import { InformationCircleIcon } from "@heroicons/react/20/solid"
import { twMerge } from "tailwind-merge"
import { Text } from "@/components/ui/text"
import { hasOutOfStateNote, OUT_OF_STATE_LEGEND } from "@/features/teams/utils/out-of-state"
import type { TeamSummary } from "@/types/api"

interface OutOfStateLegendProps {
  teams: readonly Pick<TeamSummary, "outOfStateGamesPlayed">[]
  className?: string
}

/** Tells what the mark means. It shows only when a school in the list has the mark. */
export function OutOfStateLegend({ teams, className }: OutOfStateLegendProps) {
  if (!hasOutOfStateNote(teams)) return null

  return (
    <Text className={twMerge("flex items-start gap-1.5 text-sm/6", className)}>
      <InformationCircleIcon aria-hidden className="mt-1 size-4 shrink-0 text-muted-fg" />
      {OUT_OF_STATE_LEGEND}
    </Text>
  )
}
