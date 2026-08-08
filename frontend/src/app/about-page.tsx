import {
  ArrowRightIcon,
  ArrowTrendingUpIcon,
  CalendarDaysIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/20/solid"
import { buttonStyles } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Container } from "@/components/ui/container"
import { Heading } from "@/components/ui/heading"
import { Link } from "@/components/ui/link"
import { Text, TextLink } from "@/components/ui/text"
import { withSeason } from "@/lib/season"

const basics = [
  {
    icon: ArrowTrendingUpIcon,
    title: "What a rating is",
    body: "Every team gets one number. An average team sits near 1500. A stronger team sits higher, a weaker team sits lower. The number is a way to compare teams that never play each other.",
  },
  {
    icon: MagnifyingGlassIcon,
    title: "How to find your team",
    body: "Type your school name in the search box on the home page. You can also open the leaderboard and scroll, or filter it down to your region or division.",
  },
  {
    icon: CalendarDaysIcon,
    title: "When it changes",
    body: "Ratings move after a game is played and the final score is recorded. Every rating on the site is stamped with the date it was calculated, so you always know how fresh it is.",
  },
]

const questions = [
  {
    question: "My team won. Why did the rating barely move?",
    answer:
      "The size of the move depends on who you beat. Beating a team the model already expected you to beat is worth very little. Beating a team the model rated above you is worth a lot.",
  },
  {
    question: "What does a win probability of 68% mean?",
    answer:
      "It means that in a matchup like this one, the favorite wins about 68 times out of 100. The other 32 games are real. An upset does not mean the number was wrong.",
  },
  {
    question: "Does this decide playoff seeding?",
    answer:
      "No. Playoff qualification and seeding are set by the OHSAA, using its own system. Nothing on this site affects any of that.",
  },
  {
    question: "Why is a team missing or unrated?",
    answer:
      "A team needs recorded games in the selected season before it can be rated. Teams from other states show up as opponents on a schedule, but they are not ranked here.",
  },
  {
    question: "How early in the season can I trust this?",
    answer:
      "Week one ratings lean heavily on last season and on the team's division. They sharpen quickly once real games are played. Give it a few weeks before reading too much into a rank.",
  },
]

export function AboutPage({ season }: { season: number }) {
  return (
    <main>
      <Container className="max-w-5xl py-12 sm:py-16 lg:py-20">
        <section className="max-w-3xl">
          <p className="font-semibold text-sm/6 uppercase tracking-[0.18em] text-primary-subtle-fg">
            Start here
          </p>
          <Heading className="mt-3 text-4xl/none sm:text-5xl/none">
            Ohio high school football, <span className="text-primary">by the numbers.</span>
          </Heading>
          <Text className="mt-5 text-base/7 sm:text-lg/8">
            This site rates every Ohio high school football team, ranks them against each other, and
            estimates who is likely to win the games that have not been played yet. You do not need
            to know any math to use it.
          </Text>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={withSeason("/", season)} className={buttonStyles({ intent: "primary", size: "lg" })}>
              Find your team <ArrowRightIcon />
            </Link>
            <Link
              href={withSeason("/leaderboard", season)}
              className={buttonStyles({ intent: "outline", size: "lg" })}
            >
              See the rankings
            </Link>
          </div>
        </section>

        <section className="mt-14" aria-labelledby="basics-heading">
          <Heading id="basics-heading" level={2} className="text-2xl/8 sm:text-3xl/9">
            The three things worth knowing
          </Heading>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {basics.map(({ body, icon: Icon, title }) => (
              <Card key={title} className="gap-4 shadow-none [--gutter:--spacing(5)]">
                <CardHeader>
                  <span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary-subtle-fg">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <CardTitle className="mt-4 text-lg/7">{title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Text className="m-0 text-sm/6">{body}</Text>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="mt-14" aria-labelledby="reading-heading">
          <Heading id="reading-heading" level={2} className="text-2xl/8 sm:text-3xl/9">
            Reading a team page
          </Heading>
          <Text className="mt-3 max-w-3xl text-base/7 sm:text-base/7">
            Open any team to see its rating, its rank among every rated Ohio team, and its record.
            Below that is a chart of how the rating has moved across the season, then the full
            schedule. Games that have not been played yet show a predicted winner and a win
            probability. Games already played show the final score.
          </Text>
        </section>

        <section className="mt-14" aria-labelledby="questions-heading">
          <Heading id="questions-heading" level={2} className="text-2xl/8 sm:text-3xl/9">
            Questions people ask
          </Heading>
          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            {questions.map(({ answer, question }) => (
              <div key={question} className="rounded-xl border bg-card px-5 py-5">
                <dt className="font-semibold text-base/6 text-fg">{question}</dt>
                <dd className="mt-2 text-sm/6 text-muted-fg">{answer}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-14 rounded-2xl bg-muted/60 px-6 py-8 sm:px-8 sm:py-10">
          <Heading level={2} className="text-2xl/8 sm:text-3xl/9">
            Fine print
          </Heading>
          <ul className="mt-4 space-y-3 text-sm/6 text-muted-fg">
            <li>
              <strong className="text-fg">This is an independent project.</strong> It is not
              affiliated with the OHSAA, with any school, or with Joe Eitel.
            </li>
            <li>
              <strong className="text-fg">Predictions are not promises.</strong> The whole point of
              a probability is that the other outcome happens sometimes.
            </li>
            <li>
              <strong className="text-fg">Scores come from public results.</strong> If a result is
              missing or wrong at the source, it will be missing or wrong here too.
            </li>
          </ul>
          <Text className="mt-6 text-sm/6">
            Want the technical version, including how the ratings are calculated and where they fall
            short? Read the{" "}
            <TextLink href={withSeason("/methodology", season)}>methodology</TextLink>.
          </Text>
        </section>
      </Container>
    </main>
  )
}
