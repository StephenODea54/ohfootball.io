import type { PlayoffProjection } from "@/features/playoffs/types"

/** The number of teams of a region in the playoffs, from 2025. */
export const QUALIFIERS = 12

/** The seeds that skip the first round. */
export const BYES = 4

/**
 * The teams from the top of the projection that the bracket can take into the field. The map
 * loads the schedules of this many teams of each region.
 */
export const CANDIDATES = QUALIFIERS + 6

/** The weight that each better seed adds to the weight of the seed below it. */
export const SEED_WEIGHT_STEP = 0.1

/**
 * The weight of a seed on the map. Seed 12 has 1.0 and each better seed has 0.1 more, so seed 1
 * has 2.1. A school takes the land where its distance divided by its weight is the smallest, so a
 * better seed reaches farther.
 */
export function seedWeight(seed: number) {
  return 1 + (QUALIFIERS - Math.min(Math.max(seed, 1), QUALIFIERS)) * SEED_WEIGHT_STEP
}

/**
 * Tells if the regular season was over at the date of the projection. Then the projection holds
 * the final points of each team, so its order is the order of the seeds. A game with a date
 * before the projection that has no result, such as a game that was never played, does not keep
 * the map closed. An old projection from before the last week keeps the map closed, so a failed
 * projection on the day of the build cannot publish the seeds of an earlier week.
 */
export function seedsAreSet(projection: PlayoffProjection) {
  return projection.regions.every((region) =>
    region.teams.every((team) => team.remainingGames.every((game) => game.date < projection.asOf)),
  )
}

/** A first-round game of a region. The home team is null when no team is at home. */
export interface FirstRoundGame {
  teamIds: [string, string]
  homeId: string | null
}

/**
 * The 12 playoff teams of a region, best seed first.
 *
 * The projection gives the order of the region. When the first round shows 4 games of 8 teams
 * from the top of that order, the bracket sets the seeds: the 4 best teams outside those games
 * get a bye, the home teams are seeds 5 to 8 in the order of the projection, and each away team
 * gets the seed that its host plays (17 minus the seed of the host). A first round with any
 * other shape is not used, and the first 12 teams of the projection are the seeds.
 */
export function regionSeeds(
  projected: readonly string[],
  firstRound: readonly FirstRoundGame[],
): string[] {
  const top = projected.slice(0, CANDIDATES)
  const place = new Map(top.map((id, index) => [id, index]))
  const playing = new Set(firstRound.flatMap((game) => game.teamIds))
  const usable =
    firstRound.length === (QUALIFIERS - BYES) / 2 &&
    playing.size === QUALIFIERS - BYES &&
    [...playing].every((id) => place.has(id))
  if (!usable) return projected.slice(0, QUALIFIERS)

  const byes = top.filter((id) => !playing.has(id)).slice(0, BYES)
  const pairs = firstRound
    .map((game) => {
      const [a, b] = game.teamIds
      // A game with no home team puts the better team of the projection at home.
      const home =
        game.homeId === a || game.homeId === b
          ? game.homeId
          : (place.get(a) as number) < (place.get(b) as number)
            ? a
            : b
      return { home, away: home === a ? b : a }
    })
    .sort((first, second) => (place.get(first.home) as number) - (place.get(second.home) as number))
  const seeds = [...byes, ...pairs.map((pair) => pair.home)]
  for (let index = pairs.length - 1; index >= 0; index--) seeds.push(pairs[index].away)
  return seeds
}
