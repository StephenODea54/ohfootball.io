import type { SchoolColors } from "@/features/compare/types"
import { isHexColor } from "@/features/compare/utils/school-colors"
import {
  chroma,
  distance,
  fromOklch,
  hexToOklab,
  type Oklab,
  oklabToHex,
  toGamut,
} from "@/lib/oklab"

/** The themes of the site. The dark theme is on when the page has the class `dark`. */
const THEMES = ["light", "dark"] as const

export type Theme = (typeof THEMES)[number]

/** A CSS color for each theme. */
export type ThemedColor = Record<Theme, string>

/** The color of a line in each theme, and the same colors in OKLab for the distance check. */
interface LineColor {
  css: ThemedColor
  lab: Record<Theme, Oklab>
}

/** A color with less chroma than this looks gray. Black, white, gray, and #e0e0e0 are below it. */
const INK_CHROMA = 0.04

/**
 * The lightness of a gray team color in each theme. A line in black is lost on the dark page and a
 * line in white is lost on the white page, so a gray line is dark on the light theme and light on
 * the dark theme.
 */
const INK_LIGHTNESS: Record<Theme, number> = { light: 0.3, dark: 0.88 }

/**
 * The lightness that a team color is moved into, for each theme. The card behind the chart is
 * white (lightness 1) in the light theme and oklch(0.17 ...) in the dark theme.
 *
 * Below 0.40 on light, a color starts to look black. Above 0.62 on light, a pale color such as
 * gold has too little contrast with white. On dark, below 0.62 a navy or a maroon has too little
 * contrast. Above 0.82 on dark, a color starts to look white.
 */
const LIGHTNESS_BANDS: Record<Theme, readonly [number, number]> = {
  light: [0.4, 0.62],
  dark: [0.62, 0.82],
}

/**
 * The smallest OKLab distance between the two lines, in each theme. Red and orange (about 0.17)
 * pass. Red and a darker red such as #cf0000 (about 0.09) do not.
 */
const MIN_DISTANCE = 0.15

/**
 * The OKLab value of a token as an sRGB screen shows it. Some tokens are outside sRGB, and the
 * browser draws them at the nearest color it can show. The distance check uses that color, as it
 * does for a team color.
 */
function shownToken(l: number, c: number, h: number): Oklab {
  return hexToOklab(oklabToHex(toGamut(fromOklch(l, c, h))))
}

/**
 * The lines of each side when a school has no usable color. The chart draws them with the tokens
 * of the site. The OKLab values come from the tokens in src/styles.css, for the distance check
 * only: --primary-subtle-fg, and --warning-subtle-fg, which is amber-700 on light and amber-400
 * on dark in Tailwind. Change them together with styles.css.
 */
const DEFAULT_LINES = {
  a: {
    css: { light: "var(--color-primary-subtle-fg)", dark: "var(--color-primary-subtle-fg)" },
    // biome-ignore lint/suspicious/noApproximativeNumericConstant: 0.707 is the lightness of the token.
    lab: { light: shownToken(0.488, 0.243, 264.376), dark: shownToken(0.707, 0.165, 254.624) },
  },
  b: {
    css: { light: "var(--color-warning-subtle-fg)", dark: "var(--color-warning-subtle-fg)" },
    lab: { light: shownToken(0.555, 0.163, 48.998), dark: shownToken(0.828, 0.189, 84.429) },
  },
} satisfies Record<string, LineColor>

/**
 * A team color made readable on the page of one theme. A gray color becomes a gray of fixed
 * lightness. Any other color keeps its hue and its chroma, and its lightness moves into the band
 * of the theme. When sRGB cannot show the result, the chroma goes down until it can.
 */
export function themeColor(hex: string, theme: Theme): string {
  const color = hexToOklab(hex)
  if (chroma(color) < INK_CHROMA) return oklabToHex({ l: INK_LIGHTNESS[theme], a: 0, b: 0 })
  const [low, high] = LIGHTNESS_BANDS[theme]
  return oklabToHex(toGamut({ ...color, l: Math.min(high, Math.max(low, color.l)) }))
}

/** The line of a team color in both themes. The distance check reads the final #rrggbb values. */
function schoolLine(hex: string): LineColor {
  const css = { light: themeColor(hex, "light"), dark: themeColor(hex, "dark") }
  return { css, lab: { light: hexToOklab(css.light), dark: hexToOklab(css.dark) } }
}

/** The lines of the usable colors of a school, primary first. */
function schoolLines(colors: SchoolColors): LineColor[] {
  return [colors.primary, colors.secondary].filter(isHexColor).map(schoolLine)
}

/** True when the two lines differ enough in both themes. */
function farApart(first: LineColor, second: LineColor) {
  return THEMES.every((theme) => distance(first.lab[theme], second.lab[theme]) >= MIN_DISTANCE)
}

/** The line of a school alone: its primary color, else its secondary color, else the default. */
function soloLine(colors: SchoolColors | null, fallback: LineColor): LineColor {
  return (colors && schoolLines(colors)[0]) ?? fallback
}

/**
 * The line colors of the two sides of a comparison. Side a takes its own line first. Side b takes
 * the first of its primary color, its secondary color, and the default amber that differs enough
 * from the line of side a. When none differs enough, both sides use the defaults of the site. A
 * side with no school takes nothing from the other side.
 */
export function lineColors(
  a: SchoolColors | null,
  b: SchoolColors | null,
): Record<"a" | "b", ThemedColor> {
  const lineA = soloLine(a, DEFAULT_LINES.a)
  if (!a || !b) return { a: lineA.css, b: soloLine(b, DEFAULT_LINES.b).css }
  const lineB = [...schoolLines(b), DEFAULT_LINES.b].find((line) => farApart(lineA, line))
  return lineB ? { a: lineA.css, b: lineB.css } : { a: DEFAULT_LINES.a.css, b: DEFAULT_LINES.b.css }
}
