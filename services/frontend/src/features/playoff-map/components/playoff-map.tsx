"use client"

import { useMemo, useState } from "react"
import { Text } from "@/components/ui/text"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { PlayoffMapCanvas } from "@/features/playoff-map/components/playoff-map-canvas"
import { RegionStandings } from "@/features/playoff-map/components/region-standings"
import type {
  PlayoffMapDivision,
  PlayoffMapShape,
  PlayoffMapTeam,
} from "@/features/playoff-map/types"
import { latestRound, ownersAt, standings } from "@/features/playoff-map/utils/ownership"
import { formatShare, ROUND_NAMES } from "@/features/playoff-map/utils/view"
import { regionLabel } from "@/features/playoffs/utils/format"

interface PlayoffMapProps {
  map: PlayoffMapShape
  division: PlayoffMapDivision
}

/**
 * The playoff map of one division, with a choice of the round. It opens at the last round with a
 * result, and a round with no result yet cannot be chosen. A list for each region gives the same
 * facts as the map, for a keyboard and a screen reader.
 */
export function PlayoffMap({ map, division }: PlayoffMapProps) {
  const latest = useMemo(() => latestRound(division.regions), [division])
  const [round, setRound] = useState(latest)

  const owners = useMemo(
    () =>
      new Map(
        division.regions.flatMap((region) => [
          ...ownersAt(
            region.cells.map((cell) => cell.id),
            region.games,
            round,
          ),
        ]),
      ),
    [division, round],
  )
  const tables = useMemo(
    () =>
      division.regions.map((region) => ({
        region,
        standings: standings(region, round),
        championId:
          round >= 4
            ? (region.games.find((game) => game.round === 4 && game.winnerId)?.winnerId ?? null)
            : null,
      })),
    [division, round],
  )
  const detail = (team: PlayoffMapTeam, region: number) => {
    const share = tables
      .find((table) => table.region.region === region)
      ?.standings.find((standing) => standing.teamId === team.id)?.share
    return `Seed ${team.seed} · ${formatShare(share ?? 0)} of ${regionLabel(region)}`
  }

  return (
    <div className="mt-6">
      <div className="overflow-x-auto pb-1">
        <ToggleGroup
          aria-label="Round"
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={new Set([String(round)])}
          onSelectionChange={(keys) => setRound(Number([...keys][0]))}
        >
          {ROUND_NAMES.map((name, index) => (
            <ToggleGroupItem
              key={name}
              id={String(index)}
              isDisabled={index > latest}
              className="whitespace-nowrap"
            >
              {name}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      {latest === 0 && (
        <Text className="mt-2 text-xs/5">The rounds open here as the games are played.</Text>
      )}

      <div className="mt-4">
        <PlayoffMapCanvas
          map={map}
          division={division.division}
          regions={division.regions}
          owners={owners}
          detail={detail}
        />
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        {tables.map((table) => (
          <RegionStandings
            key={table.region.region}
            region={table.region}
            standings={table.standings}
            championId={table.championId}
          />
        ))}
      </div>
    </div>
  )
}
