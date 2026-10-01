"use client"

import { ArrowsRightLeftIcon, CheckIcon, LinkIcon } from "@heroicons/react/20/solid"
import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Heading } from "@/components/ui/heading"
import { Text } from "@/components/ui/text"
import { paths } from "@/config/paths"
import { CompareChart } from "@/features/compare/components/compare-chart"
import { CompareLegend } from "@/features/compare/components/compare-legend"
import { CompareNotice } from "@/features/compare/components/compare-notice"
import { CompareSeasonTable } from "@/features/compare/components/compare-season-table"
import { HeadToHeadCard } from "@/features/compare/components/head-to-head-card"
import { MeetingsTable } from "@/features/compare/components/meetings-table"
import { ProgramPicker } from "@/features/compare/components/program-picker"
import type { ProgramHistory, ProgramOption } from "@/features/compare/types"
import {
  type ComparePair,
  pairNotice,
  parseComparePair,
} from "@/features/compare/utils/compare-pair"
import { headToHead } from "@/features/compare/utils/head-to-head"
import { loadProgramHistory } from "@/features/compare/utils/load-program-history"
import { seasonLabeler } from "@/features/compare/utils/season-points"
import { mergeSeasonSeries } from "@/features/compare/utils/season-series"

interface CompareViewProps {
  season: number
  programs: ProgramOption[]
}

/** A copy of the set without the id. */
function withoutId(ids: ReadonlySet<string>, id: string): ReadonlySet<string> {
  if (!ids.has(id)) return ids
  const copy = new Set(ids)
  copy.delete(id)
  return copy
}

/** How long the copy button says that it copied the link. */
const COPIED_FOR_MS = 2000

/**
 * Two schools on one chart, with their season table and their record against each other. The
 * page holds the list of schools. The pair is in the query string, and each change is written back
 * to it. The history of each chosen school is a file of the site, which the browser loads when the
 * school is chosen.
 */
