import { describe, expect, it } from "vitest"
import { seasonStart, type WeekGame, weekNumber, weekStart } from "@/features/pickem/utils/week"

describe("weekStart", () => {
  it("puts Wednesday to Tuesday in one week, named by the Monday before", () => {
    // Wednesday 7 October 2026 starts a week, and Tuesday 13 October ends it.
    for (const date of ["2026-10-07", "2026-10-09", "2026-10-10", "2026-10-13"]) {
      expect(weekStart(date)).toBe("2026-10-05")
    }
    expect(weekStart("2026-10-06")).toBe("2026-09-28")
    expect(weekStart("2026-10-14")).toBe("2026-10-12")
  })
})

function games(date: string, count: number, ohio = true): WeekGame[] {
  return Array.from({ length: count }, () => ({ date, ohio }))
}

describe("seasonStart", () => {
  it("starts at the first week with 50 games between Ohio teams", () => {
    const season = [
      ...games("2026-08-14", 49),
      ...games("2026-08-15", 30, false),
      ...games("2026-08-21", 50),
      ...games("2026-08-28", 300),
    ]
    expect(seasonStart(season)).toBe("2026-08-17")
  })

  it("starts at the week of the first game when no week is large enough", () => {
    expect(seasonStart([...games("2026-08-28", 3), ...games("2026-08-21", 2, false)])).toBe(
      "2026-08-17",
    )
  })

  it("has no start without a game", () => {
    expect(seasonStart([])).toBeNull()
  })
})

describe("weekNumber", () => {
  it("counts weeks from week 1 and puts an earlier game in week 1", () => {
    expect(weekNumber("2026-08-21", "2026-08-17")).toBe(1)
    expect(weekNumber("2026-10-09", "2026-08-17")).toBe(8)
    expect(weekNumber("2026-08-14", "2026-08-17")).toBe(1)
  })
})
