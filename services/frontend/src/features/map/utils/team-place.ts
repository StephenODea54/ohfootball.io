import type { MapMarker } from "@/features/map/utils/markers"
import { regionLabel } from "@/features/playoffs/utils/format"
import { formatDivision } from "@/features/teams/utils/format"

/** The county, the division, and the region of a school, such as Stark · D-III · Region 9. */
export function teamPlace(marker: Pick<MapMarker, "county" | "division" | "region">) {
  return [
    marker.county,
    formatDivision(marker.division),
    marker.region ? regionLabel(marker.region) : null,
  ]
    .filter(Boolean)
    .join(" · ")
}
