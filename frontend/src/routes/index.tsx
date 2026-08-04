import { createFileRoute } from '@tanstack/react-router'
import { TeamsPage } from '@/app/teams-page'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return <TeamsPage />
}
