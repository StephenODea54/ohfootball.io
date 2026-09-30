"use client"

import { twJoin } from "tailwind-merge"
import { Heading } from "@/components/ui/heading"
import { Text } from "@/components/ui/text"
import { formatRating, formatRecord, ratingTone, teamMeta } from "@/features/teams/utils/format"
import type { Team } from "@/types/api"

/** The name of a school with the three numbers that summarize its season. */
export function TeamHeader({ team }: { team: Team }) {
  const rating = team.rating ? formatRating(team.rating.value) : null

  return (
    <header className="mt-6 grid gap-8 border-b pb-8 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <div>
        <Text className="font-medium">{`${teamMeta(team)} · ${team.season}`}</Text>
        <Heading className="mt-1 text-4xl/none sm:text-5xl/none">
          {team.name}
          {team.mascot && <span className="text-muted-fg"> {team.mascot}</span>}
        </Heading>
      </div>

      <dl className="grid grid-cols-3 gap-7 sm:text-right">
        <TeamStat
          label="Rating"
          value={rating ?? "—"}
          tone={team.rating ? ratingTone(team.rating.value) : "text-fg"}
        />
        <TeamStat label="Rank" value={team.rating ? `#${team.rating.rank}` : "—"} />
        <TeamStat label="Record" value={formatRecord(team.record)} />
      </dl>
    </header>
  )
}

function TeamStat({
  label,
  value,
  tone = "text-fg",
}: {
  label: string
  value: string
  tone?: string
}) {
  return (
    <div>
      <dt className="text-xs/5 font-medium uppercase tracking-wide text-muted-fg">{label}</dt>
      <dd className={twJoin("mt-0.5 text-2xl/7 font-semibold", tone)}>{value}</dd>
    </div>
  )
}
