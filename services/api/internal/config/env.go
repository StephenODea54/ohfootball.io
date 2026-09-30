// Package config reads settings from the environment. Every entry point of the API shares these
// helpers so that a setting is spelled and parsed the same way everywhere.
package config

import (
	"fmt"
	"os"
	"strconv"
)

// String returns the value of the named variable. An unset or empty variable returns the fallback.
func String(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}

// Int returns the named variable parsed as an integer. An unset or empty variable returns the
// fallback. A value that does not parse is an error.
func Int(name string, fallback int) (int, error) {
	raw := os.Getenv(name)
	if raw == "" {
		return fallback, nil
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return 0, fmt.Errorf("parse %s as a whole number: %w", name, err)
	}
	return value, nil
}
