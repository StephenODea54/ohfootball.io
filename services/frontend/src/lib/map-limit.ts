/**
 * Runs `work` on each item with at most `limit` calls in flight, and keeps the order of the items.
 * The build asks the API for hundreds of teams in one step, and this keeps those requests to the
 * number the page builder uses.
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await work(items[index])
    }
  }
  const workers = Math.min(Math.max(1, limit), items.length)
  await Promise.all(Array.from({ length: workers }, worker))
  return results
}
