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
    id: "home-edge",
    name: "Home edge",
    value: "1.5",
    note: "Points added to the expected margin of the home team.",
  },
  {
    id: "learning-rate",
    name: "Learning rate",
    value: "1.65 / (n + 5)",
    note: "The share of a surprise that moves a rating. n is the games played this season.",
  },
  {
    id: "margin-cap",
    name: "Margin cap",
    value: "56",
    note: "The largest margin that a game counts. A bigger win counts as 56 points.",
  },
  {
    id: "division-step",
    name: "Division step",
    value: "12",
    note: "Points per division of separation in the prior of a new program.",
  },
  {
    id: "carryover-last",
    name: "Last season",
    value: "0.8",
    note: "The share of last season's final rating in the start of a season.",
  },
  {
    id: "carryover-older",
    name: "Earlier seasons",
    value: "0.2",
    note: "The share of the average of up to eight seasons before that one.",
  },
  {
    id: "slope-window",
    name: "Slope window",
    value: "10",
    note: "The number of earlier seasons that each win probability slope is fit on.",
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
