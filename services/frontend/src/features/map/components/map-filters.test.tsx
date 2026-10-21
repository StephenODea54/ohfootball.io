// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { CountyField } from "@/features/map/components/county-field"
import { MapFilterBar } from "@/features/map/components/map-filters"
import { type MapFilters, NO_FILTERS } from "@/features/map/utils/map-view"

afterEach(cleanup)

const divisions = [
  { division: 1, regions: [1, 2] },
  { division: 3, regions: [9] },
]
const counties = ["Stark", "Summit", "Van Wert"]

function bar(filters: MapFilters = NO_FILTERS) {
  const handlers = {
    onDivisionChange: vi.fn(),
    onRegionChange: vi.fn(),
    onCountyChange: vi.fn(),
    onClear: vi.fn(),
  }
  render(<MapFilterBar filters={filters} divisions={divisions} counties={counties} {...handlers} />)
  return handlers
}

async function choose(field: RegExp, option: string) {
  fireEvent.click(screen.getByRole("button", { name: field }))
  fireEvent.click(await screen.findByRole("option", { name: option }))
}

describe("MapFilterBar", () => {
  it("chooses a division and goes back to all divisions", async () => {
    const { onDivisionChange } = bar()

    await choose(/Division/, "Division III")
    expect(onDivisionChange).toHaveBeenLastCalledWith(3)

    cleanup()
    const again = bar({ ...NO_FILTERS, division: 3 })
    await choose(/Division/, "All divisions")
    expect(again.onDivisionChange).toHaveBeenLastCalledWith(null)
  })

  it("offers every region with its division when no division is set", async () => {
    const { onRegionChange } = bar()

    fireEvent.click(screen.getByRole("button", { name: /Region/ }))
    const options = await screen.findAllByRole("option")
    expect(options.map((option) => option.textContent)).toEqual([
      "All regions",
      "Region 1 · Division I",
      "Region 2 · Division I",
      "Region 9 · Division III",
    ])
    fireEvent.click(options[3])
    expect(onRegionChange).toHaveBeenLastCalledWith(9)
  })

  it("hides the clear button until a filter is set", () => {
    bar()
    const hidden = screen.getByRole("button", { name: "Clear" })
    expect(hidden.hasAttribute("disabled")).toBe(true)
    expect(hidden.className).toContain("invisible")

    cleanup()
    const { onClear } = bar({ ...NO_FILTERS, county: "Stark" })
    fireEvent.click(screen.getByRole("button", { name: "Clear" }))
    expect(onClear).toHaveBeenCalled()
  })
})

function field(value: string | null, onChange = vi.fn()) {
  const view = render(<CountyField counties={counties} value={value} onChange={onChange} />)
  const input = screen.getByRole("combobox", { name: "County" }) as HTMLInputElement
  return { ...view, input, onChange }
}

async function type(input: HTMLInputElement, text: string) {
  act(() => {
    input.focus()
  })
  fireEvent.change(input, { target: { value: text } })
}

describe("CountyField", () => {
  it("finds a county by any part of its name and chooses it", async () => {
    const { input, onChange } = field(null)

    await type(input, "wer")
    const options = await screen.findAllByRole("option")
    expect(options.map((option) => option.textContent)).toEqual(["Van Wert"])
    fireEvent.click(options[0])
    expect(onChange).toHaveBeenLastCalledWith("Van Wert")
  })

  it("says when no county matches", async () => {
    const { input } = field(null)

    await type(input, "zzz")
    expect(await screen.findByText("No county matches that name.")).toBeTruthy()
  })

  it("clears the county when the field is emptied", async () => {
    const { input, onChange } = field("Stark")
    expect(input.value).toBe("Stark")

    await type(input, "")
    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  it("follows a county chosen from outside", () => {
    const onChange = vi.fn()
    const { input, rerender } = field(null, onChange)

    rerender(<CountyField counties={counties} value="Summit" onChange={onChange} />)
    expect(input.value).toBe("Summit")
    rerender(<CountyField counties={counties} value={null} onChange={onChange} />)
    expect(input.value).toBe("")
    expect(onChange).not.toHaveBeenCalled()
  })

  it("shows the chosen county again after a search that chose nothing", async () => {
    const { input, onChange } = field("Stark")

    await type(input, "Sum")
    act(() => {
      input.blur()
    })
    expect(input.value).toBe("Stark")
    expect(onChange).not.toHaveBeenCalled()
  })

  it("empties the field again after a search that chose no county", async () => {
    const { input, onChange } = field(null)

    await type(input, "Sum")
    act(() => {
      input.blur()
    })
    expect(input.value).toBe("")
    expect(onChange).not.toHaveBeenCalled()
  })
})