export function CompareView({ season, programs }: CompareViewProps) {
  const [pair, setPair] = useState<ComparePair>({ a: null, b: null })
  const [histories, setHistories] = useState<ReadonlyMap<string, ProgramHistory>>(() => new Map())
  const [notice, setNotice] = useState<string | null>(null)
  // The ids whose history did not load, so the page does not wait for them.
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set())
  const [copied, setCopied] = useState(false)
  // The ids already asked for, so a school is loaded one time.
  const requested = useRef(new Set<string>())
  const secondPicker = useRef<HTMLDivElement>(null)
  const known = useMemo(() => new Set(programs.map((program) => program.sourceId)), [programs])
  const names = useMemo(
    () => new Map(programs.map((program) => [program.sourceId, program.name])),
    [programs],
  )

  // Only the browser knows the address, so the pair is read after the first draw.
  // An address that named a school the page left out is written again with the pair it kept, so a
  // reload and a copied link give the same pair.
  useEffect(() => {
    const parsed = parseComparePair(window.location.search, known)
    setPair({ a: parsed.a, b: parsed.b })
    setNotice(pairNotice(parsed))
    const href = paths.compare.getHref(parsed)
    if (href !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, "", href)
    }
    if (parsed.a && !parsed.b) secondPicker.current?.querySelector("input")?.focus()
  }, [known])

  useEffect(() => {
    for (const sourceId of [pair.a, pair.b]) {
      if (sourceId === null || requested.current.has(sourceId)) continue
      requested.current.add(sourceId)
      setFailed((current) => withoutId(current, sourceId))
      const name = names.get(sourceId) ?? sourceId
      loadProgramHistory(sourceId)
        .then((history) => {
          if (history) {
            setHistories((current) => new Map(current).set(sourceId, history))
          } else {
            setFailed((current) => new Set(current).add(sourceId))
            setNotice(`The site has no ratings for ${name}.`)
          }
        })
        .catch(() => {
          // A failed load may pass, so the next choice of the school tries again.
          requested.current.delete(sourceId)
          setFailed((current) => new Set(current).add(sourceId))
          setNotice(`The ratings of ${name} did not load. Try again later.`)
        })
    }
  }, [pair, names])

  function choose(next: ComparePair) {
    setCopied(false)
    setPair(next)
    setNotice(null)
    window.history.replaceState(null, "", paths.compare.getHref(next))
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      window.setTimeout(() => setCopied(false), COPIED_FOR_MS)
    } catch {
      setNotice("The link did not copy. Copy the address from the address bar.")
    }
  }

  const a = pair.a ? (histories.get(pair.a) ?? null) : null
  const b = pair.b ? (histories.get(pair.b) ?? null) : null
  const loaded = [a, b].filter((history) => history !== null)
  const seasonLabel = seasonLabeler(season, loaded)
  const rows = mergeSeasonSeries(a?.seasons ?? [], b?.seasons ?? [])
  const record = a && b ? headToHead(a, b.sourceId) : null
  const nameA = a?.name ?? ""
  const nameB = b?.name ?? ""
  const loading = [pair.a, pair.b].some(
    (sourceId) => sourceId !== null && !histories.has(sourceId) && !failed.has(sourceId),
  )

  return (
    <div className="mt-8">
      <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
        <ProgramPicker
          label="First School"
          programs={programs}
          selectedKey={pair.a}
          excludeSourceId={pair.b}
          onSelectionChange={(sourceId) => choose({ a: sourceId, b: pair.b })}
        />
        <Button
          intent="plain"
          size="sq-sm"
          aria-label="Swap the schools"
          isDisabled={!pair.a && !pair.b}
          onPress={() => choose({ a: pair.b, b: pair.a })}
          className="justify-self-center"
        >
          <ArrowsRightLeftIcon />
        </Button>
        <div ref={secondPicker}>
          <ProgramPicker
            label="Second School"
            programs={programs}
            selectedKey={pair.b}
            excludeSourceId={pair.a}
            onSelectionChange={(sourceId) => choose({ a: pair.a, b: sourceId })}
          />
        </div>
      </div>

      <div className="mt-4">
        <Button intent="outline" size="sm" isDisabled={!pair.a && !pair.b} onPress={copyLink}>
          {copied ? <CheckIcon /> : <LinkIcon />}
          {copied ? "Link Copied" : "Copy Link"}
        </Button>
      </div>

      <CompareNotice message={notice} />

      {loaded.length === 0 ? (
        <Text className="mt-8">
          {loading ? "Loading the ratings…" : "Pick two schools to see their ratings on one chart."}
        </Text>
      ) : (
        <>
          <section className="mt-8" aria-labelledby="compare-chart-heading">
            <Heading id="compare-chart-heading" level={2} className="mb-4 text-lg/7 sm:text-lg/7">
              Rating By Season
            </Heading>
            <Card className="gap-5 py-5 shadow-none [--gutter:--spacing(4)] sm:[--gutter:--spacing(6)]">
              <CardContent className="grid gap-5">
                <CompareLegend a={a} b={b} season={season} />
                <CompareChart rows={rows} nameA={nameA} nameB={nameB} seasonLabel={seasonLabel} />
              </CardContent>
            </Card>
          </section>

          {a && b && record && (
            <section className="mt-10" aria-labelledby="head-to-head-heading">
              <Heading id="head-to-head-heading" level={2} className="mb-4 text-lg/7 sm:text-lg/7">
                Head To Head
              </Heading>
              {record.meetings.length > 0 ? (
                <div className="grid gap-4">
                  <HeadToHeadCard record={record} nameA={nameA} nameB={nameB} />
                  <MeetingsTable meetings={record.meetings} nameA={nameA} nameB={nameB} />
                </div>
              ) : (
                <Text>
                  {nameA} and {nameB} have not played each other in the seasons the site holds.
                </Text>
              )}
            </section>
          )}

          <section className="mt-10" aria-labelledby="compare-seasons-heading">
            <Heading id="compare-seasons-heading" level={2} className="mb-4 text-lg/7 sm:text-lg/7">
              Season By Season
            </Heading>
            <CompareSeasonTable
              rows={rows}
              nameA={a?.name ?? "Not chosen"}
              nameB={b?.name ?? "Not chosen"}
              seasonLabel={seasonLabel}
            />
          </section>
        </>
      )}
    </div>
  )
}
