package joeeitel

import (
	"bytes"
	"errors"
)

// ErrEmptyPage reports a page whose body holds only white space.
//
// The site answers some team pages with status 200 and a body of a few new
// lines. The same team has a normal page in other seasons, so such a page is a
// team that the site has no data for. It is not a new page format.
var ErrEmptyPage = errors.New("the page is empty")

// IsEmptyPage reports whether a body holds nothing but white space.
func IsEmptyPage(body []byte) bool {
	return len(bytes.TrimSpace(body)) == 0
}

// AcceptBody rejects an empty body. The fetch client calls it, and retries
// whatever it rejects, so an empty answer that the server sends only once
// does not reach the parser.
func AcceptBody(body []byte) error {
	if IsEmptyPage(body) {
		return ErrEmptyPage
	}
	return nil
}
