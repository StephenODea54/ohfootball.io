import { createFileRoute } from '@tanstack/react-router'
import { TeamDetailPage } from '@/app/team-detail-page'
import { teamQuery } from '@/lib/queries'

export const Route = createFileRoute('/teams/$teamId')({
  loaderDeps: ({ search }) => ({ season: search.season }),
  loader: ({ context, deps, params }) =>
    context.queryClient.ensureQueryData(teamQuery(params.teamId, deps.season)),
  component: TeamRoute,
})

function TeamRoute() {
  const team = Route.useLoaderData()

  return <TeamDetailPage team={team} />
}
