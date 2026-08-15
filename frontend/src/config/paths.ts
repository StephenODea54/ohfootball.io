/**
 * Every route in the site, in one place. A link built here always carries the selected season, so
 * a full page load does not lose it.
 */

function withSeason(path: string, season: number) {
  return `${path}?season=${season}`
}

export const paths = {
  home: {
    path: "/",
    getHref: (season: number) => withSeason("/", season),
  },
  about: {
    path: "/about",
    getHref: (season: number) => withSeason("/about", season),
  },
  leaderboard: {
    path: "/leaderboard",
    getHref: (season: number) => withSeason("/leaderboard", season),
  },
  methodology: {
    path: "/methodology",
    getHref: (season: number) => withSeason("/methodology", season),
  },
  team: {
    path: "/teams/$teamId",
    getHref: (teamId: string, season: number) => withSeason(`/teams/${teamId}`, season),
  },
} as const
