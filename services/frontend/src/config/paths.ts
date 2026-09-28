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
  // The page that tells people how to call the API. Its address is in features/api-docs, because
  // the navigation bar sends this file to the browser.
  api: {
    path: "/api",
    getHref: () => "/api",
  },
  team: {
    path: "/teams/[teamId]",
    getHref: (teamId: string) => `/teams/${teamId}`,
  },
} as const

/** The places outside the site that the footer and the About page link to. */
export const links = {
  repository: "https://github.com/StephenODea54/ohfootball.io",
  issues: "https://github.com/StephenODea54/ohfootball.io/issues",
  dataset: "https://www.kaggle.com/datasets/stephenodea54/ohfootball",
  contact: "mailto:hey@ohfootball.io",
} as const
