"use client"

import { useMemo, useState } from "react"
import { ComboBox, ComboBoxContent, ComboBoxInput, ComboBoxItem } from "@/components/ui/combo-box"
import { Label } from "@/components/ui/field"
import { openTeam } from "@/features/teams/utils/open-team"
import { rankTeams } from "@/features/teams/utils/rank-teams"
import type { TeamSummary } from "@/types/api"

/** Enough matches to find the right school without rendering the whole state. */
const MAX_MATCHES = 25

interface TeamSearchProps {
  teams: TeamSummary[]
}

/** A name search over every school in the loaded season. */
export function TeamSearch({ teams }: TeamSearchProps) {
  const [query, setQuery] = useState("")

  // Matching happens here rather than inside the ComboBox so that the list can be ranked by how
  // well each school name matches, and so that only the best matches are rendered.
  const matches = useMemo(() => rankTeams(teams, query, MAX_MATCHES), [query, teams])

  return (
    // The matched teams are passed to the ComboBox itself, which tells React Aria that filtering is
    // already handled and stops it from filtering a second time.
    <ComboBox
      allowsEmptyCollection
      inputValue={query}
      items={matches}
      onInputChange={setQuery}
      onChange={(teamId) => {
        if (teamId !== null) openTeam(String(teamId))
      }}
    >
      <Label>Find Your School</Label>
      <ComboBoxInput placeholder="Start typing a school name…" />
      <ComboBoxContent
        items={matches}
        renderEmptyState={() => (
          <div className="px-3 py-6 text-center text-muted-fg text-sm/6">
            No school matches that name.
          </div>
        )}
      >
        {(team) => (
          <ComboBoxItem id={team.id} textValue={team.name}>
            {team.name}
          </ComboBoxItem>
        )}
      </ComboBoxContent>
    </ComboBox>
  )
}
