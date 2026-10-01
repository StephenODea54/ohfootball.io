import { expect, it } from "vitest"
import { FIRST_CHART_SEASON, FIRST_SCORED_SEASON } from "@/features/accuracy/scored-seasons"

it("starts the chart after the first season and before the headline range", () => {
  expect(FIRST_CHART_SEASON).toBe(1973)
  expect(FIRST_SCORED_SEASON).toBe(2000)
  expect(FIRST_CHART_SEASON).toBeLessThan(FIRST_SCORED_SEASON)
})
