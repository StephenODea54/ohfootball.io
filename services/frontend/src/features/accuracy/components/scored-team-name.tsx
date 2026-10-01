import { Link } from "@/components/ui/link"
import type { LinkedScoredTeam } from "@/features/accuracy/utils/team-links"
import { TeamLogo } from "@/features/teams/components/team-logo"

/** The logo, the name, and the score of a team of a scored game. The name links to its page. */
export function ScoredTeamName({ team }: { team: LinkedScoredTeam }) {
  return (
    <span className="flex items-center gap-2.5">
      <TeamLogo team={team} size="xs" />
      <span>
        {team.href ? (
          <Link href={team.href} className="font-medium text-fg hover:text-primary-subtle-fg">
            {team.name}
          </Link>
        ) : (
          <span className="font-medium text-fg">{team.name}</span>
        )}
        {team.score !== null && (
          <span className="ms-1.5 text-muted-fg tabular-nums">{team.score}</span>
        )}
      </span>
    </span>
  )
}
