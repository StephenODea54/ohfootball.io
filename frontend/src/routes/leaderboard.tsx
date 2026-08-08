import { createFileRoute } from '@tanstack/react-router'
import { LeaderboardPage } from '@/app/leaderboard-page'
import { fetchTeams } from '@/lib/graphql'

export const Route = createFileRoute('/leaderboard')({
  head: () => ({
    meta: [
      { title: 'Leaderboard — ohfootball.io' },
      {
        name: 'description',
        content: 'Ohio high school football teams ranked by rating, filtered by region or division.',
      },
    ],
  }),
  loaderDeps: ({ search }) => ({ season: search.season }),
  loader: ({ deps }) => fetchTeams({ season: deps.season }),
  component: LeaderboardRoute,
})

function LeaderboardRoute() {
  const teams = Route.useLoaderData()
  const { season } = Route.useSearch()

  return <LeaderboardPage teams={teams} season={season} />
}
