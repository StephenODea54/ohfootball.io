import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Container } from "@/components/ui/container"
import { Heading } from "@/components/ui/heading"
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@/components/ui/table"
import { Code, Text, TextLink } from "@/components/ui/text"
import { withSeason } from "@/lib/season"

const parameters = [
  {
    id: "initial-rating",
    name: "Initial rating",
    value: "1500",
    note: "The rating of a team with no history and no division.",
  },
  {
    id: "k-factor",
    name: "K factor",
    value: "148",
    note: "The maximum rating a single game can move. It is large because a season is only about ten games.",
  },
  {
    id: "rating-scale",
    name: "Rating scale",
    value: "400",
    note: "A 400 point gap means the stronger team is expected to win about 91% of the time.",
  },
  {
    id: "home-advantage",
    name: "Home advantage",
    value: "30",
    note: "Added to the home team's rating before the probability is calculated. It never changes the stored rating.",
  },
  {
    id: "season-carryover",
    name: "Season carryover",
    value: "0.85",
    note: "The share of last season's ending rating that a returning program keeps.",
  },
  {
    id: "division-rating-step",
    name: "Division rating step",
    value: "140",
    note: "Points per division of separation in the preseason prior.",
  },
  {
    id: "provisional-games",
    name: "Provisional games",
    value: "3",
    note: "How long a team's early-season rating moves faster than normal.",
  },
  {
    id: "provisional-multiplier",
    name: "Provisional K multiplier",
    value: "1.6",
    note: "The size of that early-season boost. It decays linearly to 1.0.",
  },
  {
    id: "margin-weight",
    name: "Margin weight",
    value: "0",
    note: "Margin of victory is available in the model but is switched off in production.",
  },
]

const limits = [
  {
    title: "Margin of victory is ignored",
    body: "A one point win and a forty point win move a rating by exactly the same amount. This keeps the model resistant to running up the score, and it costs real information.",
  },
  {
    title: "Ratings are zero sum inside a season",
    body: "Every point one team gains, its opponent loses. Ohio as a whole cannot get stronger or weaker, so ratings compare teams to each other and not to some fixed standard.",
  },
  {
    title: "Schedules are regional",
    body: "Most teams play a narrow local schedule. A team that dominates a weak area can carry a higher rating than it deserves until it plays outside that area, which often means the playoffs.",
  },
  {
    title: "Out-of-state opponents are invisible",
    body: "Only games between rated Ohio teams update ratings. A game against an out-of-state program is skipped, so it neither helps nor hurts.",
  },
  {
    title: "The preseason prior is a guess about school size",
    body: "Division is mostly an enrollment bracket, not a strength measure. Using it as a prior helps on average and is wrong for any specific program that is unusually strong or weak for its size.",
  },
  {
    title: "Program continuity can break",
    body: "Carryover follows a program identifier across seasons. Co-ops, mergers, and renames can split one program into two histories, which resets a team to its prior.",
  },
  {
    title: "The model knows nothing about football",
    body: "There is no roster, no injury report, no weather, no travel distance, and no notion of matchup style. It sees who played, who won, and where.",
  },
  {
    title: "Source data can be wrong",
    body: "Results are scraped from a public site. A missing or mistyped score flows straight through to a rating.",
  },
]

