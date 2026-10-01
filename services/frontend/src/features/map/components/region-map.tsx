import type { CSSProperties } from "react"
import { Link } from "@/components/ui/link"
import { paths } from "@/config/paths"
import type { RegionKey, RegionKing } from "@/features/map/utils/regions"
import type { Dot } from "@/features/map/utils/school-dots"
import { TeamLogo } from "@/features/teams/components/team-logo"
import { formatRating } from "@/features/teams/utils/format"

/**
 * The color of a region whose best school has no team color that shows on both themes. A gray
 * from the theme works on a dark and a white page.
 */
const FALLBACK_COLOR = "var(--color-muted-fg)"

/** The color of a region as a CSS variable, so the classes below can paint with it. */
function tint(color: string) {
  return { "--tint": color } as CSSProperties
}

/**
 * The classes that paint with the tint of a region, written out in full for Tailwind. On a white
 * page the team color fills the region strongly and the dots are white. On a dark page the fill
 * is faint and the dots glow like stars.
 */
const TINT = {
  fill: "[fill:var(--tint)] [fill-opacity:0.6] dark:[fill-opacity:0.12]",
  stroke: "fill-none stroke-2 [stroke:var(--tint)]",
  stop: "[stop-color:var(--tint)]",
  border: "[border-left-color:var(--tint)]",
}

interface RegionMapProps {
  map: {
    width: number
    height: number
    countyBorders: string
    regions: { key: RegionKey; path: string; center: { x: number; y: number } }[]
  }
  /** The place of the best school of each region, in map units. */
  kingPoints: Partial<Record<RegionKey, { x: number; y: number }>>
  kings: RegionKing[]
  dots: Dot[]
}

/**
 * Ohio in five colored regions, with a card for the best rated school of each. Every school is a
 * dot. The build draws it, so the browser runs no code for it, and it follows the theme of the
 * page. Each card links to the page of its school.
 */
export function RegionMap({ map, kingPoints, kings, dots }: RegionMapProps) {
  // Each region takes the color of its best school. The color comes from the data, so it is
  // set with a style and not a class.
  const tintOf = (key: RegionKey) =>
    tint(kings.find((entry) => entry.region.key === key)?.color ?? FALLBACK_COLOR)
  const percent = (point: { x: number; y: number }) => ({
    left: `${(point.x / map.width) * 100}%`,
    top: `${(point.y / map.height) * 100}%`,
  })

  return (
    <div>
      <div className="group relative">
        <svg
          viewBox={`0 0 ${map.width} ${map.height}`}
          className="h-auto w-full overflow-visible"
          aria-hidden="true"
        >
          <defs>
            {map.regions.map((region) => {
              const point = kingPoints[region.key] ?? region.center
              return (
                <g key={region.key} style={tintOf(region.key)}>
                  <clipPath id={`region-clip-${region.key}`}>
                    <path d={region.path} />
                  </clipPath>
                  <radialGradient
                    id={`region-glow-${region.key}`}
                    gradientUnits="userSpaceOnUse"
                    cx={point.x}
                    cy={point.y}
                    r={360}
                  >
                    <stop offset="0%" className={TINT.stop} style={{ stopOpacity: 0.75 }} />
                    <stop offset="35%" className={TINT.stop} style={{ stopOpacity: 0.25 }} />
                    <stop offset="100%" className={TINT.stop} style={{ stopOpacity: 0.03 }} />
                  </radialGradient>
                </g>
              )
            })}
          </defs>
          {map.regions.map((region) => (
            <g key={region.key} style={tintOf(region.key)}>
              <path d={region.path} className={TINT.fill} />
              <rect
                width={map.width}
                height={map.height}
                fill={`url(#region-glow-${region.key})`}
                clipPath={`url(#region-clip-${region.key})`}
                className="opacity-70 motion-safe:transition-opacity motion-safe:duration-500 group-hover:opacity-90 dark:opacity-80 dark:group-hover:opacity-100"
              />
            </g>
          ))}
          <path d={map.countyBorders} className="fill-none stroke-bg/25 dark:stroke-fg/10" />
          {map.regions.map((region) => (
            <path
              key={region.key}
              d={region.path}
              className={TINT.stroke}
              style={{ ...tintOf(region.key), strokeOpacity: 0.8 }}
              strokeLinejoin="round"
            />
          ))}
          {/* The dots are white in both themes: stars on a dark page, and light points on the
              strong colors of a white page. */}
          <g>
            {dots.map((dot) => (
              <circle
                key={dot.id}
                cx={dot.x}
                cy={dot.y}
                r={dot.radius * 0.8}
                opacity={dot.opacity}
                className={
                  dot.twinkleDelay === null
                    ? "fill-bg dark:fill-fg"
                    : "fill-bg motion-safe:animate-twinkle dark:fill-fg"
                }
                style={
                  dot.twinkleDelay === null
                    ? undefined
                    : { animationDelay: `${dot.twinkleDelay}ms` }
                }
              />
            ))}
          </g>
        </svg>

        {kings.map(({ region, king }) => {
          const center = map.regions.find((shape) => shape.key === region.key)?.center
          if (!king || !center) return null
          return (
            <div
              key={region.key}
              className="absolute hidden -translate-x-1/2 -translate-y-1/2 lg:block"
              style={percent(center)}
            >
              <KingCard king={king} label={region.label} style={tintOf(region.key)} />
            </div>
          )
        })}
      </div>

      <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:hidden">
        {kings.flatMap(({ region, king }) =>
          king
            ? [
                <li key={region.key}>
                  <KingCard king={king} label={region.label} style={tintOf(region.key)} />
                </li>,
              ]
            : [],
        )}
      </ul>
    </div>
  )
}

function KingCard({
  king,
  label,
  style,
}: {
  king: NonNullable<RegionKing["king"]>
  label: string
  /** The tint of the region, which colors the left edge of the card. */
  style: CSSProperties
}) {
  return (
    <Link
      href={paths.team.getHref(king.id)}
      className={`flex items-center gap-3 whitespace-nowrap rounded-xl border border-l-4 bg-bg/90 px-3 py-2 shadow-lg backdrop-blur-sm motion-safe:transition-transform motion-safe:hover:-translate-y-0.5 ${TINT.border}`}
      style={style}
    >
      <TeamLogo team={king} size="sm" />
      <span className="flex flex-col">
        <span className="font-semibold text-[0.6875rem]/4 text-muted-fg uppercase tracking-wider">
          {label}
        </span>
        <span className="font-semibold text-fg text-sm/5">{king.name}</span>
        <span className="text-muted-fg text-xs/4 tabular-nums">
          {`#${king.rating.rank} · ${formatRating(king.rating.value)}`}
        </span>
      </span>
    </Link>
  )
}
