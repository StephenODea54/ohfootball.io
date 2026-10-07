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
  return { gameKey, side: "a", lockAt: FUTURE, winner: null, takesPicks: true, ...overrides }
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
    if (url.startsWith("/picks/board")) {
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

/** Waits for the script of the picks. Only it draws the header of the Pick column. */
function picksDrawn() {
  return screen.findByText(/Thumbs up picks .+ to win/)
}

/** Waits for the script of the picks, then brings the games into view. */
async function showBoard() {
  await picksDrawn()
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

    expect(screen.queryByText(/Thumbs up picks/)).toBeNull()
    expect(screen.queryByRole("status")).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it("shows quiet thumbs for games that take no picks, and loads no board", async () => {
    const fetch = serve({})

    render(
      <TeamScheduleTable
        team={team(
          game(OPEN, "Michigan", null),
          game(LATER, "Perry", null, "CANCELED"),
          game(LOCKED, "Jackson", null, "WIN"),
        )}
      />,
    )

    expect(await picksDrawn()).toBeTruthy()
    expect(
      screen.getByText("Massillon vs Michigan: picks are not open for this game."),
    ).toBeTruthy()
    expect(screen.getByText("Massillon vs Perry: the game was canceled.")).toBeTruthy()
    // A dash takes the place of each count.
    expect(screen.getAllByText("–")).toHaveLength(6)
    // The result column says Canceled.
    expect(screen.getAllByText("Canceled")).toHaveLength(1)
    // Screen readers skip the buttons of these rows, and the buttons take no focus.
    expect(screen.queryByRole("toolbar")).toBeNull()
    expect(screen.queryByRole("button", { name: /wins$/ })).toBeNull()
    const buttons = document.querySelectorAll("[aria-hidden=true] button")
    expect(buttons).toHaveLength(6)
    for (const button of buttons) expect(button.hasAttribute("disabled")).toBe(true)
    expect(document.querySelector("[title]")).toBeNull()
    expect(screen.queryByText(/picks? for/)).toBeNull()
    expect(document.querySelector("[data-slot=skeleton]")).toBeNull()
    await act(async () => FakeObserver.showAll())
    expect(FakeObserver.all.every((observer) => observer.targets.length === 0)).toBe(true)
    expect(fetch).not.toHaveBeenCalled()
  })

  it("asks for the tallies of the games of the schedule, sorted", async () => {
    const fetch = serve({})
    render(
      <TeamScheduleTable
        team={team(
          game(LATER, "Perry", pick(LATER)),
          game(OPEN, "McKinley", pick(OPEN)),
          game(LOCKED, "Michigan", null),
        )}
      />,
    )
    await showBoard()

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(`/picks/board?games=${OPEN},${LATER}`, { method: "GET" }),
    )
  })

  it("shows the counts of an older game against an Ohio team, read only", async () => {
    serve({ tallies: { [WON]: { a: 2, b: 5 } } })
    render(
      <TeamScheduleTable
        team={team(
          game(WON, "McKinley", pick(WON, { lockAt: PAST, winner: "a", takesPicks: false }), "WIN"),
          game(LOST, "Perry", pick(LOST, { lockAt: FUTURE, takesPicks: false })),
        )}
      />,
    )
    await showBoard()

    expect(await screen.findByText("2 picks for Massillon, 5 picks for McKinley.")).toBeTruthy()
    expect(screen.getByText("0 picks for Massillon, 0 picks for Perry.")).toBeTruthy()
    // A game that the build takes no picks for is read only, even before its lock.
    const perry = screen.getByRole("toolbar", { name: "Pick the winner of Massillon vs Perry" })
    for (const button of perry.querySelectorAll("button")) {
      expect(button.hasAttribute("disabled")).toBe(true)
    }
  })

  it("watches the whole table, so a table scrolled past its first game still loads", async () => {
    serve({})
    render(
      <TeamScheduleTable
        team={team(game(LOCKED, "Michigan", null), game(OPEN, "McKinley", pick(OPEN)))}
      />,
    )
    await picksDrawn()

    const watched = FakeObserver.all.flatMap((observer) => observer.targets)
    expect(watched).toHaveLength(1)
    expect(watched[0].querySelector("table")).not.toBeNull()
  })

  it("loads the board once, when a game first comes into view, for every game", async () => {
    const fetch = serve({ tallies: { [OPEN]: { a: 2, b: 1 } } })

    render(
      <TeamScheduleTable
        team={team(game(OPEN, "McKinley", pick(OPEN)), game(LATER, "Perry", pick(LATER)))}
      />,
    )

    await picksDrawn()
    // Nothing shows above the table, and the status region is empty.
    expect(screen.queryByRole("link")).toBeNull()
    expect(screen.getByRole("status").textContent).toBe("")
    const headers = screen.getAllByRole("columnheader").map((header) => header.textContent)
    expect(headers.at(-1)).toBe("Pick")
    // Screen readers read how to pick once, above the table.
    expect(
      screen.getAllByText(
        "Thumbs up picks Massillon to win. Picks close at midnight in Ohio after game day.",
      ),
    ).toHaveLength(1)
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
    // An open thumb keeps the pointer cursor.
    expect(thumb("Massillon wins").closest(".cursor-not-allowed")).toBeNull()
    expect(thumb("Massillon wins").className).toContain("cursor-pointer")
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
    // The message is a note in the status region above the table.
    expect(screen.getByRole("status").querySelector("[data-slot=note]")?.textContent).toBe(
      "Massillon vs McKinley: Picks for this game are closed.",
    )
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
    // A thumb that cannot be pressed shows the not-allowed cursor.
    expect(thumb("Massillon wins").closest(".cursor-not-allowed")).not.toBeNull()
    expect(screen.getByText("2 picks for Massillon, 1 pick for McKinley.")).toBeTruthy()
    expect(screen.getByText("Picks closed.")).toBeTruthy()
  })

  it("marks how the pick of a final game did, and shows the counts of a final with no pick", async () => {
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
    expect(screen.getByRole("toolbar", { name: "Picks for Massillon vs Hoover" })).toBeTruthy()
    expect(screen.getByText("0 picks for Massillon, 0 picks for Hoover.")).toBeTruthy()
    expect(screen.getAllByRole("toolbar")).toHaveLength(4)
    for (const toolbar of screen.getAllByRole("toolbar")) {
      for (const button of toolbar.querySelectorAll("button")) {
        expect(button.hasAttribute("disabled")).toBe(true)
      }
    }
  })

  it("shows a skeleton for a final until the board loads", async () => {
    serve({ picks: { [WON]: "a" }, tallies: { [WON]: { a: 1, b: 0 } } })
    render(
      <TeamScheduleTable
        team={team(game(WON, "McKinley", pick(WON, { lockAt: PAST, winner: "none" }), "LOSS"))}
      />,
    )
    await picksDrawn()
    expect(document.querySelectorAll("[data-slot=skeleton]")).toHaveLength(1)

    await showBoard()

    expect(await screen.findByText("You picked Massillon. The game had no winner.")).toBeTruthy()
    expect(document.querySelector("[data-slot=skeleton]")).toBeNull()
  })

  it("moves focus past a row whose thumbs take no picks", async () => {
    serve({})
    render(
      <TeamScheduleTable
        team={team(
          game(OPEN, "McKinley", pick(OPEN)),
          game(LOCKED, "Michigan", null),
          game(LATER, "Perry", pick(LATER)),
        )}
      />,
    )
    await showBoard()
    await screen.findByRole("toolbar", { name: /Perry/ })

    const [first, last] = screen.getAllByRole("button", { name: "Massillon wins" })
    fireEvent.pointerDown(first, { pointerType: "mouse" })
    act(() => first.focus())
    fireEvent.keyDown(first, { key: "ArrowDown" })

    // The disabled buttons take no focus, so the cell of that row takes it.
    await waitFor(() => expect(document.activeElement?.getAttribute("role")).toBe("gridcell"))
    expect(document.activeElement?.closest("tr")?.textContent).toContain("Michigan")

    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowDown" })
    await waitFor(() => expect(document.activeElement).toBe(last))
  })

  it("lets the next press try again after GAME_UNKNOWN", async () => {
    let answer = json({ error: { code: "GAME_UNKNOWN", message: "no" } }, 404)
    const fetch = serve({}, () => answer)
    render(<TeamScheduleTable team={team(game(OPEN, "McKinley", pick(OPEN)))} />)
    await showBoard()

    fireEvent.click(await screen.findByRole("button", { name: "Massillon wins" }))
    expect(
      await screen.findByText(
        "Massillon vs McKinley: This game does not take picks yet. Try again in a minute.",
      ),
    ).toBeTruthy()
    expect(thumb("Massillon wins").hasAttribute("disabled")).toBe(false)

    answer = json({ gameKey: OPEN, myPick: "a", tally: { a: 1, b: 0 } })
    fireEvent.click(thumb("Massillon wins"))

    expect(await screen.findByText("1 pick for Massillon, 0 picks for McKinley.")).toBeTruthy()
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it("makes every control read only when the board does not load", async () => {
    serve(new Response("<html></html>", { status: 404, headers: { "Content-Type": "text/html" } }))
    render(<TeamScheduleTable team={team(game(OPEN, "McKinley", pick(OPEN)))} />)
    await showBoard()

    expect(
      await screen.findByText("Picks are not available right now. The schedule still shows."),
    ).toBeTruthy()
    expect(thumb("Massillon wins").hasAttribute("disabled")).toBe(true)
    // The counts are not known, so a word shows in their place.
    expect(screen.queryByText(/picks? for/)).toBeNull()
    expect(screen.getByText("No counts")).toBeTruthy()
    expect(screen.getByText("Counts not available.")).toBeTruthy()
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
  /** The HTML as Astro draws an island: with a stream, after all of it is ready. */
  async function drawn(schedule: ScheduleGame[]) {
    const { renderToReadableStream } = await import("react-dom/server")
    const stream = await renderToReadableStream(<TeamScheduleTable team={team(...schedule)} />)
    await stream.allReady
    return new Response(stream).text()
  }

  it("draws a skeleton for each game that takes picks, and quiet thumbs for the others", async () => {
    const html = await drawn([game(OPEN, "McKinley", pick(OPEN)), game(LATER, "Michigan", null)])

    expect(html).not.toContain("How picks work")
    expect(html).toContain("Thumbs up picks Massillon to win.")
    expect(html).toContain(">Pick<")
    expect(html.match(/data-slot="skeleton"/g)).toHaveLength(1)
    expect(html).toContain("Massillon vs Michigan: picks are not open for this game.")
    expect(html).toContain(">–<")
    expect(html).not.toContain('aria-pressed="true"')
  })

  it("hydrates the drawn HTML with no change", async () => {
    const schedule = [game(OPEN, "McKinley", pick(OPEN)), game(LATER, "Michigan", null)]
    const html = await drawn(schedule)
    const container = document.body.appendChild(document.createElement("div"))
    container.innerHTML = html
    const errors = vi.spyOn(console, "error").mockImplementation(() => {})

    render(<TeamScheduleTable team={team(...schedule)} />, { container, hydrate: true })
    await screen.findByText("Massillon vs Michigan: picks are not open for this game.")

    // The test draws on the server and in the browser in one process, and React warns about that.
    // Only a message about hydration counts here.
    const hydration = errors.mock.calls.filter((call) =>
      /hydrat|did not match/i.test(String(call[0])),
    )
    expect(hydration).toEqual([])
    errors.mockRestore()
  })
})
