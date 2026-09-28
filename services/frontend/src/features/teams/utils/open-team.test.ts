import { afterEach, expect, it, vi } from "vitest"
import { openTeam } from "@/features/teams/utils/open-team"

afterEach(() => {
  vi.unstubAllGlobals()
})

it("loads the page of the team", () => {
  const assign = vi.fn()
  vi.stubGlobal("window", { location: { assign } })

  openTeam("abc")

  expect(assign).toHaveBeenCalledWith("/teams/abc")
})
