"use client"

import { Line, LineChart, ReferenceLine } from "recharts"
import { CartesianGrid, Chart, ChartTooltip, XAxis, YAxis } from "@/components/ui/chart"
import { AccuracyTooltip } from "@/features/accuracy/components/accuracy-tooltip"
import { percentDomain, percentTicks, type SeasonPoint } from "@/features/accuracy/utils/chart-data"
import { formatCount, formatScore, MISSING } from "@/features/accuracy/utils/format"

const chartConfig = {
  accuracy: { label: "Accuracy", color: "var(--color-primary)" },
}

interface DotProps {
  cx?: number
  cy?: number
  payload?: SeasonPoint
}

/** A filled dot for a finished season, and a hollow dot for the season in progress. */
function SeasonDot({ cx, cy, payload }: DotProps) {
  if (cx === undefined || cy === undefined || !payload || payload.accuracy === null) return null
  return (
    <circle
      cx={cx}
      cy={cy}
      r={4}
      strokeWidth={2}
      stroke={payload.inProgress ? "var(--color-accuracy)" : "var(--color-bg)"}
      fill={payload.inProgress ? "var(--color-bg)" : "var(--color-accuracy)"}
    />
  )
}

interface SeasonChartProps {
  points: SeasonPoint[]
  /** The first season of the headline numbers, marked on the chart. */
  headlineSeason: number
}

/** The share of winners picked in each season. The season in progress has a hollow dot. */
export function SeasonChart({ points, headlineSeason }: SeasonChartProps) {
  const domain = percentDomain(points.map((point) => point.accuracy))
  return (
    <div>
      <Chart data={points} dataKey="label" config={chartConfig} containerHeight={280}>
        <LineChart
          data={points}
          accessibilityLayer
          margin={{ top: 16, right: 12, left: 0, bottom: 0 }}
        >
          <CartesianGrid vertical={false} />
          <XAxis minTickGap={24} />
          <YAxis
            width={44}
            domain={domain}
            ticks={percentTicks(domain)}
            tickFormatter={(value: number) => `${value}%`}
          />
          <ReferenceLine
            x={headlineSeason.toString()}
            stroke="var(--color-muted-fg)"
            strokeWidth={1}
            label={{
              value: "Headline range starts",
              position: "insideTopLeft",
              fill: "var(--color-muted-fg)",
              fontSize: 11,
            }}
          />
          <ChartTooltip
            content={
              <AccuracyTooltip<SeasonPoint>
                title={(point) => (point.inProgress ? `${point.label} (in progress)` : point.label)}
                lines={(point) => [
                  {
                    name: "Accuracy",
                    value: point.accuracy === null ? MISSING : `${point.accuracy.toFixed(1)}%`,
                  },
                  { name: "Brier score", value: formatScore(point.brierScore) },
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
            dot={<SeasonDot />}
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
        <summary className="cursor-pointer font-medium text-fg">The numbers of each season</summary>
        <ul className="mt-2 grid gap-1 text-muted-fg sm:grid-cols-2 lg:grid-cols-3">
          {points.map((point) => (
            <li key={point.season}>
              {point.label}
              {point.inProgress ? " (in progress)" : ""}:{" "}
              {point.accuracy === null ? "no pick" : `${point.accuracy.toFixed(1)}%`} of{" "}
              {formatCount(point.games)} games
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}
