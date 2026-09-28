package server

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"

	"github.com/99designs/gqlgen/graphql"
	"github.com/99designs/gqlgen/graphql/errcode"
	"github.com/vektah/gqlparser/v2/ast"
	"github.com/vektah/gqlparser/v2/gqlerror"
	"github.com/vektah/gqlparser/v2/parser"
)

// The codes in the extensions of an error that a limit of this file sends.
const (
	codeFieldLimit   = "FIELD_LIMIT_EXCEEDED"
	codeTokenLimit   = "TOKEN_LIMIT_EXCEEDED"
	codeBodyTooLarge = "BODY_TOO_LARGE"
	codeBodyUnread   = "BODY_NOT_READ"
)

const (
	// DefaultFieldLimit is the most fields that one query may select. The introspection query of
	// GraphiQL selects about 220, and each query of the site fewer than 60.
	DefaultFieldLimit = 300

	// parserTokenLimit is the most tokens that one query may have. The introspection query of
	// GraphiQL has about 160.
	parserTokenLimit = 10000

	// maxRequestBody is the largest body that /graphql reads.
	maxRequestBody = 1 << 20
)

func init() {
	// A refused operation answers 422, as a refusal by the complexity limit does.
	errcode.RegisterErrorType(codeFieldLimit, errcode.KindProtocol)
	errcode.RegisterErrorType(codeTokenLimit, errcode.KindProtocol)
}

// queryLimits refuses a query that has more than tokens tokens, or that selects more than fields
// fields. It runs before gqlgen parses and validates the query, because validation can take time
// that grows as the square of the number of fields. It must come after the extension for
// persisted queries, which can replace the query.
//
// gqlgen v0.17.64 has SetParserTokenLimit, but when the parser stops at the limit, gqlgen ignores
// the error, because it is not a GraphQL error. It then validates and runs the part of the query
// that was parsed. This check gives a clear error instead.
//
// The complexity limit of gqlgen does not count introspection, because it skips each field of
// __Schema. So without the field limit, a short query can ask for the schema many times under
// many aliases, or through fragments that use other fragments many times.
type queryLimits struct{ tokens, fields int }

var _ interface {
	graphql.HandlerExtension
	graphql.OperationParameterMutator
} = queryLimits{}

func (queryLimits) ExtensionName() string { return "QueryLimits" }

func (queryLimits) Validate(graphql.ExecutableSchema) error { return nil }

func (limits queryLimits) MutateOperationParameters(
	_ context.Context, params *graphql.RawParams,
) *gqlerror.Error {
	document, err := parser.ParseQueryWithTokenLimit(&ast.Source{Input: params.Query}, limits.tokens)
	var syntaxError *gqlerror.Error
	switch {
	case errors.As(err, &syntaxError):
		// gqlgen parses the query again and reports the syntax error itself.
		return nil
	case err != nil:
		limitError := gqlerror.Errorf("The query has more than %d tokens. Send a shorter query.",
			limits.tokens)
		errcode.Set(limitError, codeTokenLimit)
		return limitError
	case countFields(document, limits.fields) > limits.fields:
		limitError := gqlerror.Errorf("The query selects more than %d fields. Select fewer "+
			"fields, or send more than one query.", limits.fields)
		errcode.Set(limitError, codeFieldLimit)
		return limitError
	}
	return nil
}

// countFields returns the number of fields that the document selects. It counts each field, with
// each alias and each __typename, and it counts the fields of a fragment each time the document
// uses the fragment. It counts each operation, because validation reads each one, and each
// fragment that no operation uses. When the number is more than limit, it stops and returns
// limit+1.
func countFields(document *ast.QueryDocument, limit int) int {
	counter := fieldCounter{fragments: document.Fragments, counts: map[*ast.FragmentDefinition]int{}, limit: limit}
	total := 0
	for _, operation := range document.Operations {
		total += counter.count(operation.SelectionSet)
		if total > limit {
			return limit + 1
		}
	}
	for _, definition := range document.Fragments {
		if _, counted := counter.counts[definition]; !counted {
			total += counter.definition(definition)
		}
		if total > limit {
			return limit + 1
		}
	}
	return total
}

// fieldCounter keeps the count of each fragment, so it walks each fragment only one time. The
// walk then takes time in proportion to the length of the document, and not to the number of
// fields that the fragments expand to.
type fieldCounter struct {
	fragments ast.FragmentDefinitionList
	counts    map[*ast.FragmentDefinition]int
	limit     int
}

func (counter *fieldCounter) count(selections ast.SelectionSet) int {
	total := 0
	for _, selection := range selections {
		switch selection := selection.(type) {
		case *ast.Field:
			total += 1 + counter.count(selection.SelectionSet)
		case *ast.InlineFragment:
			total += counter.count(selection.SelectionSet)
		case *ast.FragmentSpread:
			if definition := counter.fragments.ForName(selection.Name); definition != nil {
				total += counter.definition(definition)
			}
		}
		if total > counter.limit {
			return counter.limit + 1
		}
	}
	return total
}

func (counter *fieldCounter) definition(definition *ast.FragmentDefinition) int {
	if count, found := counter.counts[definition]; found {
		return count
	}
	// A fragment that uses itself counts as over the limit, so the walk ends. Validation would
	// refuse it too.
	counter.counts[definition] = counter.limit + 1
	count := counter.count(definition.SelectionSet)
	counter.counts[definition] = count
	return count
}

// limitBody reads at most maxRequestBody bytes of the body before the next handler runs. The POST
// transport of gqlgen reads the whole body into memory, so the body is held in memory here in its
// place. A larger body gets 413.
func limitBody(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		body, err := io.ReadAll(http.MaxBytesReader(writer, request.Body, maxRequestBody))
		var tooLarge *http.MaxBytesError
		switch {
		case errors.As(err, &tooLarge):
			writeError(writer, http.StatusRequestEntityTooLarge, codeBodyTooLarge, fmt.Sprintf(
				"The request body is larger than %d bytes. Send a shorter query.", maxRequestBody))
			return
		case err != nil:
			writeError(writer, http.StatusBadRequest, codeBodyUnread, "The request body could not be read.")
			return
		}
		request.Body = io.NopCloser(bytes.NewReader(body))
		next.ServeHTTP(writer, request)
	})
}

// writeError answers in the form of a GraphQL error, so a GraphQL client shows the message.
func writeError(writer http.ResponseWriter, status int, code, message string) {
	body, _ := json.Marshal(map[string]any{"errors": []any{map[string]any{
		"message":    message,
		"extensions": map[string]string{"code": code},
	}}})
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(status)
	_, _ = writer.Write(body)
}
