"use client"

import { compareItems, rankItem } from "@tanstack/match-sorter-utils"
import { useMemo, useState } from "react"
import {
  ALL_DIVISIONS,
  ALL_REGIONS,
  DivisionSelect,
  filterTeams,
  RegionSelect,
} from "@/app/team-filter-controls"
import { LastUpdatedStamp } from "@/components/last-updated-stamp"
import { TeamColorGrid } from "@/components/team-color-grid"
import {
  ComboBox,
  ComboBoxContent,
  ComboBoxInput,
  ComboBoxItem,
} from "@/components/ui/combo-box"
import { Container } from "@/components/ui/container"
import { Label } from "@/components/ui/field"
import { Heading } from "@/components/ui/heading"
import { Text } from "@/components/ui/text"
import { lastUpdated, type Team } from "@/lib/graphql"

/** Enough matches to find the right school without rendering the whole state. */
const MAX_MATCHES = 25

/** How many schools the grid shows before the visitor narrows it by region or division. */
const UNFILTERED_TILES = 24

interface HomePageProps {
  onSelectTeam: (teamId: string) => void
  season: number
  teams: Team[]
}

export function HomePage({ onSelectTeam, season, teams }: HomePageProps) {
  const [query, setQuery] = useState("")
  const [region, setRegion] = useState(ALL_REGIONS)
  const [division, setDivision] = useState(ALL_DIVISIONS)

  // Matching happens here rather than inside the ComboBox so that the list can be ranked by how
  // well each school name matches, and so that only the best matches are rendered.
  const matches = useMemo(() => {
    const search = query.trim()
    if (!search) return teams.slice(0, MAX_MATCHES)

    return teams
      .map((team) => ({ team, ranking: rankItem(team.name, search) }))
      .filter(({ ranking }) => ranking.passed)
      .sort((first, second) => compareItems(first.ranking, second.ranking))
      .slice(0, MAX_MATCHES)
      .map(({ team }) => team)
  }, [query, teams])

  const isFiltered = region !== ALL_REGIONS || division !== ALL_DIVISIONS

  // The API already sorts by rating, so the top of the list is the top of the state. Showing all
  // seven hundred schools at once is not useful, so the unfiltered grid is capped.
  const tiles = useMemo(() => {
    const matching = filterTeams(teams, { query: "", region, division })
    return isFiltered ? matching : matching.slice(0, UNFILTERED_TILES)
  }, [teams, region, division, isFiltered])

  return (
    <main>
      <Container className="max-w-5xl py-16 sm:py-20 lg:py-24">
        <Heading className="text-5xl/none sm:text-6xl/none">
          ohfootball<span className="text-primary">.io</span>
        </Heading>
        <Text className="mt-4 text-base/7 sm:text-lg/8">
          See how good your school's football team is.
        </Text>

        <div className="mt-8 max-w-2xl">
          {/* The matched teams are passed to the ComboBox itself, which tells React Aria that
              filtering is already handled and stops it from filtering a second time. */}
          <ComboBox
            allowsEmptyCollection
            inputValue={query}
            items={matches}
            onInputChange={setQuery}
            onChange={(teamId) => {
              if (teamId !== null) onSelectTeam(String(teamId))
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
        </div>

        <section className="mt-12" aria-labelledby="browse-heading">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Heading id="browse-heading" level={2} className="text-2xl/8">
                {isFiltered ? "Matching Schools" : "Top Rated"}
              </Heading>
              <Text className="mt-1 text-sm/6">
                {isFiltered
                  ? `${tiles.length.toLocaleString()} schools in ${season}.`
                  : `The ${UNFILTERED_TILES} best schools in ${season}. Pick a region or division to see more.`}
              </Text>
            </div>
            <div className="grid w-full grid-cols-2 gap-3 sm:w-auto sm:grid-cols-[11rem_11rem]">
              <RegionSelect onChange={setRegion} teams={teams} value={region} />
              <DivisionSelect onChange={setDivision} teams={teams} value={division} />
            </div>
          </div>

          <div className="mt-6">
            <TeamColorGrid
              label={isFiltered ? "Matching Schools" : "Top Rated Schools"}
              onSelectTeam={onSelectTeam}
              teams={tiles}
            />
          </div>
        </section>
      </Container>

      <LastUpdatedStamp isoDate={lastUpdated(teams)} />
    </main>
  )
}
