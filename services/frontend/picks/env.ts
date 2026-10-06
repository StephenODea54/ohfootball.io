import type { Assets } from "./games"
import type { Database } from "./store"

/**
 * The bindings and settings that Pages gives the picks Function. Each one may be missing. Then the
 * Function answers 503 PICKS_UNAVAILABLE, and the rest of the site works as before.
 */
export interface Env {
  /** The D1 database of the picks. */
  PICKS_DB?: Database
  /** The secret of the address hash. A Pages secret of at least 32 characters. */
  PICKS_HASH_SECRET?: string
  /** The only origin that may write, such as https://ohfootball.io. */
  PICKS_ORIGIN?: string
  /** The static files of the deployment. */
  ASSETS: Assets
}
