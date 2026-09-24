import type { Team, TeamRecord } from "@/types/api"

export function formatRecord(record: TeamRecord) {
  return record.ties > 0
    ? `${record.wins}–${record.losses}–${record.ties}`
    : `${record.wins}–${record.losses}`
}

/** The city, region, and division of a school, joined for one line of text. */
export function teamMeta(team: Team) {
  return [team.city, team.region ? `Region ${team.region}` : null, formatDivision(team.division)]
    .filter(Boolean)
    .join(" · ")
}

export function formatDivision(division: number | null) {
  return division ? `D-${toRoman(division)}` : "Independent"
}

function toRoman(value: number) {
  const numerals = ["", "I", "II", "III", "IV", "V", "VI", "VII"]
  return numerals[value] ?? value.toString()
}

/** The newest rating date across a set of teams. Returns null when none of them are rated. */
export function lastUpdated(teams: Team[]) {
  const dates = teams.flatMap((team) => team.rating?.asOf ?? [])
  return dates.length > 0 ? dates.reduce((latest, date) => (date > latest ? date : latest)) : null
}
