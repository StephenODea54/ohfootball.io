import { Container } from "@/components/ui/container"
import { Heading } from "@/components/ui/heading"
import { Text, TextLink } from "@/components/ui/text"
import { links } from "@/config/paths"
import { FINAL_DAYS } from "@/features/pickem/contract"

/** What the site keeps about a visitor. Nothing in it runs in the browser. */
export function PrivacyContent() {
  return (
    <main>
      <Container className="max-w-6xl py-12 sm:py-16 lg:py-20">
        <div className="max-w-3xl">
          <Heading className="text-4xl/none sm:text-5xl/none">Privacy</Heading>
          <Text className="mt-6 text-base/7">
            ohfootball.io has no accounts and sets no cookies. Your browser remembers whether you
            chose light or dark mode. That setting never leaves your device.
          </Text>
          <Text className="mt-4 text-base/7">
            When you vote on a game, we store your vote with a scrambled form of your network
            address. We never store the address itself, and nothing else about you. Everyone on the
            same network shares one vote. We delete the scrambled address about {FINAL_DAYS} days
            after the game and keep only the vote totals.
          </Text>
          <Text className="mt-4 text-base/7">
            Questions: <TextLink href={links.contact}>hey@ohfootball.io</TextLink>
          </Text>
        </div>
      </Container>
    </main>
  )
}
