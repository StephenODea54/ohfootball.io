"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Heading } from "@/components/ui/heading"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import {
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Text } from "@/components/ui/text"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { loadRegion } from "@/features/playoffs/api/load-region"
import { HowItWorks } from "@/features/playoffs/components/how-it-works"
import { OddsTable } from "@/features/playoffs/components/odds-table"
import { RegionPanel } from "@/features/playoffs/components/region-panel"
import { TeamDetails } from "@/features/playoffs/components/team-details"
import type { PlayoffMap } from "@/features/playoffs/server/region-map"
import type { PlayoffRow, RegionData, RegionKey } from "@/features/playoffs/types"
import { divisionLabel, regionLabel } from "@/features/playoffs/utils/format"
import { divisionsOf, type Selection, selectionFrom } from "@/features/playoffs/utils/view"

interface PlayoffOddsProps {
  regions: RegionKey[]
  /** The rows of the first region, which the page draws ahead of time. */
  first: { region: number; data: RegionData }
  qualifiers: number
  byes: number
  runs: number
  map: PlayoffMap | null
}

/**
 * Writes a choice into the address of the page. It replaces the entry of the history, so Back
 * leaves the page and does not step through the regions that a visitor looked at.
 */
function writeSelection(selection: Selection) {
  const url = new URL(window.location.href)
  url.searchParams.set("division", String(selection.division))
  url.searchParams.set("region", String(selection.region))
  window.history.replaceState(null, "", url)
}

/**
 * The odds of one region at a time. The division and the region live in the query string, so a
 * link opens the same region. The page carries the rows of the first region, and the rows of any
 * other region load from the file of that region. A team opens its details in a sheet.
 */
export function PlayoffOdds({ regions, first, qualifiers, byes, runs, map }: PlayoffOddsProps) {
  const divisions = useMemo(() => divisionsOf(regions), [regions])
  const [selection, setSelection] = useState<Selection | null>(() => selectionFrom("", divisions))
  const [rows, setRows] = useState<Record<number, PlayoffRow[] | "failed">>({
    [first.region]: first.data.rows,
  })
  const [open, setOpen] = useState(false)
  // The team stays after the sheet closes, so the sheet does not empty while it slides away.
  const [team, setTeam] = useState<PlayoffRow | null>(null)
  const toggles = useRef<HTMLDivElement>(null)

  const choose = (next: Selection) => {
    setSelection(next)
    writeSelection(next)
  }

  // The page is drawn ahead of time without a query string, so the choice of a link applies after
  // the page loads. The address then holds the choice that the page shows.
  useEffect(() => {
    const chosen = selectionFrom(window.location.search, divisions)
    if (!chosen) return
    setSelection(chosen)
    writeSelection(chosen)
    toggles.current
      ?.querySelector(`[data-division="${chosen.division}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "center" })
  }, [divisions])

  const region = selection?.region
  useEffect(() => {
    if (region === undefined || rows[region] !== undefined) return
    loadRegion(region).then(
      (data) => setRows((known) => ({ ...known, [region]: data.rows })),
      () => setRows((known) => ({ ...known, [region]: "failed" })),
    )
  }, [region, rows])

  if (!selection) return null
  const regionNumbers =
    divisions.find((item) => item.division === selection.division)?.regions ?? []
  const shown = rows[selection.region]

  return (
    <div className="mt-8">
      <div ref={toggles} className="overflow-x-auto pb-1">
        <ToggleGroup
          aria-label="Division"
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={new Set([String(selection.division)])}
          onSelectionChange={(keys) => {
            const division = Number([...keys][0])
            const next = divisions.find((item) => item.division === division)
            if (next) choose({ division, region: next.regions[0] })
          }}
        >
          {divisions.map((item) => (
            <ToggleGroupItem
              key={item.division}
              id={String(item.division)}
              data-division={item.division}
              className="whitespace-nowrap"
            >
              {divisionLabel(item.division)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section aria-labelledby="odds-heading" className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <Heading id="odds-heading" level={2} className="text-2xl/8">
                {divisionLabel(selection.division)}
              </Heading>
              <Text className="text-xs/5">Select a team to see what each of its games means.</Text>
            </div>
            <Select
              aria-label="Region"
              className="w-40"
              value={selection.region}
              onChange={(next) =>
                next !== null && choose({ division: selection.division, region: Number(next) })
              }
            >
              <SelectTrigger />
              <SelectContent items={regionNumbers.map((number) => ({ id: number }))}>
                {(item) => <SelectItem id={item.id}>{regionLabel(item.id)}</SelectItem>}
              </SelectContent>
            </Select>
          </div>
          {shown === undefined && <Text>Loading the odds of this region…</Text>}
          {shown === "failed" && (
            <Text>The odds of this region did not load. Try again later.</Text>
          )}
          {Array.isArray(shown) && (
            <OddsTable
              label={`${regionLabel(selection.region)} playoff odds`}
              teams={shown}
              qualifiers={qualifiers}
              byes={byes}
              onSelect={(sourceId) => {
                setTeam(shown.find((item) => item.sourceId === sourceId) ?? null)
                setOpen(true)
              }}
            />
          )}
        </section>

        <aside className="flex flex-col gap-6">
          <RegionPanel
            region={selection.region}
            map={
              map
                ? {
                    width: map.width,
                    height: map.height,
                    outline: map.outline,
                    shapes: map.divisions[selection.division] ?? [],
                  }
                : null
            }
          />
          <HowItWorks runs={runs} />
        </aside>
      </div>

      <SheetContent
        isOpen={open}
        onOpenChange={setOpen}
        aria-label={team ? `${team.name} playoff odds` : "Playoff odds"}
        className="sm:max-w-lg"
      >
        {team && (
          <>
            <SheetHeader>
              <SheetTitle>{team.name}</SheetTitle>
              <SheetDescription>
                {team.record}, {regionLabel(selection.region)}
              </SheetDescription>
            </SheetHeader>
            <SheetBody>
              <TeamDetails region={selection.region} sourceId={team.sourceId} />
            </SheetBody>
          </>
        )}
      </SheetContent>
    </div>
  )
}
