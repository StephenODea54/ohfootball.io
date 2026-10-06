// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LeaderboardPagination } from "@/features/teams/components/leaderboard-pagination"

afterEach(cleanup)

function Pages({ start, pageCount }: { start: number; pageCount: number }) {
  const [page, setPage] = useState(start)
  return <LeaderboardPagination page={page} pageCount={pageCount} onChange={setPage} />
}

describe("LeaderboardPagination", () => {
  it("shows nothing for one page", () => {
    const { container } = render(
      <LeaderboardPagination page={1} pageCount={1} onChange={() => {}} />,
    )

    expect(container.innerHTML).toBe("")
  })

  it("marks the current page", () => {
    render(<LeaderboardPagination page={2} pageCount={3} onChange={() => {}} />)

    expect(screen.getByRole("button", { name: "Page 2" }).getAttribute("aria-current")).toBe("page")
    expect(screen.getByRole("button", { name: "Page 1" }).hasAttribute("aria-current")).toBe(false)
  })

  it("disables Previous on the first page and Next on the last page", () => {
    const { rerender } = render(
      <LeaderboardPagination page={1} pageCount={3} onChange={() => {}} />,
    )
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Previous page" }).disabled).toBe(
      true,
    )

    rerender(<LeaderboardPagination page={3} pageCount={3} onChange={() => {}} />)
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Next page" }).disabled).toBe(true)
  })

  it("asks for the page that the visitor chose", () => {
    const onChange = vi.fn()
    render(<LeaderboardPagination page={2} pageCount={3} onChange={onChange} />)

    fireEvent.click(screen.getByRole("button", { name: "Previous page" }))
    fireEvent.click(screen.getByRole("button", { name: "Next page" }))
    fireEvent.click(screen.getByRole("button", { name: "Page 3" }))

    expect(onChange.mock.calls).toEqual([[1], [3], [3]])
  })

  it("shows gaps for the pages that it leaves out", () => {
    render(<LeaderboardPagination page={8} pageCount={15} onChange={() => {}} />)

    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "",
      "1",
      "8",
      "15",
      "",
    ])
    expect(screen.getAllByText("…")).toHaveLength(2)
  })

  it("moves focus to the current page when Next becomes disabled", () => {
    render(<Pages start={2} pageCount={3} />)
    const next = screen.getByRole("button", { name: "Next page" })
    act(() => next.focus())

    fireEvent.click(next)

    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Page 3" }))
  })

  it("keeps focus on Next while it can still be pressed", () => {
    render(<Pages start={1} pageCount={3} />)
    const next = screen.getByRole("button", { name: "Next page" })
    act(() => next.focus())

    fireEvent.click(next)

    expect(document.activeElement).toBe(next)
  })
})
