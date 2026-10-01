"use client"

import { Line, LineChart, ReferenceLine } from "recharts"
import { CartesianGrid, Chart, ChartTooltip, XAxis, YAxis } from "@/components/ui/chart"
import { AccuracyTooltip } from "@/features/accuracy/components/accuracy-tooltip"
import type { CalibrationPoint } from "@/features/accuracy/utils/chart-data"
import { formatCount } from "@/features/accuracy/utils/format"

const chartConfig = {
  observed: { label: "Favorite won", color: "var(--color-primary)" },
}

const ticks = [50, 60, 70, 80, 90, 100]

/**
 * How often the favorite won against how sure the model was, one dot for each bin. A dot on the
 * diagonal means the model was as sure as it should have been.
 */
export function CalibrationChart({ points }: { points: CalibrationPoint[] }) {
  return (
    <Chart data={points} dataKey="predicted" config={chartConfig} containerHeight={300}>
      <LineChart
        data={points}
        accessibilityLayer
        margin={{ top: 12, right: 16, left: 0, bottom: 12 }}
      >
        <CartesianGrid vertical={false} />
        <XAxis
          type="number"
          domain={[50, 100]}
          ticks={ticks}
          tickFormatter={(value: number) => `${value}%`}
          label={{
            value: "Model said",
            position: "insideBottom",
            offset: -8,
            fill: "var(--color-muted-fg)",
            fontSize: 11,
          }}
        />
        <YAxis
          width={44}
          domain={[50, 100]}
          ticks={ticks}
          tickFormatter={(value: number) => `${value}%`}
        />
        <ReferenceLine
          segment={[
            { x: 50, y: 50 },
            { x: 100, y: 100 },
          ]}
          stroke="var(--color-muted-fg)"
          strokeWidth={1}
          ifOverflow="hidden"
        />
        <ChartTooltip
          content={
            <AccuracyTooltip<CalibrationPoint>
              title={(point) => `Favorite at ${point.label}`}
              lines={(point) => [
                { name: "Model said", value: `${point.predicted.toFixed(1)}%` },
                { name: "Favorite won", value: `${point.observed.toFixed(1)}%` },
                { name: "Games", value: formatCount(point.games) },
              ]}
            />
          }
        />
        <Line
          dataKey="observed"
          type="linear"
          stroke="var(--color-observed)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          dot={{ r: 4, fill: "var(--color-observed)", stroke: "var(--color-bg)", strokeWidth: 2 }}
          activeDot={{
            r: 5,
            fill: "var(--color-observed)",
            stroke: "var(--color-bg)",
            strokeWidth: 2,
          }}
          isAnimationActive={false}
        />
      </LineChart>
    </Chart>
  )
}
