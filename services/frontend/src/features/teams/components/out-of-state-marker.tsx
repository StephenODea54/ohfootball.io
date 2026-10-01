"use client"

import { InformationCircleIcon } from "@heroicons/react/20/solid"
import { buttonStyles } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import {
  Popover,
  PopoverBody,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
} from "@/components/ui/popover"
import { Text } from "@/components/ui/text"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { outOfStateNote } from "@/features/teams/utils/out-of-state"
import { cx } from "@/lib/primitive"
import type { TeamSummary } from "@/types/api"

interface OutOfStateMarkerProps {
  team: Pick<TeamSummary, "outOfStateGamesPlayed">
  className?: string
}

/**
 * A small button next to the name of a school that played several games against out-of-state
 * teams, which the rating counts at half weight. A pointer that rests on it shows a tooltip with the count. A press opens a
 * popover that tells the same in a full sentence. A touch screen has no hover, so the press is
 * the part that works everywhere. It shows nothing for a school below the threshold.
 */
export function OutOfStateMarker({ team, className }: OutOfStateMarkerProps) {
  const note = outOfStateNote(team)
  if (!note) return null

  return (
    <Popover>
      {/* The default delay of React Aria is 1.5 seconds. That is too slow for an icon that people
          point at to learn what it means. */}
      <Tooltip delay={300}>
        <TooltipTrigger
          aria-label={note.label}
          // The button is taller than a line of text. The negative margin keeps the line as high
          // as the name of a school without a mark.
          className={cx(
            buttonStyles({ intent: "plain", isCircle: true, size: "sq-xs" }),
            "-my-1",
            className,
          )}
        >
          {/* The card of the home page gives every icon inside it a larger size. The important
              size keeps this icon the same on every page. */}
          <InformationCircleIcon aria-hidden className="size-4!" />
        </TooltipTrigger>
        <TooltipContent>{note.label}</TooltipContent>
      </Tooltip>
      <PopoverContent arrow className="max-w-xs" placement="top">
        {/* The Dialog gives the popover the role of a dialog and names it with the title. */}
        <Dialog>
          <PopoverHeader>
            <PopoverTitle>Less behind this rating</PopoverTitle>
          </PopoverHeader>
          <PopoverBody className="pb-(--gutter)">
            <Text>{note.text}</Text>
          </PopoverBody>
        </Dialog>
      </PopoverContent>
    </Popover>
  )
}
