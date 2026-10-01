import type { ProgramHistory, ProgramOption } from "@/features/compare/types"
import { seasonEndPoints } from "@/features/compare/utils/season-points"
import type { Program, TeamSummary } from "@/types/api"

/** A source id that is safe in an address and in a file name. */
const SAFE_SOURCE_ID = /^[0-9]{1,20}$/

/** True for a source id that is safe in an address and in a file name. */
export function isSafeSourceId(sourceId: string): boolean {
  return SAFE_SOURCE_ID.test(sourceId)
}

/** The fields of a program for a picker, from the team of the current season. */
export function toProgramOption(team: TeamSummary): ProgramOption {
  return { sourceId: team.sourceId, name: team.name }
}

/** A rating rounded to a tenth of a point. The site shows whole points, so this keeps files small. */
function tenth(value: number) {
  return Math.round(value * 10) / 10
}

/**
 * The history file of a program. The name and the page come from the team of the current season.
 * The seasons and the games come from the program.
 */
export function toProgramHistory(team: TeamSummary, program: Program): ProgramHistory {
  return {
    sourceId: team.sourceId,
    name: team.name,
    teamId: team.id,
    seasons: seasonEndPoints(program.ratingHistory).map((point) => ({
      ...point,
      rating: tenth(point.rating),
    })),
    games: program.games,
  }
}

/** The source ids that the build already warned about, so each warning shows one time. */
const warned = new Set<string>()

/**
 * The teams whose source id is safe in an address and in a file name. Only these get a history
 * file and a place in a picker. The build writes one warning for each other team.
 */
export function safePrograms<T extends Pick<TeamSummary, "sourceId" | "name">>(
  teams: readonly T[],
  warn: (message: string) => void = console.warn,
): T[] {
  return teams.filter((team) => {
    const safe = isSafeSourceId(team.sourceId)
    if (!safe && !warned.has(team.sourceId)) {
      warned.add(team.sourceId)
      warn(`${team.name} has the source id "${team.sourceId}", so it has no history file`)
    }
    return safe
  })
}
