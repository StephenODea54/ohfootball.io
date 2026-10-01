/**
 * The color of each side of a comparison. The color belongs to the side and not to the school, so
 * two schools with the same colors still differ. Each token has a value for the light theme and
 * one for the dark theme, and both read on their background. The second line is also dashed, so
 * the two lines differ without color.
 */
export const SLOT_STYLES = {
  a: { color: "var(--color-primary-subtle-fg)", dash: undefined },
  b: { color: "var(--color-warning-subtle-fg)", dash: "6 3" },
} as const

export type Slot = keyof typeof SLOT_STYLES
