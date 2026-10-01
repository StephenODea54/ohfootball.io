"use client"

import { useMemo, useState } from "react"
import { ComboBox, ComboBoxContent, ComboBoxInput, ComboBoxItem } from "@/components/ui/combo-box"
import { Label } from "@/components/ui/field"
import type { ProgramOption } from "@/features/compare/types"
import { rankTeams } from "@/features/teams/utils/rank-teams"

/** Enough matches to find the right school without rendering the whole state. */
const MAX_MATCHES = 25

interface ProgramPickerProps {
  label: string
  programs: readonly ProgramOption[]
  /** The source id of the chosen school, or null. */
  selectedKey: string | null
  onSelectionChange: (sourceId: string | null) => void
  /** The school of the other side. It is not offered, so both sides cannot hold one school. */
  excludeSourceId?: string | null
}

/** A name search that chooses one school of a comparison. */
export function ProgramPicker({
  label,
  programs,
  selectedKey,
  onSelectionChange,
  excludeSourceId,
}: ProgramPickerProps) {
  const choices = useMemo(
    () => programs.filter((program) => program.sourceId !== excludeSourceId),
    [programs, excludeSourceId],
  )
  const selectedName = programs.find((program) => program.sourceId === selectedKey)?.name ?? ""
  const [query, setQuery] = useState(selectedName)
  // The chosen school can change from outside, for example with the swap button. The text of the
  // field then follows it.
  const [shownKey, setShownKey] = useState(selectedKey)
  if (shownKey !== selectedKey) {
    setShownKey(selectedKey)
    setQuery(selectedName)
  }

  // While the field shows the chosen school, the list shows the best schools and not only that
  // one. The chosen school stays in the list, so the combo box can still find it.
  const search = query === selectedName ? "" : query
  const matches = useMemo(() => {
    const ranked = rankTeams(choices, search, MAX_MATCHES)
    const chosen = choices.find((program) => program.sourceId === selectedKey)
    return search || !chosen || ranked.includes(chosen) ? ranked : [chosen, ...ranked]
  }, [choices, search, selectedKey])

  return (
    <ComboBox
      allowsEmptyCollection
      inputValue={query}
      items={matches}
      onInputChange={setQuery}
      value={selectedKey}
      onChange={(key) => onSelectionChange(key === null ? null : String(key))}
    >
      <Label>{label}</Label>
      <ComboBoxInput placeholder="Start typing a school name…" />
      <ComboBoxContent
        items={matches}
        renderEmptyState={() => (
          <div className="px-3 py-6 text-center text-muted-fg text-sm/6">
            No school matches that name.
          </div>
        )}
      >
        {(program) => (
          <ComboBoxItem id={program.sourceId} textValue={program.name}>
            {program.name}
          </ComboBoxItem>
        )}
      </ComboBoxContent>
    </ComboBox>
  )
}
