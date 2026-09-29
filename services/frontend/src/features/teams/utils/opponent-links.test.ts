import { expect, it } from "vitest"
import { linkOpponents } from "@/features/teams/utils/opponent-links"
import type { Game } from "@/types/api"

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

it("links an opponent that has a page", () => {
  const [linked] = linkOpponents([game("g1", "ohio")], new Set(["ohio"]))

  expect(linked?.opponentHref).toBe("/teams/ohio")
})

it("does not link an opponent that has no page", () => {
  const [linked] = linkOpponents([game("g1", "michigan")], new Set(["ohio"]))

  expect(linked?.opponentHref).toBeNull()
})

it("decides each game on its own", () => {
  const linked = linkOpponents([game("g1", "ohio"), game("g2", "michigan")], new Set(["ohio"]))

  expect(linked.map((row) => row.opponentHref)).toEqual(["/teams/ohio", null])
})

it("keeps every other field of the game", () => {
  const original = game("g1", "ohio")
  const [linked] = linkOpponents([original], new Set())

  expect(linked).toEqual({ ...original, opponentHref: null })
})

it("returns an empty schedule for an empty schedule", () => {
  expect(linkOpponents([], new Set(["ohio"]))).toEqual([])
})
