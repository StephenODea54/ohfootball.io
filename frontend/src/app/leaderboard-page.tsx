"use client"

import { useMemo, useState } from "react"
import { TeamAnalytics } from "@/app/team-analytics"
import {
  EMPTY_TEAM_FILTERS,
  filterTeams,
  TeamFilterControls,
  type TeamFilterState,
} from "@/app/team-filter-controls"
import { Card, CardContent } from "@/components/ui/card"
import { Container } from "@/components/ui/container"
import { Heading } from "@/components/ui/heading"
import { Link } from "@/components/ui/link"
import { ProgressBar, ProgressBarTrack } from "@/components/ui/progress-bar"
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@/components/ui/table"
import { Text } from "@/components/ui/text"
import { formatDivision, formatRecord, type Team } from "@/lib/graphql"
import { withSeason } from "@/lib/season"

export function LeaderboardPage({ season, teams }: { season: number; teams: Team[] }) {
  const [filters, setFilters] = useState<TeamFilterState>(EMPTY_TEAM_FILTERS)
  const filteredTeams = useMemo(() => filterTeams(teams, filters), [teams, filters])
  const ratedTeams = filteredTeams.filter((team) => team.rating)
  const highestRating = ratedTeams.length
    ? Math.max(...ratedTeams.map((team) => team.rating!.value))
    : 0
  const ratingFloor = ratedTeams.length
    ? Math.min(...ratedTeams.map((team) => team.rating!.value))
    : 0

  return (
    <main>
      <Container className="max-w-6xl py-12 sm:py-16 lg:py-20">
        <header className="max-w-4xl">
          <Heading className="text-4xl/none sm:text-5xl/none">Leaderboard</Heading>
          <Text className="mt-3 text-base/7 sm:text-base/7">
            Every Ohio high school football team in {season}, ranked by rating. Search by school
            name, then narrow the field by region or division.
          </Text>
        </header>

        <div className="mt-8 sm:mt-10">
          <TeamFilterControls filters={filters} onChange={setFilters} teams={teams} />
        </div>

        <TeamAnalytics season={season} teams={filteredTeams} />

        {ratedTeams.length > 0 ? (
          <Card className="mt-8 gap-0 overflow-hidden py-0 shadow-none [--gutter:--spacing(4)]">
            <CardContent>
              <Table aria-label={`${season} Ohio high school football rating leaderboard`} bleed>
                <TableHeader className="bg-muted/70 uppercase text-xs/5 tracking-wide">
                  <TableColumn isRowHeader className="w-16">Rank</TableColumn>
                  <TableColumn>Team</TableColumn>
                  <TableColumn className="text-end">Record</TableColumn>
                  <TableColumn className="w-32 text-end">Rating</TableColumn>
                </TableHeader>
                <TableBody>
                  {ratedTeams.map((team) => {
                    const rating = team.rating!.value
                    const range = highestRating - ratingFloor
                    const progress = range === 0 ? 100 : ((rating - ratingFloor) / range) * 100

                    return (
                      <TableRow id={team.id} key={team.id}>
                        <TableCell className="text-lg/6 font-semibold text-muted-fg">
                          {team.rating!.rank}
                        </TableCell>
                        <TableCell>
                          <div className="py-1">
                            <Link
                              href={withSeason(`/teams/${team.id}`, season)}
                              className="font-semibold text-base/6 text-fg hover:text-primary-subtle-fg"
                            >
                              {team.name}
                            </Link>
                            <p className="text-sm/5 text-muted-fg">
                              {[
                                team.city,
                                team.region ? `Region ${team.region}` : null,
                                formatDivision(team.division),
                              ].filter(Boolean).join(" · ")}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-end font-medium text-fg">
                          {formatRecord(team.record)}
                        </TableCell>
                        <TableCell>
                          <div className="ms-auto w-24 py-1">
                            <p className="text-end font-semibold text-base/6 text-success-subtle-fg">
                              {Math.round(rating)}
                            </p>
                            <ProgressBar
                              aria-label={`${team.name} rating ${Math.round(rating)}`}
                              value={progress}
                              className="mt-1"
                            >
                              <ProgressBarTrack className="min-w-24 max-w-24 [--progress-content-bg:var(--color-success)]" />
                            </ProgressBar>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : (
          <Card className="mt-8 px-5 py-10 text-center shadow-none">
            <p className="font-medium text-sm/6 text-fg">No rated teams found</p>
            <Text className="mt-1">Try another school name, region, division, or season.</Text>
          </Card>
        )}

        <Text className="mt-3 text-xs/5">
          Ratings are relative strength estimates. They update after completed games.
        </Text>
      </Container>
    </main>
  )
}
