import type { CSSProperties } from "react"
import { twJoin } from "tailwind-merge"
import { Link } from "@/components/ui/link"
import { paths } from "@/config/paths"
import type { SlotStyle, SlotStyles } from "@/features/compare/components/slot-colors"
import type { ProgramHistory } from "@/features/compare/types"
import { TeamLogo } from "@/features/teams/components/team-logo"
import { formatRank, formatRating, ratingTone } from "@/features/teams/utils/format"

/**
 * A short sample of the line of one side, so the legend shows the color and the dash. The legend
 * is not in the scope of the chart, so the sample gets the color of each theme from its own style.
 */
function LineSample({ line: { light, dark, dash } }: { line: SlotStyle }) {
  return (
    <svg aria-hidden="true" className="h-2 w-8 shrink-0" viewBox="0 0 32 8">
      <line
        x1="0"
        y1="4"
        x2="32"
        y2="4"
        className="stroke-(--line-light) dark:stroke-(--line-dark)"
        style={{ "--line-light": light, "--line-dark": dark } as CSSProperties}
        strokeWidth="2.5"
        strokeDasharray={dash}
      />
    </svg>
  )
}

interface LegendRowProps {
  line: SlotStyle
  program: ProgramHistory
  season: number
}

/**
 * One school of the chart: the sample of its line, its logo and name, and its rank and rating this
 * season. The name links to the team page.
 */
function LegendRow({ line, program, season }: LegendRowProps) {
  const point = program.seasons.at(-1)
  const current = point?.season === season ? point : null

  return (
    <li className="flex min-w-0 items-center gap-3">
      <LineSample line={line} />
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
  styles: SlotStyles
  season: number
}

/** The legend of the chart, with one row for each school that is chosen. */
export function CompareLegend({ a, b, styles, season }: CompareLegendProps) {
  return (
    <ul aria-label="Schools on the chart" className="grid gap-4 sm:grid-cols-2">
      {a && <LegendRow line={styles.a} program={a} season={season} />}
      {b && <LegendRow line={styles.b} program={b} season={season} />}
    </ul>
  )
}
