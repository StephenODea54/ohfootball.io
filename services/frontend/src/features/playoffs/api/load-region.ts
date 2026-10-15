import { paths } from "@/config/paths"
import type { RegionData } from "@/features/playoffs/types"

/** The files of the regions that this visit loaded already, or is loading. */
const loaded = new Map<number, Promise<RegionData>>()

/**
 * Loads the file of a region that the build wrote. A visit loads each file one time, and a file
 * that failed to load is loaded again on the next call.
 */
export function loadRegion(region: number): Promise<RegionData> {
  let data = loaded.get(region)
  if (!data) {
    data = fetch(paths.playoffRegion.getHref(region)).then((response) => {
      if (!response.ok) throw new Error(`region ${region} did not load`)
      return response.json() as Promise<RegionData>
    })
    data.catch(() => loaded.delete(region))
    loaded.set(region, data)
  }
  return data
}
