"use client"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { CountyField } from "@/features/map/components/county-field"
import {
  type DivisionList,
  hasFilters,
  type MapFilters,
  regionItems,
} from "@/features/map/utils/map-view"
import { divisionLabel } from "@/features/playoffs/utils/format"

/** The key of the choice that sets no filter. */
const ALL = "all"

interface MapFiltersProps {
  filters: MapFilters
  divisions: DivisionList
  /** The names of the counties, A to Z. */
  counties: readonly string[]
  onDivisionChange: (division: number | null) => void
  onRegionChange: (region: number | null) => void
  onCountyChange: (county: string | null) => void
  onClear: () => void
}

function numberOrNull(key: string | number | null) {
  return key === null || key === ALL ? null : Number(key)
}

/** The division, region, and county filters of the team map. */
export function MapFilterBar({
  filters,
  divisions,
  counties,
  onDivisionChange,
  onRegionChange,
  onCountyChange,
  onClear,
}: MapFiltersProps) {
  const divisionChoices = [
    { id: ALL, label: "All divisions" },
    ...divisions.map((item) => ({ id: item.division, label: divisionLabel(item.division) })),
  ]
  const regionChoices = [
    { id: ALL, label: "All regions" },
    ...regionItems(divisions, filters.division),
  ]
  // On a wide screen the button keeps its room while it is hidden, so the fields do not move.
  const hasFilter = hasFilters(filters)

  return (
    <div className="grid items-end gap-4 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto]">
      <Select
        value={filters.division ?? ALL}
        onChange={(key) => onDivisionChange(numberOrNull(key))}
      >
        <Label>Division</Label>
        <SelectTrigger />
        <SelectContent items={divisionChoices}>
          {(item) => <SelectItem id={item.id}>{item.label}</SelectItem>}
        </SelectContent>
      </Select>
      <Select value={filters.region ?? ALL} onChange={(key) => onRegionChange(numberOrNull(key))}>
        <Label>Region</Label>
        <SelectTrigger />
        <SelectContent items={regionChoices}>
          {(item) => <SelectItem id={item.id}>{item.label}</SelectItem>}
        </SelectContent>
      </Select>
      <CountyField counties={counties} value={filters.county} onChange={onCountyChange} />
      <Button
        intent="outline"
        onPress={onClear}
        className={hasFilter ? undefined : "invisible max-sm:hidden"}
        isDisabled={!hasFilter}
      >
        Clear
      </Button>
    </div>
  )
}
