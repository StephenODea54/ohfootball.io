import { formatOdds } from "@/features/playoffs/utils/format"

/**
 * A chance as a percent and a bar. The percent is the value that a screen reader reads, so the bar
 * is hidden from it.
 */
export function OddsBar({ probability }: { probability: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-9 shrink-0 text-end text-fg tabular-nums">{formatOdds(probability)}</span>
      <span
        aria-hidden="true"
        className="h-1.5 w-14 shrink-0 rounded-full bg-secondary max-lg:hidden"
      >
        <span
          className="block h-full rounded-full bg-primary"
          style={{ width: `${Math.round(probability * 100)}%` }}
        />
      </span>
    </div>
  )
}
