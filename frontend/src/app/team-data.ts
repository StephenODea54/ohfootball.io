export interface Team {
  slug: string
  name: string
  mascot: string
  city: string
  division: string
  record: string
  rating: number
  rank: number
}

export const teams: Team[] = [
  { slug: "st-edward", name: "St. Edward", mascot: "Eagles", city: "Lakewood", division: "D-I", record: "5–1", rating: 1892, rank: 1 },
  { slug: "st-xavier", name: "St. Xavier", mascot: "Bombers", city: "Cincinnati", division: "D-I", record: "3–3", rating: 1874, rank: 2 },
  { slug: "archbishop-moeller", name: "Archbishop Moeller", mascot: "Crusaders", city: "Cincinnati", division: "D-I", record: "6–0", rating: 1851, rank: 3 },
  { slug: "mentor", name: "Mentor", mascot: "Cardinals", city: "Mentor", division: "D-I", record: "3–3", rating: 1823, rank: 4 },
  { slug: "springfield", name: "Springfield", mascot: "Wildcats", city: "Springfield", division: "D-I", record: "1–5", rating: 1815, rank: 5 },
  { slug: "pickerington-central", name: "Pickerington Central", mascot: "Tigers", city: "Pickerington", division: "D-I", record: "3–3", rating: 1798, rank: 6 },
  { slug: "massillon-washington", name: "Massillon Washington", mascot: "Tigers", city: "Massillon", division: "D-II", record: "4–2", rating: 1789, rank: 7 },
  { slug: "avon", name: "Avon", mascot: "Eagles", city: "Avon", division: "D-II", record: "6–0", rating: 1776, rank: 8 },
]

export function getTeam(slug: string) {
  return teams.find((team) => team.slug === slug) ?? teams[0]!
}
