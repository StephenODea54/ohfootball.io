import { createFileRoute } from '@tanstack/react-router'
import { Container } from '@/components/ui/container'
import { Heading } from '@/components/ui/heading'
import { Link } from '@/components/ui/link'
import { paths } from '@/config/paths'
import { getTeamQueryOptions } from '@/features/teams/api/get-team'
import { RatingHistoryChart } from '@/features/teams/components/rating-history-chart'
import { TeamHeader } from '@/features/teams/components/team-header'
import { TeamScheduleTable } from '@/features/teams/components/team-schedule-table'

export const Route = createFileRoute('/teams/$teamId')({
  loaderDeps: ({ search }) => ({ season: search.season }),
  loader: ({ context, deps, params }) =>
    context.queryClient.ensureQueryData(getTeamQueryOptions(params.teamId, deps.season)),
  component: TeamRoute,
})

function TeamRoute() {
  const team = Route.useLoaderData()

  return (
    <main>
      <Container className="max-w-6xl py-10 sm:py-14 lg:py-16">
        <Link
          href={paths.leaderboard.getHref(team.season)}
          className="inline-flex text-sm/6 text-muted-fg hover:text-fg"
        >
          ← {team.season} Leaderboard
        </Link>

        <TeamHeader team={team} />

        <section className="mt-10" aria-labelledby="rating-history-heading">
          <Heading id="rating-history-heading" level={2} className="mb-4 text-lg/7 sm:text-lg/7">
            Rating By Season
          </Heading>
          <RatingHistoryChart team={team} />
        </section>

        <section className="mt-10" aria-labelledby="schedule-heading">
          <Heading id="schedule-heading" level={2} className="mb-4 text-lg/7 sm:text-lg/7">
            Schedule
          </Heading>
          <TeamScheduleTable team={team} />
        </section>
      </Container>
    </main>
  )
}
