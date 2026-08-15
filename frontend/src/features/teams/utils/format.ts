import type { Team, TeamRecord } from "@/types/api"

export function formatRecord(record: TeamRecord) {
  return record.ties > 0
    ? `${record.wins}–${record.losses}–${record.ties}`
    : `${record.wins}–${record.losses}`
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
