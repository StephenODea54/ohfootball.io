// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useTypedBeforeHydration } from "@/hooks/use-typed-before-hydration"
import { hydrateTyped } from "@/test/hydrate-typed"

afterEach(() => {
  cleanup()
  document.body.innerHTML = ""
})

function Field({ onTyped }: { onTyped: (text: string) => void }) {
  const ref = useTypedBeforeHydration<HTMLDivElement>(onTyped)
  return (
    <div ref={ref}>
      <input aria-label="Name" />
    </div>
  )
}

describe("useTypedBeforeHydration", () => {
  it("gives the text that was typed before hydration", () => {
    const onTyped = vi.fn()
    hydrateTyped(<Field onTyped={onTyped} />, "Troy")

    expect(onTyped).toHaveBeenCalledExactlyOnceWith("Troy")
  })

  it("gives nothing when the field is empty", () => {
    const onTyped = vi.fn()
    hydrateTyped(<Field onTyped={onTyped} />, "")

    expect(onTyped).not.toHaveBeenCalled()
  })

  it("tells React about a focus that came before hydration", () => {
    const onFocus = vi.fn()
    document.addEventListener("focusin", onFocus)
    hydrateTyped(<Field onTyped={() => {}} />, "Troy")
    document.removeEventListener("focusin", onFocus)

    // One event comes from the focus call itself and one from the hook.
    expect(onFocus).toHaveBeenCalledTimes(2)
  })

  it("sends no focus event when the field does not have focus", () => {
    const onFocus = vi.fn()
    document.addEventListener("focusin", onFocus)
    hydrateTyped(<Field onTyped={() => {}} />, "Troy", { focused: false })
    document.removeEventListener("focusin", onFocus)

    expect(onFocus).not.toHaveBeenCalled()
  })

  it("does nothing when the element holds no field", () => {
    const onTyped = vi.fn()
    function NoField() {
      const ref = useTypedBeforeHydration<HTMLDivElement>(onTyped)
      return <div ref={ref} />
    }
    render(<NoField />)

    expect(onTyped).not.toHaveBeenCalled()
  })
})
