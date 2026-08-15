"use client"

import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { SEASONS } from "@/utils/season"

const seasonItems = SEASONS.map((season) => ({ id: season }))

interface SeasonSelectProps {
  className?: string
  onSeasonChange: (season: number) => void
  season: number
}

/** Season picker shown in the navbar. It drives every season-aware page. */
export function SeasonSelect({ className, onSeasonChange, season }: SeasonSelectProps) {
  return (
    <Select
      aria-label="Season"
      className={className}
      onChange={(key) => {
        if (key !== null) onSeasonChange(Number(key))
      }}
      value={season}
    >
      <SelectTrigger />
      <SelectContent items={seasonItems}>
        {(item) => (
          <SelectItem id={item.id} textValue={item.id.toString()}>
            {item.id.toString()}
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  )
}
