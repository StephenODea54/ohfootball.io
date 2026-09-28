/**
 * Keeps the answer to one question for the length of a build.
 *
 * The build draws every page in one process. The home page, the leaderboard, and each team page
 * all ask for the current season, and without this each of them would ask the API again. The
 * development server draws a page on each request, so there the answer is not kept and a change
 * to the data shows on the next load.
 */

const answers = new Map<string, Promise<unknown>>()

export function once<T>(key: string, load: () => Promise<T>): Promise<T> {
  if (import.meta.env.DEV) return load()

  let answer = answers.get(key) as Promise<T> | undefined
  if (!answer) {
    answer = load()
    answers.set(key, answer)
  }
  return answer
}
