import { expect, it } from "vitest"
import { MAX_BOARD_GAMES } from "@/features/pickem/contract"
import { tallyKeys } from "@/features/pickem/utils/tally-keys"
import type { TeamPick } from "@/features/pickem/utils/team-picks"

function pick(gameKey: string): TeamPick {
  return { gameKey, side: "a", lockAt: "2026-10-10T04:00:00.000Z", winner: null, takesPicks: true }
}

it("lists the keys of the games with a pick, sorted", () => {
  expect(tallyKeys([{ pick: pick("g2") }, { pick: null }, { pick: pick("g1") }])).toEqual([
    "g1",
    "g2",
  ])
})

it("lists at most as many keys as one board takes", () => {
  const schedule = Array.from({ length: MAX_BOARD_GAMES + 5 }, (_, index) => ({
    pick: pick(`g${String(index).padStart(3, "0")}`),
  }))

  const keys = tallyKeys(schedule)

  expect(keys).toHaveLength(MAX_BOARD_GAMES)
  expect(keys[0]).toBe("g000")
})
