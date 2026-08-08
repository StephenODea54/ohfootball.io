"use client"

import { compareItems, rankItem } from "@tanstack/match-sorter-utils"
import { useMemo, useState } from "react"
import {
  ComboBox,
  ComboBoxContent,
  ComboBoxInput,
  ComboBoxItem,
} from "@/components/ui/combo-box"
import { Container } from "@/components/ui/container"
import { Description, Label } from "@/components/ui/field"
import { Heading } from "@/components/ui/heading"
import { Text, TextLink } from "@/components/ui/text"
import type { Team } from "@/lib/graphql"
import { withSeason } from "@/lib/season"

/** Enough matches to find the right school without rendering the whole state. */
const MAX_MATCHES = 25

interface HomePageProps {
  onSelectTeam: (teamId: string) => void
  season: number
  teams: Team[]
}

export function HomePage({ onSelectTeam, season, teams }: HomePageProps) {
  const [query, setQuery] = useState("")

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

  return (
    <main>
      <Container className="max-w-3xl py-16 sm:py-24 lg:py-32">
        <Heading className="text-4xl/none sm:text-5xl/none">
          Ohio high school football, <span className="text-primary">predicted.</span>
        </Heading>
        <Text className="mt-4 text-base/7 sm:text-lg/8">
          Search for a school to see its rating, record, and what the numbers expect next.
        </Text>

        <div className="mt-8">
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
            <Label>Find your team</Label>
            <ComboBoxInput placeholder="Start typing a school name…" />
            <Description>
              {teams.length > 0
                ? `${teams.length.toLocaleString()} schools played in ${season}.`
                : `No schools have been recorded for ${season} yet.`}
            </Description>
            <ComboBoxContent
              items={matches}
              renderEmptyState={() => (
                <div className="px-3 py-6 text-center text-sm/6 text-muted-fg">
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

        <Text className="mt-10 text-sm/6">
          Want the whole field at once? Open the{" "}
          <TextLink href={withSeason("/leaderboard", season)}>{season} leaderboard</TextLink>, or read
          how the <TextLink href={withSeason("/methodology", season)}>ratings are built</TextLink>.
        </Text>
      </Container>
    </main>
  )
}
