/**
 * The facts that the API page tells callers. Only the API page imports this file. The address of
 * the API must not go into config/paths.ts, because the navigation bar runs in the browser and
 * imports that file, so its text goes into a script. `make pages` fails when a script names the
 * API.
 */

export const apiOrigin = "https://api.ohfootball.io"
export const apiEndpoint = `${apiOrigin}/graphql`
export const playgroundUrl = `${apiOrigin}/`

/** A User-Agent that names a contact, as the API asks of each caller. */
export const exampleUserAgent = "my-football-app/1.0 (me@example.com)"
export const exampleContact = "me@example.com"
export const exampleQuery = "{ currentSeason }"

/** The ten teams with the highest rating in the current season, with their records. */
export const topTenQuery = `query TopTen {
  currentSeason
  teams(sort: ELO, limit: 10) {
    name
    city
    division
    region
    record { wins losses ties }
    elo { rating rank }
  }
}`

/** A query on one line, for a shell command. Each run of white space becomes one space. */
export function oneLine(query: string): string {
  return query.replace(/\s+/g, " ").trim()
}

/**
 * The top-level fields that read only the schema. A query that selects only these fields needs no
 * contact. They must agree with schemaFields in services/api.
 */
export const schemaFields = ["__schema", "__type", "__typename"] as const

/** The default limits of the API. They must agree with DefaultLimits in services/api. */
export const limits = {
  addressPerMinute: 60,
  addressBurst: 20,
  totalPerSecond: 20,
  totalBurst: 40,
} as const

/** The limits on the size of one query. They must agree with services/api. */
export const queryLimits = {
  fields: 300,
  tokens: 10000,
  bodyMiB: 1,
} as const

/** The errors that the rules of the API send, in the order the page lists them. */
export const ruleErrors = [
  {
    id: "contact",
    status: 400,
    code: "CONTACT_REQUIRED",
    meaning: "The request names no contact. The message tells you what to send.",
  },
  {
    id: "limit",
    status: 429,
    code: "RATE_LIMITED",
    meaning:
      "The request is over a limit. The Retry-After header gives the number of seconds to wait. Wait that long, then send the request again.",
  },
  {
    id: "fields",
    status: 422,
    code: "FIELD_LIMIT_EXCEEDED",
    meaning: `The query selects more than ${queryLimits.fields} fields. Select fewer fields, or send more than one query.`,
  },
  {
    id: "tokens",
    status: 422,
    code: "TOKEN_LIMIT_EXCEEDED",
    meaning: `The query has more than ${queryLimits.tokens} tokens. Send a shorter query.`,
  },
  {
    id: "body",
    status: 413,
    code: "BODY_TOO_LARGE",
    meaning: `The request body is larger than ${queryLimits.bodyMiB} MiB. Send a shorter query.`,
  },
] as const

/** A curl command that sends one query with a contact in its User-Agent. */
export function curlExample(query: string = exampleQuery): string {
  const body = JSON.stringify({ query }).replaceAll("'", "'\\''")
  return [
    `curl ${apiEndpoint} \\`,
    "  -H 'Content-Type: application/json' \\",
    `  -H 'User-Agent: ${exampleUserAgent}' \\`,
    `  -d '${body}'`,
  ].join("\n")
}

/** The body of an error that the rules of the API send, with a short message. */
export function errorExample(code: string, message: string): string {
  return JSON.stringify({ errors: [{ message, extensions: { code } }] }, null, 2)
}

/** The Headers pane of the playground, with a contact in the From header. */
export function playgroundHeadersExample(contact: string = exampleContact): string {
  return JSON.stringify({ From: contact }, null, 2)
}
