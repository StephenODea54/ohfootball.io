import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Text } from "@/components/ui/text"
import { ScoredTeamName } from "@/features/accuracy/components/scored-team-name"
import type { ReportCard as ReportCardData } from "@/features/accuracy/utils/chart-data"
import { formatPercent, formatScore } from "@/features/accuracy/utils/format"
import type { LinkedScoredGame } from "@/features/accuracy/utils/team-links"

interface ReportCardProps {
  card: ReportCardData
  /** The upsets of the week, with the links to the pages of the teams. */
  upsets: LinkedScoredGame[]
}

/** The grade of the last week with results: how many winners the model picked and its upsets. */
export function ReportCard({ card, upsets }: ReportCardProps) {
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
        {card.pending > 0 && (
          <Text>
            {card.pending === 1
              ? "1 game of the week has no result yet."
              : `${card.pending} games of the week have no result yet.`}
          </Text>
        )}
        {upsets.length > 0 && (
          <div>
            <p className="font-semibold text-fg text-sm/6">Biggest upsets of the week</p>
            <ol className="mt-2 grid gap-2">
              {upsets.map((game) => (
                <li
                  key={game.id}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm/6"
                >
                  <span className="flex flex-wrap items-center gap-x-2">
                    <ScoredTeamName team={game.winner} />
                    <span className="text-muted-fg">beat</span>
                    <ScoredTeamName team={game.loser} />
                  </span>
                  <Badge intent="danger" isCircle={false} className="font-semibold tabular-nums">
                    {formatPercent(game.winnerProbability)} chance
                  </Badge>
                </li>
              ))}
            </ol>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
