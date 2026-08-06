import { createFileRoute } from '@tanstack/react-router'
import { TeamsPage } from '@/app/teams-page'
import { fetchTeams } from '@/lib/graphql'

export const Route = createFileRoute('/')({
  loader: fetchTeams,
  component: Home,
})

function Home() {
  const teams = Route.useLoaderData()
  return <TeamsPage teams={teams} />
}
