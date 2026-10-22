import type { PlayoffMapGame, PlayoffMapRegion } from "@/features/playoff-map/types"

/**
 * The owner of each cell after a round. Each team starts with its own cell. In each game up to the
 * round, in the order of the days, the winner takes every cell of the loser, with the cells that
 * the loser took before. A game that moves to a later week can share a round with the next game
 * of its winner, so the day decides the order. Round 0 is the map of the seeds.
 */
export function ownersAt(
  cellIds: readonly string[],
  games: readonly PlayoffMapGame[],
  round: number,
): Map<string, string> {
  const owners = new Map(cellIds.map((id) => [id, id]))
  const played = games
    .filter((game) => game.round <= round && game.winnerId !== null)
    .sort((first, second) => first.round - second.round || first.date.localeCompare(second.date))
  for (const game of played) {
    for (const [cell, owner] of owners) {
      if (owner === game.loserId) owners.set(cell, game.winnerId as string)
    }
  }
  return owners
}

/** How a team of a region stands after a round. */
export interface Standing {
  teamId: string
  /** The share of the land of the region that the team holds, from 0 to 1. */
  share: number
  /** The round that the team lost in and the team that beat it, or null for a team still in. */
  out: { round: number; byId: string } | null
}

/** How each team of a region stands after a round, in the order of the seeds. */
export function standings(region: PlayoffMapRegion, round: number): Standing[] {
  const owners = ownersAt(
    region.cells.map((cell) => cell.id),
    region.games,
    round,
  )
  const land = new Map<string, number>()
  let total = 0
  for (const cell of region.cells) {
    const owner = owners.get(cell.id) as string
    land.set(owner, (land.get(owner) ?? 0) + cell.land)
    total += cell.land
  }
  return region.teams.map((team) => {
    const loss = region.games.find(
      (game) => game.round <= round && game.loserId === team.id && game.winnerId !== null,
    )
    return {
      teamId: team.id,
      share: total > 0 ? (land.get(team.id) ?? 0) / total : 0,
      out: loss ? { round: loss.round, byId: loss.winnerId as string } : null,
    }
  })
}

/** The last round with a result in any region, or 0 when no playoff game has a result. */
export function latestRound(regions: readonly PlayoffMapRegion[]) {
  return Math.max(
    0,
    ...regions.flatMap((region) =>
      region.games.filter((game) => game.winnerId !== null).map((game) => game.round),
    ),
  )
}
