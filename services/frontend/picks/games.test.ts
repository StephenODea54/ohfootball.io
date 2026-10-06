import { describe, expect, it } from "vitest"
import { readGames } from "./games"
import { gamesFile, OPEN } from "./test/fixtures"

describe("readGames", () => {
  it("keys the games by game key", () => {
    const games = readGames(gamesFile())

    expect(games.size).toBe(5)
    expect(games.get(OPEN)?.date).toBe("2026-10-09")
  })

  it("takes a file with no games", () => {
    expect(readGames({ ...gamesFile(), games: [] }).size).toBe(0)
  })

  it.each([
    ["no file", null],
    ["text", "games"],
    ["no games", {}],
    ["games that are not a list", { games: {} }],
  ])("refuses %s", (_, file) => {
    expect(() => readGames(file)).toThrow("not valid")
  })

  it.each([
    ["no game key", { gameKey: 1 }],
    ["no season", { season: "2026" }],
    ["a season that is not whole", { season: 2026.5 }],
    ["no date", { date: undefined }],
    ["a date in another form", { date: "10/09/2026" }],
    ["no lock", { lockAt: null }],
    ["a lock that is not a time", { lockAt: "soon" }],
    ["no canceled flag", { canceled: "no" }],
    ["a result that is not an object", { result: "a" }],
  ])("refuses a game with %s", (_, change) => {
    const file = gamesFile()
    file.games[0] = { ...file.games[0], ...change } as never

    expect(() => readGames(file)).toThrow("not valid")
  })

  it("refuses a game that is not an object", () => {
    expect(() => readGames({ games: [null] })).toThrow("not valid")
  })
})
