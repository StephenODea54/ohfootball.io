import { isSafeSourceId } from "@/features/compare/utils/program-history"

/** The two programs of a comparison, by source id. A side with no program is null. */
export interface ComparePair {
  a: string | null
  b: string | null
}

/** The pair in an address, with what the page left out. */
export interface ParsedComparePair extends ComparePair {
  /** The ids that are not safe or that name no program the page holds. */
  dropped: string[]
  /** True when the address named the same program on both sides. */
  repeated: boolean
}

/** A dropped id is shown to the visitor, so a long value is cut. */
const MAX_SHOWN_LENGTH = 20

/**
 * The pair in a query string. An id that is not safe or not in `known` is dropped. A second id
 * equal to the first is dropped. `dropped` names what was left out, for a notice.
 */
export function parseComparePair(search: string, known: ReadonlySet<string>): ParsedComparePair {
  const params = new URLSearchParams(search)
  const dropped: string[] = []
  const read = (name: "a" | "b") => {
    const value = params.get(name)?.trim()
    if (!value) return null
    if (isSafeSourceId(value) && known.has(value)) return value
    dropped.push(value.slice(0, MAX_SHOWN_LENGTH))
    return null
  }

  const a = read("a")
  const b = read("b")
  const repeated = a !== null && a === b
  return { a, b: repeated ? null : b, dropped, repeated }
}

/** The message for what the address named and the page left out, or null when nothing was. */
export function pairNotice({ dropped, repeated }: Pick<ParsedComparePair, "dropped" | "repeated">) {
  const messages: string[] = []
  if (repeated) messages.push("Pick two different schools.")
  if (dropped.length > 0) {
    const ids = dropped.map((id) => `"${id}"`).join(" and ")
    messages.push(`No school with the id ${ids} has a page this season.`)
  }
  return messages.length > 0 ? messages.join(" ") : null
}
