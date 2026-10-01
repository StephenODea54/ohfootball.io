import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { ExactMarginsTable } from "@/features/accuracy/components/exact-margins-table"
import { ScoredGamesTable } from "@/features/accuracy/components/scored-games-table"
import { UpsetsTable } from "@/features/accuracy/components/upsets-table"
import { linkScoredTeams } from "@/features/accuracy/utils/team-links"
import type { ScoredGame } from "@/types/api"

const ignatius: ScoredGame = {
  id: "ignatius-edward",
  season: 2004,
  date: "2004-10-16",
  winner: { id: "ignatius", sourceId: "1354", name: "St Ignatius", score: 26 },
  loser: { id: "edward", sourceId: "1346", name: "St Edward", score: 10 },
  winnerProbability: 0.8257,
  winnerPredictedMargin: 15.54,
}

const wayne: ScoredGame = {
  id: "wayne-northmont",
  season: 2026,
  date: "2026-09-25",
  winner: { id: "wayne", sourceId: "1638", name: "Wayne", score: 49 },
  loser: { id: "northmont", sourceId: "1142", name: "Northmont", score: null },
  winnerProbability: 0.962,
  winnerPredictedMargin: 25.36,
}

const games = linkScoredTeams([ignatius, wayne], 2026, new Set(["ignatius", "wayne", "northmont"]))

describe("ScoredGamesTable", () => {
  it("shows the winner, the loser, the value, and the date of each game", () => {
    const html = renderToStaticMarkup(
      <ScoredGamesTable
        games={games}
        label="Some games"
        header="Value"
        cell={(game) => `value of ${game.id}`}
      />,
    )

    expect(html).toContain('aria-label="Some games"')
    expect(html).toContain(">Value<")
    expect(html).toContain("value of ignatius-edward")
    expect(html).toContain("value of wayne-northmont")
    expect(html).toContain("beat St Edward 10")
    // A loser without a score shows only its name under the winner.
    expect(html).toContain("beat Northmont<")
    expect(html).toContain("Oct 16, 2004")
  })

  it("links only the teams of the current season", () => {
    const html = renderToStaticMarkup(
      <ScoredGamesTable games={games} label="Some games" header="Value" cell={() => null} />,
    )

    expect(html).toContain('href="/teams/wayne"')
    expect(html).toContain('href="/teams/northmont"')
    expect(html).not.toContain('href="/teams/ignatius"')
  })
})

describe("UpsetsTable", () => {
  it("shows the chance of the winner in a danger badge", () => {
    const html = renderToStaticMarkup(<UpsetsTable games={games} label="Upsets" />)

    expect(html).toContain("Winner’s </span>Chance")
    expect(html).toContain("82.6%")
    expect(html).toContain("--color-danger-subtle")
  })
})

describe("ExactMarginsTable", () => {
  it("shows the call of the model in a success badge", () => {
    const html = renderToStaticMarkup(<ExactMarginsTable games={games} label="Exact margins" />)

    expect(html).toContain('aria-label="Exact margins"')
    expect(html).toContain(">Call<")
    expect(html).toContain(">W by 16<")
    expect(html).toContain(">W by 25<")
    expect(html).toContain("--color-success-subtle")
    expect(html).not.toContain("82.6%")
  })
})
