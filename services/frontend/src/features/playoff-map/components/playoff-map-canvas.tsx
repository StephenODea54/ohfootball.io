"use client"

import { useId, useMemo, useRef, useState } from "react"
import { CellCard } from "@/features/map/components/cell-card"
import { TeamCell, TeamPill } from "@/features/map/components/team-cell"
import { cellLayout, pillAnchor, visiblePills } from "@/features/map/utils/cell-layout"
import type { MapMarker } from "@/features/map/utils/markers"
import { areaShape } from "@/features/map/utils/polygon"
import { screenPoint, viewBoxAttribute, wholeMap } from "@/features/map/utils/zoom"
import type {
  PlayoffMapRegion,
  PlayoffMapShape,
  PlayoffMapTeam,
} from "@/features/playoff-map/types"
import { type DrawnCell, drawnCells } from "@/features/playoff-map/utils/view"
import { useElementWidth } from "@/hooks/use-element-width"

interface PlayoffMapCanvasProps {
  map: PlayoffMapShape
  division: number
  regions: readonly PlayoffMapRegion[]
  /** The owner of each cell after the chosen round. */
  owners: ReadonlyMap<string, string>
  /** The line under the name on the card of a team, such as Seed 3 · 41% of Region 9. */
  detail: (team: PlayoffMapTeam, region: number) => string
}

/** The id of the team under an event, or null. */
function teamOf(target: EventTarget) {
  return (target as Element).closest?.("[data-cell]")?.getAttribute("data-cell") ?? null
}

/** A team as a marker of the shared map drawing. The seed takes the place of the rank. */
function markerOf(team: PlayoffMapTeam, division: number, region: number, school: PlayoffMapTeam) {
  return {
    id: team.id,
    sourceId: team.sourceId,
    name: team.name,
    county: null,
    division,
    region,
    rank: team.seed,
    rating: team.rating ?? 0,
    // The dot marks the school that started with the land, not the school of the owner.
    x: school.x ?? 0,
    y: school.y ?? 0,
    color: team.color,
  } satisfies MapMarker
}

/** The outer edge of the counties of each region, as one SVG path for each region. */
function regionBorders(map: PlayoffMapShape, regions: readonly PlayoffMapRegion[]) {
  const paths = new Map(map.counties.map((county) => [county.name, county.path]))
  return regions.map((region) => ({
    region: region.region,
    clip: region.counties.map((name) => paths.get(name) ?? ""),
    edge: areaShape(region.counties.map((name) => paths.get(name) ?? ""))
      .edges.map(([a, b]) => `M${a.x},${a.y}L${b.x},${b.y}`)
      .join(""),
  }))
}

/**
 * Ohio split between the playoff teams of the four regions of a division. Each cell is in the
 * color of the team that holds it, and the team with the most room in its land shows its logo and
 * its seed. A dot marks each school that started with land.
 *
 * A mouse shows the card of a team while it points at the land of the team, and a click opens the
 * page of the team. A touch shows the card first, and a second touch opens the page.
 */
