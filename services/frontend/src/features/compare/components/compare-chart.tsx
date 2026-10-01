"use client"

import { Line, LineChart, ReferenceLine } from "recharts"
import {
  CartesianGrid,
  Chart,
  ChartTooltip,
  ChartTooltipContent,
  XAxis,
  YAxis,
} from "@/components/ui/chart"
import { SLOT_STYLES } from "@/features/compare/components/slot-colors"
import { type CompareRow, ratingAxis } from "@/features/compare/utils/season-series"
import { formatRating, formatRatingTick } from "@/features/teams/utils/format"

interface CompareChartProps {
  rows: CompareRow[]
  nameA: string
  nameB: string
  /** The label of a season, such as "2026 so far" for the season in progress. */
  seasonLabel: (season: number) => string
}

/**
 * The end of season rating of two schools on one axis. The relative rating is 0 for the median
 * Ohio team of each season, so two schools of any era compare. A season that a school did not
 * play is a break in its line. The season table below holds the same data as text.
 */
export function CompareChart({ rows, nameA, nameB, seasonLabel }: CompareChartProps) {
  const config = {
    a: { label: nameA, color: SLOT_STYLES.a.color },
    b: { label: nameB, color: SLOT_STYLES.b.color },
  }
  const first = rows.at(0)?.season
  const last = rows.at(-1)?.season
  const axis = ratingAxis(rows)
  const schools = [nameA, nameB].filter(Boolean).join(" and ")
  const label = `End of season rating of ${schools}, ${first} to ${last}`

  return (
    <div role="img" aria-label={label}>
      <Chart data={rows} dataKey="season" config={config} containerHeight={300}>
        {/* The wrapper is one image with a label, and the season table holds the same data as
            text. So the chart takes no focus of its own. */}
        <LineChart
          accessibilityLayer={false}
          data={rows}
          margin={{ top: 10, right: 10, left: 4, bottom: 0 }}
        >
          <CartesianGrid vertical={false} />
          <XAxis type="number" domain={["dataMin", "dataMax"]} allowDecimals={false} />
          <YAxis
            width={48}
            domain={axis.domain}
            ticks={axis.ticks}
            allowDecimals={false}
            tickFormatter={formatRatingTick}
          />
          {/* The median Ohio team of each season. */}
          <ReferenceLine y={0} strokeDasharray="2 4" />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) => {
                  const season = payload?.[0]?.payload?.season
                  return typeof season === "number" ? seasonLabel(season) : null
                }}
                formatter={(value, name, item) => (
                  <div className="flex flex-1 items-center justify-between gap-4 leading-none">
                    <span className="flex items-center gap-2 text-muted-fg">
                      <span
                        aria-hidden="true"
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      {config[name as keyof typeof config]?.label ?? name}
                    </span>
                    <span className="font-medium font-mono text-fg tabular-nums">
                      {typeof value === "number" ? formatRating(value) : "—"}
                    </span>
                  </div>
                )}
              />
            }
          />
          <Line
            dataKey="a"
            name="a"
            type="monotone"
            connectNulls={false}
            isAnimationActive={false}
            stroke="var(--color-a)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: "var(--color-a)" }}
          />
          <Line
            dataKey="b"
            name="b"
            type="monotone"
            connectNulls={false}
            isAnimationActive={false}
            stroke="var(--color-b)"
            strokeWidth={2}
            strokeDasharray={SLOT_STYLES.b.dash}
            dot={false}
            activeDot={{ r: 4, fill: "var(--color-b)" }}
          />
        </LineChart>
      </Chart>
    </div>
  )
}
