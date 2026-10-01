import { expect, it } from "vitest"
import { linkOpponents } from "@/features/teams/utils/opponent-links"
import { addOpponentStandings } from "@/features/teams/utils/opponent-standings"
import type { Game, TeamSummary } from "@/types/api"

function game(id: string, opponentId: string): Game {
  return {
    id,
    week: 1,
    date: "2025-08-22",
    opponentId,
    opponentName: `Opponent ${opponentId}`,
    location: "HOME",
    result: "UNKNOWN",
    teamScore: null,
    opponentScore: null,
    playoff: false,
    notes: null,
    prediction: null,
  }
}

function team(id: string, rating: { rank: number; value: number } | null): TeamSummary {
  return {
    id,
    season: 2025,
    sourceId: id,
    name: `Team ${id}`,
    mascot: null,
    city: null,
    county: null,
    division: null,
    region: null,
    primaryColor: null,
    secondaryColor: null,
    record: { wins: 0, losses: 0, ties: 0 },
    outOfStateGamesPlayed: 0,
    rating: rating ? { season: 2025, previousRank: null, asOf: "2025-08-20", ...rating } : null,
  }
}

it("gives a rated opponent its rank and rating", () => {
  const [row] = addOpponentStandings(
    [game("g1", "ursuline")],
    [team("ursuline", { rank: 18, value: 1824.4 })],
  )

  expect(row?.opponentStanding).toEqual({ rank: 18, value: 1824.4 })
})

it("gives null to an opponent that is not in the list of teams", () => {
  const [row] = addOpponentStandings(
    [game("g1", "michigan")],
    [team("ursuline", { rank: 18, value: 1824 })],
  )

  expect(row?.opponentStanding).toBeNull()
})

it("gives null to an opponent that has no rating", () => {
  const [row] = addOpponentStandings([game("g1", "ursuline")], [team("ursuline", null)])

  expect(row?.opponentStanding).toBeNull()
})

it("decides each game on its own", () => {
  const rows = addOpponentStandings(
    [game("g1", "ursuline"), game("g2", "michigan")],
    [team("ursuline", { rank: 18, value: 1824 })],
  )

  expect(rows.map((row) => row.opponentStanding)).toEqual([{ rank: 18, value: 1824 }, null])
})

it("keeps every other field of the game, including the link to the opponent", () => {
  const [linked] = linkOpponents([game("g1", "ursuline")], new Set(["ursuline"]))
  if (!linked) throw new Error("linkOpponents returned no game")
  const [row] = addOpponentStandings([linked], [team("ursuline", { rank: 18, value: 1824 })])

  expect(row).toEqual({ ...linked, opponentStanding: { rank: 18, value: 1824 } })
})

it("gives null to every game when there are no teams", () => {
  const rows = addOpponentStandings([game("g1", "ursuline"), game("g2", "michigan")], [])

  expect(rows.map((row) => row.opponentStanding)).toEqual([null, null])
})

it("returns an empty schedule for an empty schedule", () => {
  expect(addOpponentStandings([], [team("ursuline", { rank: 18, value: 1824 })])).toEqual([])
})

it("keeps the first entry when a team occurs two times", () => {
  const [row] = addOpponentStandings(
    [game("g1", "ursuline")],
    [team("ursuline", { rank: 18, value: 1824 }), team("ursuline", { rank: 90, value: 1500 })],
  )

  expect(row?.opponentStanding).toEqual({ rank: 18, value: 1824 })
})
