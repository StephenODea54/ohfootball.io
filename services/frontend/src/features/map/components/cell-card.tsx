import type { CSSProperties } from "react"
import { Text } from "@/components/ui/text"
import { TeamCard } from "@/features/map/components/team-card"
import type { MapMarker } from "@/features/map/utils/markers"
import { teamPlace } from "@/features/map/utils/team-place"
import type { Point } from "@/features/map/utils/zoom"

/** About half the width of a card, in CSS pixels, so a card near a side stays in the map box. */
const CARD_HALF = 120

/** A card this near the top of the map box goes below its point, so it is not cut off. */
const FLIP_BELOW_PX = 120

/** The color of a card of a school with no usable team color. */
const FALLBACK_COLOR = "var(--color-muted-fg)"

interface CellCardProps {
  marker: MapMarker
  /** The middle of the territory, in CSS pixels from the top left of the map box. */
  anchor: Point
  /** The width of the map box, in CSS pixels. */
  boxWidth: number
  /** The line below the name. Without it the card shows the rank and the rating. */
  detail?: string
}

/** Where the card goes in the map box: centered on the point, above it or below it. */
export function cardPlacement(anchor: Point, boxWidth: number) {
  const left = Math.min(Math.max(anchor.x, CARD_HALF), Math.max(CARD_HALF, boxWidth - CARD_HALF))
  return { left, top: anchor.y, below: anchor.y < FLIP_BELOW_PX }
}

/**
 * The card of the school that the pointer is on, in the style of the poster map. It shows above
 * the territory. On a narrow screen it is a strip at the bottom of the map. The card is only a
 * label: it takes no pointer, and screen readers skip it, as they skip the map.
 */
export function CellCard({ marker, anchor, boxWidth, detail }: CellCardProps) {
  const { left, top, below } = cardPlacement(anchor, boxWidth)
  const style = {
    "--tint": marker.color ?? FALLBACK_COLOR,
    "--card-x": `${left}px`,
    "--card-y": `${top}px`,
  } as CSSProperties

  return (
    <div
      aria-hidden="true"
      data-below={below || undefined}
      className="cell-card pointer-events-none absolute inset-x-2 bottom-2 sm:inset-x-auto sm:bottom-auto sm:left-(--card-x) sm:top-(--card-y) sm:-translate-x-1/2 sm:-translate-y-[calc(100%+12px)] sm:data-below:translate-y-3"
      style={style}
    >
      <TeamCard
        team={{
          sourceId: marker.sourceId,
          name: marker.name,
          rank: marker.rank,
          rating: marker.rating,
        }}
        label={teamPlace(marker)}
        detail={detail}
        style={style}
      />
      <Text className="mx-auto mt-1 hidden w-fit rounded-full bg-bg/90 px-2 text-fg text-xs/5 pointer-coarse:block sm:text-xs/5">
        Tap again to open
      </Text>
    </div>
  )
}
