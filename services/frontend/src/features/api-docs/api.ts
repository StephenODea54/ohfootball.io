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

/** The default limits of the API. They must agree with DefaultLimits in services/api. */
export const limits = {
  addressPerMinute: 60,
  addressBurst: 20,
  totalPerSecond: 20,
  totalBurst: 40,
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
