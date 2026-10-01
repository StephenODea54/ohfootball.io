import type { Team, TeamRecord } from "@/types/api"

/**
 * The number of games with a result that a season needs before it counts as a best or worst
 * season, a top 10 finish, or a rank of a decade. The number leaves out club teams, teams that
 * stopped play in a season, and teams with only one or two games of record.
 */
export const MIN_GAMES = 5

/** The note next to the title of each card that counts only the seasons with MIN_GAMES games. */
export const COUNTED_SEASONS_NOTE = `Only includes seasons with at least ${MIN_GAMES} games with a result.`

/** A season as the components draw it. Small, because the page embeds every row. */
export interface SeasonRow {
  season: number
  record: TeamRecord
  playoffRecord: TeamRecord
  /** The relative rating at the end of the season, to one decimal. Null when not rated. */
  rating: number | null
  /** The rank at the end of the season. Null when not rated. */
  rank: number | null
  /** True for the season in progress. */
  inProgress: boolean
}

/** A season that has a rank and enough games to compare with the other seasons. */
export type QualifyingRow = SeasonRow & { rank: number; rating: number }

/** One decade of a program. It holds only the complete seasons. */
export interface DecadeRow {
  /** The label of the decade, for example "1970s". */
  id: string
  seasons: number
  record: TeamRecord
  playoffAppearances: number
  medianRank: number | null
  bestRank: number | null
}

/**
 * The rows of the program history of a team, oldest first, as the API gives them. A season after
 * the season of the page is dropped, so it never counts as a complete season.
 */
export function toSeasonRows(team: Pick<Team, "season" | "programHistory">): SeasonRow[] {
  const seasons = team.programHistory.filter((season) => season.season <= team.season)
  return seasons.map((season) => ({
    season: season.season,
    record: season.record,
    playoffRecord: season.playoffRecord,
    rating: season.rating ? Math.round(season.rating.value * 10) / 10 : null,
    rank: season.rating ? season.rating.rank : null,
    inProgress: season.season === team.season,
  }))
}

export function gamesPlayed(record: TeamRecord) {
  return record.wins + record.losses + record.ties
}

/** The number of seasons the table of seasons shows before a button shows all of them. */
export const RECENT_SEASONS = 10

/** The rows the table of seasons shows, newest first: the recent seasons, or all of them. */
export function visibleSeasons(rows: SeasonRow[], showAll: boolean) {
  const newestFirst = [...rows].reverse()
  return showAll ? newestFirst : newestFirst.slice(0, RECENT_SEASONS)
}

/** A complete season with a rank and at least MIN_GAMES games with a result. */
export function qualifies(row: SeasonRow): row is QualifyingRow {
  return (
    !row.inProgress &&
    row.rank !== null &&
    row.rating !== null &&
    gamesPlayed(row.record) >= MIN_GAMES
  )
}

/** The qualifying season with the lowest rank. A tie goes to the higher rating, then the later season. */
export function bestSeason(rows: SeasonRow[]): QualifyingRow | null {
  return pick(rows, (a, b) => a.rank - b.rank || b.rating - a.rating || b.season - a.season)
}

/** The qualifying season with the highest rank. A tie goes to the lower rating, then the later season. */
export function worstSeason(rows: SeasonRow[]): QualifyingRow | null {
  return pick(rows, (a, b) => b.rank - a.rank || a.rating - b.rating || b.season - a.season)
}

/** The first qualifying row in the order of compare, or null when no row qualifies. */
function pick(
  rows: SeasonRow[],
  compare: (a: QualifyingRow, b: QualifyingRow) => number,
): QualifyingRow | null {
  return rows.filter(qualifies).sort(compare).at(0) ?? null
}

/** The number of qualifying seasons. */
export function qualifyingSeasons(rows: SeasonRow[]) {
  return rows.filter(qualifies).length
}

/** The number of qualifying seasons that ended with a rank of 10 or better. */
export function topTenFinishes(rows: SeasonRow[]) {
  return rows.filter((row) => qualifies(row) && row.rank <= 10).length
}

/** The number of complete seasons with at least one playoff game with a result. */
export function playoffAppearances(rows: SeasonRow[]) {
  return rows.filter((row) => !row.inProgress && gamesPlayed(row.playoffRecord) > 0).length
}

export function sumRecords(records: TeamRecord[]): TeamRecord {
  return records.reduce(
    (total, record) => ({
      wins: total.wins + record.wins,
      losses: total.losses + record.losses,
      ties: total.ties + record.ties,
    }),
    { wins: 0, losses: 0, ties: 0 },
  )
}

/**
 * The middle rank. With an even count it is the mean of the two middle ranks, rounded half up to a
 * whole rank. Null when there is no rank.
 */
export function medianRank(ranks: number[]): number | null {
  if (ranks.length === 0) return null
  const sorted = [...ranks].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle]
  return Math.round((sorted[middle - 1] + sorted[middle]) / 2)
}

/**
 * One row for each decade with a complete season, newest decade first. A decade that falls in a
 * gap between seasons has no row. The season in progress is left out.
 */
export function decadeRows(rows: SeasonRow[]): DecadeRow[] {
  const decades = new Map<number, SeasonRow[]>()
  for (const row of rows) {
    if (row.inProgress) continue
    const decade = Math.floor(row.season / 10) * 10
    decades.set(decade, [...(decades.get(decade) ?? []), row])
  }
  return [...decades.entries()]
    .sort(([a], [b]) => b - a)
    .map(([decade, seasons]) => {
      const ranks = seasons.filter(qualifies).map((row) => row.rank)
      return {
        id: `${decade}s`,
        seasons: seasons.length,
        record: sumRecords(seasons.map((row) => row.record)),
        playoffAppearances: playoffAppearances(seasons),
        medianRank: medianRank(ranks),
        bestRank: ranks.length > 0 ? Math.min(...ranks) : null,
      }
    })
}
