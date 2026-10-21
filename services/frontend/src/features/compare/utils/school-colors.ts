import type { SchoolColors } from "@/features/compare/types"
import type { TeamSummary } from "@/types/api"

/** A color in the form #rrggbb with lowercase letters. Only such a color goes into a history file. */
const HEX_COLOR = /^#[0-9a-f]{6}$/

/** A short color in the form #rgb. */
const SHORT_HEX_COLOR = /^#[0-9a-f]{3}$/

/**
 * The color names that the data uses, and the 16 basic color names of HTML. The table is small,
 * because the module can be part of the page in the browser.
 */
const NAMED_COLORS = new Map([
  ["aqua", "#00ffff"],
  ["black", "#000000"],
  ["blue", "#0000ff"],
  ["fuchsia", "#ff00ff"],
  ["gold", "#ffd700"],
  ["gray", "#808080"],
  ["green", "#008000"],
  ["grey", "#808080"],
  ["lime", "#00ff00"],
  ["maroon", "#800000"],
  ["navy", "#000080"],
  ["olive", "#808000"],
  ["orange", "#ffa500"],
  ["purple", "#800080"],
  ["red", "#ff0000"],
  ["silver", "#c0c0c0"],
  ["teal", "#008080"],
  ["white", "#ffffff"],
  ["yellow", "#ffff00"],
])

/** True for a color in the form #rrggbb with lowercase letters. */
export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_COLOR.test(value)
}

/**
 * A team color from the data in the form #rrggbb, or null when the value is not a color. The data
 * holds #rrggbb, #rgb, and color names in any case.
 */
export function parseSchoolColor(raw: string | null): string | null {
  const value = raw?.trim().toLowerCase() ?? ""
  if (HEX_COLOR.test(value)) return value
  if (SHORT_HEX_COLOR.test(value)) {
    return `#${[...value.slice(1)].map((digit) => digit + digit).join("")}`
  }
  return NAMED_COLORS.get(value) ?? null
}

/** The two colors of a school, from its team of the current season. */
export function toSchoolColors(team: Pick<TeamSummary, "primaryColor" | "secondaryColor">) {
  return {
    primary: parseSchoolColor(team.primaryColor),
    secondary: parseSchoolColor(team.secondaryColor),
  } satisfies SchoolColors
}

/**
 * The colors of a history file that the browser loaded. A file from before the site wrote colors
 * has none. Each value goes through the same parser as the build, so a value that is not a color
 * is dropped. The chart writes the colors into a style element, so only a checked value goes on.
 */
export function readSchoolColors(value: unknown): SchoolColors {
  const colors = (typeof value === "object" && value !== null ? value : {}) as Partial<
    Record<keyof SchoolColors, unknown>
  >
  return {
    primary: typeof colors.primary === "string" ? parseSchoolColor(colors.primary) : null,
    secondary: typeof colors.secondary === "string" ? parseSchoolColor(colors.secondary) : null,
  }
}
