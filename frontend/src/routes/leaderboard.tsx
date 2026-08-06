import { createFileRoute } from '@tanstack/react-router'
import { LeaderboardPage } from '@/app/leaderboard-page'
import { fetchTeams } from '@/lib/graphql'

export const Route = createFileRoute('/leaderboard')({
  loader: fetchTeams,
  component: LeaderboardRoute,
})

function LeaderboardRoute() {
  const teams = Route.useLoaderData()
  return <LeaderboardPage teams={teams} />
}
