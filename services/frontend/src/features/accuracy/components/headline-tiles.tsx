import { Card } from "@/components/ui/card"
import type { HeadlineTile } from "@/features/accuracy/utils/chart-data"

/** The headline numbers, one card each. */
export function HeadlineTiles({ tiles }: { tiles: HeadlineTile[] }) {
  return (
    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map((tile) => (
        <Card key={tile.id} className="gap-1 px-5 py-5 shadow-none">
          <dt className="text-muted-fg text-sm/6">{tile.label}</dt>
          <dd className="font-semibold text-3xl/9 text-fg">{tile.value}</dd>
        </Card>
      ))}
    </dl>
  )
}
