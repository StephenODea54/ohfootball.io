import { FIRST_SCORED_SEASON } from "@/features/accuracy/scored-seasons"
import { once } from "@/lib/build-cache"
import { graphqlRequest } from "@/lib/graphql-client"
import type { ModelAccuracy } from "@/types/api"

/**
 * The query that the Accuracy page sends. The tests of the API hold a copy, so change them
 * together.
 */
export const modelAccuracyQuery = `query ModelAccuracy($fromSeason: Int!) {
  modelAccuracy(fromSeason: $fromSeason) {
    currentSeason
    fromSeason
    overall { ...Score }
    seasons { season pendingGames inProgress score { ...Score } }
    phases { phase score { ...Score } }
    confidence { lowerBound upperBound games ties meanProbability favoriteWins observedRate accuracy }
    upsets { ...Game }
    exactMarginGames { ...Game }
    worstWeeks { ...Week }
    current {
      season
      weeks { ...Week }
      lastWeek { ...Week }
      lastWeekUpsets { ...Game }
      lastWeekExactMarginGames { ...Game }
    }
  }
}

fragment Score on AccuracyScore {
  games ties decided correct exactMargins accuracy expectedCorrect brierScore logLoss
}

fragment Week on SeasonWeekAccuracy {
  season week firstDate lastDate pendingGames score { ...Score }
}

fragment Game on ScoredGame {
  id season date
  winner { id sourceId name score }
  loser { id sourceId name score }
  winnerProbability
  winnerPredictedMargin
}`

/** The scores of the predictions from FIRST_SCORED_SEASON to the current season. */
export function getModelAccuracy(): Promise<ModelAccuracy> {
  return once("modelAccuracy", async () => {
    const data = await graphqlRequest<{ modelAccuracy: ModelAccuracy }>(modelAccuracyQuery, {
      fromSeason: FIRST_SCORED_SEASON,
    })
    return data.modelAccuracy
  })
}
