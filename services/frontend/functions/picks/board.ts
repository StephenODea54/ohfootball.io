/**
 * GET and HEAD /picks/board. Pages makes a route of each file under functions/, so this file only
 * passes the request on. The code is in picks/.
 */
import type { Env } from "../../picks/env"
import { methodNotAllowed } from "../../picks/http"
import { picks } from "../../picks/runtime"

export const onRequestGet: PagesFunction<Env> = (context) => picks.board(context)

export const onRequestHead: PagesFunction<Env> = (context) => picks.board(context)

export const onRequest: PagesFunction<Env> = () => methodNotAllowed("GET, HEAD")
