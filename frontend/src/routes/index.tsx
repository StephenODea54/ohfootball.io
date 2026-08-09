import { createFileRoute } from '@tanstack/react-router'
import { HomePage } from '@/app/home-page'
import { teamsQuery } from '@/lib/queries'

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: 'ohfootball.io — Ohio High School Football Ratings' },
      {
        name: 'description',
        content: 'Look up any Ohio high school football team and see how good it is.',
      },
    ],
  }),
  loaderDeps: ({ search }) => ({ season: search.season }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(teamsQuery({ season: deps.season })),
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
