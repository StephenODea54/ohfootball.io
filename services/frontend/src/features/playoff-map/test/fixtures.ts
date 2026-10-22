import type {
  PlayoffMapDivision,
  PlayoffMapRegion,
  PlayoffMapShape,
} from "@/features/playoff-map/types"

/** Two square counties side by side: West for region 1 and East for region 2. */
export const shape: PlayoffMapShape = {
  width: 200,
  height: 100,
  outline: "M0,0L200,0L200,100L0,100Z",
  counties: [
    { name: "West", path: "M0,0L100,0L100,100L0,100Z" },
    { name: "East", path: "M100,0L200,0L200,100L100,100Z" },
  ],
}

function team(id: string, seed: number, x: number) {
  return { id, sourceId: id, name: `School ${id}`, seed, rating: 10 - seed, color: null, x, y: 50 }
}

/** A region of 2 teams in one county, with the land split down the middle. */
function region(
  number: number,
  county: string,
  left: number,
  [a, b]: [string, string],
): PlayoffMapRegion {
  return {
    region: number,
    counties: [county],
    teams: [team(a, 1, left + 25), team(b, 2, left + 75)],
    cells: [
      {
        id: a,
        path: `M${left},0L${left + 50},0L${left + 50},100L${left},100Z`,
        circle: { x: left + 25, y: 50, r: 25 },
        land: 60,
      },
      {
        id: b,
        path: `M${left + 50},0L${left + 100},0L${left + 100},100L${left + 50},100Z`,
        circle: { x: left + 75, y: 50, r: 20 },
        land: 40,
      },
    ],
    games: [],
  }
}

/**
 * A division of 2 regions. In region 1, a beats b in the first round and wins the regional final
 * against no one. Region 2 has no result.
 */
export const division: PlayoffMapDivision = {
  division: 3,
  regions: [
    {
      ...region(1, "West", 0, ["a", "b"]),
      games: [
        { id: "g1", round: 1, date: "2026-10-30", winnerId: "a", loserId: "b" },
        { id: "g4", round: 4, date: "2026-11-20", winnerId: "a", loserId: null },
      ],
    },
    region(2, "East", 100, ["c", "d"]),
  ],
}
