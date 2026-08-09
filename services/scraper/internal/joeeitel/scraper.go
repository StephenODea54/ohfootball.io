package joeeitel

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"math/rand/v2"
	"net/http"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

type Config struct {
	BaseURL           string
	Season            int
	Workers           int
	RequestsPerSecond float64
	RequestTimeout    time.Duration
	MaxRetries        int
	UserAgent         string
}

func DefaultConfig() Config {
	return Config{
		BaseURL:           "https://joeeitel.com",
		Workers:           6,
		RequestsPerSecond: 3,
		RequestTimeout:    20 * time.Second,
		MaxRetries:        3,
		UserAgent:         "ohfootball.io scraper/1.0 (+https://ohfootball.io)",
	}
}

type Scraper struct {
	config  Config
	client  *http.Client
	limiter *rate.Limiter
}

func New(config Config) (*Scraper, error) {
	if config.BaseURL == "" {
		config.BaseURL = DefaultConfig().BaseURL
	}
	if config.Workers < 1 {
		return nil, fmt.Errorf("workers must be at least 1")
	}
	if config.RequestsPerSecond <= 0 {
		return nil, fmt.Errorf("requests per second must be positive")
	}
	if config.RequestTimeout <= 0 {
		return nil, fmt.Errorf("request timeout must be positive")
	}
	if config.MaxRetries < 0 {
		return nil, fmt.Errorf("max retries cannot be negative")
	}
	if config.UserAgent == "" {
		return nil, fmt.Errorf("user agent cannot be empty")
	}
	if _, err := url.ParseRequestURI(config.BaseURL); err != nil {
		return nil, fmt.Errorf("invalid base URL: %w", err)
	}

	return &Scraper{
		config:  config,
		client:  &http.Client{Timeout: config.RequestTimeout},
		limiter: rate.NewLimiter(rate.Limit(config.RequestsPerSecond), 1),
	}, nil
}

func (s *Scraper) Scrape(ctx context.Context) (Result, error) {
	season, err := s.resolveSeason(ctx)
	if err != nil {
		return Result{}, err
	}

	seasonURL := SeasonURL(s.config.BaseURL, season)
	body, err := s.fetch(ctx, seasonURL)
	if err != nil {
		return Result{}, fmt.Errorf("fetch season %d: %w", season, err)
	}
	doc, base, err := NewDocument(body, seasonURL)
	if err != nil {
		return Result{}, err
	}
	regions := ParseRegionLinks(doc, base, season)
	if len(regions) == 0 {
		return Result{}, fmt.Errorf("season %d page did not contain region links", season)
	}

	ohsaaRefs, discoveryErrors := s.discoverTeams(ctx, regions, season)
	if len(ohsaaRefs) == 0 {
		return Result{}, errors.Join(append([]error{fmt.Errorf("no OHSAA teams discovered for season %d", season)}, discoveryErrors...)...)
	}

	ohsaaTeams, games, opponentRefs, teamErrors := s.scrapeTeams(ctx, ohsaaRefs, true)
	ohsaaKeys := make(map[string]struct{}, len(ohsaaRefs))
	for _, ref := range ohsaaRefs {
		ohsaaKeys[ref.Key()] = struct{}{}
	}

	nonOHSAARefs := make([]TeamRef, 0, len(opponentRefs))
	for _, ref := range opponentRefs {
		if _, isOHSAA := ohsaaKeys[ref.Key()]; !isOHSAA {
			nonOHSAARefs = append(nonOHSAARefs, ref)
		}
	}
	opponentTeams, _, _, opponentErrors := s.scrapeTeams(ctx, nonOHSAARefs, false)

	result := Result{
		Season:              season,
		RegionCount:         len(regions),
		OHSAATeams:          ohsaaTeams,
		OpponentTeams:       opponentTeams,
		Games:               games,
		DiscoveredOpponents: len(nonOHSAARefs),
		Errors:              append(append(discoveryErrors, teamErrors...), opponentErrors...),
	}
	return result, nil
}

func (s *Scraper) resolveSeason(ctx context.Context) (int, error) {
	if s.config.Season > 0 {
		return s.config.Season, nil
	}
	return s.LatestSeason(ctx)
}

func (s *Scraper) LatestSeason(ctx context.Context) (int, error) {
	indexURL := SeasonIndexURL(s.config.BaseURL)
	body, err := s.fetch(ctx, indexURL)
	if err != nil {
		return 0, fmt.Errorf("fetch season index: %w", err)
	}
	doc, base, err := NewDocument(body, indexURL)
	if err != nil {
		return 0, err
	}
	seasons := ParseSeasons(doc, base)
	if len(seasons) == 0 {
		return 0, fmt.Errorf("season index did not contain a year link")
	}
	return slices.Max(seasons), nil
}

