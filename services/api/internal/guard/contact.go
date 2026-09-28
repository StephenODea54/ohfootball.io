// Package guard holds the rules that every caller of the public API follows: a caller names a
// contact, and a caller stays inside the rate limits. The build of the site skips both rules when
// it sends the build key.
package guard

import "regexp"

// contactPattern finds an email address or an http(s) URL with a dotted host name. It matches
// only ASCII, so a contact that is cut to maxContact bytes stays valid text in a log.
var contactPattern = regexp.MustCompile(
	`(?i)https?://[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?::[0-9]{1,5})?(?:[/?#][a-z0-9\-._~:/?#\[\]@!$&*+,=%]*)?` +
		`|[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}`,
)

// maxContact is the most bytes of a contact that a log line holds.
const maxContact = 200

// Contact returns the first email address or http(s) URL in the User-Agent header, or else in the
// From header. It returns false when neither header holds one.
func Contact(userAgent, from string) (string, bool) {
	for _, value := range [...]string{userAgent, from} {
		if found := contactPattern.FindString(value); found != "" {
			if len(found) > maxContact {
				found = found[:maxContact]
			}
			return found, true
		}
	}
	return "", false
}
