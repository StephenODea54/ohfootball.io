import type { PlayoffProjection } from "@/features/playoffs/types"
import { once } from "@/lib/build-cache"
import { graphqlRequest } from "@/lib/graphql-client"

/** The query that the playoff page and the files of its regions send. They share one answer. */
export const playoffProjectionQuery = `query PlayoffProjection {
  playoffProjection {
    season asOf runs qualifiers byes homeGames
    regions {
      region division
      teams {
        teamId sourceId name rating
        record { wins losses ties }
        levelOne levelTwo divisor average
        qualifyProbability homeProbability byeProbability regionWinProbability expectedSeed
        remainingGames {
          id date opponentId opponentName location winProbability
          qualifyIfWin qualifyIfLoss homeIfWin homeIfLoss
        }
        records {
          record { wins losses ties }
          probability runs lowAverage medianAverage highAverage
          qualifyProbability homeProbability byeProbability
        }
      }
    }
  }
}`

/**
 * The newest projection of the current season, or null when the API has none.
 *
 * An API that does not know the query yet also gives null, with a warning in the log of the build.
 * So a site built before the API is deployed still builds, and its playoff page says that the odds
 * are not ready.
 */
export function getPlayoffProjection(): Promise<PlayoffProjection | null> {
  return once("playoffProjection", async () => {
    try {
      const data = await graphqlRequest<{ playoffProjection: PlayoffProjection | null }>(
        playoffProjectionQuery,
      )
      return data.playoffProjection
    } catch (error) {
      console.warn(`The playoff odds are left out of this build: ${String(error)}`)
      return null
    }
  })
}
