import { paths } from "@/config/paths"
import type { ProgramHistory } from "@/features/compare/types"
import { isSafeSourceId } from "@/features/compare/utils/program-history"
import { readSchoolColors } from "@/features/compare/utils/school-colors"

type Fetcher = (input: string) => Promise<Pick<Response, "ok" | "json">>

/**
 * Loads programs/<sourceId>.json from the site. Returns null when the site has no file for the id.
 * Pages answers a missing file with 404.html and the status 404, so the status is read before the
 * body. The colors are checked again here, because a browser can hold an old file in its cache.
 */
export async function loadProgramHistory(
  sourceId: string,
  fetcher: Fetcher = (input) => fetch(input),
): Promise<ProgramHistory | null> {
  if (!isSafeSourceId(sourceId)) return null
  const response = await fetcher(paths.program.getHref(sourceId))
  if (!response.ok) return null
  const history = (await response.json()) as Omit<ProgramHistory, "colors"> & { colors?: unknown }
  return { ...history, colors: readSchoolColors(history.colors) }
}
