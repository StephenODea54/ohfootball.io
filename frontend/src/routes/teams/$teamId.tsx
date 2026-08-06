import { createFileRoute } from '@tanstack/react-router'
import { TeamDetailPage } from '@/app/team-detail-page'
import { fetchTeam } from '@/lib/graphql'

export const Route = createFileRoute('/teams/$teamId')({
  loader: ({ params }) => fetchTeam(params.teamId),
  component: TeamRoute,
})

function TeamRoute() {
  const team = Route.useLoaderData()
  return <TeamDetailPage team={team} />
}
