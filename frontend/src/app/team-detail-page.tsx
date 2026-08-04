"use client"

import { Area, AreaChart } from "recharts"
import { getTeam } from "@/app/team-data"
import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CartesianGrid, Chart, ChartTooltip, ChartTooltipContent, XAxis, YAxis } from "@/components/ui/chart"
import { Container } from "@/components/ui/container"
import { Heading } from "@/components/ui/heading"
import { Link } from "@/components/ui/link"
import { ProgressBar, ProgressBarTrack } from "@/components/ui/progress-bar"
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@/components/ui/table"
import { Text } from "@/components/ui/text"

const eloHistory = [
  { period: "Preseason", rating: 1866 },
  { period: "Wk 1", rating: 1869 },
  { period: "Wk 2", rating: 1849 },
  { period: "Wk 3", rating: 1859 },
  { period: "Wk 4", rating: 1872 },
  { period: "Wk 5", rating: 1883 },
  { period: "Wk 6", rating: 1892 },
]

type GameResult = "hit" | "miss" | "upcoming"

interface Game {
  week: number
  date: string
  opponent: string
  location: "vs" | "@"
  prediction: "W" | "L"
  probability: number
  result: string
  status: GameResult
}

const schedule: Game[] = [
  { week: 1, date: "Aug 20", opponent: "Highland", location: "vs", prediction: "W", probability: 86, result: "W 46–29", status: "hit" },
  { week: 2, date: "Aug 27", opponent: "Kings", location: "@", prediction: "W", probability: 69, result: "L 24–29", status: "miss" },
  { week: 3, date: "Sep 3", opponent: "Pickerington Central", location: "vs", prediction: "W", probability: 63, result: "W 31–20", status: "hit" },
  { week: 4, date: "Sep 10", opponent: "Springfield", location: "@", prediction: "W", probability: 61, result: "W 33–28", status: "hit" },
  { week: 5, date: "Sep 17", opponent: "Avon", location: "vs", prediction: "W", probability: 67, result: "W 36–29", status: "hit" },
  { week: 6, date: "Sep 24", opponent: "Medina", location: "@", prediction: "W", probability: 78, result: "W 31–20", status: "hit" },
  { week: 7, date: "Oct 1", opponent: "Canton McKinley", location: "vs", prediction: "W", probability: 81, result: "Upcoming", status: "upcoming" },
  { week: 8, date: "Oct 8", opponent: "Lakota West", location: "@", prediction: "W", probability: 77, result: "Upcoming", status: "upcoming" },
  { week: 9, date: "Oct 15", opponent: "Olentangy Liberty", location: "vs", prediction: "W", probability: 76, result: "Upcoming", status: "upcoming" },
  { week: 10, date: "Oct 22", opponent: "Elder", location: "@", prediction: "W", probability: 80, result: "Upcoming", status: "upcoming" },
]

const chartConfig = {
  rating: {
    label: "Elo",
    color: "var(--color-success)",
  },
}

export function TeamDetailPage({ teamId }: { teamId: string }) {
  const team = getTeam(teamId)

  return (
    <main>
      <Container className="max-w-6xl py-10 sm:py-14 lg:py-16">
        <Link href="/" className="inline-flex text-sm/6 text-muted-fg hover:text-fg">
          ← All teams
        </Link>

        <header className="mt-6 grid gap-8 border-b pb-8 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div>
            <Text className="font-medium">{team.city} · {team.division}</Text>
            <Heading className="mt-1 text-4xl/none sm:text-5xl/none">
              {team.name} <span className="text-muted-fg">{team.mascot}</span>
            </Heading>
          </div>

          <dl className="grid grid-cols-3 gap-7 sm:text-right">
            <TeamStat label="Elo" value={team.rating.toString()} accent />
            <TeamStat label="Rank" value={`#${team.rank}`} />
            <TeamStat label="Record" value={team.record} />
          </dl>
        </header>

        <Card className="mt-6 gap-0 py-4 shadow-none [--gutter:--spacing(4)]">
          <CardContent className="flex flex-col items-start gap-x-3 gap-y-1 text-sm/6 sm:flex-row sm:items-center">
            <span><strong className="font-semibold text-fg">5</strong> <span className="text-muted-fg">of 6 predictions correct</span></span>
            <span aria-hidden className="hidden text-muted-fg sm:inline">·</span>
            <span><strong className="font-semibold text-fg">83%</strong> <span className="text-muted-fg">model accuracy</span></span>
          </CardContent>
        </Card>

        <section className="mt-10" aria-labelledby="elo-history-heading">
          <Heading id="elo-history-heading" level={2} className="mb-4 text-lg/7 sm:text-lg/7">
            Elo history
          </Heading>
          <Card className="gap-4 py-5 shadow-none [--gutter:--spacing(4)] sm:[--gutter:--spacing(6)]">
            <CardHeader>
              <div>
                <p className="text-xs/5 font-semibold uppercase tracking-wide text-muted-fg">Season trend</p>
                <p className="mt-1 text-sm/6 text-fg">
                  Preseason <strong>1866</strong> <span className="mx-1 text-muted-fg">→</span> Current <strong>{team.rating}</strong>
                </p>
              </div>
              <CardAction>
                <Badge intent="success" className="font-semibold">+26</Badge>
              </CardAction>
            </CardHeader>
            <CardContent>
              <Chart data={eloHistory} dataKey="period" config={chartConfig} containerHeight={250}>
                <AreaChart data={eloHistory} margin={{ top: 10, right: 10, left: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="elo-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-rating)" stopOpacity={0.22} />
                      <stop offset="95%" stopColor="var(--color-rating)" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} />
                  <XAxis />
                  <YAxis width={42} domain={[1820, 1920]} ticks={[1820, 1845, 1870, 1895, 1920]} />
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
                  {schedule.map((game) => (
                    <TableRow id={game.week} key={game.week}>
                      <TableCell className="font-semibold text-muted-fg">{game.week}</TableCell>
                      <TableCell className="text-muted-fg">{game.date}</TableCell>
                      <TableCell>
                        <span className="text-muted-fg">{game.location}</span>{" "}
                        <span className="font-medium text-fg">{game.opponent}</span>
                      </TableCell>
                      <TableCell>
                        <Badge intent={game.prediction === "W" ? "success" : "danger"} isCircle={false} className="text-sm/5 font-semibold">
                          {game.prediction}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <ProgressBar aria-label={`${game.probability}% win probability`} value={game.probability} className="w-auto">
                            <ProgressBarTrack className="min-w-24 max-w-24 [--progress-content-bg:var(--color-success)]" />
                          </ProgressBar>
                          <span className="font-medium text-sm/5 text-muted-fg">{game.probability}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-end">
                        <GameResult result={game.result} status={game.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Text className="mt-3 text-xs/5">
            Predictions use the Elo rating available before each game. Upcoming probabilities may change as ratings update.
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

function GameResult({ result, status }: { result: string; status: GameResult }) {
  if (status === "upcoming") {
    return <span className="text-xs/5 uppercase tracking-wide text-muted-fg">Upcoming</span>
  }

  return (
    <div className={status === "hit" ? "text-success-subtle-fg" : "text-danger-subtle-fg"}>
      <p className="font-semibold text-sm/5">{result}</p>
      <p className="text-[0.6875rem]/4 uppercase tracking-wide">{status === "hit" ? "✓ Hit" : "× Miss"}</p>
    </div>
  )
}
