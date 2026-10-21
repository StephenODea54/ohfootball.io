"use client"

import { useMemo, useState } from "react"
import { ComboBox, ComboBoxContent, ComboBoxInput, ComboBoxItem } from "@/components/ui/combo-box"
import { Label } from "@/components/ui/field"

interface CountyFieldProps {
  /** The names of the counties, A to Z. */
  counties: readonly string[]
  /** The chosen county, or null for all counties. */
  value: string | null
  onChange: (county: string | null) => void
  className?: string
}

/** A name search that chooses one county. An empty field means all counties. */
export function CountyField({ counties, value, onChange, className }: CountyFieldProps) {
  const [query, setQuery] = useState(value ?? "")
  // The county can change from outside, for example with a click on the map. The text of the
  // field then follows it.
  const [shown, setShown] = useState(value)
  if (shown !== value) {
    setShown(value)
    setQuery(value ?? "")
  }

  // While the field shows the chosen county, the list shows every county and not only that one.
  const search = query === (value ?? "") ? "" : query.trim().toLowerCase()
  const matches = useMemo(
    () =>
      counties.filter((name) => name.toLowerCase().includes(search)).map((name) => ({ id: name })),
    [counties, search],
  )

  return (
    <ComboBox
      allowsEmptyCollection
      className={className}
      inputValue={query}
      items={matches}
      onInputChange={(text) => {
        setQuery(text)
        // Both the text and the value are controlled, so an empty field clears the county here.
        if (text === "" && value !== null) onChange(null)
      }}
      value={value}
      onChange={(key) => {
        const county = key === null ? null : String(key)
        // A blur after a search that chose nothing gives the same county. The text then shows
        // that county again.
        setQuery(county ?? "")
        if (county !== value) onChange(county)
      }}
    >
      <Label>County</Label>
      <ComboBoxInput placeholder="All counties" />
      <ComboBoxContent
        items={matches}
        renderEmptyState={() => (
          <div className="px-3 py-6 text-center text-muted-fg text-sm/6">
            No county matches that name.
          </div>
        )}
      >
        {(county) => <ComboBoxItem id={county.id}>{county.id}</ComboBoxItem>}
      </ComboBoxContent>
    </ComboBox>
  )
}
