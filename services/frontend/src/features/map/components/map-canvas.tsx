"use client"

import { type CSSProperties, useId, useMemo, useRef, useState } from "react"
import { CellCard } from "@/features/map/components/cell-card"
import { TeamCell, TeamPill } from "@/features/map/components/team-cell"
import { useAnimatedViewBox } from "@/features/map/hooks/use-animated-view-box"
import type { CountyMapData } from "@/features/map/server/county-map"
import { cellLayout, pillAnchor, visiblePills } from "@/features/map/utils/cell-layout"
import type { MapMarker } from "@/features/map/utils/markers"
import { areaShape } from "@/features/map/utils/polygon"
import { territories } from "@/features/map/utils/territories"
import {
  type Bounds,
  pointBounds,
  screenPoint,
  unionBounds,
  type ViewBox,
  viewBoxAttribute,
  wholeMap,
} from "@/features/map/utils/zoom"
import { useElementWidth } from "@/hooks/use-element-width"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

/** The color of a county whose best school has no usable team color. */
const FALLBACK_COLOR = "var(--color-muted-fg)"

interface MapCanvasProps {
  map: Pick<CountyMapData, "width" | "height" | "outline" | "counties">
  /** The color of each county. A county that is not in it is gray. */
  tints: ReadonlyMap<string, string>
  /** The counties of the chosen area. */
  selected: ReadonlySet<string>
  /** True when a filter is set, so the counties outside the chosen area fade. */
  filtered: boolean
  /** The schools that match the filters. */
  markers: readonly MapMarker[]
  /** A new key draws the territories again, so a new set of schools fades in. */
  markersKey: string
  /** The view that the map zooms to. */
  target: ViewBox
  /** Chooses a county, from a click on the map. */
  onSelectCounty: (county: string) => void
}

/** The school whose card shows, for one set of filters. */
interface ActiveCell {
  key: string
  id: string
}

/** The id of the territory under an event, or null. */
function cellOf(target: EventTarget) {
  return (target as Element).closest?.("[data-cell]")?.getAttribute("data-cell") ?? null
}

/**
 * Ohio with each county in the team color of its best school. A filter splits the chosen area
 * into territories, one for each school that matches: the part of the area nearer to that school
 * than to any other. The map zooms to the chosen area.
 *
 * A mouse shows the card of a school while it points at the territory, and a click opens the
 * page of the team. A touch shows the card first, and a second touch opens the page.
 */
