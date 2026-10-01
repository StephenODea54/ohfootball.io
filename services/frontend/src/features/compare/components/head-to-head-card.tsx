import { Card, CardContent } from "@/components/ui/card"
import {
  type HeadToHead,
  meetingLabel,
  seriesSummary,
  streakLabel,
} from "@/features/compare/utils/head-to-head"

interface HeadToHeadCardProps {
  record: HeadToHead
  nameA: string
  nameB: string
}

/**
 * The record of two schools against each other since the first season the site holds. Only games
 * with a result and both scores count.
 */
export function HeadToHeadCard({ record, nameA, nameB }: HeadToHeadCardProps) {
  const { first, last, streak, meetings } = record
  const summary = seriesSummary(nameA, nameB, record.record)
  const facts = [
    { term: "Total Meetings", detail: String(meetings.length) },
    summary && { term: "Record", detail: summary },
    first && { term: "First Meeting", detail: meetingLabel(first, nameA, nameB) },
    last && { term: "Last Meeting", detail: meetingLabel(last, nameA, nameB) },
    streak && { term: "Streak", detail: streakLabel(streak, nameA, nameB) },
  ].filter((fact): fact is { term: string; detail: string } => Boolean(fact))

  return (
    <Card className="shadow-none [--gutter:--spacing(4)] sm:[--gutter:--spacing(6)]">
      <CardContent>
        <dl className="grid gap-x-6 gap-y-3 text-sm/6 sm:grid-cols-[auto_1fr]">
          {facts.map((fact) => (
            <div key={fact.term} className="contents">
              <dt className="font-medium text-muted-fg">{fact.term}</dt>
              <dd className="text-fg tabular-nums">{fact.detail}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}
