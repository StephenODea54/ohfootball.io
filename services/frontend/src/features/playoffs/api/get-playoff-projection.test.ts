import { beforeEach, expect, it, vi } from "vitest"

const graphqlRequest = vi.hoisted(() => vi.fn())

vi.mock("@/lib/graphql-client", () => ({ graphqlRequest }))

beforeEach(() => {
  graphqlRequest.mockReset()
  vi.stubEnv("DEV", false)
  vi.resetModules()
})

it("asks one time for the projection", async () => {
  graphqlRequest.mockResolvedValue({ playoffProjection: { season: 2026 } })
  const { getPlayoffProjection, playoffProjectionQuery } = await import(
    "@/features/playoffs/api/get-playoff-projection"
  )

  expect(await getPlayoffProjection()).toEqual({ season: 2026 })
  await getPlayoffProjection()

  expect(graphqlRequest).toHaveBeenCalledTimes(1)
  expect(graphqlRequest).toHaveBeenCalledWith(playoffProjectionQuery)
})

it("gives null when the season has no projection", async () => {
  graphqlRequest.mockResolvedValue({ playoffProjection: null })
  const { getPlayoffProjection } = await import("@/features/playoffs/api/get-playoff-projection")

  expect(await getPlayoffProjection()).toBeNull()
})

it("gives null and warns when the API does not answer the query", async () => {
  graphqlRequest.mockRejectedValue(new Error('Cannot query field "playoffProjection"'))
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  const { getPlayoffProjection } = await import("@/features/playoffs/api/get-playoff-projection")

  expect(await getPlayoffProjection()).toBeNull()
  expect(warn).toHaveBeenCalledOnce()
  warn.mockRestore()
})
