import type { CSSProperties } from "react"
import { Link } from "@/components/ui/link"
import { paths } from "@/config/paths"
import type { RegionKey, RegionKing } from "@/features/map/utils/regions"
import type { Dot } from "@/features/map/utils/school-dots"
import { TeamLogo } from "@/features/teams/components/team-logo"
import { formatRating } from "@/features/teams/utils/format"
import { logoHref } from "@/features/teams/utils/team-logo"

/** The color of a region whose best school has no usable team color. */
const FALLBACK_COLOR = "var(--color-muted-fg)"

/**
 * Where the card of each region sits, in percent of the map box. A card on the left grows to the
 * right from its spot, and a card on the right grows to the left. Some cards hang past the edge
 * of the map, as on a poster. The cards sit on the map only on an extra wide screen, where the
 * map is wide enough for them.
 */
const CARD_SPOTS: Record<RegionKey, { side: "left" | "right"; inset: number; top: number }> = {
  nw: { side: "left", inset: -1, top: 13 },
  ne: { side: "right", inset: 0, top: 19 },
  central: { side: "left", inset: 7, top: 40 },
  sw: { side: "left", inset: -2.5, top: 80 },
  se: { side: "right", inset: 0, top: 67 },
}

/**
 * Where the large logo of each region sits and how wide it is, as shares of the width and height
 * of the state. A region is not round, so its middle is often a poor spot. These spots keep each
 * logo mostly inside its region and clear of the cards. A logo may cross a border, as on a poster.
 */
const LOGO_SPOTS: Record<RegionKey, { x: number; y: number; width: number }> = {
  nw: { x: 0.24, y: 0.27, width: 0.33 },
  ne: { x: 0.81, y: 0.25, width: 0.25 },
  central: { x: 0.42, y: 0.51, width: 0.25 },
  sw: { x: 0.16, y: 0.65, width: 0.25 },
  se: { x: 0.75, y: 0.65, width: 0.24 },
}

/** The room around the state in the map box, in map units. It matches MAP_MARGIN. */
const MARGIN = 24

/** The classes that paint with the tint of a region, written out in full for Tailwind. */
const TINT = {
  fill: "[fill:var(--tint)] [fill-opacity:0.8] dark:[fill-opacity:0.5]",
  stroke: "fill-none [stroke:var(--tint)]",
  halo: "[fill:var(--tint)]",
  card: "border-l-4 [border-color:color-mix(in_oklab,var(--tint)_45%,transparent)] [border-left-color:var(--tint)]",
}

function tint(color: string) {
  return { "--tint": color } as CSSProperties
}

interface RegionPosterProps {
  map: {
    width: number
    height: number
    countyBorders: string
    regions: { key: RegionKey; path: string; center: { x: number; y: number } }[]
  }
  kings: RegionKing[]
  dots: Dot[]
}

/**
 * Ohio as a poster of five regions. Each region is filled with the team color of its best rated
 * school and carries a large, faint logo of that school. The borders and the school dots glow.
 * The build draws it, so the browser runs no code for it.
 */
