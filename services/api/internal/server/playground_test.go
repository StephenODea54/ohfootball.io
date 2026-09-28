package server

import (
	"bytes"
	"html/template"
	"net/http"
	"net/http/httptest"
	"net/url"
	"regexp"
	"strings"
	"testing"
)

// jsLiteral writes the value as html/template writes it into a script, so a test can look for
// the escaped form in the page.
func jsLiteral(t *testing.T, value any) string {
	t.Helper()
	var out bytes.Buffer
	if err := template.Must(template.New("").Parse(`<script>{{.}}</script>`)).Execute(&out, value); err != nil {
		t.Fatalf("render %v: %v", value, err)
	}
	return strings.TrimSuffix(strings.TrimPrefix(out.String(), "<script>"), "</script>")
}

func TestPlayground(t *testing.T) {
	handler := newHandler(t, &fakeStore{}, Options{})

	recorder := serve(handler, httptest.NewRequest(http.MethodGet, "/", nil))

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}
	if contentType := recorder.Header().Get("Content-Type"); contentType != "text/html; charset=utf-8" {
		t.Fatalf("Content-Type = %q, want text/html; charset=utf-8", contentType)
	}
	page := recorder.Body.String()
	for _, part := range []string{
		"<title>ohfootball.io GraphQL</title>",
		"location.host + " + jsLiteral(t, "/graphql") + ";",
		"defaultQuery: " + jsLiteral(t, playgroundQuery) + ",",
		"defaultHeaders: JSON.stringify(" + jsLiteral(t, playgroundHeaders) + ", null, 2),",
		playgroundHeaders["From"],
		"shouldPersistHeaders: true,",
		// The script puts back the headers that GraphiQL removes when it opens.
		"localStorage.getItem('graphiql:tabState')",
		"localStorage.setItem('graphiql:headers', tab.headers)",
		`src="https://cdn.jsdelivr.net/npm/graphiql@3.7.0/graphiql.min.js"`,
		`integrity="sha256-qsScAZytFdTAEOM8REpljROHu8DvdvxXBK7xhoq5XD0="`,
		`crossorigin="anonymous"`,
	} {
		if !strings.Contains(page, part) {
			t.Fatalf("the page does not hold %q", part)
		}
	}
	// A headers prop would replace the saved Headers pane on each load.
	if regexp.MustCompile(`[^A-Za-z]headers:`).MatchString(page) {
		t.Fatal("the page gives GraphiQL a headers prop")
	}
}

func TestPlaygroundQueryAsksForAContact(t *testing.T) {
	for _, part := range []string{"the From header", "email address", "URL of your site", "{\n  currentSeason\n}"} {
		if !strings.Contains(playgroundQuery, part) {
			t.Fatalf("the default query does not hold %q", part)
		}
	}
	for _, line := range strings.Split(strings.TrimSpace(playgroundQuery), "\n") {
		if len(line) > 44 {
			t.Fatalf("the line %q is longer than 44 characters", line)
		}
	}
}

func TestPlaygroundPageIsTheSameForAnyRequest(t *testing.T) {
	handler := playgroundHandler("ohfootball.io GraphQL", "/graphql")
	first := serve(handler, httptest.NewRequest(http.MethodGet, "/", nil)).Body.String()
	request := httptest.NewRequest(http.MethodGet, "/?query="+url.QueryEscape("</script><script>alert(1)</script>"), nil)
	if second := serve(handler, request).Body.String(); second != first {
		t.Fatal("the page changes with the request")
	}
}

func TestRenderPagePanicsOnABrokenTemplate(t *testing.T) {
	defer func() {
		if recover() == nil {
			t.Fatal("renderPage did not panic")
		}
	}()
	renderPage(template.Must(template.New("").Parse(`{{template "missing"}}`)), playgroundData{})
}
