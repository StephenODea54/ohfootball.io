/**
 * PUT and DELETE /picks/:gameKey. Pages makes a route of each file under functions/, so this file
 * only passes the request on. The code is in picks/.
 */
import type { Env } from "../../picks/env"
import { methodNotAllowed } from "../../picks/http"
import { picks } from "../../picks/runtime"

export const onRequestPut: PagesFunction<Env, "gameKey"> = (context) => picks.put(context)

export const onRequestDelete: PagesFunction<Env, "gameKey"> = (context) => picks.remove(context)

export const onRequest: PagesFunction<Env, "gameKey"> = () => methodNotAllowed("PUT, DELETE")
