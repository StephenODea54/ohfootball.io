import { Text, TextLink } from "@/components/ui/text"
import { paths } from "@/config/paths"

/** A short pointer to the methodology page, for the pages that show ratings. */
export function RatingNote({ className }: { className?: string }) {
  return (
    <Text className={className}>
      Curious about what the ratings represent?{" "}
      <TextLink href={paths.methodology.getHref()}>Check here</TextLink>.
    </Text>
  )
}
