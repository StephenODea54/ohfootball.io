import { describe, expect, it } from "vitest"
import { rankMovement } from "@/features/teams/utils/rank-movement"

describe("rankMovement", () => {
  it("returns null when the API gives no previous rank", () => {
    expect(rankMovement({ rank: 12, previousRank: null })).toBeNull()
  })

  it("returns null when the rating has no previous rank field", () => {
    const rating = { rank: 12 } as { rank: number; previousRank: number | null }
    expect(rankMovement(rating)).toBeNull()
  })

  it("counts a lower rank as a move up", () => {
    expect(rankMovement({ rank: 12, previousRank: 15 })).toEqual({
      direction: "up",
      places: 3,
      text: "↑3",
      label: "Up 3 places",
      title: "Up 3 places in the last week",
    })
  })

  it("counts a higher rank as a move down", () => {
    expect(rankMovement({ rank: 18, previousRank: 16 })).toEqual({
      direction: "down",
      places: 2,
      text: "↓2",
      label: "Down 2 places",
      title: "Down 2 places in the last week",
    })
  })

  it("says place, not places, for a move of one", () => {
    expect(rankMovement({ rank: 4, previousRank: 5 })?.label).toBe("Up 1 place")
    expect(rankMovement({ rank: 6, previousRank: 5 })?.label).toBe("Down 1 place")
  })

  it("shows a dash when the rank did not change", () => {
    expect(rankMovement({ rank: 7, previousRank: 7 })).toEqual({
      direction: "same",
      places: 0,
      text: "—",
      label: "No change",
      title: "No change in the last week",
    })
  })
})
