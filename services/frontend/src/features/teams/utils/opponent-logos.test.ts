import { expect, it } from "vitest"
import { addOpponentSourceIds } from "@/features/teams/utils/opponent-logos"
import type { Game, TeamSummary } from "@/types/api"

function game(id: string, opponentId: string): Game {
  return {
    id,
    week: 1,
    date: "2026-08-21",
    opponentId,
    opponentName: `Opponent ${opponentId}`,
    location: "AWAY",
    result: "UNKNOWN",
    teamScore: null,
    opponentScore: null,
    playoff: false,
    notes: null,
    prediction: null,
  }
}

function team(id: string, sourceId: string): TeamSummary {
  return {
    id,
    season: 2026,
    sourceId,
    name: `Team ${id}`,
    mascot: null,
    city: null,
    division: null,
    region: null,
    primaryColor: null,
    secondaryColor: null,
    record: { wins: 0, losses: 0, ties: 0 },
    outOfStateGamesPlayed: 0,
    rating: null,
  }
}

it("gives each opponent from Ohio its number and keeps the game", () => {
  const [row] = addOpponentSourceIds([game("g1", "elder")], [team("elder", "506")])

  expect(row.opponentSourceId).toBe("506")
  expect(row.opponentName).toBe("Opponent elder")
})

it("gives null to an opponent that is not in the list of teams", () => {
  const [row] = addOpponentSourceIds([game("g1", "out-of-state")], [team("elder", "506")])

  expect(row.opponentSourceId).toBeNull()
})
