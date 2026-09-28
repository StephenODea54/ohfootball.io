import type { ReactNode } from "react"
import { twMerge } from "tailwind-merge"

/**
 * A small set of pieces that set mathematical notation with the styles of the
 * site. No typesetting library is needed, so the formulas use the same color
 * tokens, the same border radius, and the same light and dark themes as every
 * other block on the page.
 *
 * Screen readers get the `label` of the block and skip the visual markup, which
 * on its own reads as a list of unrelated letters.
 */

interface FormulaProps {
  children: ReactNode
  className?: string
  /** A plain sentence that says the formula out loud, for screen readers. */
  label: string
}

export function Formula({ children, className, label }: FormulaProps) {
  return (
    <div
      aria-label={label}
      className={twMerge(
        "flex flex-col items-center gap-y-3 overflow-x-auto rounded-lg border bg-muted/60 px-5 py-5 font-math text-fg text-lg/none lining-nums sm:text-xl/none",
        className,
      )}
      role="math"
    >
      {children}
    </div>
  )
}

/** One line of a formula. A block can hold more than one. */
export function FormulaLine({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center justify-center whitespace-nowrap">{children}</span>
  )
}

/** A single letter symbol, with an optional subscript and prime mark. */
export function Var({
  children,
  prime,
  sub,
}: {
  children: ReactNode
  prime?: boolean
  sub?: ReactNode
}) {
  return (
    <span className="italic">
      {children}
      {sub === undefined ? null : <sub className="text-[0.65em]">{sub}</sub>}
      {prime ? <span className="not-italic">&prime;</span> : null}
    </span>
  )
}

/** A name of more than one letter, such as `prior`. Names are set upright so
 * that they do not read as several symbols multiplied together. */
export function Name({ children }: { children: ReactNode }) {
  return <span className="text-[0.9em]">{children}</span>
}

/** An operator or a relation, with the space it needs on both sides. */
export function Op({ children }: { children: ReactNode }) {
  return <span className="mx-1.5 text-muted-fg">{children}</span>
}

/** Brackets around a group of terms. */
export function Group({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center">
      <span className="text-muted-fg">(</span>
      {children}
      <span className="text-muted-fg">)</span>
    </span>
  )
}

/** A stacked fraction with a rule between the two parts. */
export function Frac({ den, num }: { den: ReactNode; num: ReactNode }) {
  return (
    <span className="inline-flex flex-col items-center align-middle text-[0.9em] leading-tight">
      <span className="px-2 pb-1">{num}</span>
      <span className="w-full border-fg/25 border-t px-2 pt-1">{den}</span>
    </span>
  )
}

/** A base raised to an exponent. */
export function Pow({ base, exp }: { base: ReactNode; exp: ReactNode }) {
  return (
    <span>
      {base}
      <sup className="text-[0.65em]">{exp}</sup>
    </span>
  )
}

/** A symbol inside a sentence, such as the meaning of a term in prose. */
export function InlineMath({ children, label }: { children: ReactNode; label: string }) {
  return (
    <span aria-label={label} className="font-math text-[1.05em] lining-nums" role="math">
      {children}
    </span>
  )
}
