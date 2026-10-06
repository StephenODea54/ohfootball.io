// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { PickemResult } from "@/features/pickem/contract"
import type { TeamPick } from "@/features/pickem/utils/team-picks"
import {
  type ScheduleGame,
  TeamScheduleTable,
} from "@/features/teams/components/team-schedule-table"

const flag = vi.hoisted(() => ({ on: true }))
vi.mock("astro:env/client", () => ({
  get PUBLIC_PICKEM() {
    return flag.on
  },
}))

const OPEN = "00000000-0000-4000-8000-000000000001"
const LATER = "00000000-0000-4000-8000-000000000002"
const LOCKED = "00000000-0000-4000-8000-000000000003"
const WON = "00000000-0000-4000-8000-000000000004"
const LOST = "00000000-0000-4000-8000-000000000005"
const TIED = "00000000-0000-4000-8000-000000000006"

/** Far in the future and far in the past, so the tests do not depend on the clock. */
const FUTURE = "2999-01-01T05:00:00.000Z"
const PAST = "2000-01-01T05:00:00.000Z"

function pick(gameKey: string, overrides: Partial<TeamPick> = {}): TeamPick {
  return { gameKey, side: "a", lockAt: FUTURE, winner: null, ...overrides }
}

function game(
  id: string,
  opponentName: string,
  gamePick: TeamPick | null,
  result: ScheduleGame["result"] = "UNKNOWN",
): ScheduleGame {
  return {
    id,
    week: 7,
    date: "2026-10-09",
    opponentId: opponentName.toLowerCase(),
    opponentName,
    location: "HOME",
    result,
    teamScore: result === "UNKNOWN" ? null : 21,
    opponentScore: result === "UNKNOWN" ? null : 14,
    playoff: false,
    notes: null,
    prediction: null,
    opponentHref: null,
    opponentStanding: null,
    opponentSourceId: null,
    pick: gamePick,
  }
}

function team(...schedule: ScheduleGame[]) {
  return { name: "Massillon", schedule }
}

