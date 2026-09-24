/**
 * The fields every team query selects. The API still names the rating fields after the Elo model
 * that produces them. They are aliased here so the rest of the front end talks about ratings in
 * model-neutral terms.
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
  rating: elo { season value: rating rank asOf }
`
