import { describe, expect, it } from "vitest"
import { rankTeams } from "@/features/teams/utils/rank-teams"

const teams = [
  { name: "Canton McKinley" },
  { name: "Massillon Washington" },
  { name: "Canton South" },
  { name: "Troy" },
]

describe("rankTeams", () => {
  it("keeps the first teams in order with no query", () => {
    expect(rankTeams(teams, "  ", 2)).toEqual([teams[0], teams[1]])
  })

  it("puts the best match first", () => {
    expect(rankTeams(teams, "troy", 5)[0]).toBe(teams[3])
  })

  it("leaves out a team that does not match", () => {
    expect(rankTeams(teams, "canton", 5).map((team) => team.name)).toEqual([
      "Canton McKinley",
      "Canton South",
    ])
  })

  it("keeps at most the limit", () => {
    expect(rankTeams(teams, "canton", 1)).toHaveLength(1)
  })
})
