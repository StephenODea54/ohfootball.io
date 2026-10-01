import { twJoin } from "tailwind-merge"
import { Link } from "@/components/ui/link"
import { paths } from "@/config/paths"
import { SLOT_STYLES, type Slot } from "@/features/compare/components/slot-colors"
import type { ProgramHistory } from "@/features/compare/types"
import { TeamLogo } from "@/features/teams/components/team-logo"
import { formatRank, formatRating, ratingTone } from "@/features/teams/utils/format"

/** A short sample of the line of one side, so the legend shows the color and the dash. */
function LineSample({ slot }: { slot: Slot }) {
  const { color, dash } = SLOT_STYLES[slot]
  return (
    <svg aria-hidden="true" className="h-2 w-8 shrink-0" viewBox="0 0 32 8">
      <line x1="0" y1="4" x2="32" y2="4" stroke={color} strokeWidth="2.5" strokeDasharray={dash} />
    </svg>
  )
}

interface LegendRowProps {
  slot: Slot
  program: ProgramHistory
  season: number
}

/**
 * One school of the chart: the sample of its line, its logo and name, and its rank and rating this
 * season. The name links to the team page.
 */
function LegendRow({ slot, program, season }: LegendRowProps) {
  const point = program.seasons.at(-1)
  const current = point?.season === season ? point : null

  return (
    <li className="flex min-w-0 items-center gap-3">
      <LineSample slot={slot} />
      <TeamLogo team={program} size="sm" />
      <div className="min-w-0">
        <Link
          href={paths.team.getHref(program.teamId)}
          className="block truncate font-semibold text-fg hover:text-primary-subtle-fg"
        >
          {program.name}
        </Link>
        <p className="text-muted-fg text-sm/5 tabular-nums">
          {current ? (
            <>
              {season}: {formatRank(current.rank)} ·{" "}
              <span className={twJoin("font-medium", ratingTone(current.rating))}>
                {formatRating(current.rating)}
              </span>
            </>
          ) : (
            `Not rated in ${season}`
          )}
        </p>
      </div>
    </li>
  )
}

interface CompareLegendProps {
  a: ProgramHistory | null
  b: ProgramHistory | null
  season: number
}

/** The legend of the chart, with one row for each school that is chosen. */
export function CompareLegend({ a, b, season }: CompareLegendProps) {
  return (
    <ul aria-label="Schools on the chart" className="grid gap-4 sm:grid-cols-2">
      {a && <LegendRow slot="a" program={a} season={season} />}
      {b && <LegendRow slot="b" program={b} season={season} />}
    </ul>
  )
}