export function MapCanvas({
  map,
  tints,
  selected,
  filtered,
  markers,
  markersKey,
  target,
  onSelectCounty,
}: MapCanvasProps) {
  const svg = useRef<SVGSVGElement>(null)
  const width = useElementWidth(svg)
  const reducedMotion = useReducedMotion()
  const start = useMemo(() => wholeMap(map), [map])
  useAnimatedViewBox(svg, target, { start, width, reducedMotion })
  // An id for each clip path. React gives the base, and the rest of the id must be safe in url().
  const ids = useId().replace(/[^\w-]/g, "")
  const [active, setActive] = useState<ActiveCell | null>(null)
  // A new set of filters shows no card.
  const activeId = active?.key === markersKey ? active.id : null

  // With no chosen county, such as a region that the map gives no county, the area is the state.
  const areaCounties = useMemo(() => {
    const chosen = map.counties.filter((county) => selected.has(county.name))
    return chosen.length > 0 ? chosen : map.counties
  }, [map, selected])
  const cells = useMemo(() => {
    if (markers.length === 0) return []
    const area = areaShape(areaCounties.map((county) => county.path))
    // There is at least one school, so there is a box.
    const bounds = unionBounds([
      ...areaCounties.map((county) => county.bounds),
      ...markers.map(pointBounds),
    ]) as Bounds
    return territories(markers, bounds, area)
  }, [markers, areaCounties])
  const byId = useMemo(() => new Map(markers.map((marker) => [marker.id, marker])), [markers])

  // The territories are laid out for the view at the end of the zoom. One CSS pixel is this many
  // map units there.
  const unitsPerPx = target.width / width
  const layouts = useMemo(
    () => cells.map((cell) => cellLayout(cell.circle, unitsPerPx, target.width)),
    [cells, unitsPerPx, target.width],
  )
  // Each school gets its rank, except where the badge would cover the badge of a better school.
  const pills = useMemo(() => {
    const placed = cells.map((cell, index) => {
      const marker = byId.get(cell.id) as MapMarker
      return {
        id: cell.id,
        rank: marker.rank,
        at: pillAnchor(cell.circle, marker, layouts[index]),
        compact: layouts[index].compactPill,
      }
    })
    const shown = visiblePills(placed, unitsPerPx)
    return placed.filter((pill) => shown.has(pill.id))
  }, [cells, byId, layouts, unitsPerPx])
  const activeCell = cells.find((cell) => cell.id === activeId)
  const activeMarker = activeId ? byId.get(activeId) : undefined

  return (
    // The map is for the pointer only, so screen readers skip it. The filters and the list carry
    // the same choices and the same teams.
    <div aria-hidden="true" className="relative">
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: The county field chooses a county with a keyboard. */}
      <svg
        ref={svg}
        viewBox={viewBoxAttribute(start)}
        preserveAspectRatio="xMidYMid meet"
        // The wrapper hides the map from screen readers. The name only keeps the SVG valid.
        aria-label="Map of Ohio"
        data-filtered={filtered || undefined}
        data-cells={cells.length > 0 || undefined}
        // The size of the box never changes, so a zoom moves nothing else on the page.
        style={{ aspectRatio: `${map.width} / ${map.height}` }}
        className="team-map block h-auto w-full select-none"
        // One set of handlers for the 88 counties and all the territories.
        onPointerOver={(event) => {
          if (event.pointerType === "touch") return
          const id = cellOf(event.target)
          setActive((shown) =>
            id === null
              ? null
              : shown?.key === markersKey && shown.id === id
                ? shown
                : { key: markersKey, id },
          )
        }}
        onPointerLeave={(event) => {
          if (event.pointerType !== "touch") setActive(null)
        }}
        onClick={(event) => {
          const id = cellOf(event.target)
          if (id) {
            // The first touch on a territory shows its card. A touch on the territory with the
            // card, or a click with a mouse that points at it, opens the page of the team.
            if (id !== activeId) {
              event.preventDefault()
              setActive({ key: markersKey, id })
            }
            return
          }
          // A click outside the territories hides the card, and a click on a county chooses it.
          setActive(null)
          const county = (event.target as Element).getAttribute("data-county")
          if (county) onSelectCounty(county)
        }}
      >
        {cells.length > 0 && (
          <defs>
            <clipPath id={`${ids}-area`}>
              {areaCounties.map((county) => (
                <path key={county.name} d={county.path} />
              ))}
            </clipPath>
            {/* The glow of the poster map: a wide and a near blur under the sharp stroke. The
                blur is in map units, so it is sized for the view at the end of the zoom. CSS
                hides the glow during the zoom. */}
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
        )}
        {map.counties.map((county) => (
          <path
            key={county.name}
            d={county.path}
            data-county={county.name}
            data-selected={selected.has(county.name) || undefined}
            vectorEffect="non-scaling-stroke"
            className="cursor-pointer stroke-bg/40 [fill-opacity:0.6] [fill:var(--tint)] [stroke-width:0.8] dark:stroke-fg/15 dark:[fill-opacity:0.45]"
            style={{ "--tint": tints.get(county.name) ?? FALLBACK_COLOR } as CSSProperties}
          />
        ))}
        <path
          d={map.outline}
          vectorEffect="non-scaling-stroke"
          className="pointer-events-none fill-none stroke-fg/50 [stroke-linejoin:round] [stroke-width:1.5]"
        />
        {cells.length > 0 && (
          <g
            key={markersKey}
            clipPath={`url(#${ids}-area)`}
            className="motion-safe:fade-in motion-safe:animate-in motion-safe:duration-500"
          >
            {cells.map((cell, index) => (
              <TeamCell
                key={cell.id}
                marker={byId.get(cell.id) as MapMarker}
                territory={cell}
                layout={layouts[index]}
                clipId={`${ids}-cell-${index}`}
                glowId={`${ids}-glow`}
                active={cell.id === activeId}
              />
            ))}
          </g>
        )}
        {/* The ranks sit above all the territories and outside the clip of the area, so no
            territory paints over a rank, and a school outside the area still shows its rank. In a
            crowd a rank that would cover a better rank is left out, and the card shows it. */}
        {cells.length > 0 && (
          <g
            key={`${markersKey}-ranks`}
            className="pointer-events-none motion-safe:fade-in motion-safe:animate-in motion-safe:duration-500"
          >
            {pills.map((pill) => (
              <TeamPill key={pill.id} rank={pill.rank} at={pill.at} compact={pill.compact} />
            ))}
          </g>
        )}
      </svg>
      {activeCell && activeMarker && (
        <CellCard
          marker={activeMarker}
          anchor={screenPoint(activeCell.circle, target, width)}
          boxWidth={width}
        />
      )}
    </div>
  )
}
