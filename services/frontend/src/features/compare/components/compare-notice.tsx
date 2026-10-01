import { Text } from "@/components/ui/text"

/**
 * A short message about the comparison, such as a school that the address named and the site does
 * not know. The live region is always there, so a screen reader hears a new message.
 */
export function CompareNotice({ message }: { message: string | null }) {
  return (
    <Text role="status" className="mt-4 empty:hidden">
      {message}
    </Text>
  )
}
