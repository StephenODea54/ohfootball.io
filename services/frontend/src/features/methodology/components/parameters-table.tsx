"use client"

import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  CARRYOVER_LAST,
  CARRYOVER_OLDER,
  DIVISION_STEP,
  HISTORY_SEASONS,
  HOME_EDGE,
  LEARNING_OFFSET,
  LEARNING_RATE,
  MARGIN_CAP,
  OTHER_STATE_WEIGHT,
  SLOPE_SEASONS,
} from "@/features/methodology/rating-model"

/** The values the published ratings use. */
const parameters = [
  {
    id: "home-edge",
    name: "Home edge",
    value: HOME_EDGE.toString(),
    note: "Points added to the expected margin of the home team.",
  },
  {
    id: "learning-rate",
    name: "Learning rate",
    value: `${LEARNING_RATE} / (n + ${LEARNING_OFFSET})`,
    note: "The share of a surprise that moves a rating. n is the games played this season.",
  },
  {
    id: "margin-cap",
    name: "Margin cap",
    value: MARGIN_CAP.toString(),
    note: `The largest margin that a game counts, for the final and for the expected margin. A bigger margin counts as ${MARGIN_CAP} points.`,
  },
  {
    id: "division-step",
    name: "Division step",
    value: DIVISION_STEP.toString(),
    note: "Points per division of separation in the prior of a new program.",
  },
  {
    id: "carryover-last",
    name: "Last season",
    value: CARRYOVER_LAST.toString(),
    note: "The share of last season's final rating in the start of a season.",
  },
  {
    id: "carryover-older",
    name: "Earlier seasons",
    value: CARRYOVER_OLDER.toString(),
    note: `The share of the average of up to ${HISTORY_SEASONS} seasons before that one.`,
  },
  {
    id: "slope-window",
    name: "Slope window",
    value: SLOPE_SEASONS.toString(),
    note: "The number of earlier seasons that each win probability slope is fit on.",
  },
  {
    id: "other-state-weight",
    name: "Out-of-state weight",
    value: OTHER_STATE_WEIGHT.toString(),
    note: "The share of its normal change that an Ohio team moves by in a game against an out-of-state team. The out-of-state team moves by its full change.",
  },
]

/** The tuned parameters of the rating model, one row each. */
export function ParametersTable() {
  return (
    <Card className="mt-5 gap-0 overflow-hidden py-0 shadow-none [--gutter:--spacing(4)]">
      <CardContent>
        <Table aria-label="Production rating parameters" bleed>
          <TableHeader className="bg-muted/70 uppercase text-xs/5 tracking-wide">
            <TableColumn isRowHeader>Parameter</TableColumn>
            <TableColumn className="w-32 text-end">Value</TableColumn>
            <TableColumn>What It Does</TableColumn>
          </TableHeader>
          <TableBody items={parameters}>
            {(parameter) => (
              <TableRow id={parameter.id}>
                <TableCell className="font-medium text-fg">{parameter.name}</TableCell>
                <TableCell className="text-end font-semibold text-fg">{parameter.value}</TableCell>
                <TableCell className="text-muted-fg">{parameter.note}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
