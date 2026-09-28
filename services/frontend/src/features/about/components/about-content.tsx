import { ArrowRightIcon } from '@heroicons/react/20/solid'
import { buttonStyles } from '@/components/ui/button'
import { Container } from '@/components/ui/container'
import { Heading } from '@/components/ui/heading'
import { Link } from '@/components/ui/link'
import { Text, TextLink } from '@/components/ui/text'
import { paths } from '@/config/paths'

const questions = [
  {
    question: 'What Is A Rating?',
    answer: 'A rating is meant to be a measure of how good a team is. The higher the better.',
  },
  {
    question: 'My Team Won. Why Did The Rating Barely Move?',
    answer: 'Beating a weak team is worth little. Beating a strong team is worth a lot.',
  },
  {
    question: 'What Does A 68% Win Chance Mean?',
    answer: 'The favorite wins about 68 games out of 100, on average.',
  },
  {
    question: 'When Do Ratings Change?',
    answer: 'After a game is played and the score is posted, normally on a weekly basis.',
  },
  {
    question: 'Why Is My School Missing?',
    answer: 'A school needs games this season to get a rating. Out of state schools are not ranked.',
  },
  {
    question: 'Does This Set Playoff Seeding?',
    answer: 'No. The OHSAA does that with its own system. This is not affiliated with the OHSAA.',
  },
]

/** What the ratings mean, how to find a school, and when the numbers change. */
export function AboutContent() {
  return (
    <main>
      <Container className="max-w-3xl py-12 sm:py-16 lg:py-20">
        <Heading className="text-4xl/none sm:text-5xl/none">About</Heading>
        <Text className="mt-4 text-base/7 sm:text-lg/8">
          This site is an incredibly nerdy attempt at rating and making predictions
          for Ohio high school football teams. The ratings and predictions are solely based on historical win and loss
          results, and predictions are made using a statistical model. The current accuracy
          of the predictions hover around 80%.
        </Text>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href={paths.home.getHref()}
            className={buttonStyles({ intent: 'primary', size: 'lg' })}
          >
            Find Your School <ArrowRightIcon />
          </Link>
          <Link
            href={paths.leaderboard.getHref()}
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
            <li>Not affiliated with the OHSAA, any school, Joe Eitel, or any other entity.</li>
            <li>A prediction is a guess, not a promise.</li>
            <li>Scores come from public results. Predictions are a reflection of that, whether right or wrong.</li>
            <li>It is illegal to bet on Ohio high school football games. Please don't use these predictions as hedges for your bets you weirdos.</li>
          </ul>
          <Text className="mt-6 text-sm/6">
            Want the math? Read the{' '}
            <TextLink href={paths.methodology.getHref()}>methodology</TextLink>.
          </Text>
        </section>
      </Container>
    </main>
  )
}