export function PlayoffMapCanvas({
  map,
  division,
  regions,
  owners,
  detail,
}: PlayoffMapCanvasProps) {
  const svg = useRef<SVGSVGElement>(null)
  const width = useElementWidth(svg)
  const view = useMemo(() => wholeMap(map), [map])
  const ids = useId().replace(/[^\w-]/g, "")
  const [active, setActive] = useState<string | null>(null)

  const borders = useMemo(() => regionBorders(map, regions), [map, regions])
  // Each cell keeps its marker until the round changes, so a hover does not draw every cell again.
  const cells = useMemo(
    () =>
      drawnCells(regions, owners).map((item) => ({
        ...item,
        marker: markerOf(item.owner, division, item.region, item.school),
      })),
    [regions, owners, division],
  )
  const unitsPerPx = view.width / width
  const layouts = useMemo(
    () =>
      cells.map((item) => {
        const layout = cellLayout(item.cell.circle, unitsPerPx, view.width)
        return item.main ? layout : { ...layout, logo: null }
      }),
    [cells, unitsPerPx, view.width],
  )
  const pills = useMemo(() => {
    const placed = cells.flatMap((item, index) =>
      item.main
        ? [
            {
              id: item.owner.id,
              rank: item.owner.seed,
              at: pillAnchor(item.cell.circle, item.cell.circle, layouts[index]),
              compact: layouts[index].compactPill,
            },
          ]
        : [],
    )
    const shown = visiblePills(placed, unitsPerPx)
    return placed.filter((pill) => shown.has(pill.id))
  }, [cells, layouts, unitsPerPx])
  const activeCell = cells.find((item) => item.main && item.owner.id === active)

  return (
    // The map is for the pointer only, so screen readers skip it. The lists of the regions carry
    // the same teams.
    <div aria-hidden="true" className="relative">
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: The lists of the regions give a keyboard the same teams and links. */}
      <svg
        ref={svg}
        viewBox={viewBoxAttribute(view)}
        preserveAspectRatio="xMidYMid meet"
        // The wrapper hides the map from screen readers. The name only keeps the SVG valid.
        aria-label="Playoff map of Ohio"
        data-cells={cells.length > 0 || undefined}
        style={{ aspectRatio: `${map.width} / ${map.height}` }}
        className="team-map block h-auto w-full select-none"
        onPointerOver={(event) => {
          if (event.pointerType !== "touch") setActive(teamOf(event.target))
        }}
        onPointerLeave={(event) => {
          if (event.pointerType !== "touch") setActive(null)
        }}
        onClick={(event) => {
          const id = teamOf(event.target)
          // The first touch on the land of a team shows its card. A touch on the land with the
          // card, or a click with a mouse that points at it, opens the page of the team.
          if (id && id !== active) event.preventDefault()
          setActive(id)
        }}
      >
        <defs>
          {borders.map((border) => (
            <clipPath key={border.region} id={`${ids}-region-${border.region}`}>
              {border.clip.map((path) => (
                <path key={path} d={path} />
              ))}
            </clipPath>
          ))}
          {/* The glow of the poster map, as on the team map. */}
          <filter id={`${ids}-glow`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceGraphic" stdDeviation={7 * unitsPerPx} result="wide" />
            <feGaussianBlur in="SourceGraphic" stdDeviation={2.5 * unitsPerPx} result="near" />
            <feMerge>
              <feMergeNode in="wide" />
              <feMergeNode in="wide" />
              <feMergeNode in="near" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {map.counties.map((county) => (
          <path
            key={county.name}
            d={county.path}
            vectorEffect="non-scaling-stroke"
            // The land is translucent, so the counties under it take the page color.
            className="fill-bg stroke-fg/15 [stroke-width:0.8]"
          />
        ))}
        {borders.map((border) => (
          <g key={border.region} clipPath={`url(#${ids}-region-${border.region})`}>
            {cells.map((item, index) =>
              item.region === border.region ? (
                <TeamCell
                  key={item.cell.id}
                  marker={item.marker}
                  territory={item.cell}
                  layout={layouts[index]}
                  clipId={`${ids}-cell-${index}`}
                  glowId={`${ids}-glow`}
                  active={item.owner.id === active}
                />
              ) : null,
            )}
          </g>
        ))}
        {borders.map((border) => (
          <path
            key={border.region}
            d={border.edge}
            vectorEffect="non-scaling-stroke"
            className="pointer-events-none fill-none stroke-fg/60 [stroke-linecap:round] [stroke-width:2]"
          />
        ))}
        <path
          d={map.outline}
          vectorEffect="non-scaling-stroke"
          className="pointer-events-none fill-none stroke-fg/50 [stroke-linejoin:round] [stroke-width:1.5]"
        />
        <g className="pointer-events-none">
          {pills.map((pill) => (
            <TeamPill key={pill.id} rank={pill.rank} at={pill.at} compact={pill.compact} />
          ))}
        </g>
      </svg>
      {activeCell && (
        <ActiveCard
          item={activeCell}
          division={division}
          view={view}
          width={width}
          detail={detail}
        />
      )}
    </div>
  )
}

interface ActiveCardProps {
  item: DrawnCell
  division: number
  view: ReturnType<typeof wholeMap>
  width: number
  detail: PlayoffMapCanvasProps["detail"]
}

function ActiveCard({ item, division, view, width, detail }: ActiveCardProps) {
  return (
    <CellCard
      marker={markerOf(item.owner, division, item.region, item.owner)}
      anchor={screenPoint(item.cell.circle, view, width)}
      boxWidth={width}
      detail={detail(item.owner, item.region)}
    />
  )
}
