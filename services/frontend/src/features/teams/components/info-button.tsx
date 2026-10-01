"use client"

import { InformationCircleIcon } from "@heroicons/react/20/solid"
import { buttonStyles } from "@/components/ui/button"
import { Dialog } from "@/components/ui/dialog"
import { Popover, PopoverBody, PopoverContent } from "@/components/ui/popover"
import { Text } from "@/components/ui/text"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cx } from "@/lib/primitive"

interface InfoButtonProps {
  /** The name of the thing that the note is about. The button and the popover use it as a name. */
  label: string
  /** The note. It shows in the tooltip and in the popover. */
  note: string
}

/**
 * A small button with an info icon, for example next to the title of a card. A pointer that rests
 * on it shows the note in a tooltip. A press opens a popover with the same note, because a touch
 * screen has no hover.
 */
export function InfoButton({ label, note }: InfoButtonProps) {
  return (
    <Popover>
      {/* The default delay of React Aria is 1.5 seconds. That is too slow for an icon that people
          point at to learn what it means. */}
      <Tooltip delay={300}>
        <TooltipTrigger
          aria-label={`About ${label}`}
          // The button is taller than a line of text. The negative margin keeps the line height.
          className={cx(buttonStyles({ intent: "plain", isCircle: true, size: "sq-xs" }), "-my-1")}
        >
          <InformationCircleIcon aria-hidden className="size-4!" />
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{note}</TooltipContent>
      </Tooltip>
      <PopoverContent arrow className="max-w-xs" placement="top">
        <Dialog aria-label={label}>
          <PopoverBody className="py-(--gutter)">
            <Text>{note}</Text>
          </PopoverBody>
        </Dialog>
      </PopoverContent>
    </Popover>
  )
}
