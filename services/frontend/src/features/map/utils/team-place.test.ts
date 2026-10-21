import { describe, expect, it } from "vitest"
import { teamPlace } from "@/features/map/utils/team-place"

describe("teamPlace", () => {
  it("joins the county, the division, and the region that are known", () => {
    expect(teamPlace({ county: "Stark", division: 3, region: 9 })).toBe("Stark · D-III · Region 9")
    expect(teamPlace({ county: null, division: null, region: null })).toBe("Independent")
  })
})
