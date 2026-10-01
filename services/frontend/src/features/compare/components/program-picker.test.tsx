// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ProgramPicker } from "@/features/compare/components/program-picker"

const programs = [
  { sourceId: "306", name: "Canton McKinley" },
  { sourceId: "309", name: "Canton South" },
  { sourceId: "1624", name: "Massillon Washington" },
]

afterEach(cleanup)

async function search(text: string) {
  const input = screen.getByRole("combobox", { name: "School" })
  act(() => {
    input.focus()
  })
  fireEvent.change(input, { target: { value: text } })
  return screen.findAllByRole("option")
}

describe("ProgramPicker", () => {
  it("does not offer the school of the other side", async () => {
    render(
      <ProgramPicker
        label="School"
        programs={programs}
        selectedKey={null}
        excludeSourceId="306"
        onSelectionChange={() => {}}
      />,
    )

    const options = await search("Canton")
    expect(options.map((option) => option.textContent)).toEqual(["Canton South"])
  })

  it("tells the page which school was chosen", async () => {
    const onSelectionChange = vi.fn()
    render(
      <ProgramPicker
        label="School"
        programs={programs}
        selectedKey={null}
        onSelectionChange={onSelectionChange}
      />,
    )

    const [first] = await search("Massillon")
    fireEvent.click(first)

    expect(onSelectionChange).toHaveBeenCalledWith("1624")
  })
})
