import { readFileSync } from "node:fs"
import { DatabaseSync } from "node:sqlite"
import type { Database, Statement } from "../store"

/** The migration that makes the tables, as D1 applies it. */
const MIGRATION = readFileSync(
  new URL("../../d1/migrations/0001_picks.sql", import.meta.url),
  "utf8",
)

type Value = string | number | null

/** A statement in the shape of a D1 statement. Each call of bind gives a new statement. */
class SqliteStatement implements Statement {
  constructor(
    private readonly sqlite: DatabaseSync,
    readonly sql: string,
    private readonly values: Value[] = [],
  ) {}

  bind(...values: Value[]): SqliteStatement {
    return new SqliteStatement(this.sqlite, this.sql, values)
  }

  /** Runs the statement now. A statement that reads nothing gives no rows. */
  rows<T>(): T[] {
    return this.sqlite.prepare(this.sql).all(...this.values) as T[]
  }

  async all<T>(): Promise<{ results: T[] }> {
    return { results: this.rows<T>() }
  }

  async run(): Promise<{ results: [] }> {
    this.rows()
    return { results: [] }
  }
}

/**
 * A D1 database over node:sqlite in memory, with the tables of the migration. A batch runs in one
 * transaction, as in D1, so a statement that fails undoes the statements before it.
 */
export class SqliteD1 implements Database {
  readonly sqlite = new DatabaseSync(":memory:")

  constructor() {
    this.sqlite.exec(MIGRATION)
  }

  prepare(sql: string): SqliteStatement {
    return new SqliteStatement(this.sqlite, sql)
  }

  async batch<T>(statements: Statement[]): Promise<{ results: T[] }[]> {
    this.sqlite.exec("BEGIN")
    try {
      const results = statements.map((statement) => ({
        results: (statement as SqliteStatement).rows<T>(),
      }))
      this.sqlite.exec("COMMIT")
      return results
    } catch (cause) {
      this.sqlite.exec("ROLLBACK")
      throw cause
    }
  }

  /** Reads rows straight from the database, for the checks of a test. */
  query<T = Record<string, unknown>>(sql: string, ...values: Value[]): T[] {
    return this.sqlite.prepare(sql).all(...values) as T[]
  }
}
