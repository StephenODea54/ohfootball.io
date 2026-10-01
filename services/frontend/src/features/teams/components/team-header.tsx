"use client"

import { Heading } from "@/components/ui/heading"
import { Text } from "@/components/ui/text"
import { RatingNote } from "@/features/methodology/components/rating-note"
import { RankMovement } from "@/features/teams/components/rank-movement"
import { TeamLogo } from "@/features/teams/components/team-logo"
import { TeamStat } from "@/features/teams/components/team-stat"
import { formatRating, formatRecord, ratingTone, teamMeta } from "@/features/teams/utils/format"
import type { Team } from "@/types/api"

/** The name of a school with the three numbers that summarize its season. */
export function TeamHeader({ team }: { team: Team }) {
  const rating = team.rating ? formatRating(team.rating.value) : null

  return (
    <header className="mt-6 grid gap-8 border-b pb-8 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <div className="flex items-center gap-4 sm:gap-6">
        <TeamLogo team={team} size="lg" priority />
        <div className="min-w-0">
          <Text className="font-medium">{`${teamMeta(team)} · ${team.season}`}</Text>
          <Heading className="mt-1 text-4xl/none sm:text-5xl/none">
            {team.name}
            {team.mascot && <span className="text-muted-fg"> {team.mascot}</span>}
          </Heading>
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-7 sm:text-right">
        <TeamStat
          label="Rating"
          value={rating ?? "—"}
          tone={team.rating ? ratingTone(team.rating.value) : "text-fg"}
        />
        <TeamStat
          label="Rank"
          value={
            team.rating ? (
              <>
                #{team.rating.rank}
                <RankMovement rating={team.rating} className="ms-2 text-base/7" />
              </>
            ) : (
              "—"
            )
          }
        />
        <TeamStat label="Record" value={formatRecord(team.record)} />
      </dl>

      {/* The schedule on this page shows win chances, so the note also covers home field. */}
      <RatingNote className="max-w-3xl sm:col-span-2" />
    </header>
  )
}
