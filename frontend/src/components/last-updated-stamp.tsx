import { formatDate } from "@/lib/graphql"

/**
 * A small stamp pinned to the corner of the page. It answers the first question a visitor has
 * about any rating, which is how old the number is, without taking room in the layout.
 */
export function LastUpdatedStamp({ isoDate }: { isoDate: string | null }) {
  if (!isoDate) return null

  return (
    <p className="pointer-events-none fixed right-4 bottom-4 z-10 rounded-full border bg-bg/85 px-3 py-1.5 text-muted-fg text-xs/5 shadow-sm backdrop-blur-sm">
      Updated {formatDate(isoDate)}
    </p>
  )
}
