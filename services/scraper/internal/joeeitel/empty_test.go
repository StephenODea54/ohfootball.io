package joeeitel

import (
	"errors"
	"testing"
)

func TestIsEmptyPage(t *testing.T) {
	tests := []struct {
		name string
		body string
		want bool
	}{
		{name: "no body", body: "", want: true},
		{name: "new lines only", body: "\n\n\n\n", want: true},
		{name: "carriage returns and new lines", body: "\r\n\r\n", want: true},
		{name: "spaces and tabs", body: " \t \t ", want: true},
		{name: "a no-break space", body: " \n", want: true},
		{name: "one character", body: "\n x \n", want: false},
		{name: "a page with no text", body: "<html></html>", want: false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := IsEmptyPage([]byte(test.body)); got != test.want {
				t.Errorf("IsEmptyPage(%q) is %v, want %v", test.body, got, test.want)
			}
		})
	}
}

func TestAcceptBody(t *testing.T) {
	if err := AcceptBody([]byte("\n\n\n\n")); !errors.Is(err, ErrEmptyPage) {
		t.Errorf("AcceptBody of an empty page returned %v, want %v", err, ErrEmptyPage)
	}
	if err := AcceptBody([]byte("<html><body>a team</body></html>")); err != nil {
		t.Errorf("AcceptBody of a page returned %v, want nil", err)
	}
}
