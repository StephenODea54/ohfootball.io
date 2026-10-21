import type { Circle } from "@/features/map/utils/territories"
import type { Point } from "@/features/map/utils/zoom"
import type { LogoSize } from "@/features/teams/utils/logo-sizes"

/** The smallest logo on the screen, in CSS pixels. A smaller territory shows no logo. */
export const MIN_LOGO_PX = 24

/** The largest logo, as a share of the width of the view, so one huge territory stays calm. */
export const MAX_LOGO_SHARE = 0.35

/**
 * The width of the logo, as a share of the width of the circle of its territory. The logo is wider
 * than the circle, as on the poster map, and the territory clips it.
 */
export const LOGO_FILL = 1.6

/** A circle with a smaller radius than this, in CSS pixels, gets a smaller rank badge. */
export const PILL_MIN_INRADIUS_PX = 18

/** A logo wider than this on the screen uses the large file, so it stays sharp. */
export const LARGE_LOGO_PX = 40

/** How far below the middle of the circle the rank hangs, as a share of the radius. */
const PILL_DROP = 0.8

export interface CellLayout {
  /** The width of the logo in map units, and its file. Null when the territory is too small. */
  logo: { size: number; file: LogoSize } | null
  /** True when the territory is small, so the rank badge is smaller. */
  compactPill: boolean
}

/** What fits in a territory at the scale of the view. */
export function cellLayout(circle: Circle, unitsPerPx: number, viewWidth: number): CellLayout {
  const size = Math.min(2 * circle.r * LOGO_FILL, MAX_LOGO_SHARE * viewWidth)
  const sizePx = size / unitsPerPx
  return {
    logo: sizePx >= MIN_LOGO_PX ? { size, file: sizePx > LARGE_LOGO_PX ? "large" : "small" } : null,
    compactPill: circle.r / unitsPerPx < PILL_MIN_INRADIUS_PX,
  }
}

/**
 * Where the rank of a school hangs: below the middle of the circle of its territory, under the
 * logo. A territory with no room for a logo has its rank at the school, so each school shows its
 * rank, even when the chosen area clips its territory away.
 */
export function pillAnchor(circle: Circle, school: Point, layout: CellLayout): Point {
  return layout.logo ? { x: circle.x, y: circle.y + PILL_DROP * circle.r } : school
}

/** The rank badge on the screen, in CSS pixels. */
export const PILL_HEIGHT = 16

/** A small territory gets a badge at this share of the full size. */
export const COMPACT_PILL = 0.85

/** The least room between two badges, in CSS pixels. */
const PILL_GAP = 2

/** The width of the badge of a rank, in CSS pixels, before any scale. */
export function pillWidth(rank: number) {
  return 10 + 6.6 * `#${rank}`.length
}

export interface PlacedPill {
  id: string
  rank: number
  at: Point
  compact: boolean
}

/**
 * The badges that fit without covering another badge. A better rank goes first, so in a crowd the
 * best schools keep their ranks. The others show their rank on their card.
 */
export function visiblePills(pills: readonly PlacedPill[], unitsPerPx: number): Set<string> {
  const boxes: { left: number; right: number; top: number; bottom: number }[] = []
  const shown = new Set<string>()
  for (const pill of [...pills].sort((first, second) => first.rank - second.rank)) {
    const scale = (pill.compact ? COMPACT_PILL : 1) * unitsPerPx
    const half = (pillWidth(pill.rank) / 2) * scale
    const gap = PILL_GAP * unitsPerPx
    // The badge hangs below its point.
    const box = {
      left: pill.at.x - half - gap,
      right: pill.at.x + half + gap,
      top: pill.at.y - gap,
      bottom: pill.at.y + PILL_HEIGHT * scale + gap,
    }
    const covers = boxes.some(
      (other) =>
        box.left < other.right &&
        other.left < box.right &&
        box.top < other.bottom &&
        other.top < box.bottom,
    )
    if (covers) continue
    boxes.push(box)
    shown.add(pill.id)
  }
  return shown
}
