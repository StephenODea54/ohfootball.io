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
import { Container } from "@/components/ui/container"
import { Heading } from "@/components/ui/heading"
import { Text, TextLink } from "@/components/ui/text"

const limits = [
  {
    title: "Running up the score counts, up to a point",
    body: "A forty point win moves a rating more than a one point win. A margin larger than 56 points counts as 56, so one wild score cannot take over a season. The expected margin is held to 56 as well, so a heavy favorite that wins big is not marked down.",
  },
  {
    title: "Schedules are regional",
    body: "Most teams play a narrow local schedule. A team that dominates a weak area can carry a higher rating than it deserves until it plays outside that area, which often means the playoffs.",
  },
  {
    title: "Out-of-state opponents are known only a little",
    body: "A game against an out-of-state program counts at quarter weight, and the opponent is rated only from its games against Ohio teams. A new out-of-state program starts at the rating of the Ohio team it first plays, because teams mostly play teams of their own level. Such an opponent is never ranked. The leaderboard marks a school with two or more of these games this season, because less stands behind its rating.",
  },
  {
    title: "New schools start below the field",
    body: "A program with no history starts at a prior set by its division, and most established programs sit above those priors. A brand new school therefore starts about 25 points below the median team and needs a few games to find its level. This will cause really awful predictions for brand new schools.",
  },
  {
    title: "Program continuity can break",
    body: "The start of a season follows a program identifier, so a program that misses a season keeps the rating it last earned. Co-ops, mergers, and renames can still split one program into two histories, which starts a team over as a new school.",
  },
  {
    title: "The model knows nothing about football",
    body: "There is no roster, no injury report, no weather, no travel distance, and no notion of matchup style. It simply looks at who played, where, and what the score was.",
  },
  {
    title: "Source data can be wrong",
    body: "Results are scraped from a public sites. While these sites are awesome, any errors will flow straight to this model.",
  },
]

interface MethodologyContentProps {
  /**
   * The table of the tuned parameters. The page passes it in as an island of its own, so that the
   * table works with the keyboard. The rest of the content of the page runs no script.
   */
  children: React.ReactNode
}

