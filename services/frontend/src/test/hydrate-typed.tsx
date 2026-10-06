import { render } from "@testing-library/react"
import type { ReactElement } from "react"
import { renderToString } from "react-dom/server"

/**
 * Draws the element as the server does, types into its first field as a visitor would before the
 * scripts load, then hydrates it.
 */
export function hydrateTyped(ui: ReactElement, text: string, { focused = true } = {}) {
  const container = document.body.appendChild(document.createElement("div"))
  container.innerHTML = renderToString(ui)
  const input = container.querySelector("input")
  if (!input) throw new Error("The element has no field")
  input.value = text
  if (focused) input.focus()
  return { ...render(ui, { container, hydrate: true }), input }
}
