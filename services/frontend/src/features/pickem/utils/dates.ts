/**
 * Date rules of Pick 'Em. A date is a calendar day written as YYYY-MM-DD, with no time and no
 * zone. The math runs on UTC midnights, so no local clock can move a day.
 */

const DAY_MS = 24 * 60 * 60 * 1000

function toDay(date: string): number {
  const [year, month, day] = date.split("-").map(Number)
  return Date.UTC(year, month - 1, day)
}

function fromDay(time: number): string {
  return new Date(time).toISOString().slice(0, 10)
}

/** The date `days` days after `date`. A negative count goes back. */
export function addDays(date: string, days: number): string {
  return fromDay(toDay(date) + days * DAY_MS)
}

/** The number of days from `from` to `to`. */
export function daysBetween(from: string, to: string): number {
  return Math.round((toDay(to) - toDay(from)) / DAY_MS)
}

/** The calendar date of the moment `now` in `timeZone`. */
export function dateIn(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now)
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value
  return `${part("year")}-${part("month")}-${part("day")}`
}

/** How far the clock of `timeZone` is ahead of UTC at the moment `time`, in milliseconds. */
function offsetAt(time: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(new Date(time))
  const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value)
  const wall = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    // Some runtimes write midnight as hour 24.
    part("hour") % 24,
    part("minute"),
    part("second"),
  )
  return wall - Math.floor(time / 1000) * 1000
}

/**
 * The moment the picks of a game close: midnight in `timeZone` at the end of the game day. The
 * offset is read at that midnight, so a change of the clocks during the game day counts.
 */
export function lockAt(date: string, timeZone: string): string {
  const midnight = toDay(addDays(date, 1))
  const guess = midnight - offsetAt(midnight, timeZone)
  return new Date(midnight - offsetAt(guess, timeZone)).toISOString()
}
