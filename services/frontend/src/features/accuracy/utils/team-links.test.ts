import { expect, it } from "vitest"
import { linkScoredTeams } from "@/features/accuracy/utils/team-links"
import type { ScoredGame } from "@/types/api"

function game(season: number): ScoredGame {
  return {
    id: `game-${season}`,
    season,
    date: `${season}-09-25`,
    winner: { id: "ross", sourceId: "1", name: "Ross", score: 14 },
    loser: { id: "talawanda", sourceId: "2", name: "Talawanda", score: 7 },
    winnerProbability: 0.07,
    winnerPredictedMargin: -19.9,
  }
}

it("links only the teams of the current season whose pages the build draws", () => {
  const [current, past] = linkScoredTeams([game(2026), game(2011)], 2026, new Set(["ross"]))

  expect(current?.winner.href).toBe("/teams/ross")
  expect(current?.loser.href).toBeNull()
  expect(past?.winner.href).toBeNull()
  expect(current?.winner.name).toBe("Ross")
  expect(current?.winnerPredictedMargin).toBe(-19.9)
})
