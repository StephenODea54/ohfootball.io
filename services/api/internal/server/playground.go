package server

import (
	"bytes"
	"fmt"
	"html/template"
	"net/http"
)

// playgroundHeaders fill the Headers pane of the playground on the first visit. A browser does
// not let a page set User-Agent, so the playground names the caller in the From header. The
// value holds no contact, so a query fails with the message that tells the caller what to write
// there. The schema loads without a contact.
var playgroundHeaders = map[string]string{"From": "your email address or the URL of your site"}

// playgroundQuery fills the query editor on the first visit. Its lines are short, so they fit in
// the editor when the Docs pane is open.
const playgroundQuery = `# The ohfootball.io GraphQL API
#
# Each query must name a contact. In the
# Headers pane below, replace the text in
# the From header with your email address
# or the URL of your site. The browser
# keeps the Headers pane, so you do this
# one time.
#
# Then select the run button, or press
# Ctrl+Enter (Cmd+Enter on a Mac). The
# Docs pane shows the schema.

{
  currentSeason
}
`

// playgroundTemplate is the GraphiQL page of gqlgen with other settings. GraphiQL keeps the
// Headers pane in localStorage under "graphiql:headers" as plain text. The page gives the
// headers only as defaultHeaders, so the saved value wins and the placeholder shows only on the
// first visit.
//
// GraphiQL 3.7 removes "graphiql:headers" each time it opens, but it keeps the headers of each
// tab in "graphiql:tabState". Without the saved headers, the second reload shows the placeholder
// again and adds a tab. So the script first copies the headers of the active tab back to
// "graphiql:headers". When the browser blocks storage or the saved state is not valid, GraphiQL
// opens with the default headers. html/template removes comments from a script, so the
// comments of the page are here.
//
// The page has no subscription URL, because the API has no subscriptions.
//
// The addresses of the scripts, their versions, and their SRI hashes are those of gqlgen
// v0.17.64. Change them together.
var playgroundTemplate = template.Must(template.New("playground").Parse(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>{{.Title}}</title>
    <style>
      body {
        height: 100%;
        margin: 0;
        width: 100%;
        overflow: hidden;
      }

      #graphiql {
        height: 100vh;
      }
    </style>
    <script
      src="https://cdn.jsdelivr.net/npm/react@18.2.0/umd/react.production.min.js"
      integrity="sha256-S0lp+k7zWUMk2ixteM6HZvu8L9Eh//OVrt+ZfbCpmgY="
      crossorigin="anonymous"
    ></script>
    <script
      src="https://cdn.jsdelivr.net/npm/react-dom@18.2.0/umd/react-dom.production.min.js"
      integrity="sha256-IXWO0ITNDjfnNXIu5POVfqlgYoop36bDzhodR6LW5Pc="
      crossorigin="anonymous"
    ></script>
    <link
      rel="stylesheet"
      href="https://cdn.jsdelivr.net/npm/graphiql@3.7.0/graphiql.min.css"
      integrity="sha256-Dbkv2LUWis+0H4Z+IzxLBxM2ka1J133lSjqqtSu49o8="
      crossorigin="anonymous"
    />
  </head>
  <body>
    <div id="graphiql">Loading...</div>

    <script
      src="https://cdn.jsdelivr.net/npm/graphiql@3.7.0/graphiql.min.js"
      integrity="sha256-qsScAZytFdTAEOM8REpljROHu8DvdvxXBK7xhoq5XD0="
      crossorigin="anonymous"
    ></script>

    <script>
      try {
        if (!localStorage.getItem('graphiql:headers')) {
          const state = JSON.parse(localStorage.getItem('graphiql:tabState'));
          const tab = state && Array.isArray(state.tabs) && state.tabs[state.activeTabIndex];
          if (tab && typeof tab.headers === 'string' && tab.headers) {
            localStorage.setItem('graphiql:headers', tab.headers);
          }
        }
      } catch (error) {}

      const url = location.protocol + '//' + location.host + {{.Endpoint}};
      const fetcher = GraphiQL.createFetcher({ url });
      ReactDOM.render(
        React.createElement(GraphiQL, {
          fetcher: fetcher,
          isHeadersEditorEnabled: true,
          shouldPersistHeaders: true,
          defaultHeaders: JSON.stringify({{.Headers}}, null, 2),
          defaultQuery: {{.Query}},
          defaultEditorToolsVisibility: 'headers',
        }),
        document.getElementById('graphiql'),
      );
    </script>
  </body>
</html>
`))

// playgroundData holds the values of the page. html/template escapes each one for the place
// where it goes. No value comes from a request.
type playgroundData struct {
	Title    string
	Endpoint string
	Headers  map[string]string
	Query    string
}

// renderPage writes the page one time. It panics when the template fails, because the page is
// fixed and a failure is a fault in the code.
func renderPage(page *template.Template, data playgroundData) []byte {
	var out bytes.Buffer
	if err := page.Execute(&out, data); err != nil {
		panic(fmt.Sprintf("render the playground: %v", err))
	}
	return out.Bytes()
}

// playgroundHandler serves the GraphiQL page for the endpoint.
func playgroundHandler(title, endpoint string) http.Handler {
	page := renderPage(playgroundTemplate, playgroundData{
		Title:    title,
		Endpoint: endpoint,
		Headers:  playgroundHeaders,
		Query:    playgroundQuery,
	})
	return http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writer.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = writer.Write(page)
	})
}
