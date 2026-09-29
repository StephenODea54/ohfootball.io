import { describe, expect, it } from "vitest"
import { isCurrentPage, navItems } from "@/components/layouts/nav-items"

describe("the navigation bar", () => {
  it("shows the pages in order", () => {
    expect(navItems.map((item) => item.label)).toEqual([
      "Home",
      "About",
      "Leaderboard",
      "Methodology",
      "Data",
      "API",
    ])
    expect(navItems.find((item) => item.label === "Data")?.getHref()).toBe("/data")
  })

  it("marks Home on the home page and on a team page", () => {
    expect(isCurrentPage("/", "/")).toBe(true)
    expect(isCurrentPage("/", "/teams/abc")).toBe(true)
    expect(isCurrentPage("/", "/data")).toBe(false)
  })

  it("marks any other page only on its own address", () => {
    expect(isCurrentPage("/data", "/data")).toBe(true)
    expect(isCurrentPage("/api", "/data")).toBe(false)
    expect(isCurrentPage("/data", "/teams/abc")).toBe(false)
  })
})
