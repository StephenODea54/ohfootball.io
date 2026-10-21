import { type CSSProperties, memo } from "react"
import { paths } from "@/config/paths"
import {
  type CellLayout,
  COMPACT_PILL,
  PILL_HEIGHT,
  pillWidth,
} from "@/features/map/utils/cell-layout"
import type { MapMarker } from "@/features/map/utils/markers"
import type { Territory } from "@/features/map/utils/territories"
import type { Point } from "@/features/map/utils/zoom"
import { logoHref, teamInitials } from "@/features/teams/utils/team-logo"

/** The color of a territory of a school with no usable team color. */
export const FALLBACK_COLOR = "var(--color-muted-fg)"

interface TeamCellProps {
  marker: MapMarker
  territory: Territory
  layout: CellLayout
  /** The id of the clip path of this territory. */
  clipId: string
  /** The id of the blur filter that makes the glow. */
  glowId: string
  /** True while the card of this school shows. */
  active: boolean
}

/**
 * Places a drawing at a point at the scale of one CSS pixel. --map-px follows each step of a
 * zoom, so the drawing keeps its size on the screen.
 */
function place(point: Point, scale = 1): CSSProperties {
  return {
    transform: `translate(${point.x}px, ${point.y}px) scale(calc(var(--map-px, 1) * ${scale}))`,
  }
}

/**
 * The territory of one school in its team color, as on the poster map of the home page. It has a
 * glow on its edge, a large faint logo, and a dot where the school is. The rank is drawn apart, in
 * TeamPill, above all the territories.
 *
 * The territory is a link to the page of the team. It is an SVG link, because the Link component
 * renders an HTML link and cannot go inside an SVG. The map is for the pointer only, so the link
 * is out of the tab order, and the list of the page is the way for a keyboard.
 */
export const TeamCell = memo(function TeamCell({
  marker,
  territory,
  layout,
  clipId,
  glowId,
  active,
}: TeamCellProps) {
  const { circle } = territory
  const tint = { "--tint": marker.color ?? FALLBACK_COLOR } as CSSProperties
  const logo = layout.logo
  const logoFile = logo ? logoHref(marker.sourceId, logo.file) : null

  return (
    <a
      href={paths.team.getHref(marker.id)}
      tabIndex={-1}
      aria-label={`#${marker.rank} ${marker.name}`}
      data-cell={marker.id}
      data-active={active || undefined}
      className="team-cell cursor-pointer outline-0"
      style={tint}
    >
      <clipPath id={clipId}>
        <path d={territory.path} />
      </clipPath>
      <path
        d={territory.path}
        className="cell-fill [fill-opacity:0.8] [fill:var(--tint)] dark:[fill-opacity:0.78]"
      />
      {/* The logo is wider than the circle of the territory, so the territory clips it. */}
      {logo && (
        <g clipPath={`url(#${clipId})`} className="pointer-events-none">
          {logoFile ? (
            <image
              href={logoFile}
              x={circle.x - logo.size / 2}
              y={circle.y - logo.size / 2}
              width={logo.size}
              height={logo.size}
              className="cell-logo"
            />
          ) : (
            <text
              x={circle.x}
              y={circle.y}
              textAnchor="middle"
              dominantBaseline="central"
              className="cell-logo fill-fg font-bold"
              style={{ fontSize: logo.size * 0.4 }}
            >
              {teamInitials(marker.name)}
            </text>
          )}
        </g>
      )}
      {/* One stroke in the team color, blurred into a glow, as on the poster map. The territory
          clips it, so each side of a shared edge glows in the color of its own school. */}
      <g clipPath={`url(#${clipId})`} className="cell-glow pointer-events-none">
        <path
          d={territory.path}
          vectorEffect="non-scaling-stroke"
          strokeWidth={3}
          strokeLinejoin="round"
          filter={`url(#${glowId})`}
          className="fill-none [stroke:var(--tint)]"
        />
      </g>
      <g style={place(marker)} className="pointer-events-none">
        <circle r={2} className="fill-fg/70" />
      </g>
    </a>
  )
})

interface TeamPillProps {
  rank: number
  /** The point that the badge hangs from, in map units. */
  at: Point
  compact: boolean
}

/** The rank of a school in a badge that hangs below its point and keeps its size on the screen. */
export function TeamPill({ rank, at, compact }: TeamPillProps) {
  const label = `#${rank}`
  const width = pillWidth(rank)
  return (
    <g style={place(at, compact ? COMPACT_PILL : 1)}>
      <rect
        x={-width / 2}
        y={0}
        width={width}
        height={PILL_HEIGHT}
        rx={PILL_HEIGHT / 2}
        className="fill-fg stroke-bg [stroke-width:1.5]"
      />
      <text
        y={PILL_HEIGHT / 2}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-bg font-bold text-[11px] tabular-nums"
      >
        {label}
      </text>
    </g>
  )
}
