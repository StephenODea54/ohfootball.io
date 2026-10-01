import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { CompareLegend } from "@/features/compare/components/compare-legend"
import { CompareNotice } from "@/features/compare/components/compare-notice"
import { CompareSeasonTable } from "@/features/compare/components/compare-season-table"
import { CompareView } from "@/features/compare/components/compare-view"
import { HeadToHeadCard } from "@/features/compare/components/head-to-head-card"
import { MeetingsTable } from "@/features/compare/components/meetings-table"
import { ProgramPicker } from "@/features/compare/components/program-picker"
import type { ProgramHistory } from "@/features/compare/types"
import { headToHead } from "@/features/compare/utils/head-to-head"
import { toProgramOption } from "@/features/compare/utils/program-history"
import { mergeSeasonSeries } from "@/features/compare/utils/season-series"
import type { ProgramGame, TeamSummary } from "@/types/api"

function game(date: string, result: ProgramGame["result"], playoff = false): ProgramGame {
  return {
    season: Number(date.slice(0, 4)),
    date,
    opponentSourceId: "306",
    result,
    teamScore: result === "LOSS" ? 7 : 21,
    opponentScore: result === "WIN" ? 7 : 21,
    playoff,
  }
}

const massillon: ProgramHistory = {
  sourceId: "1624",
  name: "Massillon Washington",
  teamId: "massillon-2026",
  seasons: [
    { season: 2024, rating: 18, rank: 20, asOf: "2024-12-31" },
    { season: 2026, rating: 22.4, rank: 12, asOf: "2026-09-29" },
  ],
  games: [game("2024-10-19", "WIN"), game("2024-11-15", "TIE", true), game("2025-10-18", "LOSS")],
}

const mckinley: ProgramHistory = {
  sourceId: "306",
  name: "Canton McKinley",
  teamId: "mckinley-2026",
  seasons: [{ season: 2025, rating: -3, rank: 300, asOf: "2025-12-31" }],
  games: [],
}

const label = (season: number) => (season === 2026 ? "2026 so far" : `${season}`)

describe("CompareLegend", () => {
  it("shows each school with its line, its page, and its standing this season", () => {
    const html = renderToStaticMarkup(<CompareLegend a={massillon} b={mckinley} season={2026} />)

    expect(html).toContain('href="/teams/massillon-2026"')
    expect(html).toContain("#12")
    expect(html).toContain("+22")
    expect(html).toContain("Not rated in 2026")
    expect(html).toContain('stroke-dasharray="6 3"')
    expect(html).not.toContain("background-color:#FF6600")
  })

  it("leaves out a side with no school", () => {
    const html = renderToStaticMarkup(<CompareLegend a={null} b={mckinley} season={2026} />)

    expect(html).not.toContain("Massillon")
    expect(html).toContain("Canton McKinley")
  })
})

describe("CompareNotice", () => {
  it("is a live region that shows the message", () => {
    expect(renderToStaticMarkup(<CompareNotice message="Pick two different schools." />)).toContain(
      'role="status"',
    )
    expect(renderToStaticMarkup(<CompareNotice message={null} />)).toContain('role="status"')
  })
})

describe("CompareSeasonTable", () => {
  it("shows each season newest first, with a dash for a season not played", () => {
    const rows = mergeSeasonSeries(massillon.seasons, mckinley.seasons)
    const html = renderToStaticMarkup(
      <CompareSeasonTable
        rows={rows}
        nameA="Massillon Washington"
        nameB="Canton McKinley"
        seasonLabel={label}
      />,
    )

    expect(html.indexOf("2026 so far")).toBeLessThan(html.indexOf("2024"))
    expect(html).toContain("—")
    expect(html).toContain("+18")
    expect(html).toContain("#300")
  })
})

describe("HeadToHeadCard", () => {
  it("lists the meetings, the series, and the streak", () => {
    const html = renderToStaticMarkup(
      <HeadToHeadCard
        record={headToHead(massillon, "306")}
        nameA="Massillon Washington"
        nameB="Canton McKinley"
      />,
    )

    expect(html).toMatch(/Total Meetings<\/dt><dd[^>]*>3<\/dd>/)
    expect(html).toMatch(/Record<\/dt><dd[^>]*>Series tied 1–1–1<\/dd>/)
    expect(html).not.toContain("Playoffs")
    expect(html).toContain("First Meeting")
    expect(html).toContain("Canton McKinley won the last meeting")
    expect(html).not.toContain("3 meetings")
  })

  it("shows one meeting", () => {
    const html = renderToStaticMarkup(
      <HeadToHeadCard
        record={headToHead({ games: [game("2024-10-19", "WIN")] }, "306")}
        nameA="Massillon Washington"
        nameB="Canton McKinley"
      />,
    )

    expect(html).toMatch(/Total Meetings<\/dt><dd[^>]*>1<\/dd>/)
    expect(html).toMatch(/Record<\/dt><dd[^>]*>Massillon Washington leads 1–0<\/dd>/)
  })
})

describe("HeadToHeadCard with no meetings", () => {
  it("shows only the count", () => {
    const html = renderToStaticMarkup(
      <HeadToHeadCard
        record={headToHead({ games: [] }, "306")}
        nameA="Massillon Washington"
        nameB="Canton McKinley"
      />,
    )

    expect(html).toMatch(/Total Meetings<\/dt><dd[^>]*>0<\/dd>/)
    expect(html).not.toContain("Record")
    expect(html).not.toContain("Streak")
  })
})

describe("MeetingsTable", () => {
  it("shows every meeting with its winner and a playoff badge", () => {
    const html = renderToStaticMarkup(
      <MeetingsTable
        meetings={headToHead(massillon, "306").meetings}
        nameA="Massillon Washington"
        nameB="Canton McKinley"
      />,
    )

    expect(html).toContain("Playoff")
    expect(html).toContain("Regular")
    expect(html).toContain("Tie")
    expect(html).toContain("7–21")
  })
})

const team = {
  id: "massillon-2026",
  season: 2026,
  sourceId: "1624",
  name: "Massillon Washington",
  mascot: null,
  city: null,
  division: null,
  region: null,
  primaryColor: null,
  secondaryColor: null,
  record: { wins: 0, losses: 0, ties: 0 },
  outOfStateGamesPlayed: 0,
  county: null,
  rating: null,
} satisfies TeamSummary
const programs = [
  toProgramOption(team),
  toProgramOption({ ...team, id: "b", sourceId: "306", name: "Canton McKinley" }),
]

describe("ProgramPicker", () => {
  it("shows the name of the chosen school in the field", () => {
    const html = renderToStaticMarkup(
      <ProgramPicker
        label="First School"
        programs={programs}
        selectedKey="1624"
        onSelectionChange={() => {}}
        excludeSourceId="306"
      />,
    )

    expect(html).toContain("First School")
    expect(html).toContain('value="Massillon Washington"')
  })

  it("shows an empty field when no school is chosen", () => {
    const html = renderToStaticMarkup(
      <ProgramPicker
        label="Second School"
        programs={programs}
        selectedKey={null}
        onSelectionChange={() => {}}
      />,
    )

    expect(html).toContain('value=""')
  })
})

describe("CompareView", () => {
  it("asks for two schools before the address is read", () => {
    const html = renderToStaticMarkup(<CompareView season={2026} programs={programs} />)

    expect(html).toContain("Pick two schools")
    expect(html).toContain("First School")
    expect(html).toContain("Second School")
  })
})
