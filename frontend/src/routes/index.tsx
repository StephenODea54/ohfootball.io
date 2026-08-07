import { createFileRoute } from '@tanstack/react-router'
import { TeamsPage } from '@/app/teams-page'
import { fetchTeams } from '@/lib/graphql'
import { validateSeasonSearch } from '@/lib/season'

export const Route = createFileRoute('/')({
  validateSearch: validateSeasonSearch,
  loaderDeps: ({ search }) => ({ season: search.season }),
  loader: ({ deps }) => fetchTeams({ season: deps.season }),
  component: Home,
})

function Home() {
  const teams = Route.useLoaderData()
  const { season } = Route.useSearch()
  const navigate = Route.useNavigate()

  return (
    <TeamsPage
      teams={teams}
      season={season}
      onSeasonChange={(nextSeason) => navigate({ search: { season: nextSeason } })}
    />
  )
}
