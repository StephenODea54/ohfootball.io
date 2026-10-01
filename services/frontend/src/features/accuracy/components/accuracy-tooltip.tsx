"use client"

/** One line of the tooltip: a name and its value. */
export interface TooltipLine {
  name: string
  value: string
}

interface AccuracyTooltipProps<T> {
  /** Recharts sets these two while the pointer or the keyboard is on a point. */
  active?: boolean
  payload?: ReadonlyArray<{ payload?: T }>
  /** The heading of the point. */
  title: (point: T) => string
  lines: (point: T) => TooltipLine[]
}

/**
 * The tooltip of the charts of the Accuracy page. It shows the heading of the point and a few
 * lines of values, with text colors only.
 */
export function AccuracyTooltip<T>({ active, payload, title, lines }: AccuracyTooltipProps<T>) {
  const point = payload?.[0]?.payload
  if (!active || !point) return null
  return (
    <div className="grid min-w-44 gap-2 rounded-lg bg-overlay/70 px-3 py-2 text-overlay-fg text-xs ring ring-current/10 backdrop-blur-lg">
      <span className="font-medium">{title(point)}</span>
      <dl className="grid gap-1">
        {lines(point).map((line) => (
          <div key={line.name} className="flex justify-between gap-4">
            <dt className="text-muted-fg">{line.name}</dt>
            <dd className="font-medium text-fg tabular-nums">{line.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