export function RegionPoster({ map, kings, dots }: RegionPosterProps) {
  const kingOf = (key: RegionKey) => kings.find((entry) => entry.region.key === key)
  const tintOf = (key: RegionKey | null) => tint((key && kingOf(key)?.color) || FALLBACK_COLOR)
  const stateWidth = map.width - 2 * MARGIN
  const stateHeight = map.height - 2 * MARGIN
  const logos = map.regions.flatMap((region) => {
    const king = kingOf(region.key)?.king
    const href = king ? logoHref(king.sourceId, "large") : null
    if (!href) return []
    const spot = LOGO_SPOTS[region.key]
    return [
      {
        key: region.key,
        href,
        x: MARGIN + spot.x * stateWidth,
        y: MARGIN + spot.y * stateHeight,
        size: spot.width * stateWidth,
      },
    ]
  })
  // Only the larger dots get a colored halo, so the busy parts of the state do not blur together.
  const haloDots = dots.filter((dot) => dot.region !== null && dot.radius > 3)

  return (
    <div className="region-poster">
      <div className="group relative">
        <svg
          viewBox={`0 0 ${map.width} ${map.height}`}
          className="h-auto w-full overflow-visible"
          aria-hidden="true"
        >
          <defs>
            <filter id="poster-neon" x="-10%" y="-10%" width="120%" height="120%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="wide" />
              <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="near" />
              <feMerge>
                <feMergeNode in="wide" />
                <feMergeNode in="wide" />
                <feMergeNode in="near" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="poster-halo" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="6" />
            </filter>
            <filter id="poster-dot" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="1.6" result="soft" />
              <feMerge>
                <feMergeNode in="soft" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            {/* The dots fade where a logo sits, so the logo reads clearly through them. The mask
                keeps a dot at full strength in white and at a third in the dark gray. */}
            <radialGradient id="poster-logo-fade">
              <stop offset="0%" stopColor="#555" />
              <stop offset="70%" stopColor="#555" />
              <stop offset="100%" stopColor="#fff" />
            </radialGradient>
            <mask
              id="poster-logo-mask"
              maskUnits="userSpaceOnUse"
              x="-100"
              y="-100"
              width={map.width + 200}
              height={map.height + 200}
            >
              <rect
                x="-100"
                y="-100"
                width={map.width + 200}
                height={map.height + 200}
                fill="#fff"
              />
              {logos.map((logo) => (
                <circle
                  key={logo.key}
                  cx={logo.x}
                  cy={logo.y}
                  r={logo.size / 2}
                  fill="url(#poster-logo-fade)"
                />
              ))}
            </mask>
          </defs>

          {map.regions.map((region) => (
            <path
              key={region.key}
              d={region.path}
              data-region={region.key}
              className={`region-fill ${TINT.fill}`}
              style={tintOf(region.key)}
            />
          ))}
          <path
            d={map.countyBorders}
            className="pointer-events-none fill-none stroke-bg/30 stroke-[0.8] dark:stroke-fg/15"
          />

          {logos.map((logo) => (
            <image
              key={logo.key}
              href={logo.href}
              x={logo.x - logo.size / 2}
              y={logo.y - logo.size / 2}
              width={logo.size}
              height={logo.size}
              data-region={logo.key}
              className="region-logo pointer-events-none opacity-55 dark:opacity-50"
            />
          ))}

          {/* Only the region fills take the pointer, so pointing at a region works through the
              dots and the borders above it. */}
          <g mask="url(#poster-logo-mask)" className="pointer-events-none">
            <g filter="url(#poster-halo)" className="opacity-70 dark:opacity-90">
              {haloDots.map((dot) => (
                <circle
                  key={dot.id}
                  cx={dot.x}
                  cy={dot.y}
                  r={dot.radius * 2.4}
                  className={TINT.halo}
                  style={tintOf(dot.region)}
                />
              ))}
            </g>

            {map.regions.map((region) => (
              <path
                key={region.key}
                d={region.path}
                data-region={region.key}
                className={`${TINT.stroke} stroke-[3]`}
                style={tintOf(region.key)}
                strokeLinejoin="round"
                filter="url(#poster-neon)"
              />
            ))}

            <g filter="url(#poster-dot)">
              {dots.map((dot) => (
                <circle
                  key={dot.id}
                  cx={dot.x}
                  cy={dot.y}
                  r={dot.radius}
                  opacity={dot.opacity}
                  className={
                    dot.twinkleDelay === null
                      ? "fill-white"
                      : "fill-white motion-safe:animate-twinkle"
                  }
                  style={
                    dot.twinkleDelay === null
                      ? undefined
                      : { animationDelay: `${dot.twinkleDelay}ms` }
                  }
                />
              ))}
            </g>
          </g>

          {/* A second copy of each logo sits above the dots. It shows in full only while its
              region is pointed at, so the logo of that region comes forward. */}
          {logos.map((logo) => (
            <image
              key={logo.key}
              href={logo.href}
              x={logo.x - logo.size / 2}
              y={logo.y - logo.size / 2}
              width={logo.size}
              height={logo.size}
              data-logo={logo.key}
              className="region-logo-top pointer-events-none opacity-0"
            />
          ))}
        </svg>

        {kings.map(({ region, king }) => {
          if (!king) return null
          const spot = CARD_SPOTS[region.key]
          return (
            <div
              key={region.key}
              className="absolute hidden xl:block"
              style={{ [spot.side]: `${spot.inset}%`, top: `${spot.top}%` }}
            >
              <PosterCard
                king={king}
                label={region.label}
                regionKey={region.key}
                style={tintOf(region.key)}
              />
            </div>
          )
        })}
      </div>

      <ul className="mt-6 grid gap-3 sm:grid-cols-2 xl:hidden">
        {kings.flatMap(({ region, king }) =>
          king
            ? [
                <li key={region.key}>
                  <PosterCard
                    king={king}
                    label={region.label}
                    regionKey={region.key}
                    style={tintOf(region.key)}
                  />
                </li>,
              ]
            : [],
        )}
      </ul>
    </div>
  )
}

function PosterCard({
  king,
  label,
  regionKey,
  style,
}: {
  king: NonNullable<RegionKing["king"]>
  label: string
  regionKey: RegionKey
  style: CSSProperties
}) {
  return (
    <Link
      href={paths.team.getHref(king.id)}
      data-card={regionKey}
      className={`flex items-center gap-3 whitespace-nowrap rounded-lg border bg-bg/95 py-2 ps-3 pe-5 shadow-xl backdrop-blur-sm hover:shadow-[0_12px_32px_-8px_var(--tint)] motion-safe:transition-shadow motion-safe:duration-300 dark:bg-black/80 ${TINT.card}`}
      style={style}
    >
      <TeamLogo team={king} size="sm" className="size-9" />
      <span className="flex flex-col">
        <span className="font-medium text-[0.625rem]/3 text-muted-fg uppercase tracking-[0.12em]">
          {label}
        </span>
        <span className="mt-0.5 font-semibold text-base/5 text-fg">{king.name}</span>
        <span className="text-muted-fg text-xs/4 tabular-nums">
          {`#${king.rating.rank} · ${formatRating(king.rating.value)}`}
        </span>
      </span>
    </Link>
  )
}
