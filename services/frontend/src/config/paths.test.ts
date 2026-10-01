import { expect, it } from "vitest"
import { links, paths } from "@/config/paths"

it("builds every address without a season", () => {
  expect(paths.home.getHref()).toBe("/")
  expect(paths.about.getHref()).toBe("/about")
  expect(paths.leaderboard.getHref()).toBe("/leaderboard")
  expect(paths.methodology.getHref()).toBe("/methodology")
  expect(paths.accuracy.getHref()).toBe("/accuracy")
  expect(paths.data.getHref()).toBe("/data")
  expect(paths.api.getHref()).toBe("/api")
  expect(paths.team.getHref("abc")).toBe("/teams/abc")
})

it("links to the project and the score sources outside the site", () => {
  expect(Object.values(links)).toEqual([
    "https://github.com/StephenODea54/ohfootball.io",
    "https://github.com/StephenODea54/ohfootball.io/issues",
    "https://www.kaggle.com/datasets/stephenodea54/ohfootball",
    "mailto:hey@ohfootball.io",
    "https://joeeitel.com/hsfoot/",
    "https://ohhsfbdb.net/",
    "https://www.fantastic50.net/",
  ])
})
