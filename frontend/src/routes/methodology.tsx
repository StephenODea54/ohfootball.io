import { createFileRoute } from '@tanstack/react-router'
import {
  Formula,
  FormulaLine,
  Frac,
  Group,
  InlineMath,
  Name,
  Op,
  Pow,
  Var,
} from "@/components/formula"
import { Card, CardContent } from "@/components/ui/card"
import { Container } from "@/components/ui/container"
import { Heading } from "@/components/ui/heading"
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@/components/ui/table"
import { Text, TextLink } from "@/components/ui/text"

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
    body: "A one point win and a forty point win move a rating by exactly the same amount. This keeps the model resistant to running up the score.",
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
    body: "Carryover follows a program identifier across seasons, so a program that misses a season keeps the rating it last earned. Co-ops, mergers, and renames can still split one program into two histories, which resets a team to its prior. This will cause really awful predictions for brand new schools.",
  },
  {
    title: "The model knows nothing about football",
    body: "There is no roster, no injury report, no weather, no travel distance, and no notion of matchup style. It simply looks at who played and what the result was.",
  },
  {
    title: "Source data can be wrong",
    body: "Results are scraped from a public sites. While these sites are awesome, any errors will flow straight to this model.",
  },
]

function MethodologyRoute() {
  return (
    <main>
      <Container className="max-w-4xl py-12 sm:py-16 lg:py-20">
        <section className="max-w-3xl">
          <p className="font-semibold text-sm/6 uppercase tracking-[0.18em] text-primary-subtle-fg">
            Methodology
          </p>
          <Heading className="mt-3 text-4xl/none sm:text-5xl/none">How The Ratings Work</Heading>
          <Text className="mt-5 text-base/7 sm:text-lg/8">
            The ratings are calculated using a modified <TextLink href="https://en.wikipedia.org/wiki/Elo_rating_system">elo</TextLink> system.
            This page is meant to serve as an overview of the model, its parameters, and its known limits.
          </Text>
        </section>

        <section className="mt-12" aria-labelledby="core-heading">
          <Heading id="core-heading" level={2} className="text-2xl/8 sm:text-3xl/9">
            The Update Rule
          </Heading>
          <Text className="mt-3 text-base/7 sm:text-base/7">
            Before a game, each team has a rating. The expected score for team A against team B is a
            logistic function of the gap between them:
          </Text>
          <Formula
            className="mt-4"
            label="E sub a equals 1 divided by 1 plus 10 raised to the power of R sub b minus R sub a, all divided by 400."
          >
            <FormulaLine>
              <Var sub="a">E</Var>
              <Op>=</Op>
              <Frac
                num={<span>1</span>}
                den={
                  <>
                    <span>1</span>
                    <Op>+</Op>
                    <Pow
                      base={<span>10</span>}
                      exp={
                        <>
                          <Group>
                            <Var sub="b">R</Var>
                            <Op>&minus;</Op>
                            <Var sub="a">R</Var>
                          </Group>
                          <Op>/</Op>
                          <span>400</span>
                        </>
                      }
                    />
                  </>
                }
              />
            </FormulaLine>
          </Formula>
          <Text className="mt-4 text-base/7 sm:text-base/7">
            After the game, the rating moves by the difference between what happened and what was
            expected, scaled by the K factor and by a per game multiplier:
          </Text>
          <Formula
            className="mt-4"
            label="The new R sub a equals R sub a plus K times m times S sub a minus E sub a."
          >
            <FormulaLine>
              <Var prime sub="a">
                R
              </Var>
              <Op>=</Op>
              <Var sub="a">R</Var>
              <Op>+</Op>
              <Var>K</Var>
              <Op>&middot;</Op>
              <Var>m</Var>
              <Op>&middot;</Op>
              <Group>
                <Var sub="a">S</Var>
                <Op>&minus;</Op>
                <Var sub="a">E</Var>
              </Group>
            </FormulaLine>
          </Formula>
          <Text className="mt-4 text-base/7 sm:text-base/7">
            <InlineMath label="S sub a">
              <Var sub="a">S</Var>
            </InlineMath>{" "}
            is 1 for a win and 0 for a loss. Team B receives the exact opposite
            change.
          </Text>
        </section>

        <section className="mt-12" aria-labelledby="parameters-heading">
          <Heading id="parameters-heading" level={2} className="text-2xl/8 sm:text-3xl/9">
            Production Parameters
          </Heading>
          <Text className="mt-3 text-base/7 sm:text-base/7">
            These values are used for the published snapshots. Each parameter was tuned independently
            using the 2000–2023 seasons as the training/validation set, with final performance evaluated on the 2024–2025 seasons as the test set.
          </Text>
          <Card className="mt-5 gap-0 overflow-hidden py-0 shadow-none [--gutter:--spacing(4)]">
            <CardContent>
              <Table aria-label="Production rating parameters" bleed>
                <TableHeader className="bg-muted/70 uppercase text-xs/5 tracking-wide">
                  <TableColumn isRowHeader>Parameter</TableColumn>
                  <TableColumn className="w-24 text-end">Value</TableColumn>
                  <TableColumn>What It Does</TableColumn>
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
            Where A Season Starts
          </Heading>
          <Text className="mt-3 text-base/7 sm:text-base/7">
            A team's preseason rating is built from its division, then pulled toward what the program
            finished with in the most recent season it played:
          </Text>
          <Formula
            className="mt-4"
            label="The prior equals 1500 plus 140 times 4 minus the division. The starting rating equals the prior plus 0.85 times the last played rating minus the prior."
          >
            <FormulaLine>
              <Name>prior</Name>
              <Op>=</Op>
              <span>1500</span>
              <Op>+</Op>
              <span>140</span>
              <Op>&middot;</Op>
              <Group>
                <span>4</span>
                <Op>&minus;</Op>
                <Name>division</Name>
              </Group>
            </FormulaLine>
            <FormulaLine>
              <Name>start</Name>
              <Op>=</Op>
              <Name>prior</Name>
              <Op>+</Op>
              <span>0.85</span>
              <Op>&middot;</Op>
              <Group>
                <Name>last played rating</Name>
                <Op>&minus;</Op>
                <Name>prior</Name>
              </Group>
            </FormulaLine>
          </Formula>
          <Text className="mt-4 text-base/7 sm:text-base/7">
            Division I sits 420 points above the baseline and Division VII sits 420 below it, with
            Division IV at the baseline. Independent teams get no division adjustment. A program that
            has never played stays at its prior.
          </Text>
          <Text className="mt-4 text-base/7 sm:text-base/7">
            A program that stops for a season or more keeps the rating it last earned rather than
            starting again at its prior, because a team that comes back is not a new team. The pull
            toward the prior is applied once, however long the program was away. A program that
            returns in a different division is pulled toward the prior of the division it returns in.
          </Text>
        </section>

        <section className="mt-12" aria-labelledby="provisional-heading">
          <Heading id="provisional-heading" level={2} className="text-2xl/8 sm:text-3xl/9">
            Early Season Behavior
          </Heading>
          <Text className="mt-3 text-base/7 sm:text-base/7">
            For a team's first three games, the K factor is multiplied by a boost that starts at 1.6
            and decays linearly to 1.0. Both teams in a game share one multiplier, taken from
            whichever team is further from settled. This is an attempt to reduce the amount of
            variance in early season matchups since the model doesn't take into account things like
            roster changes, injuries, coaching changes, etc.
          </Text>
        </section>

        <section className="mt-12" aria-labelledby="mechanics-heading">
          <Heading id="mechanics-heading" level={2} className="text-2xl/8 sm:text-3xl/9">
            What Counts
          </Heading>
          <Text className="mt-3 text-base/7 sm:text-base/7">
            A win, a loss, and a tie all move ratings, with a tie counted as half a win for both teams.
            A forfeit never moves a rating, because no team played the game. Cancellations are excluded
            for the same reason. Upcoming games get a probability but never change a rating.
          </Text>
        </section>

        <section className="mt-12" aria-labelledby="evaluation-heading">
          <Heading id="evaluation-heading" level={2} className="text-2xl/8 sm:text-3xl/9">
            How It Is Measured
          </Heading>
          <Text className="mt-3 text-base/7 sm:text-base/7">
            Every configuration is scored by replaying history one game at a time and grading the
            prediction that was made before the result was known. Three numbers are tracked: Brier
            score, log loss, and straight accuracy on games with a decided result. Brier score and
            log loss both reward calibration, so a model that says 90% needs to be right about 90% of
            the time, not merely on the correct side.
          </Text>
        </section>

        <section className="mt-12" aria-labelledby="pipeline-heading">
          <Heading id="pipeline-heading" level={2} className="text-2xl/8 sm:text-3xl/9">
            Where The Data Comes From
          </Heading>
          <Text className="mt-3 text-base/7 sm:text-base/7">
            The data is sourced from a combination of <TextLink href="https://joeeitel.com/hsfoot">Joe Eitel</TextLink> and the
            {" "}<TextLink href="https://ohhsfbdb.net/">Ohio Highschool Football Database</TextLink>.
          </Text>
        </section>

        <section className="mt-12" aria-labelledby="pipeline-heading">
          <Heading id="pipeline-heading" level={2} className="text-2xl/8 sm:text-3xl/9">
            Are The Predictions Any Good?
          </Heading>
          <Text className="mt-3 text-base/7 sm:text-base/7">
            Idk. Historical accuracy sits around 80%, so it's better than a coin flip. I think a
            definition of "good" would be when it's able to consistently outpredict humans. An example might be
            checking if the model's predictions are better than <TextLink href="https://www.wfmj.com/sports/local-sports/dana-s-2026-high-school-football-predictions/article_9bd3f21d-8129-415a-b822-e6127661f01a.html">WFMJ's predictions</TextLink>.
          </Text>
        </section>

        <section className="mt-12" aria-labelledby="limits-heading">
          <Heading id="limits-heading" level={2} className="text-2xl/8 sm:text-3xl/9">
            Known Limits
          </Heading>
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
