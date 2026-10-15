"use client"

import { useEffect, useState } from "react"
import { Heading } from "@/components/ui/heading"
import { Link } from "@/components/ui/link"
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Text } from "@/components/ui/text"
import { paths } from "@/config/paths"
import { loadRegion } from "@/features/playoffs/api/load-region"
import type { PlayoffDetail } from "@/features/playoffs/types"
import {
  formatAverage,
  formatGameDate,
  formatOdds,
  formatPoints,
  formatRecord,
  opponentLabel,
} from "@/features/playoffs/utils/format"

/** A final record from fewer runs than this is marked as rough. */
export const ROUGH_RUNS = 500

const header = "bg-muted/70 text-xs/5 uppercase tracking-wide"
const number = "text-end tabular-nums"

type State =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; team: PlayoffDetail | undefined }

/** The details of one team: its points now, its remaining games and its final records. */
export function TeamDetails({ region, sourceId }: { region: number; sourceId: string }) {
  const [state, setState] = useState<State>({ status: "loading" })
  useEffect(() => {
    let current = true
    setState({ status: "loading" })
    loadRegion(region).then(
      (data) =>
        current &&
        setState({
          status: "ready",
          team: data.details.find((team) => team.sourceId === sourceId),
        }),
      () => current && setState({ status: "failed" }),
    )
    return () => {
      current = false
    }
  }, [region, sourceId])

  if (state.status === "loading") return <Text>Loading the odds of this team…</Text>
  if (state.status === "failed" || !state.team) {
    return <Text>The odds of this team did not load. Try again later.</Text>
  }
  const team = state.team
  return (
    <div className="flex flex-col gap-6">
      <Text>
        A computer points average of {formatAverage(team.average)}: Level 1{" "}
        {formatPoints(team.levelOne)}, Level 2 {formatPoints(team.levelTwo)}, divisor {team.divisor}
        . {formatOdds(team.homeProbability)} to play its first playoff game at home.
      </Text>
      {team.remainingGames.length > 0 && <RemainingGames team={team} />}
      <FinalRecords team={team} />
      <Link href={paths.team.getHref(team.teamId)} className="text-primary-subtle-fg text-sm/6">
        Open the page of {team.name}
      </Link>
    </div>
  )
}

function RemainingGames({ team }: { team: PlayoffDetail }) {
  return (
    <section>
      <Heading level={3}>What Each Game Means</Heading>
      <Text className="mt-1 text-xs/5">
        The chance to make the playoffs after a win and after a loss.
      </Text>
      <Table aria-label={`${team.name} remaining games`} className="mt-2">
        <TableHeader className={header}>
          <TableColumn isRowHeader>Game</TableColumn>
          <TableColumn className="text-end">Win</TableColumn>
          <TableColumn className="text-end">If W</TableColumn>
          <TableColumn className="text-end">If L</TableColumn>
        </TableHeader>
        <TableBody items={team.remainingGames}>
          {(game) => (
            <TableRow id={game.id}>
              <TableCell className="text-fg">
                <span>
                  <span className="text-muted-fg">{formatGameDate(game.date)}</span>{" "}
                  {opponentLabel(game)}
                </span>
              </TableCell>
              <TableCell className={number}>{formatOdds(game.winProbability)}</TableCell>
              <TableCell className={`${number} text-fg`}>{formatOdds(game.qualifyIfWin)}</TableCell>
              <TableCell className={`${number} text-fg`}>
                {formatOdds(game.qualifyIfLoss)}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </section>
  )
}

function FinalRecords({ team }: { team: PlayoffDetail }) {
  const rows = team.records.map((row) => ({ ...row, id: formatRecord(row.record) }))
  const rough = rows.some((row) => row.runs < ROUGH_RUNS)
  return (
    <section>
      <Heading level={3}>By Final Record</Heading>
      <Text className="mt-1 text-xs/5">
        The range holds the final computer points average of nine runs in ten.
      </Text>
      <Table aria-label={`${team.name} odds by final record`} className="mt-2">
        <TableHeader className={header}>
          <TableColumn isRowHeader>Record</TableColumn>
          <TableColumn className="text-end">Chance</TableColumn>
          <TableColumn className="text-end">Average</TableColumn>
          <TableColumn className="text-end">Qualify</TableColumn>
        </TableHeader>
        <TableBody items={rows}>
          {(row) => (
            <TableRow id={row.id}>
              <TableCell className="text-fg">
                {row.id}
                {row.runs < ROUGH_RUNS && <span className="text-muted-fg"> †</span>}
              </TableCell>
              <TableCell className={number}>{formatOdds(row.probability)}</TableCell>
              <TableCell className={`${number} text-muted-fg`}>
                {formatAverage(row.lowAverage)}-{formatAverage(row.highAverage)}
              </TableCell>
              <TableCell className={`${number} text-fg`}>
                {formatOdds(row.qualifyProbability)}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {rough && (
        <Text className="mt-2 text-xs/5">
          † Fewer than {ROUGH_RUNS} runs ended with this record, so its odds are rough.
        </Text>
      )}
    </section>
  )
}
