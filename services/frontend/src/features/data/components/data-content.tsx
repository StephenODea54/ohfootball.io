import { ArrowDownTrayIcon } from "@heroicons/react/20/solid"
import { CodeBlock } from "@/components/code-block"
import { buttonStyles } from "@/components/ui/button"
import { Container } from "@/components/ui/container"
import { Heading } from "@/components/ui/heading"
import { Link } from "@/components/ui/link"
import { Code, Text, TextLink } from "@/components/ui/text"
import { links } from "@/config/paths"
import {
  datePlaceholder,
  files,
  latestZipUrl,
  license,
  licenseUrl,
  pythonExample,
  snapshotsUrl,
  snapshotZipUrl,
} from "@/features/data/data"

function Section({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="mt-12" aria-labelledby={`${id}-heading`}>
      <Heading id={`${id}-heading`} level={2} className="text-2xl/8 sm:text-3xl/9">
        {title}
      </Heading>
      {children}
    </section>
  )
}

/**
 * How to download the weekly zip of the data. The content is drawn when the site is built and runs
 * no script.
 *
 * The download link has no download attribute. A browser ignores it for a file on another origin,
 * and the bucket sends each zip as an attachment, so the browser saves it without leaving the page.
 */
export function DataContent() {
  return (
    <main>
      <Container className="max-w-6xl py-12 sm:py-16 lg:py-20">
        <div className="min-w-0 max-w-3xl">
          <p className="font-semibold text-primary-subtle-fg text-sm/6 uppercase tracking-[0.18em]">
            Data
          </p>
          <Heading className="mt-3 text-4xl/none sm:text-5xl/none">Download The Data</Heading>
          <Text className="mt-5 text-base/7 sm:text-lg/8">
            The full record of games, teams, and ratings, as CSV files in one zip. A new copy is
            published each week. It is free to use for any purpose under{" "}
            <TextLink href={licenseUrl}>{license}</TextLink>.
          </Text>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={latestZipUrl} className={buttonStyles({ intent: "primary", size: "lg" })}>
              Download The Latest Zip <ArrowDownTrayIcon />
            </Link>
            <Link href={links.dataset} className={buttonStyles({ intent: "outline", size: "lg" })}>
              Open On Kaggle
            </Link>
          </div>

          <Section id="files" title="What Is In The Zip">
            <dl className="mt-5 divide-y divide-border border-y">
              {files.map((file) => (
                <div key={file.name} className="py-3 sm:flex sm:gap-6">
                  <dt className="shrink-0 sm:w-60">
                    <Code>{file.name}</Code>
                  </dt>
                  <dd className="mt-1 text-muted-fg text-sm/6 sm:mt-0">{file.holds}</dd>
                </div>
              ))}
            </dl>
            <Text className="mt-4 text-base/7">
              The <Code>README.md</Code> in the zip describes every column and how the files join.
            </Text>
          </Section>

          <Section id="load" title="Load It">
            <CodeBlock label="Read the games with pandas" className="mt-4">
              {pythonExample}
            </CodeBlock>
          </Section>

          <Section id="snapshots" title="Older Copies">
            <Text className="mt-3 text-base/7">
              The zip of each week is also kept at{" "}
              <Code className="break-all">{snapshotZipUrl(datePlaceholder)}</Code>, and{" "}
              <TextLink href={snapshotsUrl}>snapshots.json</TextLink> lists the dates.
            </Text>
          </Section>
        </div>
      </Container>
    </main>
  )
}
