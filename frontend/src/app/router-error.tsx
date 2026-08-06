"use client"

import { ArrowPathIcon, HomeIcon } from "@heroicons/react/20/solid"
import { useQueryErrorResetBoundary } from "@tanstack/react-query"
import { useRouter, type ErrorComponentProps } from "@tanstack/react-router"
import { useEffect } from "react"
import { Button, buttonStyles } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Container } from "@/components/ui/container"
import { Heading } from "@/components/ui/heading"
import { Link } from "@/components/ui/link"
import { Text } from "@/components/ui/text"

export function RouterError({ error, reset }: ErrorComponentProps) {
  const router = useRouter()
  const queryErrorResetBoundary = useQueryErrorResetBoundary()

  useEffect(() => {
    queryErrorResetBoundary.reset()
  }, [queryErrorResetBoundary])

  const retry = () => {
    reset()
    void router.invalidate()
  }

  return (
    <main className="flex min-h-[calc(100svh-4rem)] items-center py-16">
      <Container className="max-w-xl">
        <Card role="alert">
          <CardHeader>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary-subtle-fg">
              Something went wrong
            </p>
            <Heading>We couldn&apos;t load this page.</Heading>
            <Text className="mt-2">
              The problem may be temporary. Try loading the page again, or head back to the teams list.
            </Text>
          </CardHeader>

          {import.meta.env.DEV && error instanceof Error && (
            <CardContent>
              <details className="rounded-lg border bg-muted/50 px-4 py-3 text-sm">
                <summary className="cursor-pointer font-medium">Error details</summary>
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs text-muted-fg">
                  {error.message}
                </pre>
              </details>
            </CardContent>
          )}

          <CardFooter className="flex flex-wrap gap-3">
            <Button onPress={retry}>
              <ArrowPathIcon aria-hidden />
              Try again
            </Button>
            <Link className={buttonStyles({ intent: "outline", size: "md" })} href="/">
              <HomeIcon aria-hidden />
              Back to teams
            </Link>
          </CardFooter>
        </Card>
      </Container>
    </main>
  )
}
