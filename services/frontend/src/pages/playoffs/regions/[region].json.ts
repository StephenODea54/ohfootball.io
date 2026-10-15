import type { APIRoute, GetStaticPaths, InferGetStaticPropsType } from "astro"
import { getPlayoffProjection } from "@/features/playoffs/api/get-playoff-projection"
import { regionData } from "@/features/playoffs/utils/view"

/**
 * One file for each region with the rows of its table and the details of its teams. The playoff
 * page loads one when a region or a team is opened, so the page itself carries one region only.
 * The sitemap leaves them out, because they are not pages.
 */
export const getStaticPaths = (async () => {
  const projection = await getPlayoffProjection()
  return (projection?.regions ?? []).map((region) => ({
    params: { region: String(region.region) },
    props: { region },
  }))
}) satisfies GetStaticPaths

type Props = InferGetStaticPropsType<typeof getStaticPaths>

export const GET: APIRoute<Props> = ({ props }) =>
  new Response(JSON.stringify(regionData(props.region)), {
    headers: { "content-type": "application/json" },
  })
