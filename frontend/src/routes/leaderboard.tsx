import { createFileRoute } from '@tanstack/react-router'
import { LeaderboardPage } from '@/app/leaderboard-page'
import { teamsQuery } from '@/lib/queries'

export const Route = createFileRoute('/leaderboard')({
  head: () => ({
    meta: [
      { title: 'Leaderboard — ohfootball.io' },
      {
        name: 'description',
        content: 'Ohio high school football schools listed by rating.',
      },
    ],
  }),
  loaderDeps: ({ search }) => ({ season: search.season }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(teamsQuery({ season: deps.season })),
  component: LeaderboardRoute,
})

function LeaderboardRoute() {
  const teams = Route.useLoaderData()
  const { season } = Route.useSearch()

  return <LeaderboardPage teams={teams} season={season} />
}
