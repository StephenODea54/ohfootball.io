import { twMerge } from "tailwind-merge"
import { LOGO_SIZES, type LogoSize } from "@/features/teams/utils/logo-sizes"
import { logoHref, teamInitials } from "@/features/teams/utils/team-logo"
import type { TeamSummary } from "@/types/api"

type TeamLogoSize = "xs" | "sm" | "lg"

/** The size of the box, the file it shows, and the size of the initials. */
const SIZES = {
  xs: { box: "size-6", file: "small", text: "text-[0.625rem]/none" },
  sm: { box: "size-10", file: "small", text: "text-sm/none" },
  lg: { box: "size-20 sm:size-24", file: "large", text: "text-2xl/none sm:text-3xl/none" },
} as const satisfies Record<TeamLogoSize, { box: string; file: LogoSize; text: string }>

interface TeamLogoProps {
  /** The sourceId is null for a school that the site has no data for. */
  team: { sourceId: string | null; name: TeamSummary["name"] }
  size: TeamLogoSize
  /** Loads the logo at once. Use it only for a logo that is on screen when the page opens. */
  priority?: boolean
  className?: string
}

/**
 * The logo of a team, or its initials when the team has no logo. The logo is always next to the
 * name of the team, so screen readers skip it.
 *
 * A browser loads a logo only when it comes near the screen. The leaderboard has a row for each
 * team, so this keeps a visit to the page from loading hundreds of files.
 */
export function TeamLogo({ team, size, priority = false, className }: TeamLogoProps) {
  const { box, file, text } = SIZES[size]
  const src = logoHref(team.sourceId, file)

  // The initials are text and not an SVG. A list item of the grid list sets the size of each SVG
  // in it, and that rule would make SVG initials too small for the box.
  if (src === null) {
    return (
      <span
        aria-hidden="true"
        className={twMerge(
          "inline-flex shrink-0 select-none items-center justify-center rounded-[20%] bg-muted font-semibold text-muted-fg uppercase",
          box,
          text,
          className,
        )}
      >
        {teamInitials(team.name)}
      </span>
    )
  }

  return (
    <img
      src={src}
      alt=""
      width={LOGO_SIZES[file]}
      height={LOGO_SIZES[file]}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      className={twMerge("shrink-0 object-contain", box, className)}
    />
  )
}
