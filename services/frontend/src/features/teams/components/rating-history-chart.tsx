"use client"

import { Area, AreaChart } from "recharts"
import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardContent, CardHeader } from "@/components/ui/card"
import { CartesianGrid, Chart, ChartTooltip, ChartTooltipContent, XAxis, YAxis } from "@/components/ui/chart"
import type { Team } from "@/types/api"

const chartConfig = {
  rating: {
    label: "Rating",
    color: "var(--color-success)",
  },
}

/**
 * A school's rating across the seasons it has played. Ratings are published once per season, so the
 * line is season by season rather than week by week. Seasons after the one being viewed are dropped.
 */
export function RatingHistoryChart({
  team,
}: {
  team: Pick<Team, "season" | "rating" | "ratingHistory">
}) {
  const rating = team.rating ? Math.round(team.rating.value) : null
  const past = team.ratingHistory.filter((point) => point.season <= team.season)
  const history = past.map((point) => ({
    period: point.season.toString(),
    rating: Math.round(point.value),
  }))
  const firstSeason = past.at(0)?.season
  const lastSeason = past.at(-1)?.season
  const seasonIndex = past.findIndex((point) => point.season === team.season)
  const previousPoint = seasonIndex > 0 ? past[seasonIndex - 1] : undefined
  const ratingDelta = rating !== null && previousPoint
    ? rating - Math.round(previousPoint.value)
    : null
  const ratings = history.map((point) => point.rating)
  const minimumRating = ratings.length ? Math.min(...ratings) - 25 : 1400
  const maximumRating = ratings.length ? Math.max(...ratings) + 25 : 1600

  return (
    <Card className="gap-4 py-5 shadow-none [--gutter:--spacing(4)] sm:[--gutter:--spacing(6)]">
      <CardHeader>
        <div>
          <p className="text-xs/5 font-semibold uppercase tracking-wide text-muted-fg">
            End Of Season Rating
          </p>
          <p className="mt-1 text-sm/6 text-fg">
            {firstSeason !== undefined && lastSeason !== undefined
              ? `${firstSeason} through ${lastSeason}`
              : "No ratings have been published yet."}
          </p>
        </div>
        {ratingDelta !== null && previousPoint && (
          <CardAction>
            <Badge intent={ratingDelta >= 0 ? "success" : "danger"} className="font-semibold">
              {ratingDelta >= 0 ? "+" : ""}{ratingDelta} vs {previousPoint.season}
            </Badge>
          </CardAction>
        )}
      </CardHeader>
      {history.length > 0 && (
        <CardContent>
          <Chart data={history} dataKey="period" config={chartConfig} containerHeight={250}>
            <AreaChart data={history} margin={{ top: 10, right: 10, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="rating-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-rating)" stopOpacity={0.22} />
                  <stop offset="95%" stopColor="var(--color-rating)" stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis />
              <YAxis width={48} domain={[minimumRating, maximumRating]} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area
                dataKey="rating"
                type="monotone"
                isAnimationActive={false}
                stroke="var(--color-rating)"
                strokeWidth={2}
                fill="url(#rating-fill)"
                dot={{ r: 3, fill: "var(--color-rating)", strokeWidth: 0 }}
                activeDot={{ r: 5, fill: "var(--color-rating)" }}
              />
            </AreaChart>
          </Chart>
        </CardContent>
      )}
    </Card>
  )
}
