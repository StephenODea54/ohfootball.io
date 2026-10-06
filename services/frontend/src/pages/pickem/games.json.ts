import type { APIRoute } from "astro"
import { getPickemGames } from "@/features/pickem/api/get-pickable-games"

/**
 * The games that take picks. The function that stores the picks reads this file to check each
 * pick, and the team pages draw their pick controls from the same games. The sitemap leaves it
 * out, because it is not a page.
 */
export const GET: APIRoute = async () =>
  new Response(JSON.stringify(await getPickemGames()), {
    headers: { "content-type": "application/json" },
  })
