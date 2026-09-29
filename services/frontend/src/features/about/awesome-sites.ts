import { links } from "@/config/paths"

/**
 * The sites that the About page tells people to visit. A score source is a site that the scores
 * of ohfootball.io come from. The page marks each one with a badge.
 */
export const awesomeSites = [
  {
    name: "joeeitel.com",
    href: links.joeEitel,
    description: "Scores for every Ohio high school football season from 2000 to now.",
    isScoreSource: true,
  },
  {
    name: "ohhsfbdb.net",
    href: links.ohhsfbdb,
    description: "Scores for the Ohio high school football seasons from 1972 to 1999.",
    isScoreSource: true,
  },
  {
    name: "Fantastic 50",
    href: links.fantastic50,
    description: "Drew Pasteur's ratings, weekly predictions, and playoff odds for Ohio teams.",
    isScoreSource: false,
  },
] as const
