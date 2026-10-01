import { beforeEach, expect, it, vi } from "vitest"

const graphqlRequest = vi.hoisted(() => vi.fn())

vi.mock("@/lib/graphql-client", () => ({ graphqlRequest }))

beforeEach(() => {
  graphqlRequest.mockReset()
  vi.stubEnv("DEV", false)
  vi.resetModules()
})

it("asks one time for the scores from the first scored season", async () => {
  graphqlRequest.mockResolvedValue({ modelAccuracy: { currentSeason: 2026 } })
  const { getModelAccuracy, modelAccuracyQuery } = await import(
    "@/features/accuracy/api/get-model-accuracy"
  )

  expect(await getModelAccuracy()).toEqual({ currentSeason: 2026 })
  await getModelAccuracy()

  expect(graphqlRequest).toHaveBeenCalledTimes(1)
  expect(graphqlRequest).toHaveBeenCalledWith(modelAccuracyQuery, { fromSeason: 2000 })
})

it("asks for the exact margins", async () => {
  const { modelAccuracyQuery } = await import("@/features/accuracy/api/get-model-accuracy")

  expect(modelAccuracyQuery).toContain("exactMarginGames { ...Game }")
  expect(modelAccuracyQuery).toContain("lastWeekExactMarginGames { ...Game }")
  expect(modelAccuracyQuery).toMatch(/fragment Score on AccuracyScore \{[^}]*\bexactMargins\b/)
  expect(modelAccuracyQuery).toMatch(
    /fragment Game on ScoredGame \{[\s\S]*\bwinnerPredictedMargin\b/,
  )
})
