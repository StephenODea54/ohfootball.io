import type { APIRoute, GetStaticPaths, InferGetStaticPropsType } from "astro"
import { getProgram } from "@/features/compare/api/get-program"
import { safePrograms, toProgramHistory } from "@/features/compare/utils/program-history"
import { prerenderedTeams } from "@/features/teams/api/prerendered-teams"

/**
 * One history file for every team that has a page. The compare page loads two of them in the
 * browser, from the site itself. The sitemap leaves them out, because they are not pages.
 */
export const getStaticPaths = (async () => {
  const teams = safePrograms(await prerenderedTeams())
  return teams.map((team) => ({ params: { sourceId: team.sourceId }, props: { team } }))
}) satisfies GetStaticPaths

type Props = InferGetStaticPropsType<typeof getStaticPaths>

export const GET: APIRoute<Props> = async ({ props }) => {
  const program = await getProgram(props.team.sourceId)
  return new Response(JSON.stringify(toProgramHistory(props.team, program)), {
    headers: { "content-type": "application/json" },
  })
}
