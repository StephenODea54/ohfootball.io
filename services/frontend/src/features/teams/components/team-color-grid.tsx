"use client"

import { twJoin } from "tailwind-merge"
import {
  GridList,
  GridListDescription,
  GridListItem,
  GridListLabel,
} from "@/components/ui/grid-list"
import { formatRank, formatRating, ratingTone } from "@/features/teams/utils/format"
import { openTeam } from "@/features/teams/utils/open-team"
import { teamSwatches } from "@/features/teams/utils/team-colors"
import type { TeamSummary } from "@/types/api"

interface TeamColorGridProps {
  label: string
  teams: TeamSummary[]
}

/**
 * A grid of school cards. The card itself stays in the site palette. Each school's own colors sit
 * in two small swatches along the bottom, which is enough to recognize a school without letting
 * seven hundred unrelated colors take over the page.
 *
 * Each card shows the rank and the rating of the school above its name, so the order of the grid
 * is never the only sign of how good a school is. The rank is the rank across the whole state.
 */
export function TeamColorGrid({ label, teams }: TeamColorGridProps) {
  return (
    <GridList
      aria-label={label}
      // The base style is a bordered, divided list. A card grid needs none of that chrome.
      className="grid grid-cols-1 gap-3 divide-y-0 overflow-visible rounded-none border-0 bg-transparent p-0 sm:grid-cols-2 lg:grid-cols-3 dark:bg-transparent"
      items={teams}
      // "grid" tells React Aria the items wrap, so the arrow keys move in two directions.
      layout="grid"
      onAction={(teamId) => openTeam(String(teamId))}
      renderEmptyState={() => (
        <p className="col-span-full py-10 text-center text-muted-fg text-sm/6">
          No school matches those filters.
        </p>
      )}
      selectionMode="none"
    >
      {(team) => {
        const swatches = teamSwatches(team.primaryColor, team.secondaryColor)

        return (
          <GridListItem
            className="flex h-full cursor-pointer flex-col items-start gap-0 rounded-xl border bg-card px-4 py-3.5 transition hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
            id={team.id}
            textValue={team.name}
          >
            {/* React Aria names the row with the text value and this description, so a screen
                reader hears the rank and the rating with the name of the school. */}
            <GridListDescription className="mb-2 flex w-full items-baseline justify-between gap-3 text-sm/5">
              {team.rating ? (
                <>
                  <span className="font-semibold text-fg tabular-nums">
                    <span className="sr-only">Rank </span>
                    {formatRank(team.rating.rank)}
                  </span>
                  <span className="tabular-nums">
                    <span className="me-1.5 font-medium text-muted-fg text-xs/5 uppercase tracking-wide">
                      Rating
                    </span>
                    <span
                      className={twJoin("font-semibold text-base/5", ratingTone(team.rating.value))}
                    >
                      {formatRating(team.rating.value)}
                    </span>
                  </span>
                </>
              ) : (
                <span>Unrated</span>
              )}
            </GridListDescription>
            <GridListLabel className="font-semibold text-base/6 text-fg">{team.name}</GridListLabel>
            <p className="text-muted-fg text-sm/5">{team.mascot ?? "—"}</p>

            {swatches.length > 0 && (
              <div className="mt-3 flex gap-1.5" aria-hidden="true">
                {swatches.map((color) => (
                  <span
                    key={color}
                    // Every swatch is outlined. A white swatch would otherwise vanish on a light
                    // card, and a black one would vanish on a dark card.
                    className="size-4 rounded-sm border"
                    // The color is per school, so it cannot come from a Tailwind class.
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            )}
          </GridListItem>
        )
      }}
    </GridList>
  )
}
