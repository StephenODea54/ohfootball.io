import type { MouseEvent } from "react"
import { twJoin } from "tailwind-merge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { RegionShape } from "@/features/playoffs/server/region-map"
import { divisionLabel, regionLabel } from "@/features/playoffs/utils/format"

export interface RegionMapData {
  width: number
  height: number
  outline: string
  shapes: RegionShape[]
}

interface RegionPanelProps {
  region: number
  division: number
  map: RegionMapData | null
  /** Chooses another region of the division, from a click on the map. */
  onSelect: (region: number) => void
}

/** The name of the chosen region and where it lies among the regions of its division. */
export function RegionPanel({ region, division, map, onSelect }: RegionPanelProps) {
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-lg/7">{regionLabel(region)}</CardTitle>
      </CardHeader>
      {map && (
        <CardContent>
          <RegionMap map={map} region={region} division={division} onSelect={onSelect} />
        </CardContent>
      )}
    </Card>
  )
}

/**
 * A click with the main button and no key held. Any other click, such as a click that opens a new
 * tab, goes to the browser.
 */
function isPlainClick(event: MouseEvent) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
}

/**
 * Each region of the map is a link to its odds. A plain click changes the region on the page
 * without a new load. The links are SVG links, because the Link component renders an HTML link
 * and cannot go inside an SVG.
 */
function RegionMap({
  map,
  region,
  division,
  onSelect,
}: Omit<RegionPanelProps, "map"> & {
  map: RegionMapData
}) {
  return (
    <nav aria-label={`Map of the ${divisionLabel(division)} regions`}>
      {/* The map has no name of its own. A title would show as a tooltip on each region, and the
          name of the nav and of each link say enough. */}
      <svg
        viewBox={`0 0 ${map.width} ${map.height}`}
        role="presentation"
        className="h-auto w-full select-none"
      >
        {map.shapes.map((shape) => {
          const chosen = shape.region === region
          return (
            <a
              key={shape.region}
              href={`?division=${division}&region=${shape.region}`}
              aria-label={regionLabel(shape.region)}
              aria-current={chosen ? "page" : undefined}
              className="group cursor-pointer outline-0 outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring forced-colors:outline-[Highlight]"
              onClick={(event) => {
                if (!isPlainClick(event)) return
                event.preventDefault()
                onSelect(shape.region)
              }}
            >
              <path
                d={shape.path}
                className={twJoin(
                  "stroke-bg [stroke-width:1.5] group-focus-visible:stroke-ring group-focus-visible:[stroke-width:3]",
                  chosen ? "fill-primary" : "fill-muted group-hover:fill-accent",
                )}
              />
              <text
                x={shape.label.x}
                y={shape.label.y}
                textAnchor="middle"
                dominantBaseline="middle"
                className={twJoin(
                  "font-semibold text-[14px]",
                  chosen ? "fill-primary-fg" : "fill-muted-fg group-hover:fill-accent-fg",
                )}
              >
                R{shape.region}
              </text>
            </a>
          )
        })}
        <path
          d={map.outline}
          className="pointer-events-none fill-none stroke-border [stroke-width:1]"
        />
      </svg>
    </nav>
  )
}
