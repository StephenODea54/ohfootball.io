import type { TeamSummary } from "@/types/api"

/** A rated school for tests. The overrides replace any of its fields. */
export function teamSummary(overrides: Partial<TeamSummary> = {}): TeamSummary {
  return {
    id: "canfield",
    season: 2026,
    sourceId: "248",
    name: "Canfield",
    mascot: "Cardinals",
    city: "Canfield",
    county: "Mahoning",
    division: 3,
    region: 9,
    primaryColor: null,
    secondaryColor: null,
    record: { wins: 2, losses: 4, ties: 0 },
    outOfStateGamesPlayed: 0,
    rating: { season: 2026, value: 3.6, rank: 149, previousRank: null, asOf: "2026-09-27" },
    ...overrides,
  }
}
