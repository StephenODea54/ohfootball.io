import { formatDayAndMonth } from "@/utils/format"

/** The text for a value that is missing. */
export const MISSING = "—"

const counts = new Intl.NumberFormat("en-US")

/** A share as a percent, such as "80.8%". */
export function formatPercent(share: number | null, digits = 1) {
  return share === null ? MISSING : `${(share * 100).toFixed(digits)}%`
}

/** A Brier score or a log loss, with four decimals. */
export function formatScore(value: number | null) {
  return value === null ? MISSING : value.toFixed(4)
}

/** A count with a comma for each thousand, such as "97,688". */
export function formatCount(count: number) {
  return counts.format(count)
}

/** A number with its sign. The minus sign is the typographic one, and 0 has no sign. */
export function formatSigned(value: number, digits = 1) {
  const text = Math.abs(value).toFixed(digits)
  if (Number(text) === 0) return (0).toFixed(digits)
  return value > 0 ? `+${text}` : `−${text}`
}

export function formatWeek(week: number) {
  return `Week ${week}`
}

/** A confidence bin as a range of whole percents, such as "50–55%". */
export function formatBin(lowerBound: number, upperBound: number) {
  return `${Math.round(lowerBound * 100)}–${Math.round(upperBound * 100)}%`
}

/**
 * The days of a week, such as "Sep 24 – 26", or "Sep 30 – Oct 3" when the month changes. A week
 * with one date gives that date.
 */
export function formatDateRange(firstDate: string, lastDate: string) {
  const first = formatDayAndMonth(firstDate)
  if (firstDate === lastDate) return first
  const last = formatDayAndMonth(lastDate)
  const [firstMonth] = first.split(" ")
  const [lastMonth, lastDay] = last.split(" ")
  return firstMonth === lastMonth ? `${first} – ${lastDay}` : `${first} – ${last}`
}
