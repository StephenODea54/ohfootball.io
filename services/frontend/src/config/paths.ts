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
  playoffs: {
    path: "/playoffs",
    getHref: () => "/playoffs",
  },
  // The details of the teams of one region of the OHSAA, numbered 1 to 28 across the divisions.
  // The playoff page loads one when a team is opened. It is not a page, so the sitemap leaves it
  // out.
  playoffRegion: {
    path: "/playoffs/regions/[region].json",
    getHref: (region: number) => `/playoffs/regions/${region}.json`,
  },
  // The map of the teams. The filters are in the query string, so a link opens the same map. A
  // filter that is not set is left out, so one set of filters has one address.
  map: {
    path: "/map",
    getHref: (filters?: {
      division?: number | null
      region?: number | null
      county?: string | null
    }) => {
      const search = new URLSearchParams()
      if (filters?.division) search.set("division", String(filters.division))
      if (filters?.region) search.set("region", String(filters.region))
      if (filters?.county) search.set("county", filters.county)
      const query = search.toString()
      return query ? `/map?${query}` : "/map"
    },
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
  // The football tournament regulations of the OHSAA, which the Playoffs page links to.
  ohsaaFootballRules:
    "https://ohsaaweb.blob.core.windows.net/files/Sports/Football/FootballTournamentRegs.pdf",
} as const
