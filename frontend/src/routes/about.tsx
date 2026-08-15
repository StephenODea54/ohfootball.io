import { ArrowRightIcon } from '@heroicons/react/20/solid'
import { createFileRoute } from '@tanstack/react-router'
import { buttonStyles } from '@/components/ui/button'
import { Container } from '@/components/ui/container'
import { Heading } from '@/components/ui/heading'
import { Link } from '@/components/ui/link'
import { Text, TextLink } from '@/components/ui/text'
import { paths } from '@/config/paths'

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

const questions = [
  {
    question: 'What Is A Rating?',
    answer: 'One number per school. Average is about 1500. Higher is better.',
  },
  {
    question: 'My Team Won. Why Did The Rating Barely Move?',
    answer: 'Beating a weak team is worth little. Beating a strong team is worth a lot.',
  },
  {
    question: 'What Does A 68% Win Chance Mean?',
    answer: 'The favorite wins about 68 games out of 100. The other 32 are real. Upsets happen.',
  },
  {
    question: 'When Do Ratings Change?',
    answer: 'After a game is played and the score is posted.',
  },
  {
    question: 'Why Is My School Missing?',
    answer: 'A school needs games this season to get a rating. Out of state schools are not ranked.',
  },
  {
    question: 'Does This Set Playoff Seeding?',
    answer: 'No. The OHSAA does that with its own system. Nothing here affects it.',
  },
]

function AboutRoute() {
  const { season } = Route.useSearch()

  return (
    <main>
      <Container className="max-w-3xl py-12 sm:py-16 lg:py-20">
        <Heading className="text-4xl/none sm:text-5xl/none">About</Heading>
        <Text className="mt-4 text-base/7 sm:text-lg/8">
          This site rates every Ohio high school football team and guesses who wins the games that
          have not been played yet. No math needed.
        </Text>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href={paths.home.getHref(season)}
            className={buttonStyles({ intent: 'primary', size: 'lg' })}
          >
            Find Your School <ArrowRightIcon />
          </Link>
          <Link
            href={paths.leaderboard.getHref(season)}
            className={buttonStyles({ intent: 'outline', size: 'lg' })}
          >
            See The Rankings
          </Link>
        </div>

        <section className="mt-14" aria-labelledby="questions-heading">
          <Heading id="questions-heading" level={2} className="text-2xl/8 sm:text-3xl/9">
            Common Questions
          </Heading>
          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            {questions.map(({ answer, question }) => (
              <div key={question} className="rounded-xl border bg-card px-5 py-5">
                <dt className="font-semibold text-base/6 text-fg">{question}</dt>
                <dd className="mt-2 text-muted-fg text-sm/6">{answer}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-14 rounded-2xl bg-muted/60 px-6 py-8 sm:px-8 sm:py-10">
          <Heading level={2} className="text-2xl/8 sm:text-3xl/9">
            Fine Print
          </Heading>
          <ul className="mt-4 space-y-3 text-muted-fg text-sm/6">
            <li>Not affiliated with the OHSAA, any school, or Joe Eitel.</li>
            <li>A prediction is a guess, not a promise.</li>
            <li>Scores come from public results. Bad data in, bad data out.</li>
          </ul>
          <Text className="mt-6 text-sm/6">
            Want the math? Read the{' '}
            <TextLink href={paths.methodology.getHref(season)}>methodology</TextLink>.
          </Text>
        </section>
      </Container>
    </main>
  )
}
