"use client"

import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/20/solid"
import { useRef } from "react"
import { flushSync } from "react-dom"
import { twMerge } from "tailwind-merge"
import { Button } from "@/components/ui/button"
import { pageItems } from "@/features/teams/utils/paginate"

interface LeaderboardPaginationProps {
  /** The current page, from 1. */
  page: number
  pageCount: number
  onChange: (page: number) => void
  className?: string
}

/** Previous, the page numbers, and Next. It shows nothing when there is only one page. */
export function LeaderboardPagination({
  page,
  pageCount,
  onChange,
  className,
}: LeaderboardPaginationProps) {
  const navRef = useRef<HTMLElement>(null)

  if (pageCount <= 1) return null

  function go(next: number) {
    flushSync(() => onChange(next))
    // Previous on the first page and Next on the last page become disabled, and the browser then
    // drops their focus. Focus moves to the current page so that the keyboard keeps its place.
    const active = document.activeElement
    if (!active || active === document.body || (active as HTMLButtonElement).disabled) {
      navRef.current
        ?.querySelector<HTMLElement>('[aria-current="page"]')
        ?.focus({ preventScroll: true })
    }
  }

  return (
    <nav ref={navRef} aria-label="Leaderboard pages" className={twMerge("flex", className)}>
      <ul className="flex flex-wrap items-center justify-center gap-1">
        <li>
          <Button
            aria-label="Previous page"
            intent="plain"
            size="sq-sm"
            isDisabled={page <= 1}
            onPress={() => go(page - 1)}
          >
            <ChevronLeftIcon />
          </Button>
        </li>
        {pageItems(page, pageCount).map((item) =>
          typeof item === "number" ? (
            <li key={item}>
              <Button
                aria-label={`Page ${item}`}
                aria-current={item === page ? "page" : undefined}
                intent={item === page ? "outline" : "plain"}
                size="sm"
                className="touch-target min-w-9 tabular-nums"
                onPress={() => go(item)}
              >
                {item}
              </Button>
            </li>
          ) : (
            <li key={item} aria-hidden className="min-w-9 text-center text-muted-fg">
              …
            </li>
          ),
        )}
        <li>
          <Button
            aria-label="Next page"
            intent="plain"
            size="sq-sm"
            isDisabled={page >= pageCount}
            onPress={() => go(page + 1)}
          >
            <ChevronRightIcon />
          </Button>
        </li>
      </ul>
    </nav>
  )
}
