import { Container } from "@/components/ui/container"
import { Link } from "@/components/ui/link"
import { Separator } from "@/components/ui/separator"
import { links, paths } from "@/config/paths"

const projectLinks = [
  { label: "GitHub", href: links.repository },
  { label: "Report An Issue", href: links.issues },
  { label: "Contact", href: links.contact },
]

/**
 * The foot of every page, with the links to the code, the issue tracker, and the author. Nothing
 * in it runs in the browser. The data pages link to the dataset, so the foot does not.
 */
export function AppFooter() {
  return (
    // The space below the links keeps the stamp in the corner of the page from covering them.
    <footer className="mt-16 pb-16">
      <Separator />
      <Container className="flex max-w-6xl flex-col gap-4 pt-8 sm:flex-row sm:items-center sm:justify-between">
        <Link href={paths.home.getHref()} className="font-semibold text-fg text-sm/6">
          ohfootball<span className="text-primary">.io</span>
        </Link>

        <nav aria-label="Project links">
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {projectLinks.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="text-muted-fg text-sm/6 hover:text-fg">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </Container>
    </footer>
  )
}
