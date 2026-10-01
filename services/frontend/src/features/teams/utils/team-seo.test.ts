import { describe, expect, it } from "vitest"
import {
  MAX_DESCRIPTION_LENGTH,
  sportsTeamJsonLd,
  teamDescription,
  teamFullName,
  teamPageHead,
  teamPageTitle,
  teamSocialTitle,
} from "@/features/teams/utils/team-seo"
import type { TeamSummary } from "@/types/api"
import { jsonLdScript } from "@/utils/seo"

const site = new URL("https://ohfootball.io")

function team(overrides: Partial<TeamSummary> = {}): TeamSummary {
  return {
    id: "canfield",
    season: 2026,
    sourceId: "248",
    name: "Canfield",
    mascot: "Cardinals",
    city: "Canfield",
    county: "Mahoning",
    division: 3,
    region: 9,
    primaryColor: null,
    secondaryColor: null,
    record: { wins: 2, losses: 4, ties: 0 },
    outOfStateGamesPlayed: 0,
    rating: { season: 2026, value: 3.6, rank: 149, previousRank: null, asOf: "2026-09-27" },
    ...overrides,
  }
}

describe("teamFullName", () => {
  it("adds the mascot to the name", () => {
    expect(teamFullName(team())).toBe("Canfield Cardinals")
  })

  it.each([null, "  "])("gives only the name when the mascot is %j", (mascot) => {
    expect(teamFullName(team({ mascot }))).toBe("Canfield")
  })
})

describe("teamPageTitle", () => {
  it("names the school and the site", () => {
    expect(teamPageTitle(team())).toBe(
      "Canfield Cardinals Football Rankings & Predictions | ohfootball.io",
    )
  })

  it("names only the school when it has no mascot", () => {
    expect(teamPageTitle(team({ name: "Cincinnati Eagles (club)", mascot: null }))).toBe(
      "Cincinnati Eagles (club) Football Rankings & Predictions | ohfootball.io",
    )
  })
})

describe("teamSocialTitle", () => {
  it("leaves out the name of the site", () => {
    expect(teamSocialTitle(team())).toBe("Canfield Cardinals Football Rankings & Predictions")
  })
})

describe("teamDescription", () => {
  it("names the place, the league, and the numbers of the season", () => {
    expect(teamDescription(team())).toBe(
      "Canfield Cardinals football in Canfield, Ohio (D-III, Region 9). 2026: 2–4 record, #149 in Ohio, rating +3.6. Schedule and game predictions.",
    )
  })

  it("calls a team without a division independent", () => {
    expect(
      teamDescription(
        team({
          name: "Cincinnati Eagles (club)",
          mascot: null,
          city: "Cincinnati",
          division: null,
          region: null,
          record: { wins: 0, losses: 2, ties: 0 },
          rating: { season: 2026, value: -41, rank: 629, previousRank: null, asOf: "2026-09-27" },
        }),
      ),
    ).toBe(
      "Cincinnati Eagles (club) football in Cincinnati, Ohio (Independent). 2026: 0–2 record, #629 in Ohio, rating \u221241.0. Schedule and game predictions.",
    )
  })

  it("leaves out a place and numbers that are not known", () => {
    expect(
      teamDescription(
        team({
          city: null,
          division: null,
          region: 0,
          record: { wins: 0, losses: 0, ties: 0 },
          rating: null,
        }),
      ),
    ).toBe(
      "Canfield Cardinals football (Independent). 2026: no games yet. Schedule and game predictions.",
    )
  })

  it("gives only the record when the team has no rating", () => {
    expect(teamDescription(team({ rating: null }))).toBe(
      "Canfield Cardinals football in Canfield, Ohio (D-III, Region 9). 2026: 2–4 record. Schedule and game predictions.",
    )
  })

  it("gives the rating of a team that has played no games", () => {
    expect(teamDescription(team({ record: { wins: 0, losses: 0, ties: 0 } }))).toBe(
      "Canfield Cardinals football in Canfield, Ohio (D-III, Region 9). 2026: no games yet, #149 in Ohio, rating +3.6. Schedule and game predictions.",
    )
  })

  it("shows ties in the record", () => {
    expect(teamDescription(team({ record: { wins: 3, losses: 2, ties: 1 } }))).toContain(
      "3–2–1 record",
    )
  })

  it("leaves out the last sentence when the text is too long", () => {
    const description = teamDescription(
      team({
        name: "Cuyahoga Valley Christian Academy",
        mascot: "Royals",
        city: "Cuyahoga Falls",
        record: { wins: 3, losses: 3, ties: 0 },
        rating: { season: 2026, value: 12, rank: 158, previousRank: null, asOf: "2026-09-27" },
      }),
    )

    expect(description).toBe(
      "Cuyahoga Valley Christian Academy Royals football in Cuyahoga Falls, Ohio (D-III, Region 9). 2026: 3–3 record, #158 in Ohio, rating +12.0.",
    )
    expect(description.length).toBeLessThanOrEqual(MAX_DESCRIPTION_LENGTH)
  })
})

describe("sportsTeamJsonLd", () => {
  it("describes the team and its town", () => {
    expect(sportsTeamJsonLd(team(), "https://ohfootball.io/teams/canfield")).toEqual({
      "@type": "SportsTeam",
      name: "Canfield Cardinals",
      sport: "American Football",
      url: "https://ohfootball.io/teams/canfield",
      address: {
        "@type": "PostalAddress",
        addressLocality: "Canfield",
        addressRegion: "OH",
        addressCountry: "US",
      },
    })
  })

  it("has no address when the city is not known", () => {
    expect(
      sportsTeamJsonLd(team({ city: null }), "https://ohfootball.io/teams/canfield"),
    ).not.toHaveProperty("address")
  })
})

describe("teamPageHead", () => {
  it("gives the titles, the description, and the records of the page", () => {
    const head = teamPageHead(team(), site, "/teams/canfield.html")

    expect(head.title).toBe(teamPageTitle(team()))
    expect(head.socialTitle).toBe(teamSocialTitle(team()))
    expect(head.description).toBe(teamDescription(team()))
    expect(head.jsonLd).toEqual({
      "@context": "https://schema.org",
      "@graph": [
        sportsTeamJsonLd(team(), "https://ohfootball.io/teams/canfield"),
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: "https://ohfootball.io/" },
            {
              "@type": "ListItem",
              position: 2,
              name: "Leaderboard",
              item: "https://ohfootball.io/leaderboard",
            },
            {
              "@type": "ListItem",
              position: 3,
              name: "Canfield Cardinals",
              item: "https://ohfootball.io/teams/canfield",
            },
          ],
        },
      ],
    })
  })

  it("writes names with marks in a script that reads back as the same data", () => {
    const head = teamPageHead(
      team({ name: "St John's", mascot: "Eagles (club)" }),
      site,
      "/teams/st-johns",
    )

    expect(JSON.parse(jsonLdScript(head.jsonLd))).toEqual(head.jsonLd)
  })
})
