/**
 * Every page of the site, in one place. The site shows the teams of the current season only, so no
 * address carries a season.
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
  accuracy: {
    path: "/accuracy",
    getHref: () => "/accuracy",
  },
  // The page that tells people how to download the data. Its addresses are in features/data.
  data: {
    path: "/data",
    getHref: () => "/data",
  },
  // The page that tells people how to call the API. Its address is in features/api-docs, because
  // the navigation bar sends this file to the browser.
  api: {
    path: "/api",
    getHref: () => "/api",
  },
  // What the site keeps about a visitor, and what Pick 'Em stores.
  privacy: {
    path: "/privacy",
    getHref: () => "/privacy",
  },
  team: {
    path: "/teams/[teamId]",
    getHref: (teamId: string) => `/teams/${teamId}`,
  },
  // The page that compares two schools. The pair is in the query string, a before b. A side with
  // no school is left out, so one pair has one address.
  compare: {
    path: "/compare",
    getHref: (pair?: { a?: string | null; b?: string | null }) => {
      const search = new URLSearchParams()
      if (pair?.a) search.set("a", pair.a)
      if (pair?.b) search.set("b", pair.b)
      const query = search.toString()
      return query ? `/compare?${query}` : "/compare"
    },
  },
  // The history file of one program. It is not a page, so the sitemap leaves it out.
  program: {
    path: "/programs/[sourceId].json",
    getHref: (sourceId: string) => `/programs/${sourceId}.json`,
  },
} as const

/** The places outside the site that the footer and the About and Methodology pages link to. */
export const links = {
  repository: "https://github.com/StephenODea54/ohfootball.io",
  issues: "https://github.com/StephenODea54/ohfootball.io/issues",
  dataset: "https://www.kaggle.com/datasets/stephenodea54/ohfootball",
  contact: "mailto:hey@ohfootball.io",
  // The sites that the About page lists under Awesome Sites.
  joeEitel: "https://joeeitel.com/hsfoot/",
  ohhsfbdb: "https://ohhsfbdb.net/",
  fantastic50: "https://www.fantastic50.net/",
  harbinCalculator: "https://www.harbincalculator.com/",
} as const
