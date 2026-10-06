import { describe, expect, it } from "vitest"
import { pageItems, pageSummary } from "@/features/teams/utils/paginate"

describe("pageItems", () => {
  it("lists every page when there are five or fewer", () => {
    expect(pageItems(1, 1)).toEqual([1])
    expect(pageItems(3, 5)).toEqual([1, 2, 3, 4, 5])
  })

  it.each([1, 3])("shows the first three pages on page %i", (current) => {
    expect(pageItems(current, 15)).toEqual([1, 2, 3, "gap-end", 15])
  })

  it.each([4, 12])("shows only the current page between gaps on page %i", (current) => {
    expect(pageItems(current, 15)).toEqual([1, "gap-start", current, "gap-end", 15])
  })

  it.each([13, 15])("shows the last three pages on page %i", (current) => {
    expect(pageItems(current, 15)).toEqual([1, "gap-start", 13, 14, 15])
  })

  it("always has five slots past five pages", () => {
    for (let current = 1; current <= 15; current++) {
      expect(pageItems(current, 15)).toHaveLength(5)
    }
  })
})

describe("pageSummary", () => {
  it("names the first and last school of a full page", () => {
    expect(pageSummary(1, 703)).toBe("Schools 1–50 of 703")
    expect(pageSummary(2, 703)).toBe("Schools 51–100 of 703")
  })

  it("stops at the last school on the last page", () => {
    expect(pageSummary(15, 703)).toBe("Schools 701–703 of 703")
    expect(pageSummary(1, 23)).toBe("Schools 1–23 of 23")
  })

  it("uses the page size that the caller gives", () => {
    expect(pageSummary(2, 30, 10)).toBe("Schools 11–20 of 30")
  })
})
