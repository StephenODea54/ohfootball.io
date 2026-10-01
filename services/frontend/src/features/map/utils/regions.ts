import type { MapTeam } from "@/features/map/api/get-map-teams"
import { teamColor } from "@/features/map/utils/team-color"

/** A part of the state, made of whole counties. */
export interface Region {
  key: RegionKey
  label: string
  counties: readonly string[]
}

export type RegionKey = "nw" | "ne" | "central" | "sw" | "se"

/**
 * Five parts of Ohio, each a group of whole counties. They follow the common names of the parts
 * of the state. They are not OHSAA regions, which change with each division.
 */
export const REGIONS: readonly Region[] = [
  {
    key: "nw",
    label: "NW Ohio",
    counties: [
      "Allen",
      "Auglaize",
      "Defiance",
      "Erie",
      "Fulton",
      "Hancock",
      "Hardin",
      "Henry",
      "Huron",
      "Lucas",
      "Mercer",
      "Ottawa",
      "Paulding",
      "Putnam",
      "Sandusky",
      "Seneca",
      "Van Wert",
      "Williams",
      "Wood",
      "Wyandot",
    ],
  },
  {
    key: "ne",
    label: "NE Ohio",
    counties: [
      "Ashland",
      "Ashtabula",
      "Carroll",
      "Columbiana",
      "Cuyahoga",
      "Geauga",
      "Holmes",
      "Lake",
      "Lorain",
      "Mahoning",
      "Medina",
      "Portage",
      "Richland",
      "Stark",
      "Summit",
      "Trumbull",
      "Tuscarawas",
      "Wayne",
    ],
  },
  {
    key: "central",
    label: "Central Ohio",
    counties: [
      "Crawford",
      "Delaware",
      "Fairfield",
      "Fayette",
      "Franklin",
      "Knox",
      "Licking",
      "Logan",
      "Madison",
      "Marion",
      "Morrow",
      "Pickaway",
      "Union",
    ],
  },
  {
    key: "sw",
    label: "SW Ohio",
    counties: [
      "Brown",
      "Butler",
      "Champaign",
      "Clark",
      "Clermont",
      "Clinton",
      "Darke",
      "Greene",
      "Hamilton",
      "Highland",
      "Miami",
      "Montgomery",
      "Preble",
      "Shelby",
      "Warren",
    ],
  },
  {
    key: "se",
    label: "SE Ohio",
    counties: [
      "Adams",
      "Athens",
      "Belmont",
      "Coshocton",
      "Gallia",
      "Guernsey",
      "Harrison",
      "Hocking",
      "Jackson",
      "Jefferson",
      "Lawrence",
      "Meigs",
      "Monroe",
      "Morgan",
      "Muskingum",
      "Noble",
      "Perry",
      "Pike",
      "Ross",
      "Scioto",
      "Vinton",
      "Washington",
    ],
  },
]

const REGION_OF_COUNTY = new Map(
  REGIONS.flatMap((region) => region.counties.map((county) => [county, region.key] as const)),
)

/** The region of a county, or null for a county that is not in Ohio or not known. */
export function regionOfCounty(county: string | null): RegionKey | null {
  return county === null ? null : (REGION_OF_COUNTY.get(county) ?? null)
}

type RankedTeam = MapTeam & { rating: NonNullable<MapTeam["rating"]> }

/** The best rated school of a region. */
export interface RegionKing {
  region: Region
  king: RankedTeam | null
  /**
   * The color of the region: a team color of its king that shows on both a dark and a white page.
   * Null when the region has no king or no such color, so the region is gray.
   */
  color: string | null
}

/** Finds the best rated school of each region, in the order of REGIONS. */
export function regionKings(teams: MapTeam[]): RegionKing[] {
  return REGIONS.map((region) => {
    const members = teams.filter((team) => regionOfCounty(team.county) === region.key)
    const king =
      members
        .filter((team): team is RankedTeam => team.rating !== null)
        .sort((first, second) => first.rating.rank - second.rating.rank)[0] ?? null
    const color = king ? teamColor(king.primaryColor, king.secondaryColor) : null
    return { region, king, color }
  })
}
