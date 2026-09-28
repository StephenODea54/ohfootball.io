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

/** The values the published ratings use. */
const parameters = [
  {
    id: "initial-rating",
    name: "Initial rating",
    value: "1500",
    note: "The rating of a team with no history and no division.",
  },
  {
    id: "k-factor",
    name: "K factor",
    value: "148",
    note: "The maximum rating a single game can move. It is large because a season is only about ten games.",
  },
  {
    id: "rating-scale",
    name: "Rating scale",
    value: "400",
    note: "A 400 point gap means the stronger team is expected to win about 91% of the time.",
  },
  {
    id: "home-advantage",
    name: "Home advantage",
    value: "30",
    note: "Added to the home team's rating before the probability is calculated. It never changes the stored rating.",
  },
  {
    id: "season-carryover",
    name: "Season carryover",
    value: "0.85",
    note: "The share of last season's ending rating that a returning program keeps.",
  },
  {
    id: "division-rating-step",
    name: "Division rating step",
    value: "140",
    note: "Points per division of separation in the preseason prior.",
  },
  {
    id: "provisional-games",
    name: "Provisional games",
    value: "3",
    note: "How long a team's early-season rating moves faster than normal.",
  },
  {
    id: "provisional-multiplier",
    name: "Provisional K multiplier",
    value: "1.6",
    note: "The size of that early-season boost. It decays linearly to 1.0.",
  },
  {
    id: "margin-weight",
    name: "Margin weight",
    value: "0",
    note: "Margin of victory is available in the model but is switched off in production.",
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
            <TableColumn className="w-24 text-end">Value</TableColumn>
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
