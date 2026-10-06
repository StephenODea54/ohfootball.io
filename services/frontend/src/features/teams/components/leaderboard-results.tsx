"use no memo"
// TanStack Table keeps its state in one object that changes in place, so memoized code would show
// stale rows. React Compiler already skips files that use TanStack Table. This directive makes that
// choice clear. The component passes only plain values to the components that it draws.

import {
  type ColumnFiltersState,
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { useMemo } from "react"
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
import { LeaderboardPagination } from "@/features/teams/components/leaderboard-pagination"
import { OutOfStateLegend } from "@/features/teams/components/out-of-state-legend"
import { OutOfStateMarker } from "@/features/teams/components/out-of-state-marker"
import { RankMovement } from "@/features/teams/components/rank-movement"
import { TeamLogo } from "@/features/teams/components/team-logo"
import {
  ALL_COUNTIES,
  ALL_DIVISIONS,
  ALL_REGIONS,
  matchesCounty,
  matchesDivision,
  matchesQuery,
  matchesRegion,
} from "@/features/teams/utils/filter-teams"
import {
  countySummary,
  formatRating,
  formatRecord,
  ratingTone,
  teamMeta,
} from "@/features/teams/utils/format"
import { PAGE_SIZE, pageSummary } from "@/features/teams/utils/paginate"
import { isBlank } from "@/hooks/use-debounced-value"
import type { TeamRating, TeamSummary } from "@/types/api"

type RatedTeam = TeamSummary & { rating: TeamRating }

const column = createColumnHelper<RatedTeam>()

// The columns exist only to filter. The table below draws its own cells. Each filter reuses the
// test of filter-teams, so the leaderboard and its tests agree on what matches.
const columns = [
  column.accessor("name", {
    filterFn: (row, _id, query: string) => matchesQuery(row.original, query),
  }),
  column.accessor("region", {
    filterFn: (row, _id, region: string) => matchesRegion(row.original, region),
  }),
  column.accessor("division", {
    filterFn: (row, _id, division: string) => matchesDivision(row.original, division),
  }),
  column.accessor("county", {
    filterFn: (row, _id, county: string) => matchesCounty(row.original, county),
  }),
]

interface LeaderboardResultsProps {
  season: number
  teams: TeamSummary[]
  /** The name search after the debounce. */
  query: string
  region: string
  division: string
  county: string
  /** The current page, from 0. The parent sets it to 0 when a filter changes. */
  pageIndex: number
  onPageIndexChange: (pageIndex: number) => void
}

/** The rated schools that pass the filters, fifty to a page, with the page controls. */
export function LeaderboardResults({
  season,
  teams,
  query,
  region,
  division,
  county,
  pageIndex,
  onPageIndexChange,
}: LeaderboardResultsProps) {
  const data = useMemo(
    () => teams.filter((team): team is RatedTeam => team.rating !== null),
    [teams],
  )
  // A filter set to "all" is left out, so the table skips it.
  const columnFilters = useMemo<ColumnFiltersState>(
    () => [
      ...(isBlank(query) ? [] : [{ id: "name", value: query }]),
      ...(region === ALL_REGIONS ? [] : [{ id: "region", value: region }]),
      ...(division === ALL_DIVISIONS ? [] : [{ id: "division", value: division }]),
      ...(county === ALL_COUNTIES ? [] : [{ id: "county", value: county }]),
    ],
    [query, region, division, county],
  )

  const table = useReactTable({
    data,
    columns,
    getRowId: (team) => team.id,
    state: { columnFilters, pagination: { pageIndex, pageSize: PAGE_SIZE } },
    // The page comes from the parent, which sets it to 0 in the same update as a filter. Without
    // this option, the table would also queue its own reset and draw one more time.
    autoResetPageIndex: false,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  const filtered = table.getFilteredRowModel().rows.map((row) => row.original)
  const pageTeams = table.getRowModel().rows.map((row) => row.original)

  if (filtered.length === 0) {
    return (
      // The role tells a screen reader that the list became empty, as the page summary does for a
      // list that is not empty.
      <Card role="status" className="mt-8 px-5 py-10 text-center shadow-none">
        <p className="font-medium text-fg text-sm/6">No Rated Schools Found</p>
        <Text className="mt-1">Try another school name, region, division, or county.</Text>
      </Card>
    )
  }

  // The bar in each row is drawn against the range of every school that passes the filters, so the
  // bars agree from one page to the next. A narrow filter still spreads its schools across the bar.
  const ratings = filtered.map((team) => team.rating.value)
  const highestRating = Math.max(...ratings)
  const ratingFloor = Math.min(...ratings)
  const ratingRange = highestRating - ratingFloor

  return (
    <>
      {county !== ALL_COUNTIES && (
        <Text className="mt-6">{countySummary(filtered.length, county)}</Text>
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
            <TableBody items={pageTeams}>
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
      <OutOfStateLegend teams={pageTeams} className="mt-3" />
      <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
        <Text aria-live="polite">{pageSummary(pageIndex + 1, filtered.length)}</Text>
        <LeaderboardPagination
          page={pageIndex + 1}
          pageCount={table.getPageCount()}
          onChange={(page) => onPageIndexChange(page - 1)}
        />
      </div>
    </>
  )
}
