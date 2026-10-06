// @vitest-environment happy-dom
import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { PicksClient, PickWrite } from "@/features/pickem/api/picks-client"
import { FinalPick, PickControl } from "@/features/pickem/components/pick-control"
import {
  PicksBoardProvider,
  type PicksBoardValue,
  usePicksBoard,
} from "@/features/pickem/components/picks-board"

const GAME = "00000000-0000-4000-8000-000000000001"

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  let reject: (cause: unknown) => void = () => {}
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

function client(overrides: Partial<PicksClient> = {}): PicksClient {
  return {
    loadBoard: async () => ({ address: "known", cutoff: "2026-09-26", picks: {}, tallies: {} }),
    putPick: vi.fn(),
    removePick: vi.fn(),
    ...overrides,
  }
}

/** Draws nothing, and hands the board to the test. */
function Probe({ onBoard }: { onBoard: (board: PicksBoardValue) => void }) {
  const board = usePicksBoard()
  if (board) onBoard(board)
  return null
}

function renderBoard(picks: PicksClient) {
  let board: PicksBoardValue | null = null
  render(
    <PicksBoardProvider client={picks}>
      <Probe
        onBoard={(value) => {
          board = value
        }}
      />
    </PicksBoardProvider>,
  )
  return () => board as unknown as PicksBoardValue
}

afterEach(() => {
  cleanup()
})

describe("PicksBoardProvider", () => {
  it("loads the board one time however often it is asked", async () => {
    const loadBoard = vi.fn(client().loadBoard)
    const board = renderBoard(client({ loadBoard }))

    await act(async () => {
      board().load()
      board().load()
    })

    expect(loadBoard).toHaveBeenCalledTimes(1)
    expect(board().status).toBe("ready")
  })

  it("lets only the latest write of a game change what the page shows", async () => {
    const first = deferred<PickWrite>()
    const second = deferred<PickWrite>()
    const putPick = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const board = renderBoard(client({ putPick }))
    await act(async () => board().load())

    act(() => board().choose(GAME, "a"))
    act(() => board().choose(GAME, "b"))
    expect(board().picks[GAME]).toBe("b")
    expect(board().tallies[GAME]).toEqual({ a: 0, b: 1 })
    expect(board().pending[GAME]).toBe(true)

    await act(async () => second.resolve({ gameKey: GAME, myPick: "b", tally: { a: 4, b: 6 } }))
    await act(async () => first.reject(new Error("late")))

    expect(board().picks[GAME]).toBe("b")
    expect(board().tallies[GAME]).toEqual({ a: 4, b: 6 })
    expect(board().errors).toEqual({})
    expect(board().pending).toEqual({})
  })

  it("keeps an answer that comes after a newer write, for a later revert", async () => {
    const first = deferred<PickWrite>()
    const second = deferred<PickWrite>()
    const putPick = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const board = renderBoard(client({ putPick }))
    await act(async () => board().load())

    act(() => board().choose(GAME, "a"))
    act(() => board().choose(GAME, "b"))
    await act(async () => first.resolve({ gameKey: GAME, myPick: "a", tally: { a: 3, b: 0 } }))
    expect(board().picks[GAME]).toBe("b")

    await act(async () => second.reject(new Error("offline")))

    expect(board().picks[GAME]).toBe("a")
    expect(board().tallies[GAME]).toEqual({ a: 3, b: 0 })
    expect(board().errors[GAME]).toBe("PICKS_UNAVAILABLE")
  })
})

describe("PicksBoardProvider with writes that answer out of order", () => {
  it("shows the stored pick when the newer write fails before the older one saves", async () => {
    const first = deferred<PickWrite>()
    const second = deferred<PickWrite>()
    const putPick = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const board = renderBoard(client({ putPick }))
    await act(async () => board().load())

    act(() => board().choose(GAME, "a"))
    act(() => board().choose(GAME, "b"))
    await act(async () => second.reject(new Error("offline")))

    expect(board().picks[GAME]).toBe("b")
    expect(board().pending[GAME]).toBe(true)

    await act(async () => first.resolve({ gameKey: GAME, myPick: "a", tally: { a: 1, b: 0 } }))

    expect(board().picks[GAME]).toBe("a")
    expect(board().tallies[GAME]).toEqual({ a: 1, b: 0 })
    expect(board().errors[GAME]).toBe("PICKS_UNAVAILABLE")
    expect(board().pending).toEqual({})
  })

  it("keeps the newest confirmed answer when an older one comes last", async () => {
    const first = deferred<PickWrite>()
    const second = deferred<PickWrite>()
    const putPick = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const board = renderBoard(client({ putPick }))
    await act(async () => board().load())

    act(() => board().choose(GAME, "a"))
    act(() => board().choose(GAME, "b"))
    await act(async () => second.resolve({ gameKey: GAME, myPick: "b", tally: { a: 0, b: 1 } }))
    await act(async () => first.resolve({ gameKey: GAME, myPick: "a", tally: { a: 1, b: 0 } }))

    expect(board().picks[GAME]).toBe("b")
    expect(board().tallies[GAME]).toEqual({ a: 0, b: 1 })
  })

  it("notes when the board loaded", async () => {
    const board = renderBoard(client())
    expect(board().readyAt).toBeNull()

    await act(async () => board().load())

    expect(board().readyAt).toBeInstanceOf(Date)
  })

  it("fails the board when it does not load", async () => {
    const board = renderBoard(client({ loadBoard: async () => Promise.reject(new Error("no")) }))

    await act(async () => board().load())

    expect(board().status).toBe("failed")
    expect(board().blocked).toBe("unavailable")
    expect(board().readyAt).toBeInstanceOf(Date)
  })
})

describe("the pick controls without a board", () => {
  const pick = { gameKey: GAME, side: "a" as const, lockAt: "2999-01-01T00:00:00Z", winner: null }

  it("shows the skeleton of an open game and nothing for a final game", () => {
    const skeleton = render(
      <PickControl pick={pick} teamName="Massillon" opponentName="McKinley" />,
    ).container.querySelector("[data-slot=skeleton]")
    expect(skeleton?.getAttribute("aria-hidden")).toBe("true")
    expect(screen.queryByRole("toolbar")).toBeNull()
    cleanup()

    const { container } = render(
      <FinalPick pick={{ ...pick, winner: "a" }} teamName="Massillon" opponentName="McKinley" />,
    )
    expect(container.innerHTML).toBe("")
  })
})
