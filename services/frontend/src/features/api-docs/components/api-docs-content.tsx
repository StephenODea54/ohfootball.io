import { Fragment } from "react"
import { CodeBlock } from "@/components/code-block"
import { Badge } from "@/components/ui/badge"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Container } from "@/components/ui/container"
import { Heading } from "@/components/ui/heading"
import { Code, Strong, Text, TextLink } from "@/components/ui/text"
import { links, paths } from "@/config/paths"
import {
  apiEndpoint,
  curlExample,
  errorExample,
  exampleContact,
  exampleUserAgent,
  limits,
  oneLine,
  playgroundHeadersExample,
  playgroundUrl,
  queryLimits,
  ruleErrors,
  schemaFields,
  topTenQuery,
} from "@/features/api-docs/api"

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
 * How to read the ratings and the predictions from the public API. The content is drawn when the
 * site is built and runs no script. It is the only page that may name the API.
 */
export function ApiDocsContent() {
  return (
    <main>
      <Container className="max-w-6xl py-12 sm:py-16 lg:py-20">
        <div className="min-w-0 max-w-3xl">
          <p className="font-semibold text-primary-subtle-fg text-sm/6 uppercase tracking-[0.18em]">
            API
          </p>
          <Heading className="mt-3 text-4xl/none sm:text-5xl/none">
            Read The Ratings From Your Code
          </Heading>
          <Text className="mt-5 text-base/7 sm:text-lg/8">
            The ratings and the predictions of the current season are available from a public
            GraphQL API. You do not need an account or a key. Follow the two rules on this page, so
            that the API stays fast for all callers.
          </Text>

          <Section id="endpoint" title="The Endpoint">
            <Text className="mt-3 text-base/7">
              Send each query to this address as a POST request with a JSON body:
            </Text>
            <CodeBlock label="The endpoint" className="mt-4">
              {apiEndpoint}
            </CodeBlock>
          </Section>

          <Section id="contact" title="Say Who You Are">
            <Text className="mt-3 text-base/7">
              Each request must name a contact. A contact is an email address, or a web address that
              starts with <Code>http://</Code> or <Code>https://</Code>. Put it in the{" "}
              <Code>User-Agent</Code> header:
            </Text>
            <CodeBlock label="A User-Agent header with a contact" className="mt-4">
              {`User-Agent: ${exampleUserAgent}`}
            </CodeBlock>
            <Text className="mt-4 text-base/7">
              If you cannot set <Code>User-Agent</Code>, for example in the{" "}
              <TextLink href={playgroundUrl}>playground at {playgroundUrl}</TextLink>, put the
              contact in a <Code>From</Code> header:
            </Text>
            <CodeBlock label="A From header with a contact" className="mt-4">
              {`From: ${exampleContact}`}
            </CodeBlock>
            <Text className="mt-4 text-base/7">
              The default <Code>User-Agent</Code> of a tool such as curl names no contact, so set
              your own. The contact lets us reach you if your requests cause a problem.
            </Text>
            <Text className="mt-3 text-base/7">
              A query that reads only the schema needs no contact. Its top-level fields must all be{" "}
              {schemaFields.map((field, index) => (
                <Fragment key={field}>
                  {index > 0 && (index === schemaFields.length - 1 ? ", or " : ", ")}
                  <Code>{field}</Code>
                </Fragment>
              ))}
              . So a tool that reads the schema, such as a code generator, works without a contact.
              These queries count toward the rate limits.
            </Text>
            <Text className="mt-3 text-base/7">
              A page on another site cannot call the API from a browser, because the API sends no
              CORS headers. Call it from a server or a script, or use the playground.
            </Text>
          </Section>

          <Section id="limits" title="Rate Limits">
            <ul className="mt-4 list-disc space-y-2 pl-5 text-base/7 text-muted-fg">
              <li>
                <Strong className="text-fg">{limits.addressPerMinute} requests a minute</Strong>{" "}
                from one address. You can send up to {limits.addressBurst} at once. After that, you
                get one more request each second.
              </li>
              <li>
                <Strong className="text-fg">{limits.totalPerSecond} requests a second</Strong> from
                all callers together, with up to {limits.totalBurst} at once.
              </li>
            </ul>
            <Text className="mt-4 text-base/7">
              An IPv6 network of size /64 counts as one address. Send your requests one after the
              other, and keep the answers that you need again.
            </Text>
            <Text className="mt-3 text-base/7">
              One query may select at most {queryLimits.fields} fields. Each alias and each field of
              a fragment counts, each time the query uses it. A query may have at most{" "}
              {queryLimits.tokens} tokens, and a request body may have at most {queryLimits.bodyMiB}{" "}
              MiB. These limits hold for queries that read only the schema too.
            </Text>
          </Section>

          <Section id="errors" title="Errors">
            <Text className="mt-3 text-base/7">
              When a request breaks a rule, the API sends one of these status codes. The body has
              the form of a GraphQL error, with the code in its extensions.
            </Text>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {ruleErrors.map((error) => (
                <Card key={error.id}>
                  <CardHeader>
                    <CardTitle className="flex flex-wrap items-center gap-2">
                      <Badge intent="danger">{error.status}</Badge>
                      <Code>{error.code}</Code>
                    </CardTitle>
                    <CardDescription>{error.meaning}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
            <CodeBlock label="The body of a 429 error" className="mt-4">
              {errorExample("RATE_LIMITED", "Too many requests. ...")}
            </CodeBlock>
          </Section>

          <Section id="example" title="Try It">
            <Text className="mt-3 text-base/7">
              This command asks for the current season. The answer holds its year.
            </Text>
            <CodeBlock label="A curl command" className="mt-4">
              {curlExample()}
            </CodeBlock>
            <Text className="mt-6 text-base/7">
              This query asks for the ten teams with the highest rating this season, with the
              record, the division, and the region of each team. Paste it into the playground:
            </Text>
            <CodeBlock label="The ten teams with the highest rating" className="mt-4">
              {topTenQuery}
            </CodeBlock>
            <Text className="mt-4 text-base/7">
              <Code>previousRank</Code> is the rank of the team one week earlier. Subtract{" "}
              <Code>rank</Code> from it to see how far the team moved: a positive number means it
              moved up.
            </Text>
            <Text className="mt-4 text-base/7">Or send the same query with curl:</Text>
            <CodeBlock
              label="A curl command for the ten teams with the highest rating"
              className="mt-4"
            >
              {curlExample(oneLine(topTenQuery))}
            </CodeBlock>
          </Section>

          <Section id="playground" title="The Playground">
            <Text className="mt-3 text-base/7">
              The <TextLink href={playgroundUrl}>playground</TextLink> runs queries in your browser.
              The schema, the documentation, and the completion load when the page opens. Before you
              run a query, replace the text in the <Code>From</Code> header of the Headers pane with
              your contact:
            </Text>
            <CodeBlock label="The Headers pane of the playground" className="mt-4">
              {playgroundHeadersExample()}
            </CodeBlock>
            <Text className="mt-4 text-base/7">
              Your browser keeps the Headers pane, so the contact is still there after a reload.
            </Text>
          </Section>

          <Section id="bulk" title="Bulk Data">
            <Text className="mt-3 text-base/7">
              Do not use the API to download every game or every season. Download the zip from the{" "}
              <TextLink href={paths.data.getHref()}>Data page</TextLink>, or use the{" "}
              <TextLink href={links.dataset}>Kaggle dataset</TextLink>. Both hold every game and
              rating, and both are published each week.
            </Text>
          </Section>
        </div>
      </Container>
    </main>
  )
}
