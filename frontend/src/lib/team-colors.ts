/**
 * School colors come from the scraped source, so they arrive in two shapes. Most are already
 * six-digit hex. A small number are CSS color names that the source wrote by hand. Both are turned
 * into hex here so every swatch is painted the same way.
 */

const NAMED_COLORS: Record<string, string> = {
  black: "#000000",
  blue: "#0000FF",
  brown: "#A52A2A",
  gold: "#FFD700",
  gray: "#808080",
  green: "#008000",
  grey: "#808080",
  maroon: "#800000",
  navy: "#000080",
  orange: "#FFA500",
  purple: "#800080",
  red: "#FF0000",
  silver: "#C0C0C0",
  teal: "#008080",
  white: "#FFFFFF",
  yellow: "#FFFF00",
}

/** Turns a scraped color into six-digit hex. Returns null when the value cannot be read. */
export function normalizeColor(value: string | null | undefined): string | null {
  if (!value) return null

  const trimmed = value.trim()
  const named = NAMED_COLORS[trimmed.toLowerCase()]
  if (named) return named

  const hex = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed
  if (/^[0-9a-f]{3}$/i.test(hex)) {
    return `#${hex.split("").map((digit) => digit + digit).join("")}`.toUpperCase()
  }
  if (/^[0-9a-f]{6}$/i.test(hex)) return `#${hex.toUpperCase()}`

  return null
}

/**
 * The swatch colors for one school, in the order the source lists them. A school with no readable
 * color returns an empty list, so the card drops the swatch row rather than drawing a blank box.
 */
export function teamSwatches(
  primary: string | null | undefined,
  secondary: string | null | undefined,
): string[] {
  return [primary, secondary].map(normalizeColor).filter((color): color is string => color !== null)
}
