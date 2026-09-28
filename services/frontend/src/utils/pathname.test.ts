import { describe, expect, it } from "vitest"
import { visitorPathname } from "@/utils/pathname"

describe("visitorPathname", () => {
  it.each([
    ["/", "/"],
    ["/index.html", "/"],
    ["/index", "/"],
    ["", "/"],
    ["/leaderboard", "/leaderboard"],
    ["/leaderboard.html", "/leaderboard"],
    ["/teams/abc.html", "/teams/abc"],
    ["/teams/index.html", "/teams/"],
    ["/404.html", "/404"],
  ])("reads %j as %j", (pathname, expected) => {
    expect(visitorPathname(pathname)).toBe(expected)
  })

  it("removes only an .html at the end", () => {
    expect(visitorPathname("/a.html/b")).toBe("/a.html/b")
  })
})
