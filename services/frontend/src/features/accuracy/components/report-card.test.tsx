import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { ReportCard } from "@/features/accuracy/components/report-card"
import type { ReportCard as ReportCardData } from "@/features/accuracy/utils/chart-data"
import { type LinkedScoredGame, linkScoredTeams } from "@/features/accuracy/utils/team-links"
import type { ScoredGame } from "@/types/api"

const card: ReportCardData = {
  week: 6,
  correct: 293,
  decided: 337,
  exactMargins: 5,
  expected: 295,
  accuracy: 0.8694,
  brierScore: 0.0869,
  pending: 0,
}

function game(id: string, winnerProbability: number, winnerPredictedMargin: number): ScoredGame {
  return {
    id,
    season: 2026,
    date: "2026-09-25",
    winner: { id: `${id}-winner`, sourceId: "1", name: `Winner ${id}`, score: 21 },
    loser: { id: `${id}-loser`, sourceId: "2", name: `Loser ${id}`, score: 14 },
    winnerProbability,
    winnerPredictedMargin,
  }
}

const upsets = linkScoredTeams([game("upset", 0.0735, -19.9)], 2026, new Set(["upset-winner"]))
const exact = linkScoredTeams([game("exact", 0.7, 6.8)], 2026, new Set(["exact-winner"]))

function render(data: ReportCardData, exactMargins: LinkedScoredGame[] = exact) {
  return renderToStaticMarkup(
    <ReportCard card={data} upsets={upsets} exactMargins={exactMargins} />,
  )
}

describe("ReportCard", () => {
  it("grades the week", () => {
    const html = render(card)

    expect(html).toContain("86.9%")
    expect(html).toContain("293 of 337")
    expect(html).toContain("295.0")
    expect(html).toContain("0.0869")
    expect(html).toContain("The model called the exact margin in 5 of 337 games with a winner.")
    expect(html).not.toContain("no result yet")
  })

  it("lists the upsets and the exact margins of the week", () => {
    const html = render(card)

    expect(html).toContain("Biggest upsets of the week")
    expect(html).toContain("7.3% chance")
    expect(html).toContain("Exact margins of the week")
    expect(html).toContain("Called W by 7")
    expect(html).toContain('href="/teams/exact-winner"')
    expect(html).not.toContain('href="/teams/exact-loser"')
    expect(html.indexOf("Biggest upsets")).toBeLessThan(html.indexOf("Exact margins"))
  })

  it("hides the exact margins when the week has none", () => {
    const html = render({ ...card, exactMargins: 0 }, [])

    expect(html).not.toContain("Exact margins of the week")
    expect(html).toContain("Biggest upsets of the week")
    expect(html).toContain("The model called the exact margin in 0 of 337 games with a winner.")
  })

  it("counts one game", () => {
    const html = render({ ...card, decided: 1, correct: 1, exactMargins: 1, pending: 1 })

    expect(html).toContain("The model called the exact margin in 1 of 1 game with a winner.")
    expect(html).toContain("1 game of the week has no result yet.")
  })

  it("hides the count when the week has no game with a winner", () => {
    const html = render({ ...card, decided: 0, correct: 0, exactMargins: 0 }, [])

    expect(html).not.toContain("The model called the exact margin")
  })

  it("counts the pending games", () => {
    expect(render({ ...card, pending: 3 })).toContain("3 games of the week have no result yet.")
  })
})
