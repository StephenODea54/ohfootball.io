import { ArrowRightIcon } from "@heroicons/react/20/solid"
import { Badge } from "@/components/ui/badge"
import { buttonStyles } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Container } from "@/components/ui/container"
import { Heading } from "@/components/ui/heading"
import { Link } from "@/components/ui/link"
import { Text, TextLink } from "@/components/ui/text"
import { links, paths } from "@/config/paths"
import { awesomeSites } from "@/features/about/awesome-sites"

const questions = [
  {
    question: "What Is A Rating?",
    answer:
      "A rating is a number of points. It is how many points a team would be expected to beat the median Ohio team by on a neutral field, so 0 is an average team and the higher the better.",
  },
  {
    question: "My Team Won. Why Did The Rating Go Down?",
    answer:
      "A rating moves by how much the score beat what was expected, not by the win alone. Winning by 7 when the model expected 20 lowers a rating a little.",
  },
  {
    question: "What Does A 68% Win Chance Mean?",
    answer: "The favorite wins about 68 games out of 100, on average.",
  },
  {
    question: "When Do Ratings Change?",
    answer:
      "Once a week, every Tuesday morning, Eastern time. A game counts once its score is posted.",
  },
  {
    question: "Why Is My School Missing?",
    answer:
      "A school needs games this season to get a rating. Out of state schools are not ranked.",
  },
  {
    question: "Does This Set Playoff Seeding?",
    answer: "No. The OHSAA does that with its own system. This is not affiliated with the OHSAA.",
  },
]

/** What the ratings mean, how to find a school, and when the numbers change. */
export function AboutContent() {
  return (
    <main>
      <Container className="max-w-6xl py-12 sm:py-16 lg:py-20">
        <div className="max-w-3xl">
          <Heading className="text-4xl/none sm:text-5xl/none">About</Heading>
          <Text className="mt-4 text-base/7 sm:text-lg/8">
            ohfootball.io is an incredibly nerdy attempt at rating and making predictions for Ohio
            high school football teams. The ratings and predictions are based only on the scores of
            past games, and predictions are made using a statistical model. The current accuracy of
            the predictions hovers around 81%.
          </Text>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={paths.home.getHref()}
              className={buttonStyles({ intent: "primary", size: "lg" })}
            >
              Find Your School <ArrowRightIcon />
            </Link>
            <Link
              href={paths.leaderboard.getHref()}
              className={buttonStyles({ intent: "outline", size: "lg" })}
            >
              See The Rankings
            </Link>
          </div>
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

        <section className="mt-14 max-w-3xl" aria-labelledby="sources-heading">
          <Heading id="sources-heading" level={2} className="text-2xl/8 sm:text-3xl/9">
            Where The Data Comes From
          </Heading>
          <Text className="mt-4 text-base/7">
            The scores come from two places. <TextLink href={links.joeEitel}>joeeitel.com</TextLink>{" "}
            has every season from 2000, and <TextLink href={links.ohhsfbdb}>ohhsfbdb.net</TextLink>{" "}
            has the seasons from 1972 to 1999. You can find both under{" "}
            <TextLink href="#awesome-sites-heading">Awesome Sites</TextLink>.
          </Text>
          <Text className="mt-3 text-base/7">
            That is also why only the season in progress is shown here. A page for every old score
            would turn ohfootball.io into a place to look up past results, and that takes away from
            those two. So you will find ratings and predictions for the current season only. For
            earlier seasons, and for the predictions made for them, check out the{" "}
            <TextLink href={paths.data.getHref()}>Data tab</TextLink>.
          </Text>
        </section>

        <section className="mt-14" aria-labelledby="awesome-sites-heading">
          <Heading
            id="awesome-sites-heading"
            level={2}
            className="scroll-mt-20 text-2xl/8 sm:text-3xl/9"
          >
            Awesome Sites
          </Heading>
          <Text className="mt-4 max-w-3xl text-base/7">
            The sites that ohfootball.io is built on, and others that are worth your time.
          </Text>
          <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {awesomeSites.map(({ description, href, isScoreSource, name }) => (
              <li key={href}>
                <Card className="h-full rounded-xl shadow-none [--gutter:--spacing(5)]">
                  <CardHeader>
                    <CardTitle className="flex flex-wrap items-center gap-2">
                      <Link href={href} className="font-semibold text-fg hover:underline">
                        {name}
                      </Link>
                      {isScoreSource && <Badge intent="secondary">Score source</Badge>}
                    </CardTitle>
                    <CardDescription>{description}</CardDescription>
                  </CardHeader>
                </Card>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-14 max-w-3xl" aria-labelledby="data-heading">
          <Heading id="data-heading" level={2} className="text-2xl/8 sm:text-3xl/9">
            Data And Code
          </Heading>
          <Text className="mt-4 text-base/7">
            All of the code, including the API and the model, is on{" "}
            <TextLink href={links.repository}>GitHub</TextLink>. Every game and rating is also
            published each week as a <TextLink href={links.dataset}>Kaggle dataset</TextLink>, and
            as one zip that you can download from the{" "}
            <TextLink href={paths.data.getHref()}>Data page</TextLink>.
          </Text>
          <Text className="mt-3 text-base/7">
            To read the ratings and predictions from your own code, see the{" "}
            <TextLink href={paths.api.getHref()}>API page</TextLink>.
          </Text>
          <Text className="mt-3 text-base/7">
            Found a wrong score or a missing school? Please{" "}
            <TextLink href={links.issues}>open an issue</TextLink>, or send an email to{" "}
            <TextLink href={links.contact}>hey@ohfootball.io</TextLink>.
          </Text>
        </section>

        <section className="mt-14 rounded-2xl bg-muted/60 px-6 py-8 sm:px-8 sm:py-10">
          <Heading level={2} className="text-2xl/8 sm:text-3xl/9">
            Fine Print
          </Heading>
          <ul className="mt-4 space-y-3 text-muted-fg text-sm/6">
            <li>
              Not affiliated with the OHSAA, any school, Joe Eitel, Drew Pasteur, or any other
              entity.
            </li>
            <li>A prediction is a guess, not a promise.</li>
            <li>
              Scores come from public results. Predictions are a reflection of that, whether right
              or wrong.
            </li>
            <li>
              It is illegal to bet on Ohio high school football games. Please don't use these
              predictions as hedges for your bets you weirdos.
            </li>
          </ul>
          <Text className="mt-6 text-sm/6">
            Want the math? Read the{" "}
            <TextLink href={paths.methodology.getHref()}>methodology</TextLink>.
          </Text>
        </section>
      </Container>
    </main>
  )
}
