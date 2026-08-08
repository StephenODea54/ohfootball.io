import { createFileRoute } from '@tanstack/react-router'
import { MethodologyPage } from '@/app/methodology-page'

export const Route = createFileRoute('/methodology')({
  head: () => ({
    meta: [
      { title: 'Methodology — ohfootball.io' },
      {
        name: 'description',
        content:
          'The rating model behind ohfootball.io: the update rule, the tuned parameters, and its known limits.',
      },
    ],
  }),
  component: MethodologyRoute,
})

function MethodologyRoute() {
  const { season } = Route.useSearch()

  return <MethodologyPage season={season} />
}
