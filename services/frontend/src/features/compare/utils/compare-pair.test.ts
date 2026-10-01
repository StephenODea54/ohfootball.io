import { describe, expect, it } from "vitest"
import { pairNotice, parseComparePair } from "@/features/compare/utils/compare-pair"

const known = new Set(["1624", "306"])

describe("parseComparePair", () => {
  it("reads both ids", () => {
    expect(parseComparePair("?a=1624&b=306", known)).toEqual({
      a: "1624",
      b: "306",
      dropped: [],
      repeated: false,
    })
  })

  it("reads one id", () => {
    expect(parseComparePair("?a=1624", known)).toMatchObject({ a: "1624", b: null, dropped: [] })
  })

  it("reads the second id alone", () => {
    expect(parseComparePair("?b=306", known)).toMatchObject({ a: null, b: "306" })
  })

  it("drops a second id equal to the first", () => {
    expect(parseComparePair("?a=1624&b=1624", known)).toEqual({
      a: "1624",
      b: null,
      dropped: [],
      repeated: true,
    })
  })

  it("drops an id that is not safe", () => {
    expect(parseComparePair("?a=../x&b=306", known)).toEqual({
      a: null,
      b: "306",
      dropped: ["../x"],
      repeated: false,
    })
  })

  it("drops and names an id that the page does not know", () => {
    expect(parseComparePair("?a=99999&b=306", known)).toMatchObject({
      a: null,
      b: "306",
      dropped: ["99999"],
    })
  })

  it("cuts a long dropped value", () => {
    expect(parseComparePair(`?a=${"x".repeat(50)}`, known).dropped).toEqual(["x".repeat(20)])
  })

  it("reads nothing from an empty query string", () => {
    expect(parseComparePair("", known)).toEqual({ a: null, b: null, dropped: [], repeated: false })
    expect(parseComparePair("?a=&b=", known)).toMatchObject({ a: null, b: null, dropped: [] })
  })
})

describe("pairNotice", () => {
  it("says nothing when nothing was left out", () => {
    expect(pairNotice({ dropped: [], repeated: false })).toBeNull()
  })

  it("asks for two different schools", () => {
    expect(pairNotice({ dropped: [], repeated: true })).toBe("Pick two different schools.")
  })

  it("names each id that the page does not know", () => {
    expect(pairNotice({ dropped: ["99999", "../x"], repeated: false })).toBe(
      'No school with the id "99999" and "../x" has a page this season.',
    )
  })

  it("gives both messages at once", () => {
    expect(pairNotice({ dropped: ["1"], repeated: true })).toContain("different schools. No school")
  })
})
