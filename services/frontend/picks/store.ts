import type { PickemFileGame, PickSide } from "../src/features/pickem/contract"

/**
 * The part of a D1 database that the Function uses. The tests give an object of the same shape
 * over node:sqlite, so the same SQL runs in both.
 */
export interface Statement {
  bind(...values: (string | number | null)[]): Statement
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>
  run(): Promise<unknown>
}

export interface Database {
  prepare(sql: string): Statement
  /** Runs the statements in one transaction. When one fails, none of them has an effect. */
  batch<T = Record<string, unknown>>(statements: Statement[]): Promise<{ results: T[] }[]>
}

export interface Tally {
  a: number
  b: number
}

export interface Board {
  picks: Record<string, PickSide>
  tallies: Record<string, Tally>
}

const TALLIES = "SELECT game_key, a, b FROM tallies WHERE game_date >= ?"

const PICKS = "SELECT game_key, side FROM picks WHERE ip_hash = ? AND game_date >= ?"

const UPSERT_PICK = `INSERT INTO picks (game_key, ip_hash, side, season, game_date, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (game_key, ip_hash) DO UPDATE SET side = excluded.side, updated_at = excluded.updated_at`

const DELETE_PICK = "DELETE FROM picks WHERE game_key = ? AND ip_hash = ?"

// The SELECT has a WHERE clause, so SQLite reads ON CONFLICT as part of the INSERT.
const COUNT_TALLY = `INSERT INTO tallies (game_key, season, game_date, a, b)
SELECT ?, ?, ?, COALESCE(SUM(side = 'a'), 0), COALESCE(SUM(side = 'b'), 0)
FROM picks WHERE game_key = ?
ON CONFLICT (game_key) DO UPDATE SET a = excluded.a, b = excluded.b`

const READ_TALLY = "SELECT a, b FROM tallies WHERE game_key = ?"

const READ_PICK = "SELECT side FROM picks WHERE game_key = ? AND ip_hash = ?"

const PRUNE = "DELETE FROM picks WHERE game_date < ?"

interface TallyRow {
  game_key: string
  a: number
  b: number
}

interface PickRow {
  game_key: string
  side: PickSide
}

/** Which games the board reads: those on or after a date, or the games of a list of keys. */
export type BoardScope = { cutoff: string } | { games: readonly string[] }

/** `count` bound parameters for an IN list, such as `?, ?, ?`. */
function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ")
}

/** The statements that read the tallies, and the picks of `ipHash`, of the games in `scope`. */
function boardStatements(db: Database, ipHash: string | null, scope: BoardScope): Statement[] {
  if ("cutoff" in scope) {
    const statements = [db.prepare(TALLIES).bind(scope.cutoff)]
    if (ipHash) statements.push(db.prepare(PICKS).bind(ipHash, scope.cutoff))
    return statements
  }
  const list = placeholders(scope.games.length)
  const statements = [
    db
      .prepare(`SELECT game_key, a, b FROM tallies WHERE game_key IN (${list})`)
      .bind(...scope.games),
  ]
  if (ipHash) {
    const sql = `SELECT game_key, side FROM picks WHERE ip_hash = ? AND game_key IN (${list})`
    statements.push(db.prepare(sql).bind(ipHash, ...scope.games))
  }
  return statements
}

/**
 * The tallies of the games in `scope`, and the picks of `ipHash` among them. A list of keys reads
 * the tallies of those games at any date, because the tallies stay when the picks are removed. The
 * list is bound as parameters, so it must stay below the limit of D1 of 100 for each statement.
 */
export async function readBoard(
  db: Database,
  ipHash: string | null,
  scope: BoardScope,
): Promise<Board> {
  const tallies: Record<string, Tally> = {}
  const picks: Record<string, PickSide> = {}
  if ("games" in scope && scope.games.length === 0) return { picks, tallies }
  const [tallyRows, pickRows] = await db.batch<TallyRow & PickRow>(
    boardStatements(db, ipHash, scope),
  )
  for (const row of tallyRows.results) tallies[row.game_key] = { a: row.a, b: row.b }
  for (const row of pickRows?.results ?? []) picks[row.game_key] = row.side
  return { picks, tallies }
}

/** Counts the picks of a game again and reads the new tally, after `change`. One transaction. */
async function recount(db: Database, game: PickemFileGame, change: Statement): Promise<Tally> {
  const results = await db.batch<Tally>([
    change,
    db.prepare(COUNT_TALLY).bind(game.gameKey, game.season, game.date, game.gameKey),
    db.prepare(READ_TALLY).bind(game.gameKey),
  ])
  const row = results[2].results[0]
  return { a: row.a, b: row.b }
}

/**
 * Stores the pick of `ipHash` for a game, or changes it, and returns the new tally. When the
 * address already picked this side, it writes nothing and returns the tally as it is.
 */
export async function savePick(
  db: Database,
  game: PickemFileGame,
  ipHash: string,
  side: PickSide,
  now: Date,
): Promise<Tally> {
  const [held, current] = await db.batch<{ side?: PickSide } & Partial<Tally>>([
    db.prepare(READ_PICK).bind(game.gameKey, ipHash),
    db.prepare(READ_TALLY).bind(game.gameKey),
  ])
  const tally = current.results[0]
  if (held.results[0]?.side === side && tally) return { a: Number(tally.a), b: Number(tally.b) }

  const at = now.toISOString()
  const upsert = db
    .prepare(UPSERT_PICK)
    .bind(game.gameKey, ipHash, side, game.season, game.date, at, at)
  return recount(db, game, upsert)
}

/** Removes the pick of `ipHash` for a game, if it has one, and returns the new tally. */
export function removePick(db: Database, game: PickemFileGame, ipHash: string): Promise<Tally> {
  return recount(db, game, db.prepare(DELETE_PICK).bind(game.gameKey, ipHash))
}

/** Removes every pick of a game before `cutoff`. The tallies stay. */
export async function prunePicks(db: Database, cutoff: string): Promise<void> {
  await db.prepare(PRUNE).bind(cutoff).run()
}
