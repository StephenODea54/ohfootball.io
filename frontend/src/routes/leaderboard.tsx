import { createFileRoute } from '@tanstack/react-router'
import { LeaderboardPage } from '@/app/leaderboard-page'
import { fetchTeams } from '@/lib/graphql'
import { validateSeasonSearch } from '@/lib/season'

export const Route = createFileRoute('/leaderboard')({
  validateSearch: validateSeasonSearch,
  loaderDeps: ({ search }) => ({ season: search.season }),
  loader: ({ deps }) => fetchTeams({ season: deps.season }),
  component: LeaderboardRoute,
})

function LeaderboardRoute() {
  const teams = Route.useLoaderData()
  const { season } = Route.useSearch()
  const navigate = Route.useNavigate()

  return (
    <LeaderboardPage
      teams={teams}
      season={season}
      onSeasonChange={(nextSeason) => navigate({ search: { season: nextSeason } })}
    />
  )
}
