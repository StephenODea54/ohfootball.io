// Package config reads and checks every input of the scraper. All validation
// happens here, one time, before the program opens a connection of any kind.
// No other package checks these values again.
//
// Each command has its own loader, because each command reads a different
// site and chooses its work in a different way. The settings of the HTTP layer
// are the same for every command, so one type and one loader hold them.
package config

import (
	"errors"
	"fmt"
	"net/url"
	"strconv"
	"time"
)

// defaultUserAgent names the project in every request, so the owner of a site
// can see who reads it.
const defaultUserAgent = "ohfootball.io scraper/1.0 (+https://ohfootball.io)"

// HTTP holds the settings of the HTTP layer. Every command shares them.
type HTTP struct {
	BaseURL           string
	Workers           int
	RequestsPerSecond float64
	RequestTimeout    time.Duration
	MaxRetries        int
	UserAgent         string
}

// Config holds the checked input of one run of the joe-eitel command.
type Config struct {
	DatabaseURL string
	HTTP

	// AllSeasons and Season are exclusive. Exactly one of them is set.
	AllSeasons bool
	Season     int
}

// Ohhsfbdb holds the checked input of one run of the ohhsfbdb command.
//
// It names no season. That command reads one workbook that holds every season
// at once, and the seasons it keeps are a property of the backfill, not of the
// run. See the season constants of the ohhsfbdb package.
type Ohhsfbdb struct {
	DatabaseURL string
	HTTP
}

// Load reads the environment through getenv and returns the checked input of
// the joe-eitel command. Tests supply their own getenv, so they do not change
// the process environment.
func Load(getenv func(string) string) (Config, error) {
	databaseURL, err := databaseURL(getenv)
	if err != nil {
		return Config{}, err
	}

	settings, err := loadHTTP(getenv, HTTP{
		BaseURL:           "https://joeeitel.com",
		Workers:           6,
		RequestsPerSecond: 3,
		RequestTimeout:    20 * time.Second,
		MaxRetries:        3,
		UserAgent:         defaultUserAgent,
	})
	if err != nil {
		return Config{}, err
	}

	config := Config{DatabaseURL: databaseURL, HTTP: settings}
	if config.AllSeasons, config.Season, err = loadSeasons(getenv); err != nil {
		return Config{}, err
	}
	return config, nil
}

// LoadOhhsfbdb reads the environment through getenv and returns the checked
// input of the ohhsfbdb command.
//
// The command reads a fixed range of seasons, so it refuses the season
// variables of the other command. An operator who keeps SCRAPER_SEASON in the
// environment would otherwise believe that it chose the seasons of this run.
func LoadOhhsfbdb(getenv func(string) string) (Ohhsfbdb, error) {
	databaseURL, err := databaseURL(getenv)
	if err != nil {
		return Ohhsfbdb{}, err
	}
	for _, name := range []string{"SCRAPER_SEASON", "SCRAPER_ALL_SEASONS"} {
		if getenv(name) != "" {
			return Ohhsfbdb{}, fmt.Errorf(
				"%s does not apply to this command, because it always reads the seasons of the backfill", name)
		}
	}

	settings, err := loadHTTP(getenv, HTTP{
		BaseURL:           "https://ohhsfbdb.net",
		Workers:           3,
		RequestsPerSecond: 2,
		RequestTimeout:    30 * time.Second,
		MaxRetries:        5,
		UserAgent:         defaultUserAgent,
	})
	if err != nil {
		return Ohhsfbdb{}, err
	}

	return Ohhsfbdb{DatabaseURL: databaseURL, HTTP: settings}, nil
}

// databaseURL reads the one variable that every command requires.
func databaseURL(getenv func(string) string) (string, error) {
	value := getenv("DATABASE_URL")
	if value == "" {
		return "", errors.New("DATABASE_URL is required")
	}
	return value, nil
}

