import { ArrowRightIcon, ChartBarIcon, CircleStackIcon, SparklesIcon } from "@heroicons/react/20/solid"
import { buttonStyles } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Container } from "@/components/ui/container"
import { Heading } from "@/components/ui/heading"
import { Link } from "@/components/ui/link"
import { Text } from "@/components/ui/text"

const guideposts = [
  {
    icon: ChartBarIcon,
    title: "Read the rating",
    body: "Elo is a relative measure of team strength. Beating a strong opponent moves a rating more than beating a weaker one; the leaderboard is the clearest way to compare the field.",
  },
  {
    icon: SparklesIcon,
    title: "Read the forecast",
    body: "Pregame probabilities compare each team’s current Elo and account for the game location. They describe uncertainty—not destiny—and will sharpen as the season produces evidence.",
  },
  {
    icon: CircleStackIcon,
    title: "Follow the data",
    body: "Results are collected, modeled into analytics-ready marts, passed through the cumulative Elo process, and served to this site through a small GraphQL API.",
  },
]

export function AboutPage() {
  return (
    <main>
      <Container className="max-w-6xl py-12 sm:py-16 lg:py-20">
        <section className="relative overflow-hidden rounded-2xl border bg-card px-6 py-10 sm:px-10 sm:py-14">
          <div className="absolute -right-24 -top-24 size-72 rounded-full bg-primary/10 blur-3xl" aria-hidden="true" />
          <div className="relative max-w-3xl">
            <p className="font-semibold text-sm/6 uppercase tracking-[0.18em] text-primary-subtle-fg">
              For the weary traveler
            </p>
            <Heading className="mt-3 text-4xl/none sm:text-5xl/none">
              A field guide to <span className="text-primary">ohfootball.io.</span>
            </Heading>
            <Text className="mt-5 max-w-2xl text-base/7 sm:text-lg/8">
              Ohio high school football has hundreds of teams, ten weeks of regular-season
              intrigue, and no shortage of opinions. This is a calm place to explore the season,
              compare teams, and see what the numbers expect next.
            </Text>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/" className={buttonStyles({ intent: "primary", size: "lg" })}>
                Explore teams <ArrowRightIcon />
              </Link>
              <Link href="/leaderboard" className={buttonStyles({ intent: "outline", size: "lg" })}>
                View leaderboard
              </Link>
            </div>
          </div>
        </section>

        <section className="mt-12" aria-labelledby="how-it-works-heading">
          <Heading id="how-it-works-heading" level={2} className="text-2xl/8 sm:text-3xl/9">
            Three guideposts
          </Heading>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {guideposts.map(({ body, icon: Icon, title }) => (
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

        <section className="mt-12 grid gap-8 rounded-2xl bg-muted/60 px-6 py-8 sm:grid-cols-[0.75fr_1.25fr] sm:px-8 sm:py-10">
          <div>
            <p className="font-semibold text-sm/6 uppercase tracking-[0.16em] text-muted-fg">Trail notes</p>
            <Heading level={2} className="mt-2 text-2xl/8 sm:text-3xl/9">A few honest caveats</Heading>
          </div>
          <ul className="space-y-4 text-sm/6 text-muted-fg">
            <li><strong className="text-fg">Predictions are probabilities.</strong> A favorite can lose, and that uncertainty is part of the fun.</li>
            <li><strong className="text-fg">Ratings carry context forward.</strong> A returning program begins with history, then the current season steadily earns more influence.</li>
            <li><strong className="text-fg">Only completed games move Elo.</strong> Cancellations and games without a final score do not change ratings.</li>
            <li><strong className="text-fg">This is an independent project.</strong> It is not affiliated with the OHSAA or Joe Eitel.</li>
          </ul>
        </section>
      </Container>
    </main>
  )
}
