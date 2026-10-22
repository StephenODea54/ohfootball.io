import type { PlayoffMapCell, PlayoffMapRegion, PlayoffMapTeam } from "@/features/playoff-map/types"

/** The divisions of the OHSAA playoffs. */
export const DIVISIONS = [1, 2, 3, 4, 5, 6, 7] as const

/** The name of each step of the map, from the seeds (0) to the regional final (4). */
export const ROUND_NAMES = [
  "Seeds",
  "First round",
  "Second round",
  "Regional semifinals",
  "Regional finals",
] as const

/** The name of a step of the map. */
export function roundName(round: number) {
  return ROUND_NAMES[round] ?? ROUND_NAMES[0]
}

/**
 * A share of the land as a whole percent, such as 41%. A little land shows <1%, and all but a
 * little shows >99%, so 0% and 100% mean none and all.
 */
export function formatShare(share: number) {
  if (share > 0 && share < 0.005) return "<1%"
  if (share < 1 && share > 0.995) return ">99%"
  return `${Math.round(share * 100)}%`
}

/** One cell as the map draws it after a round. */
export interface DrawnCell {
  region: number
  cell: PlayoffMapCell
  /** The team that starts with the cell. Its school marks the cell. */
  school: PlayoffMapTeam
  /** The team that holds the cell after the round. Its color and logo fill the cell. */
  owner: PlayoffMapTeam
  /** True for the cell of the owner with the most room, which shows the logo and the seed. */
  main: boolean
}

/**
 * The cells of the regions with the owner of each after a round. Each owner shows its logo and its
 * seed one time, in the cell that it holds with the largest circle.
 */
export function drawnCells(
  regions: readonly PlayoffMapRegion[],
  owners: ReadonlyMap<string, string>,
): DrawnCell[] {
  const drawn = regions.flatMap((region) => {
    const teams = new Map(region.teams.map((team) => [team.id, team]))
    return region.cells.map((cell) => ({
      region: region.region,
      cell,
      school: teams.get(cell.id) as PlayoffMapTeam,
      owner: teams.get(owners.get(cell.id) ?? cell.id) as PlayoffMapTeam,
      main: false,
    }))
  })
  const largest = new Map<string, DrawnCell>()
  for (const item of drawn) {
    const known = largest.get(item.owner.id)
    if (!known || item.cell.circle.r > known.cell.circle.r) largest.set(item.owner.id, item)
  }
  for (const item of largest.values()) item.main = true
  return drawn
}
