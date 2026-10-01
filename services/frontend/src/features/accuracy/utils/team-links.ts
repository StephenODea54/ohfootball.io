import { paths } from "@/config/paths"
import type { ScoredGame, ScoredTeam } from "@/types/api"

/** A team of a scored game, with the address of its page or null when it has no page. */
export type LinkedScoredTeam = ScoredTeam & { href: string | null }

/** A scored game whose teams carry the addresses of their pages. */
export type LinkedScoredGame = Omit<ScoredGame, "winner" | "loser"> & {
  winner: LinkedScoredTeam
  loser: LinkedScoredTeam
}

/**
 * Gives each team of a game the address of its page. Only the teams of the current season have
 * a page, and a local build draws only some of them, so a team gets an address only when the game
 * is of the current season and the build draws its page.
 */
export function linkScoredTeams(
  games: ScoredGame[],
  currentSeason: number,
  pageTeamIds: ReadonlySet<string>,
): LinkedScoredGame[] {
  const link = (game: ScoredGame, team: ScoredTeam): LinkedScoredTeam => ({
    ...team,
    href:
      game.season === currentSeason && pageTeamIds.has(team.id)
        ? paths.team.getHref(team.id)
        : null,
  })
  return games.map((game) => ({
    ...game,
    winner: link(game, game.winner),
    loser: link(game, game.loser),
  }))
}
