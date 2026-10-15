"use client"

import {
  Disclosure,
  DisclosureGroup,
  DisclosurePanel,
  DisclosureTrigger,
} from "@/components/ui/disclosure-group"
import { Text, TextLink } from "@/components/ui/text"
import { paths } from "@/config/paths"

/** A short account of where the odds come from. */
export function HowItWorks({ runs }: { runs: number }) {
  return (
    <DisclosureGroup defaultExpandedKeys={["how"]}>
      <Disclosure id="how">
        <DisclosureTrigger>How playoff odds work</DisclosureTrigger>
        <DisclosurePanel>
          <Text className="text-sm/6">
            We play the rest of the regular season {runs.toLocaleString("en-US")} times with our
            team ratings, compute the OHSAA computer points of each run, seed each region, and then
            play its playoff games. The odds are unofficial.{" "}
            <TextLink href={paths.methodology.getHref()}>View the methodology</TextLink>.
          </Text>
        </DisclosurePanel>
      </Disclosure>
    </DisclosureGroup>
  )
}
