import { expect, it } from "vitest"
import { mapLimit } from "@/lib/map-limit"

it("keeps the order of the items and never runs more than the limit at once", async () => {
  let running = 0
  let most = 0
  const results = await mapLimit([5, 1, 4, 2, 3], 2, async (item) => {
    running += 1
    most = Math.max(most, running)
    await new Promise((resolve) => setTimeout(resolve, item))
    running -= 1
    return item * 10
  })
  expect(results).toEqual([50, 10, 40, 20, 30])
  expect(most).toBe(2)
})

it("answers an empty list without work", async () => {
  expect(await mapLimit([], 8, async () => 1)).toEqual([])
})

it("runs one at a time when the limit is below one", async () => {
  expect(await mapLimit([1, 2], 0, async (item) => item + 1)).toEqual([2, 3])
})

it("fails when one item fails", async () => {
  await expect(
    mapLimit([1, 2], 2, async (item) => {
      if (item === 2) throw new Error("no answer")
      return item
    }),
  ).rejects.toThrow("no answer")
})
