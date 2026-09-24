/**
 * Every route in the site, in one place. A link built here carries the selected season, so a full
 * page load does not lose it. Without a season the link is left plain, and the API answers with
 * the season it considers current.
 */

function withSeason(path: string, season?: number) {
  return season === undefined ? path : `${path}?season=${season}`
}

export const paths = {
  home: {
    path: "/",
    getHref: (season?: number) => withSeason("/", season),
  },
  about: {
    path: "/about",
    getHref: (season?: number) => withSeason("/about", season),
  },
  leaderboard: {
    path: "/leaderboard",
    getHref: (season?: number) => withSeason("/leaderboard", season),
  },
  methodology: {
    path: "/methodology",
    getHref: (season?: number) => withSeason("/methodology", season),
  },
  team: {
    path: "/teams/$teamId",
    getHref: (teamId: string, season?: number) => withSeason(`/teams/${teamId}`, season),
  },
} as const
