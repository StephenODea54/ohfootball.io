import type { PickTally } from "@/features/pickem/api/picks-client"
import type { PickemResult } from "@/features/pickem/contract"

/** The codes after which a game takes no more picks, so its control turns read only. */
const CLOSING_CODES = new Set(["GAME_LOCKED", "GAME_FINAL", "GAME_CANCELED", "GAME_UNKNOWN"])

/** Whether the code of a failed write means that the game takes no more picks. */
export function closesGame(code: string): boolean {
  return CLOSING_CODES.has(code)
}

/** A short message for the code of a failed write. */
export function pickErrorMessage(code: string): string {
  switch (code) {
    case "GAME_LOCKED":
      return "Picks for this game are closed."
    case "GAME_FINAL":
      return "This game is over, so it takes no picks."
    case "GAME_CANCELED":
      return "This game was canceled, so it takes no picks."
    case "GAME_UNKNOWN":
      return "This game does not take picks."
    case "CLIENT_ADDRESS_UNKNOWN":
      return "Your network address is not known, so the pick did not save."
    default:
      return "Your pick did not save. Picks are not available right now."
  }
}

/** The tally with one pick moved from `from` to `to`. Either side can be null, for no pick. */
export function moveTally(
  tally: PickTally,
  from: "a" | "b" | null,
  to: "a" | "b" | null,
): PickTally {
  const next = { ...tally }
  if (from) next[from] = Math.max(0, next[from] - 1)
  if (to) next[to] += 1
  return next
}

/** How the pick of a final game did. `picked` names the team the visitor picked. */
export function finalPickText(
  picked: string,
  pickedSide: "a" | "b",
  winner: PickemResult["winner"],
): string {
  if (winner === "tie") return `You picked ${picked}. The game ended in a tie.`
  if (winner === "none") return `You picked ${picked}. The game had no winner.`
  return `You picked ${picked}: ${winner === pickedSide ? "correct" : "missed"}`
}
