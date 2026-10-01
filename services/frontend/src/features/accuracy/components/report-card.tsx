import type { ReactNode } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Text } from "@/components/ui/text"
import { ScoredTeamName } from "@/features/accuracy/components/scored-team-name"
import type { ReportCard as ReportCardData } from "@/features/accuracy/utils/chart-data"
import { formatPercent, formatScore } from "@/features/accuracy/utils/format"
import type { LinkedScoredGame } from "@/features/accuracy/utils/team-links"
import { formatMargin } from "@/features/teams/utils/format"

interface ReportCardProps {
  card: ReportCardData
  /** The upsets of the week, with the links to the pages of the teams. */
  upsets: LinkedScoredGame[]
  /** The games of the week with an exact margin, with the links to the pages of the teams. */
  exactMargins: LinkedScoredGame[]
}

interface WeekGamesProps {
  title: string
  games: LinkedScoredGame[]
  intent: "danger" | "success"
  /** The text of the badge of a game. */
  badge: (game: LinkedScoredGame) => ReactNode
}

/** A list of games of the week, each with a badge. It shows nothing when it has no game. */
function WeekGames({ title, games, intent, badge }: WeekGamesProps) {
  if (games.length === 0) return null
  return (
    <div>
      <p className="font-semibold text-fg text-sm/6">{title}</p>
      <ol className="mt-2 grid gap-2">
        {games.map((game) => (
          <li
            key={game.id}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm/6"
          >
            <span className="flex flex-wrap items-center gap-x-2">
              <ScoredTeamName team={game.winner} />
              <span className="text-muted-fg">beat</span>
              <ScoredTeamName team={game.loser} />
            </span>
            <Badge intent={intent} isCircle={false} className="font-semibold tabular-nums">
              {badge(game)}
            </Badge>
          </li>
        ))}
      </ol>
    </div>
  )
}

/**
 * The grade of the last week with results: how many winners the model picked, how many margins it
 * called exactly, its upsets, and its exact margins.
 */
export function ReportCard({ card, upsets, exactMargins }: ReportCardProps) {
  const stats = [
    { label: "Accuracy", value: formatPercent(card.accuracy) },
    { label: "Right", value: `${card.correct} of ${card.decided}` },
    { label: "Expected", value: card.expected.toFixed(1) },
    { label: "Brier score", value: formatScore(card.brierScore) },
  ]
  return (
    <Card className="py-5 shadow-none [--gutter:--spacing(4)] sm:[--gutter:--spacing(6)]">
      <CardContent className="grid gap-6">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label}>
              <dt className="text-muted-fg text-xs/5">{stat.label}</dt>
              <dd className="font-semibold text-fg text-xl/7">{stat.value}</dd>
            </div>
          ))}
        </dl>
        {card.decided > 0 && (
          <Text>
            The model called the exact margin in {card.exactMargins} of {card.decided}{" "}
            {card.decided === 1 ? "game" : "games"} with a winner.
          </Text>
        )}
        {card.pending > 0 && (
          <Text>
            {card.pending === 1
              ? "1 game of the week has no result yet."
              : `${card.pending} games of the week have no result yet.`}
          </Text>
        )}
        <WeekGames
          title="Biggest upsets of the week"
          games={upsets}
          intent="danger"
          badge={(game) => `${formatPercent(game.winnerProbability)} chance`}
        />
        <WeekGames
          title="Exact margins of the week"
          games={exactMargins}
          intent="success"
          badge={(game) => `Called ${formatMargin(game.winnerPredictedMargin)}`}
        />
      </CardContent>
    </Card>
  )
}
