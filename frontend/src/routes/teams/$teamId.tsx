import { createFileRoute } from '@tanstack/react-router'
import { TeamDetailPage } from '@/app/team-detail-page'
import { fetchTeam } from '@/lib/graphql'

export const Route = createFileRoute('/teams/$teamId')({
  loaderDeps: ({ search }) => ({ season: search.season }),
  loader: ({ deps, params }) => fetchTeam(params.teamId, deps.season),
  component: TeamRoute,
})

function TeamRoute() {
  const team = Route.useLoaderData()

  return <TeamDetailPage team={team} />
}
