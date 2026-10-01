import { Card, CardContent, CardHeader } from "@/components/ui/card"

interface ChartFigureProps {
  /** The short name of the chart, above it. */
  title: string
  /** The key numbers of the chart in words, under the chart. A chart can do without one. */
  caption?: React.ReactNode
  children: React.ReactNode
}

/** A chart in a card, with an optional caption that states its key numbers in words. */
export function ChartFigure({ title, caption, children }: ChartFigureProps) {
  return (
    <figure>
      <Card className="gap-4 py-5 shadow-none [--gutter:--spacing(4)] sm:[--gutter:--spacing(6)]">
        <CardHeader>
          <p className="font-semibold text-muted-fg text-xs/5 uppercase tracking-wide">{title}</p>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
      {caption && <figcaption className="mt-3 text-muted-fg text-sm/6">{caption}</figcaption>}
    </figure>
  )
}
