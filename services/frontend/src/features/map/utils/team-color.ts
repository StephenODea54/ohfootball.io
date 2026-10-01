/** A team color in the form #RRGGBB. The map writes only such a color into the page. */
const HEX_COLOR = /^#[0-9a-f]{6}$/i

/** The darkest color the map uses, as a relative luminance. Black and navy fall below it. */
const DARKEST = 0.06

/** The lightest color the map uses. White, cream, and pale gold fall above it. */
const LIGHTEST = 0.7

/** The relative luminance of a #RRGGBB color, from 0 for black to 1 for white, as WCAG defines it. */
export function luminance(hex: string) {
  const [red, green, blue] = [1, 3, 5].map((start) => {
    const channel = Number.parseInt(hex.slice(start, start + 2), 16) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

/**
 * The color that a school gives its region: its primary color, or its secondary color when the
 * primary is too dark or too pale to show on both a dark and a white page. Null when neither
 * color is usable, so the region is gray.
 */
export function teamColor(primary: string | null, secondary: string | null): string | null {
  return (
    [primary, secondary].find((color): color is string => {
      if (color === null || !HEX_COLOR.test(color)) return false
      const value = luminance(color)
      return value >= DARKEST && value <= LIGHTEST
    }) ?? null
  )
}
