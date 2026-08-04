import { createFileRoute } from '@tanstack/react-router'
import { LeaderboardPage } from '@/app/leaderboard-page'

export const Route = createFileRoute('/leaderboard')({
  component: LeaderboardPage,
})
