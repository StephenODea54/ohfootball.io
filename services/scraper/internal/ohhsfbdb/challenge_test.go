package ohhsfbdb

import (
	"errors"
	"testing"
)

func TestIsChallengePage(t *testing.T) {
	tests := []struct {
		name string
		body []byte
		want bool
	}{
		{name: "the saved challenge page", body: fixture(t, "challenge.htm"), want: true},
		{name: "a real sheet", body: fixture(t, "sheet_ada.htm"), want: false},
		{name: "the index", body: fixture(t, "index.htm"), want: false},
		{name: "an empty body", body: nil, want: false},
		{name: "the address of the script alone", body: []byte("<script src=\"/hcdn-cgi/jschallenge\">"), want: true},
		{name: "the waiting text alone", body: []byte("<p>Checking your browser before accessing</p>"), want: true},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := IsChallengePage(test.body); got != test.want {
				t.Errorf("IsChallengePage is %v, want %v", got, test.want)
			}
		})
	}
}

func TestAcceptBody(t *testing.T) {
	if err := AcceptBody(fixture(t, "challenge.htm")); !errors.Is(err, ErrChallengePage) {
		t.Errorf("AcceptBody returned %v for the challenge page, want ErrChallengePage", err)
	}
	if err := AcceptBody(fixture(t, "sheet_ada.htm")); err != nil {
		t.Errorf("AcceptBody returned %v for a real sheet, want nil", err)
	}
}
