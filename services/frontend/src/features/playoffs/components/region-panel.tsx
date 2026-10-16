import { twJoin } from "tailwind-merge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { RegionShape } from "@/features/playoffs/server/region-map"
import { regionLabel } from "@/features/playoffs/utils/format"

export interface RegionMapData {
  width: number
  height: number
  outline: string
  shapes: RegionShape[]
}

/** The name of the chosen region and where it lies among the regions of its division. */
export function RegionPanel({ region, map }: { region: number; map: RegionMapData | null }) {
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-lg/7">{regionLabel(region)}</CardTitle>
      </CardHeader>
      {map && (
        <CardContent>
          <RegionMap map={map} region={region} />
        </CardContent>
      )}
    </Card>
  )
}

function RegionMap({ map, region }: { map: RegionMapData; region: number }) {
  return (
    <figure>
      <svg
        viewBox={`0 0 ${map.width} ${map.height}`}
        role="img"
        aria-label={`Map of Ohio with ${regionLabel(region)} marked`}
        className="h-auto w-full"
      >
        {map.shapes.map((shape) => (
          <path
            key={shape.region}
            d={shape.path}
            className={twJoin(
              "stroke-bg [stroke-width:1.5]",
              shape.region === region ? "fill-primary" : "fill-muted",
            )}
          />
        ))}
        <path d={map.outline} className="fill-none stroke-border [stroke-width:1]" />
        {map.shapes.map((shape) => (
          <text
            key={shape.region}
            x={shape.label.x}
            y={shape.label.y}
            textAnchor="middle"
            dominantBaseline="middle"
            className={twJoin(
              "font-semibold text-[14px]",
              shape.region === region ? "fill-primary-fg" : "fill-muted-fg",
            )}
          >
            R{shape.region}
          </text>
        ))}
      </svg>
    </figure>
  )
}
