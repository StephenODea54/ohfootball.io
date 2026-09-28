import { describe, expect, it } from "vitest"
import {
  apiEndpoint,
  curlExample,
  limits,
  errorExample,
  playgroundHeadersExample,
  playgroundUrl,
  ruleErrors,
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

  it("keeps the burst of one address inside the total burst, as the API does", () => {
    expect(limits).toEqual({ addressPerMinute: 60, addressBurst: 20, totalPerSecond: 20, totalBurst: 40 })
    expect(limits.addressBurst).toBeLessThanOrEqual(limits.totalBurst)
  })

  it("lists the errors of the rules with their codes", () => {
    expect(ruleErrors.map(({ status, code }) => [status, code])).toEqual([
      [400, "CONTACT_REQUIRED"],
      [429, "RATE_LIMITED"],
    ])
  })
})
