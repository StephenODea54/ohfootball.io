import type { ProgramHistory } from "@/features/compare/types"
import { lineColors, type ThemedColor } from "@/features/compare/utils/line-colors"

export type Slot = "a" | "b"

/** The line of one side: its color in each theme, and its dash pattern. */
export interface SlotStyle extends ThemedColor {
  /** The stroke-dasharray of the line. A solid line has none. */
  dash: string | undefined
}

export type SlotStyles = Record<Slot, SlotStyle>

/**
 * The dash of each side. The dash belongs to the side and not to the school, so the two lines
 * differ without color.
 */
const DASHES: Record<Slot, string | undefined> = { a: undefined, b: "6 3" }

/** The line of each side of a comparison, in the colors of its school. */
export function slotStyles(a: ProgramHistory | null, b: ProgramHistory | null): SlotStyles {
  const colors = lineColors(a?.colors ?? null, b?.colors ?? null)
  return {
    a: { ...colors.a, dash: DASHES.a },
    b: { ...colors.b, dash: DASHES.b },
  }
}
