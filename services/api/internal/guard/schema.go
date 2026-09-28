package guard

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/url"

	"github.com/vektah/gqlparser/v2/ast"
	"github.com/vektah/gqlparser/v2/parser"
)

// maxSchemaBody is the largest body that the guard reads to find a query for the schema. The
// introspection query of GraphiQL has less than 3 KiB. A larger body gets the contact rule.
const maxSchemaBody = 64 << 10

// schemaFields are the fields that read only the schema. A request that selects only these at
// the top level reads nothing from the store. It can still cost work, so the limits of the
// GraphQL handler on tokens, fields, and complexity hold for it too.
var schemaFields = map[string]bool{"__schema": true, "__type": true, "__typename": true}

// asksForSchemaOnly reports whether the request holds one GraphQL document that reads only the
// schema. It reads the query from the URL of a GET, or from the JSON body of a POST, as the
// transports of the API do. It puts back the body that it reads, so the next handler reads the
// same bytes.
func asksForSchemaOnly(request *http.Request) bool {
	switch request.Method {
	case http.MethodGet:
		values, err := url.ParseQuery(request.URL.RawQuery)
		return err == nil && isSchemaDocument(values.Get("query"))
	case http.MethodPost:
		body, ok := readBody(request)
		if !ok {
			return false
		}
		// The POST transport decodes the body into a struct with the same field, so both read
		// the same query. A JSON array, which is a batch, does not decode into the struct.
		var params struct {
			Query string `json:"query"`
		}
		return json.Unmarshal(body, &params) == nil && isSchemaDocument(params.Query)
	default:
		return false
	}
}

// readBody reads at most maxSchemaBody bytes of the body and then puts the body back. It
// returns false when the body is missing, cannot be read, or is larger than maxSchemaBody.
func readBody(request *http.Request) ([]byte, bool) {
	if request.Body == nil {
		return nil, false
	}
	original := request.Body
	body, err := io.ReadAll(io.LimitReader(original, maxSchemaBody+1))
	request.Body = struct {
		io.Reader
		io.Closer
	}{io.MultiReader(bytes.NewReader(body), original), original}
	return body, err == nil && len(body) <= maxSchemaBody
}

// isSchemaDocument reports whether the query parses, holds at least one operation, and each
// operation is a query whose top-level selections are only fields of schemaFields. A fragment
// spread or an inline fragment at the top level is refused, because it could select any field
// of the query type. Fragments inside the fields of the schema can select only fields of the
// schema, so they are accepted.
func isSchemaDocument(query string) bool {
	document, err := parser.ParseQuery(&ast.Source{Input: query})
	if err != nil || len(document.Operations) == 0 {
		return false
	}
	for _, operation := range document.Operations {
		if operation.Operation != ast.Query {
			return false
		}
		for _, selection := range operation.SelectionSet {
			field, isField := selection.(*ast.Field)
			if !isField || !schemaFields[field.Name] {
				return false
			}
		}
	}
	return true
}
