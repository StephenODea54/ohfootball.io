"use client"

import { Line, LineChart } from "recharts"
import { CartesianGrid, Chart, ChartTooltip, XAxis, YAxis } from "@/components/ui/chart"
import { AccuracyTooltip } from "@/features/accuracy/components/accuracy-tooltip"
import { percentDomain, percentTicks, type WeekPoint } from "@/features/accuracy/utils/chart-data"
import { formatCount, formatWeek, MISSING } from "@/features/accuracy/utils/format"

const chartConfig = {
  accuracy: { label: "Accuracy", color: "var(--color-primary)" },
}

/**
 * The share of winners picked in each week. The games of each week are in the tooltip and in the
 * list under the chart, so the chart keeps one axis.
 */
export function WeekChart({ points }: { points: WeekPoint[] }) {
  const domain = percentDomain(points.map((point) => point.accuracy))
  return (
    <div>
      <Chart data={points} dataKey="label" config={chartConfig} containerHeight={260}>
        <LineChart
          data={points}
          accessibilityLayer
          margin={{ top: 12, right: 12, left: 0, bottom: 0 }}
        >
          <CartesianGrid vertical={false} />
          <XAxis />
          <YAxis
            width={44}
            domain={domain}
            ticks={percentTicks(domain)}
            tickFormatter={(value: number) => `${value}%`}
          />
          <ChartTooltip
            content={
              <AccuracyTooltip<WeekPoint>
                title={(point) => formatWeek(point.week)}
                lines={(point) => [
                  {
                    name: "Accuracy",
                    value: point.accuracy === null ? MISSING : `${point.accuracy.toFixed(1)}%`,
                  },
                  { name: "Games", value: formatCount(point.games) },
                ]}
              />
            }
          />
          <Line
            dataKey="accuracy"
            type="linear"
            stroke="var(--color-accuracy)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={{ r: 4, fill: "var(--color-accuracy)", stroke: "var(--color-bg)", strokeWidth: 2 }}
            activeDot={{
              r: 5,
              fill: "var(--color-accuracy)",
              stroke: "var(--color-bg)",
              strokeWidth: 2,
            }}
            isAnimationActive={false}
          />
        </LineChart>
      </Chart>
      <details className="mt-4 text-sm/6">
        <summary className="cursor-pointer font-medium text-fg">The numbers of each week</summary>
        <ul className="mt-2 grid gap-1 text-muted-fg sm:grid-cols-2">
          {points.map((point) => (
            <li key={point.week}>
              {formatWeek(point.week)}:{" "}
              {point.accuracy === null ? "no pick" : `${point.accuracy.toFixed(1)}%`} of{" "}
              {formatCount(point.games)} games
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}