func (s *Scraper) discoverTeams(ctx context.Context, regionURLs []string, season int) ([]TeamRef, []error) {
	type regionResult struct {
		teams []TeamRef
		err   error
	}
	jobs := make(chan string)
	results := make(chan regionResult)

	var workers sync.WaitGroup
	for range min(s.config.Workers, len(regionURLs)) {
		workers.Add(1)
		go func() {
			defer workers.Done()
			for regionURL := range jobs {
				body, err := s.fetch(ctx, regionURL)
				if err != nil {
					results <- regionResult{err: fmt.Errorf("fetch region %s: %w", regionURL, err)}
					continue
				}
				doc, base, err := NewDocument(body, regionURL)
				if err != nil {
					results <- regionResult{err: err}
					continue
				}
				teams := ParseTeamLinks(doc, base, season)
				if len(teams) == 0 {
					results <- regionResult{err: fmt.Errorf("region page did not contain team links: %s", regionURL)}
					continue
				}
				results <- regionResult{teams: teams}
			}
		}()
	}

	go func() {
		defer close(jobs)
		for _, regionURL := range regionURLs {
			select {
			case jobs <- regionURL:
			case <-ctx.Done():
				return
			}
		}
	}()
	go func() {
		workers.Wait()
		close(results)
	}()

	teamByKey := make(map[string]TeamRef)
	var errs []error
	for result := range results {
		if result.err != nil {
			errs = append(errs, result.err)
			continue
		}
		for _, team := range result.teams {
			teamByKey[team.Key()] = team
		}
	}

	teams := make([]TeamRef, 0, len(teamByKey))
	for _, team := range teamByKey {
		teams = append(teams, team)
	}
	slices.SortFunc(teams, compareTeamRefs)
	return teams, errs
}

func (s *Scraper) scrapeTeams(ctx context.Context, refs []TeamRef, includeGames bool) ([]Team, []TeamScheduleRow, []TeamRef, []error) {
	if len(refs) == 0 {
		return nil, nil, nil, nil
	}

	type pageResult struct {
		team      Team
		games     []TeamScheduleRow
		opponents []TeamRef
		err       error
	}
	jobs := make(chan TeamRef)
	results := make(chan pageResult)

	var workers sync.WaitGroup
	for range min(s.config.Workers, len(refs)) {
		workers.Add(1)
		go func() {
			defer workers.Done()
			for ref := range jobs {
				body, err := s.fetch(ctx, ref.URL)
				if err != nil {
					results <- pageResult{err: fmt.Errorf("fetch team %s: %w", ref.Key(), err)}
					continue
				}
				team, games, opponents, err := parseTeamPage(bytes.NewReader(body), ref)
				if err != nil {
					results <- pageResult{err: fmt.Errorf("parse team %s: %w", ref.Key(), err)}
					continue
				}
				if !includeGames {
					games = nil
					opponents = nil
				}
				results <- pageResult{team: team, games: games, opponents: opponents}
			}
		}()
	}

	go func() {
		defer close(jobs)
		for _, ref := range refs {
			select {
			case jobs <- ref:
			case <-ctx.Done():
				return
			}
		}
	}()
	go func() {
		workers.Wait()
		close(results)
	}()

	var teams []Team
	var games []TeamScheduleRow
	opponentByKey := make(map[string]TeamRef)
	var errs []error
	for result := range results {
		if result.err != nil {
			errs = append(errs, result.err)
			continue
		}
		teams = append(teams, result.team)
		games = append(games, result.games...)
		for _, opponent := range result.opponents {
			opponentByKey[opponent.Key()] = opponent
		}
	}

	opponents := make([]TeamRef, 0, len(opponentByKey))
	for _, opponent := range opponentByKey {
		opponents = append(opponents, opponent)
	}
	slices.SortFunc(opponents, compareTeamRefs)
	slices.SortFunc(teams, func(a, b Team) int { return strings.Compare(teamKey(a.Season, a.TeamID), teamKey(b.Season, b.TeamID)) })
	return teams, games, opponents, errs
}

func (s *Scraper) fetch(ctx context.Context, pageURL string) ([]byte, error) {
	var lastErr error
	for attempt := 0; attempt <= s.config.MaxRetries; attempt++ {
		if err := s.limiter.Wait(ctx); err != nil {
			return nil, err
		}

		request, err := http.NewRequestWithContext(ctx, http.MethodGet, pageURL, nil)
		if err != nil {
			return nil, err
		}
		request.Header.Set("User-Agent", s.config.UserAgent)
		request.Header.Set("Accept", "text/html,application/xhtml+xml")

		response, err := s.client.Do(request)
		if err != nil {
			lastErr = err
			if attempt == s.config.MaxRetries {
				break
			}
			if waitErr := waitForRetry(ctx, attempt, ""); waitErr != nil {
				return nil, waitErr
			}
			continue
		}

		body, err := io.ReadAll(response.Body)
		response.Body.Close()
		if err != nil {
			lastErr = err
			if attempt == s.config.MaxRetries {
				break
			}
			if waitErr := waitForRetry(ctx, attempt, response.Header.Get("Retry-After")); waitErr != nil {
				return nil, waitErr
			}
			continue
		}
		if response.StatusCode >= 200 && response.StatusCode < 300 {
			return body, nil
		}

		lastErr = fmt.Errorf("unexpected HTTP status %s", response.Status)
		if response.StatusCode != http.StatusTooManyRequests && response.StatusCode < 500 {
			return nil, lastErr
		}
		if attempt == s.config.MaxRetries {
			break
		}
		if waitErr := waitForRetry(ctx, attempt, response.Header.Get("Retry-After")); waitErr != nil {
			return nil, waitErr
		}
	}
	return nil, lastErr
}

func waitForRetry(ctx context.Context, attempt int, retryAfter string) error {
	delay := time.Duration(attempt+1)*500*time.Millisecond + time.Duration(rand.IntN(250))*time.Millisecond
	if seconds, err := strconv.Atoi(retryAfter); err == nil && seconds > 0 {
		delay = time.Duration(seconds) * time.Second
	} else if retryAt, err := http.ParseTime(retryAfter); err == nil && time.Until(retryAt) > 0 {
		delay = time.Until(retryAt)
	}
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-timer.C:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func compareTeamRefs(a, b TeamRef) int {
	return strings.Compare(a.Key(), b.Key())
}
