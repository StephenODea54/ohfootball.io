import { twMerge } from "tailwind-merge"

interface CodeBlockProps extends React.ComponentPropsWithoutRef<"pre"> {
  /** Names the block for a screen reader, because a long line makes the block scroll. */
  label: string
  children: string
}

/**
 * A block of code or of text to copy. It scrolls to the side when a line is too long for the
 * screen, and a keyboard can reach it so that the scroll works without a mouse.
 *
 * The Snippet component of Intent UI is not used, because it is a client component with tabs and
 * a copy button that work only after hydration, and the content of the API page runs no script.
 */
export function CodeBlock({ label, children, className, ...props }: CodeBlockProps) {
  return (
    <pre
      {...props}
      // A named region that takes focus, because a keyboard cannot scroll a region without focus.
      role="region"
      aria-label={label}
      tabIndex={0}
      className={twMerge(
        "overflow-x-auto rounded-lg border bg-muted px-4 py-3 font-mono text-fg text-sm/6 outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <code>{children}</code>
    </pre>
  )
}
