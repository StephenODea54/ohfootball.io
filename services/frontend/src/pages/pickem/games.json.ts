import type { APIRoute } from "astro"
import { getPickableGames } from "@/features/pickem/api/get-pickable-games"

/**
 * The games that Pick 'Em shows. The page loads this file in the browser, and the function that
 * stores the picks reads it to check each pick. The sitemap leaves it out, because it is not a
 * page.
 */
export const GET: APIRoute = async () =>
  new Response(JSON.stringify(await getPickableGames()), {
    headers: { "content-type": "application/json" },
  })
