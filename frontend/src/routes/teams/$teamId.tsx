import { createFileRoute } from '@tanstack/react-router'
import { TeamDetailPage } from '@/app/team-detail-page'

export const Route = createFileRoute('/teams/$teamId')({
  component: TeamRoute,
})

function TeamRoute() {
  const { teamId } = Route.useParams()
  return <TeamDetailPage teamId={teamId} />
}
