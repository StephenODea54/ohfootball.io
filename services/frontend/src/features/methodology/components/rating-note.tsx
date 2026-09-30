import { Text, TextLink } from "@/components/ui/text"
import { paths } from "@/config/paths"
import { HOME_FIELD_NOTE, RATING_SUMMARY } from "@/features/methodology/rating-model"

interface RatingNoteProps {
  className?: string
  /** Add how home field changes a win chance. Use it where the page shows predictions. */
  homeField?: boolean
}

/** A short explanation of what a rating means, with a link to the methodology page. */
export function RatingNote({ className, homeField = false }: RatingNoteProps) {
  const text = homeField ? `${RATING_SUMMARY} ${HOME_FIELD_NOTE}` : RATING_SUMMARY

  return (
    <Text className={className}>
      {text} See <TextLink href={paths.methodology.getHref()}>how the ratings work</TextLink>.
    </Text>
  )
}
