import type { CalibrationPoint } from "@/features/accuracy/utils/chart-data"
import { formatCount } from "@/features/accuracy/utils/format"

/** The caption of the calibration chart. */
export function calibrationCaption(points: CalibrationPoint[]) {
  const top = points.at(-1)
  if (!top) return "No game has a result yet."
  return (
    `In the ${top.label} band, the model said ${top.predicted.toFixed(1)}% on average and the favorite won ` +
    `${top.observed.toFixed(1)}% of ${formatCount(top.games)} games. The table has the numbers of each band.`
  )
}
