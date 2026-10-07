"use client"

import {
  createContext,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import {
  createPicksClient,
  PICKS_UNAVAILABLE,
  type PicksClient,
  PicksError,
  type PickTally,
} from "@/features/pickem/api/picks-client"
import type { PickSide } from "@/features/pickem/contract"
import { moveTally } from "@/features/pickem/utils/pick-text"

export type BoardStatus = "idle" | "loading" | "ready" | "failed"

/** The picks of the visitor and the tallies, by game key. */
interface Picks {
  picks: Record<string, PickSide>
  tallies: Record<string, PickTally>
}

export interface PicksBoardValue extends Picks {
  status: BoardStatus
  /**
   * The moment the board loaded or failed. A control reads the lock of its game against it, so the
   * page reads the clock only here.
   */
  readyAt: Date | null
  /**
   * Why every control is read only: the board did not load, or the Function could not read the
   * address of the visitor. Null when the visitor can pick.
   */
  blocked: "unavailable" | "unknown" | null
  /** The code of the last failed write of each game. */
  errors: Record<string, string>
  /** The games with a write that has no answer yet. */
  pending: Record<string, boolean>
  /** Asks for the board. Only the first call loads it. */
  load: () => void
  /** Picks a side of a game, or removes the pick with null. The page shows it at once. */
  choose: (gameKey: string, side: PickSide | null) => void
}

const PicksBoardContext = createContext<PicksBoardValue | null>(null)

const NO_PICKS: PickTally = { a: 0, b: 0 }

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record
  const { [key]: _, ...rest } = record
  return rest
}

/** The picks with the pick and the tally of one game set. */
function withGame(state: Picks, gameKey: string, pick: PickSide | null, tally: PickTally): Picks {
  return {
    picks: pick ? { ...state.picks, [gameKey]: pick } : without(state.picks, gameKey),
    tallies: { ...state.tallies, [gameKey]: tally },
  }
}

/**
 * Holds the board of the picks Function for one page. Every pick control of the page reads it, so
 * the page asks for the board one time. It asks only when `load` is first called, which the page
 * does when the schedule comes into view. `games` are the keys of the games whose tallies the page
 * shows.
 */
export function PicksBoardProvider({
  client: givenClient,
  games,
  children,
}: {
  client?: PicksClient
  games?: readonly string[]
  children: ReactNode
}) {
  const [client] = useState(() => givenClient ?? createPicksClient())
  const [status, setStatus] = useState<BoardStatus>("idle")
  const [address, setAddress] = useState<"known" | "unknown">("known")
  const [shown, setShown] = useState<Picks>({ picks: {}, tallies: {} })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pending, setPending] = useState<Record<string, boolean>>({})
  const [readyAt, setReadyAt] = useState<Date | null>(null)
  const started = useRef(false)
  // What the Function last said, so the page can go back to it when a write fails.
  const confirmed = useRef<Picks>({ picks: {}, tallies: {} })
  // For each game: the number of its latest write, the number of the newest write that the
  // Function confirmed, and the count of writes with no answer yet.
  const latest = useRef<Record<string, number>>({})
  const confirmedNumber = useRef<Record<string, number>>({})
  const inFlight = useRef<Record<string, number>>({})

  const load = useCallback(() => {
    if (started.current) return
    started.current = true
    setStatus("loading")
    client.loadBoard(games).then(
      (board) => {
        confirmed.current = { picks: board.picks, tallies: board.tallies }
        setShown(confirmed.current)
        setAddress(board.address)
        setReadyAt(new Date())
        setStatus("ready")
      },
      () => {
        setReadyAt(new Date())
        setStatus("failed")
      },
    )
  }, [client, games])

  const choose = useCallback(
    (gameKey: string, side: PickSide | null) => {
      setShown((state) => {
        const from = state.picks[gameKey] ?? null
        const tally = moveTally(state.tallies[gameKey] ?? NO_PICKS, from, side)
        return withGame(state, gameKey, side, tally)
      })
      setErrors((current) => without(current, gameKey))
      setPending((current) => ({ ...current, [gameKey]: true }))
      const number = (latest.current[gameKey] ?? 0) + 1
      latest.current[gameKey] = number
      inFlight.current[gameKey] = (inFlight.current[gameKey] ?? 0) + 1

      // The page keeps the guess of the visitor while a write of the game has no answer. When the
      // last one answers, the page shows what the Function confirmed.
      const settle = () => {
        inFlight.current[gameKey] -= 1
        if (inFlight.current[gameKey] > 0) return
        const done = confirmed.current
        setShown((state) =>
          withGame(state, gameKey, done.picks[gameKey] ?? null, done.tallies[gameKey] ?? NO_PICKS),
        )
        setPending((current) => without(current, gameKey))
      }

      const write = side ? client.putPick(gameKey, side) : client.removePick(gameKey)
      write.then(
        (answer) => {
          // An answer can come after the answer of a newer write. The newest write wins.
          if (number > (confirmedNumber.current[gameKey] ?? 0)) {
            confirmedNumber.current[gameKey] = number
            confirmed.current = withGame(confirmed.current, gameKey, answer.myPick, answer.tally)
          }
          settle()
        },
        (cause: unknown) => {
          if (number === latest.current[gameKey]) {
            const code = cause instanceof PicksError ? cause.code : PICKS_UNAVAILABLE
            setErrors((current) => ({ ...current, [gameKey]: code }))
          }
          settle()
        },
      )
    },
    [client],
  )

  const blocked =
    status === "failed"
      ? "unavailable"
      : status === "ready" && address === "unknown"
        ? "unknown"
        : null

  const value = useMemo<PicksBoardValue>(
    () => ({ ...shown, status, readyAt, blocked, errors, pending, load, choose }),
    [shown, status, readyAt, blocked, errors, pending, load, choose],
  )

  return <PicksBoardContext.Provider value={value}>{children}</PicksBoardContext.Provider>
}

/** The board of the page, or null when the page has no pick controls. */
export function usePicksBoard(): PicksBoardValue | null {
  return useContext(PicksBoardContext)
}

/**
 * Loads the board when the element comes into view. A browser without IntersectionObserver loads
 * it at once.
 */
export function useLoadBoardWhenVisible(ref: RefObject<Element | null>) {
  const load = usePicksBoard()?.load
  useEffect(() => {
    const element = ref.current
    if (!load || !element) return
    if (typeof IntersectionObserver === "undefined") {
      load()
      return
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      observer.disconnect()
      load()
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [load, ref])
}
