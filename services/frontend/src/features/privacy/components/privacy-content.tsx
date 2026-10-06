import { Container } from "@/components/ui/container"
import { Heading } from "@/components/ui/heading"
import { Text, TextLink } from "@/components/ui/text"
import { links } from "@/config/paths"
import { FINAL_DAYS } from "@/features/pickem/contract"

/** The longest time that a backup of the picks database can keep a row, in days. */
const BACKUP_DAYS = 30

const site: string[] = [
  "The site sets no cookie, and you do not need an account.",
  "The site keeps your choice of a light or a dark theme in your browser. It does not send the choice anywhere.",
  "Cloudflare hosts the site. Cloudflare keeps its own logs of the requests it answers.",
]

const pickem: string[] = [
  "When you pick a winner, the site stores a keyed hash of the network address that Cloudflare reports for you. The hash is HMAC-SHA256 with a secret that only the site holds. The site never stores the address itself.",
  "An IPv6 address counts by its first 64 bits.",
  "With the hash, the site stores the side you picked, the time of the pick, the season, and the date of the game.",
  "Each network address gets one pick for each game. So the people on one network, such as a home or a school, share one pick.",
  "You can change or remove a pick until midnight in Ohio after the game day.",
  `The site deletes the hash and the pick about ${FINAL_DAYS} days after the game. The removal runs when the site next stores or removes a pick, at most once an hour. The count of picks for each side stays.`,
  `Cloudflare runs the function that stores the picks and the database that holds them. The database keeps backups for up to ${BACKUP_DAYS} days, so a deleted pick can stay in a backup that long.`,
]

function Section({ id, title, items }: { id: string; title: string; items: string[] }) {
  return (
    <section className="mt-12" aria-labelledby={id}>
      <Heading id={id} level={2} className="text-2xl/8 sm:text-3xl/9">
        {title}
      </Heading>
      <ul className="mt-4 list-disc space-y-3 ps-5 text-base/7 text-muted-fg marker:text-muted-fg">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  )
}

/** What the site keeps about a visitor, and what Pick 'Em stores. Nothing in it runs in the browser. */
export function PrivacyContent() {
  return (
    <main>
      <Container className="max-w-6xl py-12 sm:py-16 lg:py-20">
        <div className="max-w-3xl">
          <Heading className="text-4xl/none sm:text-5xl/none">Privacy</Heading>
          <Text className="mt-4 text-base/7 sm:text-lg/8">
            What ohfootball.io keeps about you. The list is short, because the site keeps very
            little.
          </Text>

          <Section id="site-heading" title="The Site" items={site} />
          <Section id="pickem-heading" title="Pick 'Em" items={pickem} />

          <section className="mt-12" aria-labelledby="contact-heading">
            <Heading id="contact-heading" level={2} className="text-2xl/8 sm:text-3xl/9">
              Contact
            </Heading>
            <Text className="mt-4 text-base/7">
              For a question about your data, send an email to{" "}
              <TextLink href={links.contact}>hey@ohfootball.io</TextLink>.
            </Text>
          </section>
        </div>
      </Container>
    </main>
  )
}
