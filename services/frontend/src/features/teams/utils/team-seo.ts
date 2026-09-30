import { paths } from "@/config/paths"
import { formatDivision, formatRating, formatRecord } from "@/features/teams/utils/format"
import type { TeamSummary } from "@/types/api"
import { breadcrumbListJsonLd, jsonLdGraph, pageUrl } from "@/utils/seo"

/** The longest description that search engines show in full. */
export const MAX_DESCRIPTION_LENGTH = 160

type TeamName = Pick<TeamSummary, "name" | "mascot">

/** The school name with its mascot, for example "Canfield Cardinals". A blank mascot is left out. */
export function teamFullName(team: TeamName): string {
  const mascot = team.mascot?.trim()
  return mascot ? `${team.name} ${mascot}` : team.name
}

/** The title of a link preview. og:site_name already names the site, so this has no suffix. */
export function teamSocialTitle(team: TeamName): string {
  return `${teamFullName(team)} Football Rankings & Predictions`
}

/** The title of a team page, for the title tag. */
export function teamPageTitle(team: TeamName): string {
  return `${teamSocialTitle(team)} | ohfootball.io`
}

/**
 * The meta description of a team page. It names the place, the season, and the numbers of the
 * school, so each page has its own text. The last sentence is left out when the text is too long.
 */
export function teamDescription(team: TeamSummary): string {
  const place = team.city ? ` in ${team.city}, Ohio` : ""
  const league = [formatDivision(team.division), team.region ? `Region ${team.region}` : null]
    .filter(Boolean)
    .join(", ")
  const { wins, losses, ties } = team.record
  const facts = [wins + losses + ties > 0 ? `${formatRecord(team.record)} record` : "no games yet"]
  if (team.rating) {
    facts.push(`#${team.rating.rank} in Ohio`, `rating ${formatRating(team.rating.value)}`)
  }

  const text = `${teamFullName(team)} football${place} (${league}). ${team.season}: ${facts.join(", ")}.`
  const full = `${text} Schedule and game predictions.`
  return full.length <= MAX_DESCRIPTION_LENGTH ? full : text
}

/**
 * The SportsTeam record of a team. A team without a city has no address. The rating is not a
 * review, so it is not written as a rating of the team.
 */
export function sportsTeamJsonLd(team: TeamSummary, url: string) {
  return {
    "@type": "SportsTeam",
    name: teamFullName(team),
    sport: "American Football",
    url,
    ...(team.city && {
      address: {
        "@type": "PostalAddress",
        addressLocality: team.city,
        addressRegion: "OH",
        addressCountry: "US",
      },
    }),
  }
}

/** Everything the layout needs in the head of a team page. */
export function teamPageHead(team: TeamSummary, site: URL, pathname: string) {
  const url = pageUrl(site, pathname)
  return {
    title: teamPageTitle(team),
    socialTitle: teamSocialTitle(team),
    description: teamDescription(team),
    jsonLd: jsonLdGraph(
      sportsTeamJsonLd(team, url),
      breadcrumbListJsonLd([
        { name: "Home", url: pageUrl(site, paths.home.path) },
        { name: "Leaderboard", url: pageUrl(site, paths.leaderboard.path) },
        { name: teamFullName(team), url },
      ]),
    ),
  }
}