/** The model behind the ratings: the prediction, the update rule, the parameters, and its limits. */
export function MethodologyContent({ children }: MethodologyContentProps) {
  return (
    <main>
      <Container className="max-w-6xl py-12 sm:py-16 lg:py-20">
        <div className="max-w-4xl">
          <section className="max-w-3xl">
            <p className="font-semibold text-sm/6 uppercase tracking-[0.18em] text-primary-subtle-fg">
              Methodology
            </p>
            <Heading className="mt-3 text-4xl/none sm:text-5xl/none">How The Ratings Work</Heading>
            <Text className="mt-5 text-base/7 sm:text-lg/8">
              Each team has a rating in points, and the gap between two ratings is the margin the
              model expects when they play. It is a close cousin of a traditional{" "}
              <TextLink href="https://en.wikipedia.org/wiki/Elo_rating_system">Elo</TextLink>{" "}
              rating: each team carries one number, and after every game the number moves by how
              much the result surprised the model. The difference is that it learns from the score
              and not only from the win or the loss. It belongs to the same family as margin ratings
              like <TextLink href="https://masseyratings.com/">Massey</TextLink> and the{" "}
              <TextLink href="https://www.sports-reference.com/blog/2015/03/srs-calculation-details/">
                Simple Rating System
              </TextLink>
              , but it updates one game at a time. This page is meant to serve as an overview of the
              model, its parameters, and its known limits.
            </Text>
          </section>

          <section className="mt-12" aria-labelledby="prediction-heading">
            <Heading id="prediction-heading" level={2} className="text-2xl/8 sm:text-3xl/9">
              The Prediction
            </Heading>
            <Text className="mt-3 text-base/7 sm:text-base/7">
              Before a game, the expected margin for team A against team B is the gap between their
              ratings, plus a small edge for the home team:
            </Text>
            <Formula
              className="mt-4"
              label="m equals R sub a minus R sub b plus 1.5 times h, where h is 1 when team A is home, minus 1 when team B is home, and 0 on a neutral field."
            >
              <FormulaLine>
                <Var>m</Var>
                <Op>=</Op>
                <Var sub="a">R</Var>
                <Op>&minus;</Op>
                <Var sub="b">R</Var>
                <Op>+</Op>
                <span>1.5</span>
                <Op>&middot;</Op>
                <Var>h</Var>
              </FormulaLine>
            </Formula>
            <Text className="mt-4 text-base/7 sm:text-base/7">
              <InlineMath label="h">
                <Var>h</Var>
              </InlineMath>{" "}
              is 1 when team A is home, &minus;1 when team B is home, and 0 on a neutral field. A
              logistic curve then turns the margin into a win probability:
            </Text>
            <Formula
              className="mt-4"
              label="P equals 1 divided by 1 plus e raised to the power of minus s times m."
            >
              <FormulaLine>
                <Var>P</Var>
                <Op>=</Op>
                <Frac
                  num={<span>1</span>}
                  den={
                    <>
                      <span>1</span>
                      <Op>+</Op>
                      <Pow
                        base={<span>e</span>}
                        exp={
                          <>
                            <Op>&minus;</Op>
                            <Var>s</Var>
                            <Op>&middot;</Op>
                            <Var>m</Var>
                          </>
                        }
                      />
                    </>
                  }
                />
              </FormulaLine>
            </Formula>
            <Text className="mt-4 text-base/7 sm:text-base/7">
              The slope{" "}
              <InlineMath label="s">
                <Var>s</Var>
              </InlineMath>{" "}
              depends on how many games the two teams have played this season, with one more slope
              for the playoffs. Each slope is fit on the ten seasons before the season being
              predicted, so a season never grades itself. The slopes are smaller early in a season,
              so the model is less sure of a margin in week one than in week eight.
            </Text>
          </section>

          <section className="mt-12" aria-labelledby="core-heading">
            <Heading id="core-heading" level={2} className="text-2xl/8 sm:text-3xl/9">
              The Update Rule
            </Heading>
            <Text className="mt-3 text-base/7 sm:text-base/7">
              After the game, each rating moves by a share of the surprise, the gap between the
              actual margin and the expected one. Both margins are held to 56 points first:
            </Text>
            <Formula
              className="mt-4"
              label="The new R sub a equals R sub a plus k of n times the actual margin minus m, with both margins held to 56 points. k of n equals 1.65 divided by n plus 5."
            >
              <FormulaLine>
                <Var prime sub="a">
                  R
                </Var>
                <Op>=</Op>
                <Var sub="a">R</Var>
                <Op>+</Op>
                <Var>k</Var>
                <Group>
                  <Var>n</Var>
                </Group>
                <Op>&middot;</Op>
                <Group>
                  <Name>margin</Name>
                  <Op>&minus;</Op>
                  <Var>m</Var>
                </Group>
              </FormulaLine>
              <FormulaLine>
                <Var>k</Var>
                <Group>
                  <Var>n</Var>
                </Group>
                <Op>=</Op>
                <Frac
                  num={<span>1.65</span>}
                  den={
                    <>
                      <Var>n</Var>
                      <Op>+</Op>
                      <span>5</span>
                    </>
                  }
                />
              </FormulaLine>
            </Formula>
            <Text className="mt-4 text-base/7 sm:text-base/7">
              <InlineMath label="n">
                <Var>n</Var>
              </InlineMath>{" "}
              is the number of games the team has already played this season. A rating moves by a
              third of the surprise in week one and by about an eighth by week ten, because early
              games say the most about a team that may have changed since last year. Team B moves
              the other way by its own share, so the two changes do not always cancel.
            </Text>
          </section>

          <section className="mt-12" aria-labelledby="parameters-heading">
            <Heading id="parameters-heading" level={2} className="text-2xl/8 sm:text-3xl/9">
              Production Parameters
            </Heading>
            <Text className="mt-3 text-base/7 sm:text-base/7">
              These values are used for the published snapshots. They were chosen on the 2000–2011
              seasons, checked on 2012–2023, and scored one time on 2024–2025 as the test set.
            </Text>
            {children}
          </section>

          <section className="mt-12" aria-labelledby="preseason-heading">
            <Heading id="preseason-heading" level={2} className="text-2xl/8 sm:text-3xl/9">
              Where A Season Starts
            </Heading>
            <Text className="mt-3 text-base/7 sm:text-base/7">
              A brand new program starts at a prior set by its division. A returning program starts
              from its own history instead:
            </Text>
            <Formula
              className="mt-4"
              label="The prior equals 12 times 4 minus the division. The starting rating equals the prior plus 0.8 times the last rating minus the prior, plus 0.2 times the older rating minus the prior."
            >
              <FormulaLine>
                <Name>prior</Name>
                <Op>=</Op>
                <span>12</span>
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
                <span>0.8</span>
                <Op>&middot;</Op>
                <Group>
                  <Name>last</Name>
                  <Op>&minus;</Op>
                  <Name>prior</Name>
                </Group>
                <Op>+</Op>
                <span>0.2</span>
                <Op>&middot;</Op>
                <Group>
                  <Name>older</Name>
                  <Op>&minus;</Op>
                  <Name>prior</Name>
                </Group>
              </FormulaLine>
            </Formula>
            <Text className="mt-4 text-base/7 sm:text-base/7">
              <InlineMath label="last">
                <Name>last</Name>
              </InlineMath>{" "}
              is the final rating of the most recent season the program played, and{" "}
              <InlineMath label="older">
                <Name>older</Name>
              </InlineMath>{" "}
              is its average over up to eight seasons before that. The two shares add up to one, so
              a returning program keeps its full history and the prior drops out. A program that
              stops for a season or more comes back with the rating it last earned, because a team
              that comes back is not a new team.
            </Text>
          </section>

          <section className="mt-12" aria-labelledby="mechanics-heading">
            <Heading id="mechanics-heading" level={2} className="text-2xl/8 sm:text-3xl/9">
              What Counts
            </Heading>
            <Text className="mt-3 text-base/7 sm:text-base/7">
              Every game with both scores moves ratings, and a tie is a margin of 0. A game between
              two Ohio teams without a score gets a prediction but moves no rating. A game against
              an out-of-state team that was played without both scores is left out and gets no
              prediction. A forfeit never moves a rating, because no team played the game.
              Cancellations are excluded for the same reason. Upcoming games get a prediction but
              never change a rating.
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
              log loss both reward calibration, so a model that says 90% needs to be right about 90%
              of the time, not merely on the correct side.
            </Text>
          </section>

          <section className="mt-12" aria-labelledby="accuracy-heading">
            <Heading id="accuracy-heading" level={2} className="text-2xl/8 sm:text-3xl/9">
              Are The Predictions Any Good?
            </Heading>
            <Text className="mt-3 text-base/7 sm:text-base/7">
              Idk. Historical accuracy sits around 81%, so it's better than a coin flip. It is less
              sure early in the season, when it knows the least about each team, and it picks about
              76% of winners in the first three weeks. It gets much better after that, at about 84%
              from week 7 on. I think a definition of "good" would be when it's able to consistently
              outpredict humans. An example might be checking if the model's predictions are better
              than{" "}
              <TextLink href="https://www.wfmj.com/sports/local-sports/dana-s-2026-high-school-football-predictions/article_9bd3f21d-8129-415a-b822-e6127661f01a.html">
                WFMJ's predictions
              </TextLink>
              .
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
        </div>
      </Container>
    </main>
  )
}
