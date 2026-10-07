import type { APIRoute } from "astro"
import { getPickemGames } from "@/features/pickem/api/get-pickable-games"
import { toPickemFile } from "@/features/pickem/contract"

/**
 * The games that take picks, with only the fields that the function that stores the picks reads to
 * check each pick. The team pages draw their pick controls from the same games while the site is
 * built, and do not read this file. The sitemap leaves it out, because it is not a page.
 */
export const GET: APIRoute = async () =>
  new Response(JSON.stringify(toPickemFile(await getPickemGames())), {
    headers: { "content-type": "application/json" },
  })
