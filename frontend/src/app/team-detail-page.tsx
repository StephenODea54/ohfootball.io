"use client"

import { Area, AreaChart } from "recharts"
import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CartesianGrid, Chart, ChartTooltip, ChartTooltipContent, XAxis, YAxis } from "@/components/ui/chart"
import { Container } from "@/components/ui/container"
import { Heading } from "@/components/ui/heading"
import { Link } from "@/components/ui/link"
import { ProgressBar, ProgressBarTrack } from "@/components/ui/progress-bar"
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@/components/ui/table"
import { Text } from "@/components/ui/text"
import {
  formatDivision,
  formatRecord,
  type Game,
  type Team,
} from "@/lib/graphql"

const chartConfig = {
  rating: {
    label: "Elo",
    color: "var(--color-success)",
  },
}

export function TeamDetailPage({ team }: { team: Team }) {
  const rating = team.elo ? Math.round(team.elo.rating) : null
  const history = team.eloHistory.map((point) => ({
    period: formatDate(point.asOf),
    rating: Math.round(point.rating),
  }))
  const firstRating = history.at(0)?.rating
  const ratingDelta = rating !== null && firstRating !== undefined ? rating - firstRating : null
  const ratings = history.map((point) => point.rating)
  const minimumRating = ratings.length ? Math.min(...ratings) - 25 : 1400
  const maximumRating = ratings.length ? Math.max(...ratings) + 25 : 1600

  return (
    <main>
      <Container className="max-w-6xl py-10 sm:py-14 lg:py-16">
        <Link href={`/?season=${team.season}`} className="inline-flex text-sm/6 text-muted-fg hover:text-fg">
          ← {team.season} teams
        </Link>

        <header className="mt-6 grid gap-8 border-b pb-8 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div>
            <Text className="font-medium">
              {[
                team.city,
                team.region ? `Region ${team.region}` : null,
                formatDivision(team.division),
                team.season,
              ].filter(Boolean).join(" · ")}
            </Text>
            <Heading className="mt-1 text-4xl/none sm:text-5xl/none">
              {team.name}{team.mascot && <span className="text-muted-fg"> {team.mascot}</span>}
            </Heading>
          </div>

          <dl className="grid grid-cols-3 gap-7 sm:text-right">
            <TeamStat label="Elo" value={rating?.toString() ?? "—"} accent />
            <TeamStat label="Rank" value={team.elo ? `#${team.elo.rank}` : "—"} />
            <TeamStat label="Record" value={formatRecord(team.record)} />
          </dl>
        </header>

        <Card className="mt-6 gap-0 py-4 shadow-none [--gutter:--spacing(4)]">
          <CardContent className="flex flex-col items-start gap-x-3 gap-y-1 text-sm/6 sm:flex-row sm:items-center">
            <span>
              <strong className="font-semibold text-fg">{team.elo ? formatDate(team.elo.asOf) : "Not published"}</strong>{" "}
              <span className="text-muted-fg">rating snapshot</span>
            </span>
            <span aria-hidden className="hidden text-muted-fg sm:inline">·</span>
            <span className="text-muted-fg">Upcoming probabilities update with every published snapshot.</span>
          </CardContent>
        </Card>

        <section className="mt-10" aria-labelledby="elo-history-heading">
          <Heading id="elo-history-heading" level={2} className="mb-4 text-lg/7 sm:text-lg/7">
            Elo history
          </Heading>
          <Card className="gap-4 py-5 shadow-none [--gutter:--spacing(4)] sm:[--gutter:--spacing(6)]">
            <CardHeader>
              <div>
                <p className="text-xs/5 font-semibold uppercase tracking-wide text-muted-fg">Published snapshots</p>
                <p className="mt-1 text-sm/6 text-fg">
                  {firstRating !== undefined && rating !== null ? (
                    <>First <strong>{firstRating}</strong> <span className="mx-1 text-muted-fg">→</span> Current <strong>{rating}</strong></>
                  ) : "No ratings have been published yet."}
                </p>
              </div>
              {ratingDelta !== null && (
                <CardAction>
                  <Badge intent={ratingDelta >= 0 ? "success" : "danger"} className="font-semibold">
                    {ratingDelta >= 0 ? "+" : ""}{ratingDelta}
                  </Badge>
                </CardAction>
              )}
            </CardHeader>
            {history.length > 0 && (
              <CardContent>
                <Chart data={history} dataKey="period" config={chartConfig} containerHeight={250}>
                  <AreaChart data={history} margin={{ top: 10, right: 10, left: 4, bottom: 0 }}>
                    <defs>
                      <linearGradient id="elo-fill" x1="0" y1="0" x2="0" y2="1">
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
                      fill="url(#elo-fill)"
                      dot={{ r: 3, fill: "var(--color-rating)", strokeWidth: 0 }}
                      activeDot={{ r: 5, fill: "var(--color-rating)" }}
                    />
                  </AreaChart>
                </Chart>
              </CardContent>
            )}
          </Card>
        </section>

        <section className="mt-10" aria-labelledby="schedule-heading">
          <Heading id="schedule-heading" level={2} className="mb-4 text-lg/7 sm:text-lg/7">
            Schedule
          </Heading>
          <Card className="gap-0 overflow-hidden py-0 shadow-none [--gutter:--spacing(4)]">
            <CardContent>
              <Table aria-label={`${team.name} schedule`} bleed>
                <TableHeader className="bg-muted/70 uppercase text-xs/5 tracking-wide">
                  <TableColumn isRowHeader>Wk</TableColumn>
                  <TableColumn>Date</TableColumn>
                  <TableColumn>Opponent</TableColumn>
                  <TableColumn>Pred</TableColumn>
                  <TableColumn>Win probability</TableColumn>
                  <TableColumn className="text-end">Result</TableColumn>
                </TableHeader>
                <TableBody>
                  {team.schedule.map((game) => {
                    const probability = game.prediction
                      ? Math.round(game.prediction.winProbability * 100)
                      : null
                    return (
                      <TableRow id={game.id} key={game.id}>
                        <TableCell className="font-semibold text-muted-fg">{game.week}</TableCell>
                        <TableCell className="text-muted-fg">{formatDate(game.date)}</TableCell>
                        <TableCell>
                          <span className="text-muted-fg">{locationLabel(game)}</span>{" "}
                          <span className="font-medium text-fg">{game.opponentName}</span>
                        </TableCell>
                        <TableCell>
                          {game.prediction ? (
                            <Badge intent={game.prediction.predictedResult === "WIN" ? "success" : "danger"} isCircle={false} className="text-sm/5 font-semibold">
                              {game.prediction.predictedResult === "WIN" ? "W" : "L"}
                            </Badge>
                          ) : <span className="text-muted-fg">—</span>}
                        </TableCell>
                        <TableCell>
                          {probability !== null ? (
                            <div className="flex items-center gap-3">
                              <ProgressBar aria-label={`${probability}% win probability`} value={probability} className="w-auto">
                                <ProgressBarTrack className="min-w-24 max-w-24 [--progress-content-bg:var(--color-success)]" />
                              </ProgressBar>
                              <span className="font-medium text-sm/5 text-muted-fg">{probability}%</span>
                            </div>
                          ) : <span className="text-sm/5 text-muted-fg">Not rated</span>}
                        </TableCell>
                        <TableCell className="text-end">
                          <GameResult game={game} />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Text className="mt-3 text-xs/5">
            Upcoming probabilities use the latest published Elo ratings. Opponents outside the rated Ohio population show as not rated.
          </Text>
        </section>
      </Container>
    </main>
  )
}

function TeamStat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <dt className="text-xs/5 font-medium uppercase tracking-wide text-muted-fg">{label}</dt>
      <dd className={`mt-0.5 text-2xl/7 font-semibold ${accent ? "text-success-subtle-fg" : "text-fg"}`}>{value}</dd>
    </div>
  )
}

function GameResult({ game }: { game: Game }) {
  if (game.result === "UNKNOWN") {
    return <span className="text-xs/5 uppercase tracking-wide text-muted-fg">Upcoming</span>
  }
  if (game.result === "CANCELED") {
    return <span className="text-xs/5 uppercase tracking-wide text-muted-fg">Canceled</span>
  }

  const label = game.result === "WIN" ? "W" : game.result === "LOSS" ? "L" : "T"
  const score = game.teamScore !== null && game.opponentScore !== null
    ? ` ${game.teamScore}–${game.opponentScore}`
    : ""
  const color = game.result === "WIN"
    ? "text-success-subtle-fg"
    : game.result === "LOSS"
      ? "text-danger-subtle-fg"
      : "text-muted-fg"

  return <p className={`font-semibold text-sm/5 ${color}`}>{label}{score}</p>
}

function locationLabel(game: Game) {
  if (game.location === "AWAY") return "@"
  if (game.location === "NEUTRAL") return "vs*"
  return "vs"
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`),
  )
}
