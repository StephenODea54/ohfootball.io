import type { CSSProperties } from "react"
import { Link } from "@/components/ui/link"
import { TeamLogo } from "@/features/teams/components/team-logo"
import { formatRating } from "@/features/teams/utils/format"

/** The classes that paint the card with the tint of its team, written out in full for Tailwind. */
const CARD_TINT =
  "border-l-4 [border-color:color-mix(in_oklab,var(--tint)_45%,transparent)] [border-left-color:var(--tint)]"

const CARD_CLASS = `flex items-center gap-3 whitespace-nowrap rounded-lg border bg-bg/95 py-2 ps-3 pe-5 shadow-xl backdrop-blur-sm hover:shadow-[0_12px_32px_-8px_var(--tint)] motion-safe:transition-shadow motion-safe:duration-300 dark:bg-black/80 ${CARD_TINT}`

interface TeamCardProps {
  team: { sourceId: string; name: string; rank: number; rating: number }
  /** The small line above the name, such as NE Ohio. */
  label: string
  /** The line below the name. Without it the card shows the rank and the rating. */
  detail?: string
  /** The page of the team. With no link the card is only a label, as on the team map. */
  href?: string
  /** Sets --tint, the color of the team. */
  style: CSSProperties
  /** A key that CSS can match, such as the region of the home page poster. */
  "data-card"?: string
  className?: string
}

/** A school with its logo, its name, its rank, and its rating, in the style of the poster map. */
export function TeamCard({ team, label, detail, href, style, className, ...data }: TeamCardProps) {
  const body = (
    <>
      <TeamLogo team={team} size="sm" className="size-9" />
      <span className="flex flex-col">
        <span className="font-medium text-[0.625rem]/3 text-muted-fg uppercase tracking-[0.12em]">
          {label}
        </span>
        <span className="mt-0.5 font-semibold text-base/5 text-fg">{team.name}</span>
        <span className="text-muted-fg text-xs/4 tabular-nums">
          {detail ?? `#${team.rank} · ${formatRating(team.rating)}`}
        </span>
      </span>
    </>
  )
  const classes = className ? `${CARD_CLASS} ${className}` : CARD_CLASS
  return href ? (
    <Link href={href} className={classes} style={style} {...data}>
      {body}
    </Link>
  ) : (
    <div className={classes} style={style} {...data}>
      {body}
    </div>
  )
}
