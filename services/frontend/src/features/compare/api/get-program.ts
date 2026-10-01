import { graphqlRequest } from "@/lib/graphql-client"
import type { Program } from "@/types/api"

/**
 * The rating history and the games of one program. Only the history file of the program reads
 * it, so the answer is not kept for the rest of the build.
 */
export async function getProgram(sourceId: string): Promise<Program> {
  const data = await graphqlRequest<{ program: Program | null }>(
    `
        query Program($sourceId: String!) {
          program(sourceId: $sourceId) {
            sourceId
            ratingHistory { season value: relativeRating rank asOf }
            games {
              season
              date
              opponentSourceId
              result
              teamScore
              opponentScore
              playoff
            }
          }
        }
      `,
    { sourceId },
  )
  if (!data.program) throw new Error(`the API has no program ${sourceId}`)
  return data.program
}
