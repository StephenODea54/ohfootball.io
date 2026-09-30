import { describe, expect, it, vi } from "vitest"
import { logoHref, teamInitials } from "@/features/teams/utils/team-logo"

vi.mock("@/features/teams/utils/logo-manifest.json", () => ({ default: ["842", "1010"] }))

describe("logoHref", () => {
  it("gives the file of each size for a team with a logo", () => {
    expect(logoHref("842", "small")).toBe("/logos/842-80.webp")
    expect(logoHref("1010", "large")).toBe("/logos/1010-192.webp")
  })

  it("gives null for a team without a logo", () => {
    expect(logoHref("84", "small")).toBeNull()
    expect(logoHref("", "large")).toBeNull()
    expect(logoHref(null, "small")).toBeNull()
  })
})

describe("teamInitials", () => {
  it("takes the first letter of the first two words", () => {
    expect(teamInitials("Massillon Washington")).toBe("MW")
    expect(teamInitials("Cincinnati Moeller Crusaders")).toBe("CM")
    expect(teamInitials("Ada")).toBe("A")
  })

  it("ignores a note in parentheses and punctuation", () => {
    expect(teamInitials("Cincinnati Eagles (club)")).toBe("CE")
    expect(teamInitials("West Union (club)")).toBe("WU")
    expect(teamInitials("St. Edward")).toBe("SE")
    expect(teamInitials("Toledo - St. John's")).toBe("TS")
  })

  it("gives no letters for a name without letters", () => {
    expect(teamInitials("(club)")).toBe("")
  })
})
