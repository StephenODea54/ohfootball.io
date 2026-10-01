import type { ReactNode } from "react"
import { twJoin } from "tailwind-merge"

/** One number of a summary, as a term and its value in a description list. */
export function TeamStat({
  label,
  value,
  tone = "text-fg",
}: {
  label: string
  value: ReactNode
  tone?: string
}) {
  return (
    <div>
      <dt className="text-xs/5 font-medium uppercase tracking-wide text-muted-fg">{label}</dt>
      <dd className={twJoin("mt-0.5 text-2xl/7 font-semibold", tone)}>{value}</dd>
    </div>
  )
}