/** An IntersectionObserver that reports an element in view only when the test says so. */
class FakeObserver {
  static all: FakeObserver[] = []
  readonly targets: Element[] = []
  constructor(readonly callback: IntersectionObserverCallback) {
    FakeObserver.all.push(this)
  }
  observe(target: Element) {
    this.targets.push(target)
  }
  disconnect() {
    this.targets.length = 0
  }
  static showAll() {
    for (const observer of [...FakeObserver.all]) {
      if (observer.targets.length === 0) continue
      const entries = observer.targets.map((target) => ({ target, isIntersecting: true }))
      observer.callback(entries as IntersectionObserverEntry[], observer as never)
    }
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

interface Board {
  address?: "known" | "unknown"
  picks?: Record<string, "a" | "b">
  tallies?: Record<string, { a: number; b: number }>
}

/** Answers the picks Function. `write` answers each PUT and DELETE. */
function serve(board: Board | Response, write?: (init: RequestInit, url: string) => Response) {
  const fetch = vi.fn(async (url: string, init: RequestInit = {}) => {
    if (url === "/picks/board") {
      return board instanceof Response
        ? board
        : json({ address: "known", cutoff: "2026-09-26", picks: {}, tallies: {}, ...board })
    }
    if (!write) throw new Error(`no answer for ${url}`)
    return write(init, url)
  })
  vi.stubGlobal("fetch", fetch)
  return fetch
}

/** Waits for the script of the picks, then brings the games into view. */
async function showBoard() {
  await screen.findByRole("link", { name: "How picks work" })
  await act(async () => FakeObserver.showAll())
}

beforeEach(() => {
  flag.on = true
  FakeObserver.all = []
  vi.stubGlobal("IntersectionObserver", FakeObserver)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** The toggle button with the name, and whether it is pressed. */
function thumb(name: string) {
  return screen.getByRole("button", { name })
}

function isPressed(name: string) {
  return thumb(name).getAttribute("aria-pressed") === "true"
}

describe("TeamScheduleTable picks", () => {
  it("has no Pick column when Pick 'Em is off", () => {
    flag.on = false
    const fetch = serve({})

    render(<TeamScheduleTable team={team(game(OPEN, "McKinley", pick(OPEN)))} />)

    expect(screen.queryByRole("columnheader", { name: "Pick" })).toBeNull()
    expect(screen.queryByText("How picks work")).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it("has no Pick column when no game takes picks", () => {
    serve({})

    render(<TeamScheduleTable team={team(game(OPEN, "McKinley", null))} />)

    expect(screen.queryByRole("columnheader", { name: "Pick" })).toBeNull()
    expect(screen.queryByText("How picks work")).toBeNull()
  })

  it("loads the board once, when a game first comes into view, for every game", async () => {
    const fetch = serve({ tallies: { [OPEN]: { a: 2, b: 1 } } })

    render(
      <TeamScheduleTable
        team={team(game(OPEN, "McKinley", pick(OPEN)), game(LATER, "Perry", pick(LATER)))}
      />,
    )

    const link = await screen.findByRole("link", { name: "How picks work" })
    expect(link.getAttribute("href")).toBe("/privacy")
    expect(screen.getByText(/Thumbs up picks this team to win/)).toBeTruthy()
    const headers = screen.getAllByRole("columnheader").map((header) => header.textContent)
    expect(headers.at(-1)).toBe("Pick")
    expect(headers.at(-2)).toBe("Result")
    const skeletons = document.querySelectorAll("[data-slot=skeleton]")
    expect(skeletons).toHaveLength(2)
    for (const skeleton of skeletons) expect(skeleton.getAttribute("aria-hidden")).toBe("true")
    expect(fetch).not.toHaveBeenCalled()

    await showBoard()
    await showBoard()

    expect(
      await screen.findByRole("toolbar", { name: "Pick the winner of Massillon vs McKinley" }),
    ).toBeTruthy()
    expect(screen.getByRole("toolbar", { name: "Pick the winner of Massillon vs Perry" }))
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(screen.getByText("2 picks for Massillon, 1 pick for McKinley.")).toBeTruthy()
    expect(screen.getByText("0 picks for Massillon, 0 picks for Perry.")).toBeTruthy()
  })

  it("says once that the picks load", async () => {
    let answer: (response: Response) => void = () => {}
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((resolve) => (answer = resolve))),
    )
    render(
      <TeamScheduleTable
        team={team(game(OPEN, "McKinley", pick(OPEN)), game(LATER, "Perry", pick(LATER)))}
      />,
    )
    await showBoard()

    expect(screen.getAllByText("Loading picks")).toHaveLength(1)
    expect(screen.getByRole("status").textContent).toBe("Loading picks")

    await act(async () =>
      answer(json({ address: "known", cutoff: "2026-09-26", picks: {}, tallies: {} })),
    )
    expect(screen.queryByText("Loading picks")).toBeNull()
  })

  it("picks the team with thumbs up, then the tally from the Function", async () => {
    const fetch = serve({ tallies: { [OPEN]: { a: 2, b: 1 } } }, () =>
      json({ gameKey: OPEN, myPick: "a", tally: { a: 5, b: 1 } }),
    )
    render(<TeamScheduleTable team={team(game(OPEN, "McKinley", pick(OPEN)))} />)
    await showBoard()

    fireEvent.click(await screen.findByRole("button", { name: "Massillon wins" }))

    expect(isPressed("Massillon wins")).toBe(true)
    expect(isPressed("McKinley wins")).toBe(false)
    expect(screen.getByText("3 picks for Massillon, 1 pick for McKinley.")).toBeTruthy()
    expect(await screen.findByText("5 picks for Massillon, 1 pick for McKinley.")).toBeTruthy()
    expect(fetch).toHaveBeenCalledWith(`/picks/${OPEN}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: '{"side":"a"}',
    })
  })

  it("switches the pick to the other side", async () => {
    const fetch = serve({ picks: { [OPEN]: "a" }, tallies: { [OPEN]: { a: 1, b: 0 } } }, () =>
      json({ gameKey: OPEN, myPick: "b", tally: { a: 0, b: 1 } }),
    )
    render(<TeamScheduleTable team={team(game(OPEN, "McKinley", pick(OPEN)))} />)
    await showBoard()

    fireEvent.click(await screen.findByRole("button", { name: "McKinley wins" }))

    expect(isPressed("McKinley wins")).toBe(true)
    expect(isPressed("Massillon wins")).toBe(false)
    expect(screen.getByText("0 picks for Massillon, 1 pick for McKinley.")).toBeTruthy()
    expect(fetch).toHaveBeenCalledWith(
      `/picks/${OPEN}`,
      expect.objectContaining({ body: '{"side":"b"}' }),
    )
  })

  it("removes the pick when the picked button is pressed again", async () => {
    const fetch = serve({ picks: { [OPEN]: "a" }, tallies: { [OPEN]: { a: 1, b: 1 } } }, () =>
      json({ gameKey: OPEN, myPick: null, tally: { a: 0, b: 1 } }),
    )
    render(<TeamScheduleTable team={team(game(OPEN, "McKinley", pick(OPEN)))} />)
    await showBoard()

    fireEvent.click(await screen.findByRole("button", { name: "Massillon wins" }))

    expect(isPressed("Massillon wins")).toBe(false)
    expect(fetch).toHaveBeenCalledWith(`/picks/${OPEN}`, { method: "DELETE" })
    expect(await screen.findByText("0 picks for Massillon, 1 pick for McKinley.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Remove pick" })).toBeNull()
  })

  it("counts the sides of the file on the page of the other team", async () => {
    serve({ picks: { [OPEN]: "a" }, tallies: { [OPEN]: { a: 4, b: 1 } } })
    // On the page of McKinley, McKinley is side b of the game.
    const mckinley = {
      name: "McKinley",
      schedule: [game(OPEN, "Massillon", pick(OPEN, { side: "b" }))],
    }
    render(<TeamScheduleTable team={mckinley} />)
    await showBoard()

    expect(await screen.findByText("1 pick for McKinley, 4 picks for Massillon.")).toBeTruthy()
    expect(isPressed("McKinley wins")).toBe(false)
    expect(isPressed("Massillon wins")).toBe(true)
  })

  it("changes the pick with the arrow keys and the space key", async () => {
    const fetch = serve({}, () => json({ gameKey: OPEN, myPick: "b", tally: { a: 0, b: 1 } }))
    render(<TeamScheduleTable team={team(game(OPEN, "McKinley", pick(OPEN)))} />)
    await showBoard()

    const up = await screen.findByRole("button", { name: "Massillon wins" })
    // A click puts focus on the button. The table would move focus that came from the keyboard to
    // its row first. The table then moves focus between the buttons of the cell.
    fireEvent.pointerDown(up, { pointerType: "mouse" })
    act(() => up.focus())
    fireEvent.keyDown(up, { key: "ArrowRight" })

    expect(document.activeElement).toBe(thumb("McKinley wins"))
    fireEvent.keyDown(document.activeElement as Element, { key: " " })
    fireEvent.keyUp(document.activeElement as Element, { key: " " })

    expect(isPressed("McKinley wins")).toBe(true)
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        `/picks/${OPEN}`,
        expect.objectContaining({ method: "PUT", body: '{"side":"b"}' }),
      ),
    )
  })

  it("moves focus to the next row with the down arrow key", async () => {
    serve({})
    render(
      <TeamScheduleTable
        team={team(game(OPEN, "McKinley", pick(OPEN)), game(LATER, "Perry", pick(LATER)))}
      />,
    )
    await showBoard()

    await screen.findByRole("toolbar", { name: /Perry/ })
    const [first, second] = screen.getAllByRole("button", { name: "Massillon wins" })
    fireEvent.pointerDown(first, { pointerType: "mouse" })
    act(() => first.focus())
    fireEvent.keyDown(first, { key: "ArrowDown" })

    await waitFor(() => expect(document.activeElement).toBe(second))
  })

  it("never leaves both buttons pressed when both are pressed quickly", async () => {
    serve({}, (init) =>
      json({ gameKey: OPEN, myPick: JSON.parse(String(init.body)).side, tally: { a: 0, b: 1 } }),
    )
    render(<TeamScheduleTable team={team(game(OPEN, "McKinley", pick(OPEN)))} />)
    await showBoard()

    fireEvent.click(await screen.findByRole("button", { name: "Massillon wins" }))
    expect(document.querySelectorAll('[aria-pressed="true"]')).toHaveLength(1)
    fireEvent.click(thumb("McKinley wins"))
    expect(document.querySelectorAll('[aria-pressed="true"]')).toHaveLength(1)

    await waitFor(() => expect(isPressed("McKinley wins")).toBe(true))
    expect(document.querySelectorAll('[aria-pressed="true"]')).toHaveLength(1)
  })

  it("goes back to the last pick and says why when a write fails", async () => {
    serve({ picks: { [OPEN]: "a" }, tallies: { [OPEN]: { a: 1, b: 0 } } }, () =>
      json({ error: { code: "GAME_LOCKED", message: "closed" } }, 409),
    )
    render(<TeamScheduleTable team={team(game(OPEN, "McKinley", pick(OPEN)))} />)
    await showBoard()

    fireEvent.click(await screen.findByRole("button", { name: "McKinley wins" }))

    expect(
      await screen.findByText("Massillon vs McKinley: Picks for this game are closed."),
    ).toBeTruthy()
    expect(isPressed("Massillon wins")).toBe(true)
    expect(screen.getByText("1 pick for Massillon, 0 picks for McKinley.")).toBeTruthy()
    expect(thumb("McKinley wins").hasAttribute("disabled")).toBe(true)
    expect(screen.getByText("Picks closed.")).toBeTruthy()
  })

  it("says the pick did not save when the Function answers with a page", async () => {
    serve(
      { tallies: {} },
      () =>
        new Response("<html></html>", { status: 404, headers: { "Content-Type": "text/html" } }),
    )
    render(<TeamScheduleTable team={team(game(OPEN, "McKinley", pick(OPEN)))} />)
    await showBoard()

    fireEvent.click(await screen.findByRole("button", { name: "Massillon wins" }))

    expect(
      await screen.findByText(
        "Massillon vs McKinley: Your pick did not save. Picks are not available right now.",
      ),
    ).toBeTruthy()
    expect(isPressed("Massillon wins")).toBe(false)
    expect(thumb("Massillon wins").hasAttribute("disabled")).toBe(false)
  })

  it("keeps a closed game read only and still shows the pick and the counts", async () => {
    serve({ picks: { [LOCKED]: "b" }, tallies: { [LOCKED]: { a: 2, b: 1 } } })
    render(
      <TeamScheduleTable team={team(game(LOCKED, "McKinley", pick(LOCKED, { lockAt: PAST })))} />,
    )
    await showBoard()

    await screen.findByRole("toolbar")
    expect(isPressed("McKinley wins")).toBe(true)
    expect(thumb("McKinley wins").hasAttribute("disabled")).toBe(true)
    expect(thumb("Massillon wins").hasAttribute("disabled")).toBe(true)
    expect(screen.getByText("2 picks for Massillon, 1 pick for McKinley.")).toBeTruthy()
    expect(screen.getByText("Picks closed.")).toBeTruthy()
  })

  it("marks how the pick of a final game did, and shows nothing for a game with no pick", async () => {
    const final = (gameKey: string, winner: PickemResult["winner"]) =>
      pick(gameKey, { side: "b", lockAt: PAST, winner })
    serve({
      picks: { [WON]: "b", [LOST]: "b", [TIED]: "a" },
      tallies: { [WON]: { a: 1, b: 3 }, [LOST]: { a: 0, b: 1 }, [TIED]: { a: 1, b: 0 } },
    })
    render(
      <TeamScheduleTable
        team={team(
          game(WON, "McKinley", final(WON, "b"), "WIN"),
          game(LOST, "Perry", final(LOST, "a"), "LOSS"),
          game(TIED, "Jackson", final(TIED, "tie"), "TIE"),
          game(OPEN, "Hoover", final(OPEN, "b"), "WIN"),
        )}
      />,
    )
    await showBoard()

    expect(await screen.findByText("You picked Massillon: correct")).toBeTruthy()
    expect(
      screen.getByRole("toolbar", { name: "Your pick for Massillon vs McKinley" }),
    ).toBeTruthy()
    expect(screen.getByText("3 picks for Massillon, 1 pick for McKinley.")).toBeTruthy()
    expect(screen.getByText("You picked Massillon: missed")).toBeTruthy()
    expect(screen.getByText("You picked Jackson. The game ended in a tie.")).toBeTruthy()
    expect(screen.queryByRole("toolbar", { name: /Hoover/ })).toBeNull()
    expect(screen.getAllByRole("toolbar")).toHaveLength(3)
    for (const toolbar of screen.getAllByRole("toolbar")) {
      for (const button of toolbar.querySelectorAll("button")) {
        expect(button.hasAttribute("disabled")).toBe(true)
      }
    }
  })

  it("adds the Pick column for finals only once the board shows a pick", async () => {
    serve({ picks: { [WON]: "a" }, tallies: { [WON]: { a: 1, b: 0 } } })
    render(
      <TeamScheduleTable
        team={team(game(WON, "McKinley", pick(WON, { lockAt: PAST, winner: "none" }), "LOSS"))}
      />,
    )
    await showBoard()

    expect(await screen.findByText("You picked Massillon. The game had no winner.")).toBeTruthy()
    expect(screen.getByRole("columnheader", { name: "Pick" })).toBeTruthy()
  })

  it("has no Pick column for finals that the visitor did not pick", async () => {
    serve({})
    render(
      <TeamScheduleTable
        team={team(game(WON, "McKinley", pick(WON, { lockAt: PAST, winner: "a" }), "WIN"))}
      />,
    )
    await showBoard()
    await waitFor(() => expect(screen.queryByText("Loading picks")).toBeNull())

    expect(screen.queryByRole("columnheader", { name: "Pick" })).toBeNull()
  })

  it("makes every control read only when the board does not load", async () => {
    serve(new Response("<html></html>", { status: 404, headers: { "Content-Type": "text/html" } }))
    render(<TeamScheduleTable team={team(game(OPEN, "McKinley", pick(OPEN)))} />)
    await showBoard()

    expect(
      await screen.findByText("Picks are not available right now. The schedule still shows."),
    ).toBeTruthy()
    expect(thumb("Massillon wins").hasAttribute("disabled")).toBe(true)
  })

  it("makes every control read only when the address of the visitor is not known", async () => {
    serve({ address: "unknown" })
    render(<TeamScheduleTable team={team(game(OPEN, "McKinley", pick(OPEN)))} />)
    await showBoard()

    expect(await screen.findByText(/network address is not known/)).toBeTruthy()
    expect(thumb("McKinley wins").hasAttribute("disabled")).toBe(true)
  })

  it("loads the board at once in a browser without IntersectionObserver", async () => {
    vi.stubGlobal("IntersectionObserver", undefined)
    const fetch = serve({})

    render(<TeamScheduleTable team={team(game(OPEN, "McKinley", pick(OPEN)))} />)

    expect(await screen.findByRole("toolbar")).toBeTruthy()
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})

describe("TeamScheduleTable drawn by the build", () => {
  it("draws the Pick column with skeletons and no buttons", async () => {
    // Astro draws an island with a stream and waits until all of it is ready, as here.
    const { renderToReadableStream } = await import("react-dom/server")
    const stream = await renderToReadableStream(
      <TeamScheduleTable team={team(game(OPEN, "McKinley", pick(OPEN)))} />,
    )
    await stream.allReady
    const html = await new Response(stream).text()

    expect(html).toContain("How picks work")
    expect(html).toContain(">Pick<")
    expect(html).toContain('data-slot="skeleton"')
    expect(html).not.toContain('role="toolbar"')
    expect(html).not.toContain("aria-pressed")
  })
})
