import { beforeEach, describe, expect, it, vi } from "vitest"

const graphqlRequest = vi.hoisted(() => vi.fn())

vi.mock("@/lib/graphql-client", () => ({ graphqlRequest }))

const { getProgram } = await import("@/features/compare/api/get-program")

const program = { sourceId: "1624", ratingHistory: [], games: [] }

beforeEach(() => {
  graphqlRequest.mockReset()
})

describe("getProgram", () => {
  it("asks for the program by its source id", async () => {
    graphqlRequest.mockResolvedValue({ program })

    expect(await getProgram("1624")).toEqual(program)
    expect(graphqlRequest).toHaveBeenCalledWith(expect.stringContaining("value: relativeRating"), {
      sourceId: "1624",
    })
  })

  it("stops the build when the API has no such program", async () => {
    graphqlRequest.mockResolvedValue({ program: null })

    await expect(getProgram("99999")).rejects.toThrow("the API has no program 99999")
  })
})
