import { describe, expect, it } from "vitest"
import { slotStyles } from "@/features/compare/components/slot-colors"
import type { ProgramHistory } from "@/features/compare/types"

function history(primary: string | null, secondary: string | null): ProgramHistory {
  return {
    sourceId: "1",
    name: "School",
    teamId: "team-1",
    colors: { primary, secondary },
    seasons: [],
    games: [],
  }
}

describe("slotStyles", () => {
  it("gives each side the colors of its school, a solid line for a and a dashed line for b", () => {
    expect(slotStyles(history("#0000ff", "#ffd700"), history("#ff0000", "#ffffff"))).toEqual({
      a: { light: "#0000ff", dark: "#447cff", dash: undefined },
      b: { light: "#fb0000", dark: "#ff0000", dash: "6 3" },
    })
  })

  it("keeps the dash of each side with no school", () => {
    expect(slotStyles(null, null)).toEqual({
      a: {
        light: "var(--color-primary-subtle-fg)",
        dark: "var(--color-primary-subtle-fg)",
        dash: undefined,
      },
      b: {
        light: "var(--color-warning-subtle-fg)",
        dark: "var(--color-warning-subtle-fg)",
        dash: "6 3",
      },
    })
  })
})
