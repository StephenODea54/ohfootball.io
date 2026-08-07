import { createFileRoute } from '@tanstack/react-router'
import { AboutPage } from '@/app/about-page'

export const Route = createFileRoute('/about')({
  head: () => ({
    meta: [
      { title: 'About — ohfootball.io' },
      {
        name: 'description',
        content: 'A field guide to the ratings, predictions, and data behind ohfootball.io.',
      },
    ],
  }),
  component: AboutPage,
})
