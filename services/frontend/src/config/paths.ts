/**
 * Every page of the site, in one place. The site shows only the current season, so no address
 * carries a season.
 */
export const paths = {
  home: {
    path: "/",
    getHref: () => "/",
  },
  about: {
    path: "/about",
    getHref: () => "/about",
  },
  leaderboard: {
    path: "/leaderboard",
    getHref: () => "/leaderboard",
  },
  methodology: {
    path: "/methodology",
    getHref: () => "/methodology",
  },
  team: {
    path: "/teams/[teamId]",
    getHref: (teamId: string) => `/teams/${teamId}`,
  },
} as const
