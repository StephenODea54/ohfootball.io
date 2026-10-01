import { describe, expect, it } from "vitest"
import { rivalries, rivalriesOf, rivalryName } from "@/features/compare/rivalries"
import { isSafeSourceId } from "@/features/compare/utils/program-history"

describe("the rivalries", () => {
  it("each pair two different programs with safe ids", () => {
    for (const rivalry of rivalries) {
      expect(rivalry.a).not.toBe(rivalry.b)
      expect(isSafeSourceId(rivalry.a), rivalry.a).toBe(true)
      expect(isSafeSourceId(rivalry.b), rivalry.b).toBe(true)
    }
  })

  it("name each pair one time", () => {
    const pairs = rivalries.map((rivalry) => [rivalry.a, rivalry.b].sort().join("-"))
    expect(new Set(pairs).size).toBe(pairs.length)
  })
})

describe("rivalriesOf", () => {
  it("finds the rivalries of a program on either side", () => {
    expect(rivalriesOf("1624")).toEqual([{ a: "1624", b: "306" }])
    expect(rivalriesOf("306")).toEqual([{ a: "1624", b: "306" }])
  })

  it("finds nothing for a program with no rivalry", () => {
    expect(rivalriesOf("99999")).toEqual([])
  })
})

describe("rivalryName", () => {
  it("names both schools", () => {
    expect(rivalryName({ name: "Piqua" }, { name: "Troy" })).toBe("Piqua vs. Troy")
  })
})
