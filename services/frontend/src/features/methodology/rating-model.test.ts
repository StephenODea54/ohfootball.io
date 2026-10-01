import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  CARRYOVER_LAST,
  CARRYOVER_OLDER,
  DIVISION_STEP,
  HISTORY_SEASONS,
  HOME_EDGE,
  LEARNING_OFFSET,
  LEARNING_RATE,
  learningWeight,
  MARGIN_CAP,
  RATING_SUMMARY,
  SLOPE_SEASONS,
} from "@/features/methodology/rating-model"

describe("learningWeight", () => {
  it("moves a rating by a third of a surprise in the first game and less after that", () => {
    expect(learningWeight(0)).toBeCloseTo(0.33)
    expect(learningWeight(9)).toBeCloseTo(1.65 / 14)
  })
})

describe("rating text", () => {
  it("says that a rating is a number of points around the median team", () => {
    expect(RATING_SUMMARY).toContain("number of points")
    expect(RATING_SUMMARY).toContain("0 is the median Ohio team")
  })
})

describe("the values of the rating service", () => {
  const margin = readFileSync(
    new URL("../../../../rating/src/ohfootball_rating/margin.py", import.meta.url),
    "utf8",
  )

  it.each([
    ["home_edge", `${HOME_EDGE}`],
    ["margin_cap", `${MARGIN_CAP}.0`],
    ["learning_rate", `${LEARNING_RATE}`],
    ["learning_offset", `${LEARNING_OFFSET}.0`],
    ["division_step", `${DIVISION_STEP}.0`],
    ["carryover_last", `${CARRYOVER_LAST}`],
    ["carryover_older", `${CARRYOVER_OLDER}`],
  ])("use the same %s", (name, value) => {
    expect(margin).toContain(`${name}: float = ${value}`)
  })

  it.each([
    ["history_seasons", HISTORY_SEASONS],
    ["slope_seasons", SLOPE_SEASONS],
  ])("use the same %s", (name, value) => {
    expect(margin).toContain(`${name}: int = ${value}`)
  })
})
