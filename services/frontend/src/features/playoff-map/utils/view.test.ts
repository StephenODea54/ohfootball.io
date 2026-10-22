import { describe, expect, it } from "vitest"
import { division } from "@/features/playoff-map/test/fixtures"
import { drawnCells, formatShare, roundName } from "@/features/playoff-map/utils/view"

describe("roundName", () => {
  it("names each round and falls back to the seeds", () => {
    expect(roundName(0)).toBe("Seeds")
    expect(roundName(4)).toBe("Regional finals")
    expect(roundName(9)).toBe("Seeds")
  })
})

describe("formatShare", () => {
  it("gives a whole percent, and <1% for a little land", () => {
    expect(formatShare(0.414)).toBe("41%")
    expect(formatShare(0.001)).toBe("<1%")
    expect(formatShare(0)).toBe("0%")
  })
})

describe("drawnCells", () => {
  it("gives each cell its school and its owner, and one main cell to each owner", () => {
    const owners = new Map([
      ["a", "a"],
      ["b", "a"],
    ])

    const cells = drawnCells(division.regions, owners)

    expect(
      cells.map((item) => [item.region, item.cell.id, item.school.id, item.owner.id, item.main]),
    ).toEqual([
      [1, "a", "a", "a", true],
      [1, "b", "b", "a", false],
      [2, "c", "c", "c", true],
      [2, "d", "d", "d", true],
    ])
  })

  it("puts the main cell where the circle is largest", () => {
    const cells = drawnCells(division.regions, new Map([["a", "b"]]))

    expect(cells.filter((item) => item.main).map((item) => item.cell.id)).toEqual(["a", "c", "d"])
    expect(cells[1].main).toBe(false)
  })
})
