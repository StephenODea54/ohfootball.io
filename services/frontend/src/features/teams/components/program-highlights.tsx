import { twJoin } from "tailwind-merge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { InfoButton } from "@/features/teams/components/info-button"
import { TeamStat } from "@/features/teams/components/team-stat"
import { formatRating, ratingTone } from "@/features/teams/utils/format"
import {
  bestSeason,
  COUNTED_SEASONS_NOTE,
  playoffAppearances,
  type QualifyingRow,
  qualifyingSeasons,
  type SeasonRow,
  topTenFinishes,
  worstSeason,
} from "@/features/teams/utils/program-history"

/**
 * Four numbers that summarize the complete seasons of a program: the best and the worst season by
 * rank, the top 10 finishes, and the playoff appearances.
 */
export function ProgramHighlights({ rows }: { rows: SeasonRow[] }) {
  const best = bestSeason(rows)
  const worst = worstSeason(rows)
  const completeSeasons = rows.filter((row) => !row.inProgress).length

  return (
    <Card className="shadow-none [--gutter:--spacing(4)] sm:[--gutter:--spacing(6)]">
      <CardHeader>
        <CardTitle className="flex items-center gap-1">
          Highlights
          <InfoButton label="Highlights" note={COUNTED_SEASONS_NOTE} />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <TeamStat label="Best Season" value={best ? <SeasonValue row={best} /> : "—"} />
          <TeamStat label="Worst Season" value={worst ? <SeasonValue row={worst} /> : "—"} />
          <TeamStat
            label="Top 10 Finishes"
            value={qualifyingSeasons(rows) > 0 ? topTenFinishes(rows) : "—"}
          />
          <TeamStat
            label="Playoff Appearances"
            value={completeSeasons > 0 ? playoffAppearances(rows) : "—"}
          />
        </dl>
      </CardContent>
    </Card>
  )
}

/** The year of a season with its rating on the same line. */
function SeasonValue({ row }: { row: QualifyingRow }) {
  return (
    <span className="flex items-center gap-2">
      {row.season}
      <span className={twJoin("text-base/7 font-medium", ratingTone(row.rating))}>
        {formatRating(row.rating)}
      </span>
    </span>
  )
}
