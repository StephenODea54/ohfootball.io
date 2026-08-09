// Package config reads and checks every input of the scraper. All validation
// happens here, one time, before the program opens a connection of any kind.
// No other package checks these values again.
package config

import (
	"errors"
	"fmt"
	"net/url"
	"strconv"
	"time"
)

// Config holds the checked input of one run.
type Config struct {
	DatabaseURL string
	BaseURL     string

	// AllSeasons and Season are exclusive. Exactly one of them is set.
	AllSeasons bool
	Season     int

	Workers           int
	RequestsPerSecond float64
	RequestTimeout    time.Duration
	MaxRetries        int
	UserAgent         string
}

// Load reads the environment through getenv and returns a checked Config.
// Tests supply their own getenv, so they do not change the process
// environment.
func Load(getenv func(string) string) (Config, error) {
	config := Config{
		BaseURL:           "https://joeeitel.com",
		Workers:           6,
		RequestsPerSecond: 3,
		RequestTimeout:    20 * time.Second,
		MaxRetries:        3,
		UserAgent:         "ohfootball.io scraper/1.0 (+https://ohfootball.io)",
	}

	config.DatabaseURL = getenv("DATABASE_URL")
	if config.DatabaseURL == "" {
		return Config{}, errors.New("DATABASE_URL is required")
	}
	if value := getenv("SCRAPER_BASE_URL"); value != "" {
		config.BaseURL = value
	}
	if value := getenv("SCRAPER_USER_AGENT"); value != "" {
		config.UserAgent = value
	}

	var err error
	if config.AllSeasons, config.Season, err = loadSeasons(getenv); err != nil {
		return Config{}, err
	}
	if config.Workers, err = intVar(getenv, "SCRAPER_WORKERS", config.Workers); err != nil {
		return Config{}, err
	}
	if config.RequestsPerSecond, err = floatVar(getenv, "SCRAPER_RATE", config.RequestsPerSecond); err != nil {
		return Config{}, err
	}
	if config.RequestTimeout, err = durationVar(getenv, "SCRAPER_TIMEOUT", config.RequestTimeout); err != nil {
		return Config{}, err
	}
	if config.MaxRetries, err = intVar(getenv, "SCRAPER_RETRIES", config.MaxRetries); err != nil {
		return Config{}, err
	}

	if _, err := url.ParseRequestURI(config.BaseURL); err != nil {
		return Config{}, fmt.Errorf("SCRAPER_BASE_URL is not a URL: %w", err)
	}
	if config.Workers < 1 {
		return Config{}, errors.New("SCRAPER_WORKERS must be at least 1")
	}
	if config.RequestsPerSecond <= 0 {
		return Config{}, errors.New("SCRAPER_RATE must be more than 0")
	}
	if config.RequestTimeout <= 0 {
		return Config{}, errors.New("SCRAPER_TIMEOUT must be more than 0")
	}
	if config.MaxRetries < 0 {
		return Config{}, errors.New("SCRAPER_RETRIES cannot be negative")
	}
	return config, nil
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