// loadHTTP reads the settings of the HTTP layer. The caller supplies the
// default of each one, because the right rate for one site is the wrong rate
// for another.
func loadHTTP(getenv func(string) string, settings HTTP) (HTTP, error) {
	if value := getenv("SCRAPER_BASE_URL"); value != "" {
		settings.BaseURL = value
	}
	if value := getenv("SCRAPER_USER_AGENT"); value != "" {
		settings.UserAgent = value
	}

	var err error
	if settings.Workers, err = intVar(getenv, "SCRAPER_WORKERS", settings.Workers); err != nil {
		return HTTP{}, err
	}
	if settings.RequestsPerSecond, err = floatVar(getenv, "SCRAPER_RATE", settings.RequestsPerSecond); err != nil {
		return HTTP{}, err
	}
	if settings.RequestTimeout, err = durationVar(getenv, "SCRAPER_TIMEOUT", settings.RequestTimeout); err != nil {
		return HTTP{}, err
	}
	if settings.MaxRetries, err = intVar(getenv, "SCRAPER_RETRIES", settings.MaxRetries); err != nil {
		return HTTP{}, err
	}

	if _, err := url.ParseRequestURI(settings.BaseURL); err != nil {
		return HTTP{}, fmt.Errorf("SCRAPER_BASE_URL is not a URL: %w", err)
	}
	if settings.Workers < 1 {
		return HTTP{}, errors.New("SCRAPER_WORKERS must be at least 1")
	}
	if settings.RequestsPerSecond <= 0 {
		return HTTP{}, errors.New("SCRAPER_RATE must be more than 0")
	}
	if settings.RequestTimeout <= 0 {
		return HTTP{}, errors.New("SCRAPER_TIMEOUT must be more than 0")
	}
	if settings.MaxRetries < 0 {
		return HTTP{}, errors.New("SCRAPER_RETRIES cannot be negative")
	}
	return settings, nil
}

// loadSeasons applies the season selection rule. The run reads one named
// season, or every season the site lists. Exactly one of the two variables
// must be set, so an operator cannot start a run without saying which.
func loadSeasons(getenv func(string) string) (allSeasons bool, season int, err error) {
	rawSeason := getenv("SCRAPER_SEASON")
	rawAllSeasons := getenv("SCRAPER_ALL_SEASONS")

	switch {
	case rawSeason == "" && rawAllSeasons == "":
		return false, 0, errors.New("set SCRAPER_SEASON or SCRAPER_ALL_SEASONS")
	case rawSeason != "" && rawAllSeasons != "":
		return false, 0, errors.New("set SCRAPER_SEASON or SCRAPER_ALL_SEASONS, but not both")
	}

	if rawAllSeasons != "" {
		allSeasons, err = strconv.ParseBool(rawAllSeasons)
		if err != nil {
			return false, 0, fmt.Errorf("SCRAPER_ALL_SEASONS is not true or false: %w", err)
		}
		if !allSeasons {
			return false, 0, errors.New("SCRAPER_ALL_SEASONS is false, so set SCRAPER_SEASON instead")
		}
		return true, 0, nil
	}

	season, err = strconv.Atoi(rawSeason)
	if err != nil {
		return false, 0, fmt.Errorf("SCRAPER_SEASON is not a number: %w", err)
	}
	// A season of zero or less matches nothing that the site lists. The run
	// would end with nothing done and report success, which hides the mistake.
	if season <= 0 {
		return false, 0, errors.New("SCRAPER_SEASON must be more than 0")
	}
	return false, season, nil
}

func intVar(getenv func(string) string, name string, fallback int) (int, error) {
	raw := getenv(name)
	if raw == "" {
		return fallback, nil
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return 0, fmt.Errorf("%s is not a number: %w", name, err)
	}
	return value, nil
}

func floatVar(getenv func(string) string, name string, fallback float64) (float64, error) {
	raw := getenv(name)
	if raw == "" {
		return fallback, nil
	}
	value, err := strconv.ParseFloat(raw, 64)
	if err != nil {
		return 0, fmt.Errorf("%s is not a number: %w", name, err)
	}
	return value, nil
}

func durationVar(getenv func(string) string, name string, fallback time.Duration) (time.Duration, error) {
	raw := getenv(name)
	if raw == "" {
		return fallback, nil
	}
	value, err := time.ParseDuration(raw)
	if err != nil {
		return 0, fmt.Errorf("%s is not a duration: %w", name, err)
	}
	return value, nil
}
