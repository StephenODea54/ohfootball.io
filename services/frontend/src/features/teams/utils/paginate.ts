/** The number of schools on each page of the leaderboard. */
export const PAGE_SIZE = 50

/** A page number, or a gap that stands for the pages it leaves out. */
export type PageItem = number | "gap-start" | "gap-end"

/** The most page buttons in the row, gaps included. Five slots and two arrows fit a 360px phone. */
const MAX_SLOTS = 5

/** The pages that the controls show, from 1. Past five pages, the row has five slots. */
export function pageItems(current: number, count: number): PageItem[] {
  if (count <= MAX_SLOTS) return Array.from({ length: count }, (_, index) => index + 1)
  if (current <= 3) return [1, 2, 3, "gap-end", count]
  if (current >= count - 2) return [1, "gap-start", count - 2, count - 1, count]
  return [1, "gap-start", current, "gap-end", count]
}

/** Tells which schools the page shows, such as "Schools 51–100 of 703". */
export function pageSummary(page: number, total: number, size = PAGE_SIZE) {
  const first = (page - 1) * size + 1
  return `Schools ${first}–${Math.min(page * size, total)} of ${total}`
}
