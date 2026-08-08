"use client"

import { Bar, BarChart } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CartesianGrid, Chart, ChartTooltip, ChartTooltipContent, XAxis, YAxis } from "@/components/ui/chart"
import { Heading } from "@/components/ui/heading"
import { Text } from "@/components/ui/text"
import { formatDivision, type Team } from "@/lib/graphql"

const divisionChartConfig = {
  rating: { label: "Average rating", color: "var(--color-primary)" },
}

const regionChartConfig = {
  rating: { label: "Average rating", color: "var(--color-success)" },
}

export function TeamAnalytics({ season, teams }: { season: number; teams: Team[] }) {
  const ratedTeams = teams.filter((team) => team.rating)
  const ratings = ratedTeams.map((team) => team.rating!.value).sort((a, b) => a - b)
  const midpoint = Math.floor(ratings.length / 2)
  const median = ratings.length === 0
    ? null
    : ratings.length % 2
      ? ratings[midpoint]!
      : (ratings[midpoint - 1]! + ratings[midpoint]!) / 2

  // Independent teams have no division number. They are sorted last, after every numbered division.
  const divisionRatings = new Map<number, number[]>()
  for (const team of ratedTeams) {
    const division = team.division ?? Number.MAX_SAFE_INTEGER
    const values = divisionRatings.get(division) ?? []
    values.push(team.rating!.value)
    divisionRatings.set(division, values)
  }
  const divisionData = [...divisionRatings]
    .sort(([a], [b]) => a - b)
    .map(([division, values]) => ({
      division: formatDivision(division === Number.MAX_SAFE_INTEGER ? null : division),
      rating: average(values),
    }))

  const regionRatings = new Map<string, number[]>()
  for (const team of ratedTeams) {
    const region = team.region ? `R${team.region}` : "Unassigned"
    const values = regionRatings.get(region) ?? []
    values.push(team.rating!.value)
    regionRatings.set(region, values)
  }
  const regionData = [...regionRatings]
    .map(([region, values]) => ({ region, rating: average(values) }))
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 8)

  return (
    <section className="mt-10" aria-labelledby="field-snapshot-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Heading id="field-snapshot-heading" level={2} className="text-lg/7 sm:text-lg/7">
            Field snapshot
          </Heading>
          <Text className="mt-1 text-sm/6">Analytics update with the filters above.</Text>
        </div>
        <Text className="m-0 text-xs/5">{season} rating snapshot</Text>
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AnalyticsStat label="Teams in view" value={teams.length.toLocaleString()} />
        <AnalyticsStat label="Rated teams" value={ratedTeams.length.toLocaleString()} />
        <AnalyticsStat
          label="Median rating"
          value={median === null ? "—" : Math.round(median).toLocaleString()}
        />
        <AnalyticsStat
          label="Highest rating"
          value={ratings.length ? Math.round(ratings.at(-1)!).toLocaleString() : "—"}
        />
      </dl>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Card className="gap-3 py-5 shadow-none [--gutter:--spacing(4)] sm:[--gutter:--spacing(5)]">
          <CardHeader>
            <CardTitle>Rating by division</CardTitle>
            <Text className="m-0 text-xs/5">Average rating for the current view</Text>
          </CardHeader>
          <CardContent>
            {divisionData.length ? (
              <Chart data={divisionData} dataKey="division" config={divisionChartConfig} containerHeight={220}>
                <BarChart data={divisionData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis />
                  <YAxis width={44} domain={["dataMin - 50", "dataMax + 25"]} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="rating" fill="var(--color-rating)" radius={[5, 5, 0, 0]} />
                </BarChart>
              </Chart>
            ) : <EmptyChart />}
          </CardContent>
        </Card>

        <Card className="gap-3 py-5 shadow-none [--gutter:--spacing(4)] sm:[--gutter:--spacing(5)]">
          <CardHeader>
            <CardTitle>Strongest regions</CardTitle>
            <Text className="m-0 text-xs/5">Top eight by average rating</Text>
          </CardHeader>
          <CardContent>
            {regionData.length ? (
              <Chart data={regionData} dataKey="region" config={regionChartConfig} containerHeight={220}>
                <BarChart data={regionData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis />
                  <YAxis width={44} domain={["dataMin - 50", "dataMax + 25"]} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="rating" fill="var(--color-rating)" radius={[5, 5, 0, 0]} />
                </BarChart>
              </Chart>
            ) : <EmptyChart />}
          </CardContent>
        </Card>
      </div>
    </section>
  )
}

function average(values: number[]) {
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function AnalyticsStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card px-4 py-4">
      <dt className="text-xs/5 font-semibold uppercase tracking-wide text-muted-fg">{label}</dt>
      <dd className="mt-1 font-display text-2xl/8 font-semibold text-fg">{value}</dd>
    </div>
  )
}

function EmptyChart() {
  return <div className="grid h-[220px] place-items-center text-sm/6 text-muted-fg">No rated teams in this view.</div>
}
