import { createFileRoute } from '@tanstack/react-router'
import { HomePage } from '@/app/home-page'
import { fetchTeams } from '@/lib/graphql'

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: 'ohfootball.io — Ohio high school football, predicted' },
      {
        name: 'description',
        content: 'Search any Ohio high school football program to see its rating and schedule.',
      },
    ],
  }),
  loaderDeps: ({ search }) => ({ season: search.season }),
  loader: ({ deps }) => fetchTeams({ season: deps.season }),
  component: Home,
})

function Home() {
  const teams = Route.useLoaderData()
  const { season } = Route.useSearch()
  const navigate = Route.useNavigate()

  return (
    <HomePage
      onSelectTeam={(teamId) =>
        navigate({ to: '/teams/$teamId', params: { teamId }, search: { season } })
      }
      season={season}
      teams={teams}
    />
  )
}
