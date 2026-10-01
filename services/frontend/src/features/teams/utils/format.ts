import type { TeamRecord, TeamSummary } from "@/types/api"

export function formatRecord(record: TeamRecord) {
  return record.ties > 0
    ? `${record.wins}–${record.losses}–${record.ties}`
    : `${record.wins}–${record.losses}`
}

export function formatRank(rank: number) {
  return `#${rank}`
}

/** The city, region, and division of a school, joined for one line of text. */
export function teamMeta(team: TeamSummary) {
  return [team.city, team.region ? `Region ${team.region}` : null, formatDivision(team.division)]
    .filter(Boolean)
    .join(" · ")
}

/** The line above a leaderboard narrowed to one county. The ranks stay those of the state. */
export function countySummary(count: number, county: string) {
  const schools = count === 1 ? "1 rated school" : `${count} rated schools`
  return `${schools} in ${county} County. Ranks are for the whole state.`
}

export function formatDivision(division: number | null) {
  return division ? `D-${toRoman(division)}` : "Independent"
}

function toRoman(value: number) {
  const numerals = ["", "I", "II", "III", "IV", "V", "VI", "VII"]
  return numerals[value] ?? value.toString()
}

/**
 * A rating with its sign, rounded to a whole point. The median team is 0, so a sign shows at once
 * which side of the median a team is on. The minus sign is the typographic one.
 */
export function formatRating(value: number) {
  const points = Math.round(value)
  if (points === 0) return "0"
  return points > 0 ? `+${points}` : `\u2212${Math.abs(points)}`
}

/** The expected margin of a game, as "W by 4", "L by 4", or "Even" when it rounds to 0. */
export function formatMargin(margin: number) {
  const points = Math.round(Math.abs(margin))
  if (points === 0) return "Even"
  return margin > 0 ? `W by ${points}` : `L by ${points}`
}

/** The color of a predicted margin: a win, a loss, or an even game that rounds to 0. */
export function marginIntent(margin: number): "success" | "danger" | "secondary" {
  if (Math.round(Math.abs(margin)) === 0) return "secondary"
  return margin > 0 ? "success" : "danger"
}

/** The text color of a rating: above the median team, below it, or at it. */
export function ratingTone(value: number) {
  const points = Math.round(value)
  if (points === 0) return "text-fg"
  return points > 0 ? "text-success-subtle-fg" : "text-danger-subtle-fg"
}

/**
 * A win probability as a whole percent from 1 to 99. The model never gives a sure result, so a
 * forecast of 99.6% shows as 99% rather than 100%.
 */
export function winPercent(probability: number) {
  return Math.min(99, Math.max(1, Math.round(probability * 100)))
}

/** The newest rating date across a set of teams. Returns null when none of them are rated. */
export function lastUpdated(teams: TeamSummary[]) {
  const dates = teams.flatMap((team) => team.rating?.asOf ?? [])
  return dates.length > 0 ? dates.reduce((latest, date) => (date > latest ? date : latest)) : null
}