export function MethodologyPage({ season }: { season: number }) {
  return (
    <main>
      <Container className="max-w-4xl py-12 sm:py-16 lg:py-20">
        <section className="max-w-3xl">
          <p className="font-semibold text-sm/6 uppercase tracking-[0.18em] text-primary-subtle-fg">
            Methodology
          </p>
          <Heading className="mt-3 text-4xl/none sm:text-5xl/none">How the ratings work</Heading>
          <Text className="mt-5 text-base/7 sm:text-lg/8">
            The rating is Elo, tuned for a sport with a ten game season and almost no crossover
            between regions. This page is the full description, including the parts that do not
            work well. If you only want to read the site, the{" "}
            <TextLink href={withSeason("/about", season)}>about page</TextLink> is the shorter
            version.
          </Text>
        </section>

        <section className="mt-12" aria-labelledby="core-heading">
          <Heading id="core-heading" level={2} className="text-2xl/8 sm:text-3xl/9">
            The update rule
          </Heading>
          <Text className="mt-3 text-base/7 sm:text-base/7">
            Before a game, each team has a rating. The expected score for team A against team B is a
            logistic function of the gap between them:
          </Text>
          <pre className="mt-4 overflow-x-auto rounded-lg border bg-muted/60 px-4 py-3 text-sm/6 text-fg">
            <code>{"E_a = 1 / (1 + 10 ^ ((R_b - R_a) / 400))"}</code>
          </pre>
          <Text className="mt-4 text-base/7 sm:text-base/7">
            After the game, the rating moves by the difference between what happened and what was
            expected, scaled by the K factor and by a per game multiplier:
          </Text>
          <pre className="mt-4 overflow-x-auto rounded-lg border bg-muted/60 px-4 py-3 text-sm/6 text-fg">
            <code>{"R_a' = R_a + K * m * (S_a - E_a)"}</code>
          </pre>
          <Text className="mt-4 text-base/7 sm:text-base/7">
            <Code>S_a</Code> is 1 for a win and 0 for a loss. Team B receives the exact opposite
            change, which is what keeps the rating pool closed. Home advantage is added to the home
            team's rating inside <Code>E_a</Code> only. It is never stored.
          </Text>
        </section>

        <section className="mt-12" aria-labelledby="parameters-heading">
          <Heading id="parameters-heading" level={2} className="text-2xl/8 sm:text-3xl/9">
            Production parameters
          </Heading>
          <Text className="mt-3 text-base/7 sm:text-base/7">
            These are the values used for the published snapshots. They were selected by sweeping one
            parameter at a time on the 2000 through 2021 seasons and checking the result on 2022 and
            2023.
          </Text>
          <Card className="mt-5 gap-0 overflow-hidden py-0 shadow-none [--gutter:--spacing(4)]">
            <CardContent>
              <Table aria-label="Production rating parameters" bleed>
                <TableHeader className="bg-muted/70 uppercase text-xs/5 tracking-wide">
                  <TableColumn isRowHeader>Parameter</TableColumn>
                  <TableColumn className="w-24 text-end">Value</TableColumn>
                  <TableColumn>What it does</TableColumn>
                </TableHeader>
                <TableBody items={parameters}>
                  {(parameter) => (
                    <TableRow id={parameter.id}>
                      <TableCell className="font-medium text-fg">{parameter.name}</TableCell>
                      <TableCell className="text-end font-semibold text-fg">
                        {parameter.value}
                      </TableCell>
                      <TableCell className="text-muted-fg">{parameter.note}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </section>

        <section className="mt-12" aria-labelledby="preseason-heading">
          <Heading id="preseason-heading" level={2} className="text-2xl/8 sm:text-3xl/9">
            Where a season starts
          </Heading>
          <Text className="mt-3 text-base/7 sm:text-base/7">
            A team's preseason rating is built from its division, then pulled toward what the program
            finished with last season:
          </Text>
          <pre className="mt-4 overflow-x-auto rounded-lg border bg-muted/60 px-4 py-3 text-sm/6 text-fg">
            <code>
              {"prior = 1500 + 140 * (4 - division)\nstart = prior + 0.85 * (last_season_rating - prior)"}
            </code>
          </pre>
          <Text className="mt-4 text-base/7 sm:text-base/7">
            Division I sits 420 points above the baseline and Division VII sits 420 below it, with
            Division IV at the baseline. Independent teams get no division adjustment. A program with
            no prior season stays at its prior.
          </Text>
        </section>

        <section className="mt-12" aria-labelledby="provisional-heading">
          <Heading id="provisional-heading" level={2} className="text-2xl/8 sm:text-3xl/9">
            Early-season behavior
          </Heading>
          <Text className="mt-3 text-base/7 sm:text-base/7">
            For a team's first three games, the K factor is multiplied by a boost that starts at 1.6
            and decays linearly to 1.0. Both teams in a game share one multiplier, taken from
            whichever team is further from settled. Sharing it matters: giving each team its own
            boost would let one side gain more than the other side lost, which would leak points into
            the pool.
          </Text>
        </section>

        <section className="mt-12" aria-labelledby="mechanics-heading">
          <Heading id="mechanics-heading" level={2} className="text-2xl/8 sm:text-3xl/9">
            Timing and exclusions
          </Heading>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Card className="gap-3 shadow-none [--gutter:--spacing(5)]">
              <CardHeader>
                <CardTitle className="text-lg/7">Games settle by date</CardTitle>
              </CardHeader>
              <CardContent>
                <Text className="m-0 text-sm/6">
                  Every game on the same date is predicted from the ratings as they stood at the
                  start of that date. All of the day's changes are applied together. Kickoff times
                  are not available, so ordering games inside a day would invent precision the data
                  does not have.
                </Text>
              </CardContent>
            </Card>
            <Card className="gap-3 shadow-none [--gutter:--spacing(5)]">
              <CardHeader>
                <CardTitle className="text-lg/7">What is skipped</CardTitle>
              </CardHeader>
              <CardContent>
                <Text className="m-0 text-sm/6">
                  Only games with a recorded win or loss update ratings. Ties, cancellations,
                  forfeits without a result, and scheduled games that have not been played are all
                  excluded. Upcoming games get a probability but never change a rating.
                </Text>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="mt-12" aria-labelledby="evaluation-heading">
          <Heading id="evaluation-heading" level={2} className="text-2xl/8 sm:text-3xl/9">
            How it is measured
          </Heading>
          <Text className="mt-3 text-base/7 sm:text-base/7">
            Every configuration is scored by replaying history one game at a time and grading the
            prediction that was made before the result was known. Three numbers are tracked: Brier
            score, log loss, and straight accuracy on games with a decided result. Brier score and
            log loss both reward calibration, so a model that says 90% needs to be right about 90% of
            the time, not merely on the correct side. Runs are logged to MLflow so a parameter change
            can be compared against every earlier run.
          </Text>
        </section>

        <section className="mt-12" aria-labelledby="pipeline-heading">
          <Heading id="pipeline-heading" level={2} className="text-2xl/8 sm:text-3xl/9">
            Where the data comes from
          </Heading>
          <Text className="mt-3 text-base/7 sm:text-base/7">
            Schedules and results are scraped from publicly posted Ohio high school football results
            and stored in Postgres. dbt models turn the raw rows into analytics tables. The predictor
            reads those tables, replays the season, and writes a dated rating snapshot. A GraphQL API
            serves the snapshot to this site. Each snapshot is stored with the date it was
            calculated, which is the date shown on a team page.
          </Text>
        </section>

        <section className="mt-12" aria-labelledby="limits-heading">
          <Heading id="limits-heading" level={2} className="text-2xl/8 sm:text-3xl/9">
            Known limits
          </Heading>
          <Text className="mt-3 text-base/7 sm:text-base/7">
            These are real weaknesses, not disclaimers. Read a rating with them in mind.
          </Text>
          <dl className="mt-5 space-y-4">
            {limits.map(({ body, title }) => (
              <div key={title} className="rounded-xl border bg-card px-5 py-5">
                <dt className="font-semibold text-base/6 text-fg">{title}</dt>
                <dd className="mt-2 text-sm/6 text-muted-fg">{body}</dd>
              </div>
            ))}
          </dl>
        </section>
      </Container>
    </main>
  )
}
