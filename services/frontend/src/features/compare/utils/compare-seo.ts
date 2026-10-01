import { paths } from "@/config/paths"
import { breadcrumbListJsonLd, jsonLdGraph, pageUrl } from "@/utils/seo"

const COMPARE_TITLE = "Compare Schools"

/** Everything the layout needs in the head of the compare page. */
export function comparePageHead(site: URL) {
  return {
    title: `${COMPARE_TITLE} | ohfootball.io`,
    description:
      "Compare the ratings of two Ohio high school football schools on one chart, season by season.",
    jsonLd: jsonLdGraph(
      breadcrumbListJsonLd([
        { name: "Home", url: pageUrl(site, paths.home.path) },
        { name: COMPARE_TITLE, url: pageUrl(site, paths.compare.path) },
      ]),
    ),
  }
}
