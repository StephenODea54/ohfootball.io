package config

import "testing"

func TestString(t *testing.T) {
	if value := String("OHFOOTBALL_TEST_UNSET", "fallback"); value != "fallback" {
		t.Fatalf("String on an unset variable = %q, want %q", value, "fallback")
	}
	t.Setenv("OHFOOTBALL_TEST_STRING", "")
	if value := String("OHFOOTBALL_TEST_STRING", "fallback"); value != "fallback" {
		t.Fatalf("String on an empty variable = %q, want %q", value, "fallback")
	}
	t.Setenv("OHFOOTBALL_TEST_STRING", "set")
	if value := String("OHFOOTBALL_TEST_STRING", "fallback"); value != "set" {
		t.Fatalf("String = %q, want %q", value, "set")
	}
}

func TestFloat(t *testing.T) {
	value, err := Float("OHFOOTBALL_TEST_UNSET", 30)
	if err != nil || value != 30 {
		t.Fatalf("Float on an unset variable = %v, %v, want 30, nil", value, err)
	}
	t.Setenv("OHFOOTBALL_TEST_FLOAT", "12.5")
	value, err = Float("OHFOOTBALL_TEST_FLOAT", 30)
	if err != nil || value != 12.5 {
		t.Fatalf("Float = %v, %v, want 12.5, nil", value, err)
	}
	t.Setenv("OHFOOTBALL_TEST_FLOAT", "not a number")
	if _, err := Float("OHFOOTBALL_TEST_FLOAT", 30); err == nil {
		t.Fatal("Float on an unparsable value returned no error")
	}
}

func TestInt(t *testing.T) {
	value, err := Int("OHFOOTBALL_TEST_UNSET", 7)
	if err != nil || value != 7 {
		t.Fatalf("Int on an unset variable = %v, %v, want 7, nil", value, err)
	}
	t.Setenv("OHFOOTBALL_TEST_INT", "42")
	value, err = Int("OHFOOTBALL_TEST_INT", 7)
	if err != nil || value != 42 {
		t.Fatalf("Int = %v, %v, want 42, nil", value, err)
	}
	t.Setenv("OHFOOTBALL_TEST_INT", "4.2")
	if _, err := Int("OHFOOTBALL_TEST_INT", 7); err == nil {
		t.Fatal("Int on an unparsable value returned no error")
	}
}
