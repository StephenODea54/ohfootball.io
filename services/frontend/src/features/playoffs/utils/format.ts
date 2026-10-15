import type { PlayoffGame } from "@/features/playoffs/types"
import type { TeamRecord } from "@/types/api"

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII"]

/**
 * A chance as a whole percent. The runs are a sample, so a chance of 0 or 1 in the runs is shown
 * as below 1% or above 99%, and never as impossible or certain.
 */
export function formatOdds(probability: number | null): string {
  if (probability === null) return "–"
  if (probability >= 0.995) return ">99%"
  if (probability < 0.005) return "<1%"
  return `${Math.round(probability * 100)}%`
}

export function formatAverage(average: number): string {
  return average.toFixed(2)
}

/** Points of a level, which come in halves and quarters, without trailing zeros. */
export function formatPoints(points: number): string {
  return String(Number(points.toFixed(2)))
}

export function divisionLabel(division: number): string {
  return `Division ${ROMAN[division] ?? division}`
}

export function regionLabel(region: number): string {
  return `Region ${region}`
}

export function formatRecord(record: TeamRecord): string {
  return record.ties > 0
    ? `${record.wins}-${record.losses}-${record.ties}`
    : `${record.wins}-${record.losses}`
}

/** The opponent of a game from the side of the team, such as "vs Mentor" or "at Lorain". */
export function opponentLabel(game: Pick<PlayoffGame, "location" | "opponentName">): string {
  if (game.location === "AWAY") return `at ${game.opponentName}`
  if (game.location === "NEUTRAL") return `vs ${game.opponentName} (neutral)`
  return `vs ${game.opponentName}`
}

/** A date of the API, such as 2026-10-02, as Oct 2. */
export function formatGameDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}
