import { describe, expect, it } from "vitest"
import { calibrationCaption } from "@/features/accuracy/utils/captions"

describe("calibrationCaption", () => {
  it("names the top band", () => {
    expect(
      calibrationCaption([{ label: "95–100%", predicted: 98.06, observed: 98.6, games: 24650 }]),
    ).toBe(
      "In the 95–100% band, the model said 98.1% on average and the favorite won 98.6% of 24,650 games. The table has the numbers of each band.",
    )
    expect(calibrationCaption([])).toBe("No game has a result yet.")
  })
})
