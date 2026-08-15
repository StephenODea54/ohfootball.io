import { createFileRoute } from '@tanstack/react-router'
import { Container } from '@/components/ui/container'
import { Heading } from '@/components/ui/heading'
import { Text } from '@/components/ui/text'
import { getTeamsQueryOptions } from '@/features/teams/api/get-teams'
import { LastUpdatedStamp } from '@/features/teams/components/last-updated-stamp'
import { TeamBrowser } from '@/features/teams/components/team-browser'
import { TeamSearch } from '@/features/teams/components/team-search'
import { lastUpdated } from '@/features/teams/utils/format'

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
    context.queryClient.ensureQueryData(getTeamsQueryOptions({ season: deps.season })),
  component: Home,
})

function Home() {
  const teams = Route.useLoaderData()
  const { season } = Route.useSearch()
  const navigate = Route.useNavigate()

  const selectTeam = (teamId: string) =>
    navigate({ to: '/teams/$teamId', params: { teamId }, search: { season } })

  return (
    <main>
      <Container className="max-w-5xl py-16 sm:py-20 lg:py-24">
        <Heading className="text-5xl/none sm:text-6xl/none">
          ohfootball<span className="text-primary">.io</span>
        </Heading>
        <Text className="mt-4 text-base/7 sm:text-lg/8">
          See how good your school's football team is.
        </Text>

        <div className="mt-8 max-w-2xl">
          <TeamSearch onSelectTeam={selectTeam} teams={teams} />
        </div>

        <TeamBrowser
          className="mt-12"
          onSelectTeam={selectTeam}
          season={season}
          teams={teams}
        />
      </Container>

      <LastUpdatedStamp isoDate={lastUpdated(teams)} />
    </main>
  )
}
