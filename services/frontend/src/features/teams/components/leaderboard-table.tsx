"use client"

import { useMemo, useState } from "react"
import { twJoin } from "tailwind-merge"
import { Card, CardContent } from "@/components/ui/card"
import { Link } from "@/components/ui/link"
import { ProgressBar, ProgressBarTrack } from "@/components/ui/progress-bar"
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Text } from "@/components/ui/text"
import { paths } from "@/config/paths"
import { OutOfStateLegend } from "@/features/teams/components/out-of-state-legend"
import { OutOfStateMarker } from "@/features/teams/components/out-of-state-marker"
import { RankMovement } from "@/features/teams/components/rank-movement"
import { TeamFilterControls } from "@/features/teams/components/team-filter-controls"
import { TeamLogo } from "@/features/teams/components/team-logo"
import {
  ALL_COUNTIES,
  EMPTY_TEAM_FILTERS,
  filterTeams,
  type TeamFilterState,
} from "@/features/teams/utils/filter-teams"
import {
  countySummary,
  formatRating,
  formatRecord,
  ratingTone,
  teamMeta,
} from "@/features/teams/utils/format"
import type { TeamRating, TeamSummary } from "@/types/api"

type RatedTeam = TeamSummary & { rating: TeamRating }

/** Every rated school for a season, ranked, with the filters that narrow the list. */
export function LeaderboardTable({ season, teams }: { season: number; teams: TeamSummary[] }) {
  const [filters, setFilters] = useState<TeamFilterState>(EMPTY_TEAM_FILTERS)
  const ratedTeams = useMemo(
    () => filterTeams(teams, filters).filter((team): team is RatedTeam => team.rating !== null),
    [teams, filters],
  )

  // The bar in each row is drawn against the range of the teams currently on screen, so a narrow
  // filter still spreads its teams across the full width instead of bunching them together.
  const ratings = ratedTeams.map((team) => team.rating.value)
  const highestRating = ratings.length > 0 ? Math.max(...ratings) : 0
  const ratingFloor = ratings.length > 0 ? Math.min(...ratings) : 0
  const ratingRange = highestRating - ratingFloor

  return (
    <>
      <div className="mt-8 sm:mt-10">
        <TeamFilterControls filters={filters} onChange={setFilters} teams={teams} />
      </div>

      {ratedTeams.length > 0 ? (
        <>
          {filters.county !== ALL_COUNTIES && (
            <Text className="mt-6">{countySummary(ratedTeams.length, filters.county)}</Text>
          )}
          <Card className="mt-8 gap-0 overflow-hidden py-0 shadow-none [--gutter:--spacing(4)]">
            <CardContent>
              <Table aria-label={`${season} Rating Leaderboard`} bleed>
                <TableHeader className="bg-muted/70 text-xs/5 uppercase tracking-wide">
                  <TableColumn isRowHeader className="w-24">
                    Rank
                  </TableColumn>
                  <TableColumn>School</TableColumn>
                  <TableColumn className="text-end">Record</TableColumn>
                  <TableColumn className="w-32 text-end">Rating</TableColumn>
                </TableHeader>
                <TableBody items={ratedTeams}>
                  {(team) => {
                    const rating = team.rating.value
                    const progress =
                      ratingRange === 0 ? 100 : ((rating - ratingFloor) / ratingRange) * 100

                    return (
                      <TableRow id={team.id}>
                        <TableCell>
                          <span className="font-semibold text-lg/6 text-muted-fg">
                            {team.rating.rank}
                          </span>
                          <RankMovement rating={team.rating} className="ms-2" />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3 py-1">
                            <TeamLogo team={team} size="sm" />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <Link
                                  href={paths.team.getHref(team.id)}
                                  className="font-semibold text-base/6 text-fg hover:text-primary-subtle-fg"
                                >
                                  {team.name}
                                </Link>
                                <OutOfStateMarker team={team} />
                              </div>
                              <p className="text-muted-fg text-sm/5">{teamMeta(team)}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-end font-medium text-fg">
                          {formatRecord(team.record)}
                        </TableCell>
                        <TableCell>
                          <div className="ms-auto w-24 py-1">
                            <p
                              className={twJoin(
                                "text-end font-semibold text-base/6",
                                ratingTone(rating),
                              )}
                            >
                              {formatRating(rating)}
                            </p>
                            <ProgressBar
                              aria-label={`${team.name} rating ${formatRating(rating)}`}
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
          <OutOfStateLegend teams={ratedTeams} className="mt-3" />
        </>
      ) : (
        <Card className="mt-8 px-5 py-10 text-center shadow-none">
          <p className="font-medium text-fg text-sm/6">No Rated Schools Found</p>
          <Text className="mt-1">Try another school name, region, division, or county.</Text>
        </Card>
      )}
    </>
  )
}
