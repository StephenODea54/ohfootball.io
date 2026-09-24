import { createFileRoute } from '@tanstack/react-router'
import { Container } from '@/components/ui/container'
import { Heading } from '@/components/ui/heading'
import { Text } from '@/components/ui/text'
import { useSelectedSeason } from '@/hooks/use-seasons'
import { getTeamsQueryOptions } from '@/features/teams/api/get-teams'
import { LastUpdatedStamp } from '@/features/teams/components/last-updated-stamp'
import { LeaderboardTable } from '@/features/teams/components/leaderboard-table'
import { lastUpdated } from '@/features/teams/utils/format'

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
    context.queryClient.ensureQueryData(getTeamsQueryOptions({ season: deps.season })),
  component: LeaderboardRoute,
})

function LeaderboardRoute() {
  const teams = Route.useLoaderData()
  const { season } = Route.useSearch()
  const selectedSeason = useSelectedSeason(season)

  return (
    <main>
      <Container className="max-w-6xl py-12 sm:py-16 lg:py-20">
        <header className="max-w-4xl">
          <Heading className="text-4xl/none sm:text-5xl/none">Leaderboard</Heading>
          <Text className="mt-3 text-base/7 sm:text-base/7">Schools listed by rating.</Text>
        </header>

        <LeaderboardTable season={selectedSeason} teams={teams} />
      </Container>

      <LastUpdatedStamp isoDate={lastUpdated(teams)} />
    </main>
  )
}
