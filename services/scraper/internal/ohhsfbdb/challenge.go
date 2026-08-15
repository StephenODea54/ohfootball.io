package ohhsfbdb

import (
	"bytes"
	"errors"
)

// ErrChallengePage reports a page that asks the browser to run a script
// instead of holding the data that was asked for.
//
// The host of the site answers such a page with status 200, so a client that
// reads only the status stores it as if it were a sheet. A caller passes
// AcceptBody to the fetch client, which then retries.
var ErrChallengePage = errors.New("the response asks the browser to run a script")

// challengeMarkers name the parts of that page. Either one is enough. The
// first is the address of the script, and the second is the text the page
// shows while it waits.
var challengeMarkers = [][]byte{
	[]byte("/hcdn-cgi/jschallenge"),
	[]byte("Checking your browser"),
}

// IsChallengePage reports whether a body is that page rather than a sheet.
func IsChallengePage(body []byte) bool {
	for _, marker := range challengeMarkers {
		if bytes.Contains(body, marker) {
			return true
		}
	}
	return false
}

// AcceptBody reads a body and rejects the page that asks the browser to run a
// script. The fetch client calls it, and retries whatever it rejects.
func AcceptBody(body []byte) error {
	if IsChallengePage(body) {
		return ErrChallengePage
	}
	return nil
}
