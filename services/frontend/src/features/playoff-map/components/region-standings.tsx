import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Link } from "@/components/ui/link"
import { paths } from "@/config/paths"
import type { PlayoffMapRegion } from "@/features/playoff-map/types"
import type { Standing } from "@/features/playoff-map/utils/ownership"
import { formatShare, roundName } from "@/features/playoff-map/utils/view"
import { regionLabel } from "@/features/playoffs/utils/format"
import { TeamLogo } from "@/features/teams/components/team-logo"

interface RegionStandingsProps {
  region: PlayoffMapRegion
  standings: readonly Standing[]
  /** The id of the team that won the regional final, once the map shows that round. */
  championId: string | null
}

/**
 * The playoff teams of a region in the order of their seeds, with the share of the land that each
 * holds after the chosen round, or the round that it lost in.
 */
export function RegionStandings({ region, standings, championId }: RegionStandingsProps) {
  const names = new Map(region.teams.map((team) => [team.id, team.name]))
  const byTeam = new Map(standings.map((standing) => [standing.teamId, standing]))

  return (
    <Card>
      <CardHeader>
        <CardTitle>{regionLabel(region.region)}</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-2">
          {region.teams.map((team) => {
            const standing = byTeam.get(team.id)
            const out = standing?.out ?? null
            return (
              <li
                key={team.id}
                data-out={out ? true : undefined}
                className="flex items-center gap-3 text-sm/6 data-out:opacity-60"
              >
                <span className="w-5 shrink-0 text-right text-muted-fg tabular-nums">
                  {team.seed}
                </span>
                <TeamLogo team={team} size="sm" className="size-7 shrink-0" />
                <span className="min-w-0 flex-1">
                  <Link href={paths.team.getHref(team.id)} className="block truncate font-medium">
                    {team.name}
                  </Link>
                  {out && (
                    <span className="block truncate text-muted-fg text-xs/5">
                      {`Lost in the ${roundName(out.round).toLowerCase()} to ${names.get(out.byId) ?? "another team"}`}
                    </span>
                  )}
                </span>
                {team.id === championId ? (
                  <Badge intent="success">Champion</Badge>
                ) : out ? (
                  <Badge intent="secondary">Out</Badge>
                ) : (
                  <Badge intent="outline" className="tabular-nums">
                    {formatShare(standing?.share ?? 0)}
                  </Badge>
                )}
              </li>
            )
          })}
        </ol>
      </CardContent>
    </Card>
  )
}
