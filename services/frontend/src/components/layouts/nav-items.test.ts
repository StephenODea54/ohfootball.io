import { describe, expect, it } from "vitest"
import { isCurrentPage, navItems } from "@/components/layouts/nav-items"

describe("the navigation bar", () => {
  it("shows the pages in order", () => {
    expect(navItems.map((item) => item.label)).toEqual([
      "Home",
      "About",
      "Leaderboard",
      "Compare",
      "Methodology",
      "Accuracy",
      "Data",
      "API",
    ])
    expect(navItems.find((item) => item.label === "Data")?.getHref()).toBe("/data")
  })

  it("marks Home only on the home page", () => {
    expect(isCurrentPage("/", "/")).toBe(true)
    expect(isCurrentPage("/", "/data")).toBe(false)
  })

  it("marks no page on a team page", () => {
    expect(navItems.some((item) => isCurrentPage(item.path, "/teams/abc"))).toBe(false)
  })

  it("marks Compare on the compare page", () => {
    expect(isCurrentPage("/compare", "/compare")).toBe(true)
    expect(isCurrentPage("/compare", "/comparisons")).toBe(false)
    expect(isCurrentPage("/", "/compare")).toBe(false)
    expect(navItems.find((item) => item.label === "Compare")?.getHref()).toBe("/compare")
  })

  it("marks any other page only on its own address", () => {
    expect(isCurrentPage("/data", "/data")).toBe(true)
    expect(isCurrentPage("/api", "/data")).toBe(false)
    expect(isCurrentPage("/data", "/teams/abc")).toBe(false)
  })
})
