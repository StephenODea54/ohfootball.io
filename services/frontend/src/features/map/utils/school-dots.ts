import type { MapTeam } from "@/features/map/api/get-map-teams"
import { type MercatorFit, project } from "@/features/map/utils/projection"

type LocatedTeam = MapTeam & { coordinates: NonNullable<MapTeam["coordinates"]> }

/** One school as a dot on the map, in map units. */
export interface Dot {
  id: string
  x: number
  y: number
  radius: number
  opacity: number
  /** A few dots twinkle. The delay spreads them out so they do not blink together. */
  twinkleDelay: number | null
}

/** One dot in this many twinkles. */
const TWINKLE_EVERY = 6

/**
 * Makes a dot of every school with a location. A better rank makes a bigger and brighter dot. A
 * school with no rating is a faint dot. The best rated schools are drawn last, so they sit on top.
 */
export function schoolDots(teams: MapTeam[], fit: MercatorFit): Dot[] {
  const located = teams.filter((team): team is LocatedTeam => team.coordinates !== null)
  const ranked = located.filter((team) => team.rating !== null).length

  return located
    .map((team, index) => {
      const { x, y } = project(fit, team.coordinates.longitude, team.coordinates.latitude)
      // 1 for the best school, near 0 for the last rated school, and 0 for a school with no rating.
      // A rank counts the whole state, so a school with no location can push a rank past the
      // number of dots. The clamp keeps the standing at 0 or more.
      const standing = team.rating
        ? Math.max(0, 1 - (team.rating.rank - 1) / Math.max(1, ranked))
        : 0
      return {
        // The page writes each number into the markup, so short numbers keep it small.
        id: team.id,
        x: round(x, 1),
        y: round(y, 1),
        radius: round(2.4 + 5 * standing ** 3, 1),
        opacity: round(team.rating ? 0.5 + 0.5 * standing : 0.35, 2),
        twinkleDelay: index % TWINKLE_EVERY === 0 ? (index * 733) % 3500 : null,
        standing,
      }
    })
    .sort((first, second) => first.standing - second.standing)
    .map(({ standing: _standing, ...dot }) => dot)
}

function round(value: number, digits: number) {
  const scale = 10 ** digits
  return Math.round(value * scale) / scale
}

/** The number of programs, rounded down to a round number for a headline, such as "700+". */
export function programCount(count: number) {
  return count >= 100 ? `${Math.floor(count / 50) * 50}+` : String(count)
}
