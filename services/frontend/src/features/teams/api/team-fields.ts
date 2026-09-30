/**
 * The fields every team query selects. The site shows the relative rating, which is 0 for the
 * median Ohio team. The query aliases relativeRating to value.
 */
export const teamFields = `
  id
  season
  name
  mascot
  city
  division
  region
  primaryColor
  secondaryColor
  record { wins losses ties }
  rating { season value: relativeRating rank previousRank asOf }
`
