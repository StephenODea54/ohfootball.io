import type { ProgramHistory } from "@/features/compare/types"
import type { GameResult, ProgramGame, TeamRecord } from "@/types/api"
import { formatDate } from "@/utils/format"

/** A result that counts in a record. */
type Decided = "WIN" | "LOSS" | "TIE"

/** One game between the two programs, from the side of the first. */
export interface Meeting {
  /** A key that is unique in one series. */
  id: string
  season: number
  date: string
  teamScore: number
  opponentScore: number
  result: Decided
  playoff: boolean
}

/** The record of two programs against each other, from the side of the first. */
export interface HeadToHead {
  record: TeamRecord
  first: Meeting | null
  last: Meeting | null
  /** The run of the same result at the end, for example 3 wins in a row for the first program. */
  streak: { result: Decided; length: number } | null
  /** Newest first. */
  meetings: Meeting[]
}

function isDecided(result: GameResult): result is Decided {
  return result === "WIN" || result === "LOSS" || result === "TIE"
}

function count(meetings: readonly Meeting[]): TeamRecord {
  return {
    wins: meetings.filter((meeting) => meeting.result === "WIN").length,
    losses: meetings.filter((meeting) => meeting.result === "LOSS").length,
    ties: meetings.filter((meeting) => meeting.result === "TIE").length,
  }
}

/** The games of program a against the program with the source id of the opponent. */
export function headToHead(a: Pick<ProgramHistory, "games">, opponentSourceId: string): HeadToHead {
  const oldestFirst: Meeting[] = a.games
    .filter(
      (game): game is ProgramGame & { result: Decided } =>
        game.opponentSourceId === opponentSourceId && isDecided(game.result),
    )
    .sort((first, second) => first.date.localeCompare(second.date))
    .map((game, index) => ({
      id: `${game.date}-${index}`,
      season: game.season,
      date: game.date,
      teamScore: game.teamScore,
      opponentScore: game.opponentScore,
      result: game.result,
      playoff: game.playoff,
    }))
  const meetings = [...oldestFirst].reverse()

  const newest = meetings[0]
  let streak: HeadToHead["streak"] = null
  if (newest) {
    const end = meetings.findIndex((meeting) => meeting.result !== newest.result)
    streak = { result: newest.result, length: end === -1 ? meetings.length : end }
  }

  return {
    record: count(meetings),
    first: oldestFirst[0] ?? null,
    last: newest ?? null,
    streak,
    meetings,
  }
}

/**
 * The series in words, with the wins of the leader first, for example "Massillon Washington leads
 * 35–24–1". Null when the programs never met.
 */
export function seriesSummary(nameA: string, nameB: string, record: TeamRecord): string | null {
  const { wins, losses, ties } = record
  if (wins + losses + ties === 0) return null
  const tail = ties > 0 ? `–${ties}` : ""
  if (wins === losses) return `Series tied ${wins}–${losses}${tail}`
  return wins > losses
    ? `${nameA} leads ${wins}–${losses}${tail}`
    : `${nameB} leads ${losses}–${wins}${tail}`
}

/**
 * A meeting in words, with the winner and the winner's score first, for example
 * "Oct 18, 2025: Massillon Washington won 28–21".
 */
export function meetingLabel(meeting: Meeting, nameA: string, nameB: string) {
  const high = Math.max(meeting.teamScore, meeting.opponentScore)
  const low = Math.min(meeting.teamScore, meeting.opponentScore)
  const outcome = meeting.result === "TIE" ? "tie" : `${meetingWinner(meeting, nameA, nameB)} won`
  return `${formatDate(meeting.date)}: ${outcome} ${high}–${low}`
}

/** The winner of a meeting, or "Tie". */
export function meetingWinner(meeting: Meeting, nameA: string, nameB: string) {
  if (meeting.result === "TIE") return "Tie"
  return meeting.result === "WIN" ? nameA : nameB
}

/** The run of one result at the end of the series, in words. */
export function streakLabel(
  streak: NonNullable<HeadToHead["streak"]>,
  nameA: string,
  nameB: string,
) {
  const games = streak.length === 1 ? "the last meeting" : `the last ${streak.length} meetings`
  if (streak.result === "TIE")
    return streak.length === 1 ? "The last meeting was a tie" : `Tied ${games}`
  return `${streak.result === "WIN" ? nameA : nameB} won ${games}`
}
