import { describe, expect, it } from "vitest"
import { SqliteD1 } from "./sqlite-d1"

const INSERT = `INSERT INTO tallies (game_key, season, game_date, a, b) VALUES (?, 2026, '2026-10-09', ?, 0)`

describe("SqliteD1", () => {
  it("runs a statement and reads its rows", async () => {
    const db = new SqliteD1()
    await db.prepare(INSERT).bind("x", 2).run()

    const read = await db.prepare("SELECT a FROM tallies WHERE game_key = ?").bind("x").all()

    expect(read.results).toEqual([{ a: 2 }])
  })

  it("undoes a batch when one statement fails", async () => {
    const db = new SqliteD1()

    await expect(
      db.batch([db.prepare(INSERT).bind("x", 1), db.prepare(INSERT).bind("y", -1)]),
    ).rejects.toThrow()

    expect(db.query("SELECT * FROM tallies")).toEqual([])
  })

  it("applies the checks of the migration", () => {
    const db = new SqliteD1()

    expect(() =>
      db.query(
        `INSERT INTO picks (game_key, ip_hash, side, season, game_date, created_at, updated_at)
         VALUES ('x', 'short', 'a', 2026, '2026-10-09', 'x', 'x')`,
      ),
    ).toThrow()
    expect(() =>
      db.query(
        `INSERT INTO picks (game_key, ip_hash, side, season, game_date, created_at, updated_at)
         VALUES ('x', ?, 'c', 2026, '2026-10-09', 'x', 'x')`,
        "0".repeat(64),
      ),
    ).toThrow()
    expect(() => db.query(INSERT.replace("'2026-10-09'", "'9 October'"), "x", 1)).toThrow()
  })
})
