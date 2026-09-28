import { describe, expect, it } from "vitest"
import { assertBelowTeamLimit, TEAM_QUERY_LIMIT } from "@/features/teams/utils/team-limit"

describe("assertBelowTeamLimit", () => {
  it("allows a season below the cap", () => {
    expect(() => assertBelowTeamLimit(2026, 0)).not.toThrow()
    expect(() => assertBelowTeamLimit(2026, TEAM_QUERY_LIMIT - 1)).not.toThrow()
  })

  it("stops a season that fills the cap", () => {
    expect(() => assertBelowTeamLimit(2026, TEAM_QUERY_LIMIT)).toThrow(
      "season 2026 returned 1000 teams, which fills the cap of 1000",
    )
  })

  it("stops a season above the cap", () => {
    expect(() => assertBelowTeamLimit(2026, TEAM_QUERY_LIMIT + 1)).toThrow("Raise the cap in the API")
  })
})
