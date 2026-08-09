"use client"

import { useMemo, useState } from "react"
import {
  EMPTY_TEAM_FILTERS,
  filterTeams,
  TeamFilterControls,
  type TeamFilterState,
} from "@/app/team-filter-controls"
import { LastUpdatedStamp } from "@/components/last-updated-stamp"
import { Card, CardContent } from "@/components/ui/card"
import { Container } from "@/components/ui/container"
import { Heading } from "@/components/ui/heading"
import { Link } from "@/components/ui/link"
import { ProgressBar, ProgressBarTrack } from "@/components/ui/progress-bar"
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@/components/ui/table"
import { Text } from "@/components/ui/text"
import { formatDivision, formatRecord, lastUpdated, type Team } from "@/lib/graphql"
import { withSeason } from "@/lib/season"

export function LeaderboardPage({ season, teams }: { season: number; teams: Team[] }) {
  const [filters, setFilters] = useState<TeamFilterState>(EMPTY_TEAM_FILTERS)
  const ratedTeams = useMemo(
    () => filterTeams(teams, filters).filter((team) => team.rating),
    [teams, filters],
  )

  // The bar in each row is drawn against the range of the teams currently on screen, so a narrow
  // filter still spreads its teams across the full width instead of bunching them together.
  const ratings = ratedTeams.map((team) => team.rating!.value)
  const highestRating = ratings.length > 0 ? Math.max(...ratings) : 0
  const ratingFloor = ratings.length > 0 ? Math.min(...ratings) : 0
  const ratingRange = highestRating - ratingFloor

  return (
    <main>
      <Container className="max-w-6xl py-12 sm:py-16 lg:py-20">
        <header className="max-w-4xl">
          <Heading className="text-4xl/none sm:text-5xl/none">Leaderboard</Heading>
          <Text className="mt-3 text-base/7 sm:text-base/7">Schools listed by rating.</Text>
        </header>

        <div className="mt-8 sm:mt-10">
          <TeamFilterControls filters={filters} onChange={setFilters} teams={teams} />
        </div>

        {ratedTeams.length > 0 ? (
          <Card className="mt-8 gap-0 overflow-hidden py-0 shadow-none [--gutter:--spacing(4)]">
            <CardContent>
              <Table aria-label={`${season} Rating Leaderboard`} bleed>
                <TableHeader className="bg-muted/70 text-xs/5 uppercase tracking-wide">
                  <TableColumn isRowHeader className="w-16">Rank</TableColumn>
                  <TableColumn>School</TableColumn>
                  <TableColumn className="text-end">Record</TableColumn>
                  <TableColumn className="w-32 text-end">Rating</TableColumn>
                </TableHeader>
                <TableBody items={ratedTeams}>
                  {(team) => {
                    const rating = team.rating!.value
                    const progress = ratingRange === 0
                      ? 100
                      : ((rating - ratingFloor) / ratingRange) * 100

                    return (
                      <TableRow id={team.id}>
                        <TableCell className="font-semibold text-lg/6 text-muted-fg">
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
                            <p className="text-muted-fg text-sm/5">
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
                  }}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : (
          <Card className="mt-8 px-5 py-10 text-center shadow-none">
            <p className="font-medium text-fg text-sm/6">No Rated Schools Found</p>
            <Text className="mt-1">Try another school name, region, division, or season.</Text>
          </Card>
        )}
      </Container>

      <LastUpdatedStamp isoDate={lastUpdated(teams)} />
    </main>
  )
}
