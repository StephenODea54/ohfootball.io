// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { TeamCard } from "@/features/map/components/team-card"

afterEach(cleanup)

const team = { sourceId: "842", name: "Archbishop Hoban", rank: 12, rating: 52.74 }

describe("TeamCard", () => {
  it("links to the team page when it has a link, with its key for CSS", () => {
    render(
      <TeamCard
        team={team}
        label="NE Ohio"
        href="/teams/hoban"
        data-card="ne"
        style={{ "--tint": "#123456" } as React.CSSProperties}
      />,
    )

    const link = screen.getByRole("link")
    expect(link.getAttribute("href")).toBe("/teams/hoban")
    expect(link.getAttribute("data-card")).toBe("ne")
    expect(screen.getByText("#12 · +52.7")).toBeTruthy()
    expect(screen.getByText("NE Ohio")).toBeTruthy()
  })

  it("is only a label with no link", () => {
    const { container } = render(
      <TeamCard team={team} label="Summit" style={{}} className="extra" />,
    )

    expect(screen.queryByRole("link")).toBeNull()
    expect(container.firstElementChild?.tagName).toBe("DIV")
    expect(container.firstElementChild?.className).toContain("extra")
    expect(screen.getByText("Archbishop Hoban")).toBeTruthy()
  })
})
