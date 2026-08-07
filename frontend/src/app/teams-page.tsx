"use client"

import { useMemo, useState } from "react"
import {
  filterTeams,
  TeamFilterControls,
  type TeamFilterState,
} from "@/app/team-filter-controls"
import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Container } from "@/components/ui/container"
import { Heading } from "@/components/ui/heading"
import { Link } from "@/components/ui/link"
import { Separator } from "@/components/ui/separator"
import { Text, TextLink } from "@/components/ui/text"
import { formatDivision, formatRecord, type Team } from "@/lib/graphql"

export function TeamsPage({
  onSeasonChange,
  season,
  teams,
}: {
  onSeasonChange: (season: number) => void
  season: number
  teams: Team[]
}) {
  const [filters, setFilters] = useState<TeamFilterState>({
    query: "",
    region: "",
    division: "",
  })

  const filteredTeams = useMemo(() => filterTeams(teams, filters), [teams, filters])

  const leaders = filteredTeams.slice(0, 5)

  return (
    <main>
      <Container className="max-w-6xl py-12 sm:py-16 lg:py-20">
        <section className="max-w-3xl">
          <Heading className="max-w-2xl text-4xl/none sm:text-5xl/none">
            Ohio high school football, <span className="text-primary">predicted.</span>
          </Heading>
          <Text className="mt-4 max-w-2xl text-base/7 sm:text-base/7">
            Explore any season by school, region, or division, with Elo ratings and results as
            the season unfolds.
          </Text>

          <div className="mt-8 max-w-4xl">
            <TeamFilterControls
              filters={filters}
              onChange={setFilters}
              onSeasonChange={onSeasonChange}
              season={season}
              teams={teams}
            />
          </div>
        </section>

        <div className="mt-12 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <section aria-labelledby="all-teams-heading">
            <div className="mb-4 flex items-baseline justify-between gap-4">
              <Heading id="all-teams-heading" level={2} className="text-base/6 sm:text-base/6">
                All teams
              </Heading>
              <Text className="m-0 text-xs/5">
                {filteredTeams.length.toLocaleString()} teams · {season} · Sorted by Elo
              </Text>
            </div>

            <Card className="gap-0 overflow-hidden py-0 shadow-none">
              {filteredTeams.length > 0 ? (
                filteredTeams.map((team, index) => (
                  <div key={team.id}>
                    {index > 0 && <Separator />}
                    <Link
                      href={`/teams/${team.id}`}
                      className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 px-4 py-4 text-fg hover:bg-muted/50 sm:px-5"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-sm/5 text-fg sm:text-base/6">
                          {team.name}
                        </p>
                        <p className="mt-0.5 truncate text-sm/5 text-muted-fg">
                          {[
                            team.mascot,
                            team.city,
                            team.region ? `Region ${team.region}` : null,
                            formatDivision(team.division),
                          ].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <span className="hidden text-sm/5 text-muted-fg sm:block">{formatRecord(team.record)}</span>
                      <Badge intent="success" className="min-w-14 justify-center font-semibold">
                        {team.elo ? Math.round(team.elo.rating) : "—"}
                      </Badge>
                    </Link>
                  </div>
                ))
              ) : (
                <div className="px-5 py-10 text-center">
                  <p className="font-medium text-sm/6 text-fg">No teams found</p>
                  <Text className="mt-1">Try another name, region, division, or season.</Text>
                </div>
              )}
            </Card>
          </section>

          <aside aria-label="Top five teams by Elo">
            <Card className="gap-4 py-5 shadow-none [--gutter:--spacing(4)]">
              <CardHeader>
                <CardTitle>Top 5 in view</CardTitle>
                <CardAction>
                  <TextLink href="/leaderboard" className="text-xs/5">
                    Full leaderboard →
                  </TextLink>
                </CardAction>
              </CardHeader>
              <CardContent>
                {leaders.length > 0 ? <ol className="space-y-4">
                  {leaders.map((team, index) => (
                    <li key={team.id} className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-baseline gap-2 text-sm/5">
                      <span className="font-medium text-muted-fg">{index + 1}</span>
                      <span className="truncate font-medium text-fg">{team.name}</span>
                      <span className="font-semibold text-success-subtle-fg">
                        {team.elo ? Math.round(team.elo.rating) : "—"}
                      </span>
                    </li>
                  ))}
                </ol> : <Text className="m-0 text-sm/6">No teams match these filters.</Text>}
              </CardContent>
            </Card>
          </aside>
        </div>
      </Container>
    </main>
  )
}
