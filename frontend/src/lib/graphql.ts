import { env } from "@/env"

export interface TeamRecord {
  wins: number
  losses: number
  ties: number
}

export interface EloRating {
  rating: number
  rank: number
  asOf: string
}

export type GameResult = "WIN" | "LOSS" | "TIE" | "CANCELED" | "UNKNOWN"
export type GameLocation = "HOME" | "AWAY" | "NEUTRAL"

export interface GamePrediction {
  winProbability: number
  predictedResult: GameResult
  teamRating: number
  opponentRating: number
  asOf: string
}

export interface Game {
  id: string
  week: number
  date: string
  opponentId: string
  opponentName: string
  location: GameLocation
  result: GameResult
  teamScore: number | null
  opponentScore: number | null
  playoff: boolean
  notes: string | null
  prediction: GamePrediction | null
}

export interface Team {
  id: string
  season: number
  name: string
  mascot: string | null
  city: string | null
  division: number | null
  region: number | null
  record: TeamRecord
  elo: EloRating | null
  eloHistory: EloRating[]
  schedule: Game[]
}

interface GraphQLResponse<T> {
  data?: T
  errors?: Array<{ message: string }>
}

const teamFields = `
  id
  season
  name
  mascot
  city
  division
  region
  record { wins losses ties }
  elo { rating rank asOf }
`

export interface FetchTeamsOptions {
  season?: number
  search?: string
  region?: number
  division?: number
}

export async function fetchTeams(options: FetchTeamsOptions = {}): Promise<Team[]> {
  const data = await graphql<{ teams: Team[] }>(`
    query Teams($season: Int, $search: String, $region: Int, $division: Int) {
      teams(
        season: $season
        search: $search
        region: $region
        division: $division
        sort: ELO
        limit: 1000
      ) {
        ${teamFields}
      }
    }
  `, options)
  return data.teams.map((team) => ({ ...team, eloHistory: [], schedule: [] }))
}

export async function fetchTeam(id: string): Promise<Team> {
  const data = await graphql<{ team: Team | null }>(
    `
      query Team($id: ID!) {
        team(id: $id) {
          ${teamFields}
          eloHistory { rating rank asOf }
          schedule {
            id
            week
            date
            opponentId
            opponentName
            location
            result
            teamScore
            opponentScore
            playoff
            notes
            prediction {
              winProbability
              predictedResult
              teamRating
              opponentRating
              asOf
            }
          }
        }
      }
    `,
    { id },
  )
  if (!data.team) throw new Error("Team not found")
  return data.team
}

async function graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const response = await fetch(env.VITE_GRAPHQL_URL ?? "http://localhost:8082/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  })
  if (!response.ok) throw new Error(`GraphQL request failed with status ${response.status}`)

  const payload = (await response.json()) as GraphQLResponse<T>
  if (payload.errors?.length) throw new Error(payload.errors.map((error) => error.message).join("; "))
  if (!payload.data) throw new Error("GraphQL response did not include data")
  return payload.data
}

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
