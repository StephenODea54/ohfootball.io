import {
  OHIO_TIME_ZONE,
  type PickemGamesFile,
  type PickemResult,
  type PickSide,
} from "@/features/pickem/contract"
import { lockAt } from "@/features/pickem/utils/dates"
import { pickResult } from "@/features/pickem/utils/pickable-games"
import type { Game } from "@/types/api"

/**
 * A game of a team page against an Ohio team that is not canceled. Such a game can have a tally.
 * This module runs only in the build. The browser imports only its types.
 */
export interface TeamPick {
  gameKey: string
  /** The side of the page team. A pick of this side picks the page team. */
  side: PickSide
  /** The moment picks close, as an ISO time. */
  lockAt: string
  /** The winner, or null when the game has no result yet. */
  winner: PickemResult["winner"] | null
  /**
   * Whether the game is in the games of the build, so the Function takes picks for it until the
   * lock. A game that is not, such as an old one, only shows its tally.
   */
  takesPicks: boolean
}

/** A game of the schedule with its pick, or null when the game can have no tally. */
export type PickedGame<T> = T & { pick: TeamPick | null }

interface PageTeam {
  id: string
  sourceId: string
  schedule: readonly Game[]
}

/**
 * The games of `team` that can have a tally, by game key: each game against an Ohio team that is
 * not canceled. `ohio` is the list of the season, which holds only schools from Ohio. A game in the
 * games of the build takes its side and its winner from there. Any other game gets its side by the
 * same rule as the build: side a is the school whose number comes first as text.
 */
export function teamPicks(
  file: PickemGamesFile,
  team: PageTeam,
  ohio: readonly { id: string; sourceId: string }[],
): Map<string, TeamPick> {
  const games = new Map(file.games.map((game) => [game.gameKey, game]))
  const sources = new Map(ohio.map((entry) => [entry.id, entry.sourceId]))
  const picks = new Map<string, TeamPick>()
  for (const game of team.schedule) {
    if (game.result === "CANCELED") continue
    const known = games.get(game.id)
    if (known) {
      if (known.canceled) continue
      picks.set(game.id, {
        gameKey: game.id,
        side: known.a.teamId === team.id ? "a" : "b",
        lockAt: known.lockAt,
        winner: known.result?.winner ?? null,
        takesPicks: true,
      })
      continue
    }
    const opponent = sources.get(game.opponentId)
    if (opponent === undefined) continue
    const teamIsA = team.sourceId < opponent
    picks.set(game.id, {
      gameKey: game.id,
      side: teamIsA ? "a" : "b",
      lockAt: lockAt(game.date, OHIO_TIME_ZONE),
      winner: pickResult(game, teamIsA)?.winner ?? null,
      takesPicks: false,
    })
  }
  return picks
}

/** Gives each game of the schedule its pick. The key of a game is the id of the game. */
export function addTeamPicks<T extends { id: string }>(
  schedule: readonly T[],
  picks: ReadonlyMap<string, TeamPick>,
): PickedGame<T>[] {
  return schedule.map((game) => ({ ...game, pick: picks.get(game.id) ?? null }))
}
