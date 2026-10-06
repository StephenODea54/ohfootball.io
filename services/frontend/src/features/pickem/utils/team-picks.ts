import type { PickemGamesFile, PickemResult, PickSide } from "@/features/pickem/contract"

/** A game of a team page that takes picks, or took them in the last days. */
export interface TeamPick {
  gameKey: string
  /** The side of the page team in the games file. A pick of this side picks the page team. */
  side: PickSide
  /** The moment picks close, as an ISO time. */
  lockAt: string
  /** The winner from the games file, or null when the game has no result yet. */
  winner: PickemResult["winner"] | null
}

/** A game of the schedule with its pick, or null when the game takes no picks. */
export type PickedGame<T> = T & { pick: TeamPick | null }

/**
 * The games of the file that `teamId` plays, by game key. A canceled game is left out, because it
 * takes no picks and shows no result of the picks.
 */
export function teamPicks(file: PickemGamesFile, teamId: string): Map<string, TeamPick> {
  const picks = new Map<string, TeamPick>()
  for (const game of file.games) {
    if (game.canceled) continue
    const side = game.a.teamId === teamId ? "a" : game.b.teamId === teamId ? "b" : null
    if (!side) continue
    picks.set(game.gameKey, {
      gameKey: game.gameKey,
      side,
      lockAt: game.lockAt,
      winner: game.result?.winner ?? null,
    })
  }
  return picks
}

/** Gives each game of the schedule its pick. The key of a game in the file is the id of the game. */
export function addTeamPicks<T extends { id: string }>(
  schedule: readonly T[],
  picks: ReadonlyMap<string, TeamPick>,
): PickedGame<T>[] {
  return schedule.map((game) => ({ ...game, pick: picks.get(game.id) ?? null }))
}

/** The side that is not `side`. */
export function otherSide(side: PickSide): PickSide {
  return side === "a" ? "b" : "a"
}
