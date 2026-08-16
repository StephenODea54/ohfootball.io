"use client"

import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"

interface SeasonSelectProps {
  className?: string
  onSeasonChange: (season: number) => void
  season: number | undefined
  seasons: number[]
}

/** Season picker shown in the navbar. It drives every season-aware page. */
export function SeasonSelect({ className, onSeasonChange, season, seasons }: SeasonSelectProps) {
  const items = seasons.map((value) => ({ id: value }))

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
      <SelectContent items={items}>
        {(item) => (
          <SelectItem id={item.id} textValue={item.id.toString()}>
            {item.id.toString()}
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  )
}
