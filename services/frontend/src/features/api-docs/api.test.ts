import { describe, expect, it } from "vitest"
import {
  apiEndpoint,
  curlExample,
  limits,
  errorExample,
  oneLine,
  playgroundHeadersExample,
  playgroundUrl,
  queryLimits,
  ruleErrors,
  schemaFields,
  topTenQuery,
} from "@/features/api-docs/api"

describe("the API page", () => {
  it("names the public endpoint and the playground", () => {
    expect(apiEndpoint).toBe("https://api.ohfootball.io/graphql")
    expect(playgroundUrl).toBe("https://api.ohfootball.io/")
  })

  it("builds a curl command that names a contact", () => {
    expect(curlExample()).toBe(
      [
        "curl https://api.ohfootball.io/graphql \\",
        "  -H 'Content-Type: application/json' \\",
        "  -H 'User-Agent: my-football-app/1.0 (me@example.com)' \\",
        `  -d '{"query":"{ currentSeason }"}'`,
      ].join("\n"),
    )
  })

  it("asks for the ten teams with the highest rating", () => {
    expect(topTenQuery).toContain("teams(sort: ELO, limit: 10)")
    expect(oneLine(topTenQuery)).toBe(
      "query TopTen { currentSeason teams(sort: ELO, limit: 10) { name city division region record { wins losses ties } elo { rating rank } } }",
    )
    // The body of the command holds the query on one line, so JSON writes no escaped line break.
    expect(curlExample(oneLine(topTenQuery))).not.toContain("\\n")
  })

  it("quotes a single quote in the query for the shell", () => {
    expect(curlExample("{ team(id: 'x') }")).toContain(`-d '{"query":"{ team(id: '\\''x'\\'') }"}'`)
  })

  it("writes an error in the form the API sends", () => {
    expect(JSON.parse(errorExample("RATE_LIMITED", "Too many requests."))).toEqual({
      errors: [{ message: "Too many requests.", extensions: { code: "RATE_LIMITED" } }],
    })
  })

  it("writes the Headers pane of the playground", () => {
    expect(JSON.parse(playgroundHeadersExample())).toEqual({ From: "me@example.com" })
  })

  it("names the fields that read only the schema, as the API does", () => {
    expect(schemaFields).toEqual(["__schema", "__type", "__typename"])
  })

  it("keeps the burst of one address inside the total burst, as the API does", () => {
    expect(limits).toEqual({ addressPerMinute: 60, addressBurst: 20, totalPerSecond: 20, totalBurst: 40 })
    expect(limits.addressBurst).toBeLessThanOrEqual(limits.totalBurst)
  })

  it("names the limits on the size of a query, as the API does", () => {
    expect(queryLimits).toEqual({ fields: 300, tokens: 10000, bodyMiB: 1 })
  })

  it("lists the errors of the rules with their codes", () => {
    expect(ruleErrors.map(({ status, code }) => [status, code])).toEqual([
      [400, "CONTACT_REQUIRED"],
      [429, "RATE_LIMITED"],
      [422, "FIELD_LIMIT_EXCEEDED"],
      [422, "TOKEN_LIMIT_EXCEEDED"],
      [413, "BODY_TOO_LARGE"],
    ])
  })
})
