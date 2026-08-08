import { createFileRoute } from '@tanstack/react-router'
import { AboutPage } from '@/app/about-page'

export const Route = createFileRoute('/about')({
  head: () => ({
    meta: [
      { title: 'About — ohfootball.io' },
      {
        name: 'description',
        content:
          'What the ratings mean, how to find your school, and when the numbers change.',
      },
    ],
  }),
  component: AboutRoute,
})

function AboutRoute() {
  const { season } = Route.useSearch()

  return <AboutPage season={season} />
}
