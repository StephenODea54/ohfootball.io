import { describe, expect, it } from "vitest"
import {
  ALL_COUNTIES,
  EMPTY_TEAM_FILTERS,
  filterTeams,
  INDEPENDENT_DIVISION,
  matchesCounty,
  matchesDivision,
  matchesQuery,
  matchesRegion,
  UNASSIGNED_REGION,
} from "@/features/teams/utils/filter-teams"
import type { TeamSummary } from "@/types/api"

function team(
  name: string,
  region: number | null,
  division: number | null,
  county: string | null,
): TeamSummary {
  return {
    id: name,
    season: 2026,
    sourceId: name,
    name,
    mascot: "Tigers",
    city: "Massillon",
    county,
    division,
    region,
    primaryColor: null,
    secondaryColor: null,
    record: { wins: 0, losses: 0, ties: 0 },
    outOfStateGamesPlayed: 0,
    rating: null,
  }
}

const teams = [
  team("Massillon Washington", 7, 2, "Stark"),
  team("Canton McKinley", 7, 2, "Stark"),
  team("Hoban", 5, 3, "Summit"),
  team("Toledo Christian", null, null, null),
]

function names(filtered: TeamSummary[]) {
  return filtered.map((match) => match.name)
}

describe("filterTeams", () => {
  it("keeps every team with the empty filters", () => {
    expect(filterTeams(teams, EMPTY_TEAM_FILTERS)).toEqual(teams)
  })

  it("matches the query against the school name only", () => {
    expect(names(filterTeams(teams, { ...EMPTY_TEAM_FILTERS, query: " MASS " }))).toEqual([
      "Massillon Washington",
    ])
    expect(filterTeams(teams, { ...EMPTY_TEAM_FILTERS, query: "Tigers" })).toEqual([])
  })

  it("filters by a region or by the unassigned region", () => {
    expect(names(filterTeams(teams, { ...EMPTY_TEAM_FILTERS, region: "5" }))).toEqual(["Hoban"])
    expect(names(filterTeams(teams, { ...EMPTY_TEAM_FILTERS, region: UNASSIGNED_REGION }))).toEqual(
      ["Toledo Christian"],
    )
  })

  it("filters by a division or by the independent teams", () => {
    expect(names(filterTeams(teams, { ...EMPTY_TEAM_FILTERS, division: "3" }))).toEqual(["Hoban"])
    expect(
      names(filterTeams(teams, { ...EMPTY_TEAM_FILTERS, division: INDEPENDENT_DIVISION })),
    ).toEqual(["Toledo Christian"])
  })

  it("filters by a county and leaves out the teams with no county", () => {
    expect(names(filterTeams(teams, { ...EMPTY_TEAM_FILTERS, county: "Stark" }))).toEqual([
      "Massillon Washington",
      "Canton McKinley",
    ])
    expect(EMPTY_TEAM_FILTERS.county).toBe(ALL_COUNTIES)
  })

  it("applies every filter together", () => {
    expect(
      names(filterTeams(teams, { query: "canton", region: "7", division: "2", county: "Stark" })),
    ).toEqual(["Canton McKinley"])
  })
})

describe("each filter test", () => {
  const hoban = team("Hoban", 5, 3, "Summit")
  const toledo = team("Toledo Christian", null, null, null)

  it.each([
    ["the name query", () => matchesQuery(hoban, " HOB "), () => matchesQuery(hoban, "Tigers")],
    ["the region", () => matchesRegion(hoban, "5"), () => matchesRegion(hoban, "7")],
    [
      "no region",
      () => matchesRegion(toledo, UNASSIGNED_REGION),
      () => matchesRegion(hoban, UNASSIGNED_REGION),
    ],
    ["the division", () => matchesDivision(hoban, "3"), () => matchesDivision(hoban, "2")],
    [
      "no division",
      () => matchesDivision(toledo, INDEPENDENT_DIVISION),
      () => matchesDivision(hoban, INDEPENDENT_DIVISION),
    ],
    ["the county", () => matchesCounty(hoban, "Summit"), () => matchesCounty(toledo, "Summit")],
  ])("passes and fails on %s", (_name, passes, fails) => {
    expect(passes()).toBe(true)
    expect(fails()).toBe(false)
  })

  it("passes every team when set to all", () => {
    expect(matchesQuery(toledo, "  ")).toBe(true)
    expect(matchesRegion(toledo, "all")).toBe(true)
    expect(matchesDivision(toledo, "all")).toBe(true)
    expect(matchesCounty(toledo, ALL_COUNTIES)).toBe(true)
  })
})
