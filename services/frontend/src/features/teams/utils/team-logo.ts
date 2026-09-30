import manifest from "@/features/teams/utils/logo-manifest.json"
import { type LogoSize, logoFileName } from "@/features/teams/utils/logo-sizes"

/** The teams that have a logo file. scripts/logos writes the list together with the files. */
const TEAMS_WITH_A_LOGO: ReadonlySet<string> = new Set(manifest)

/**
 * The address of the logo of a team, or null when the team has no logo. The site asks only for
 * a file that the manifest lists, so a team without a logo causes no failed request.
 */
export function logoHref(sourceId: string | null, size: LogoSize): string | null {
  return sourceId !== null && TEAMS_WITH_A_LOGO.has(sourceId)
    ? `/logos/${logoFileName(sourceId, size)}`
    : null
}

/**
 * Up to two letters for a team without a logo: the first letter of each of the first two words.
 * A note in parentheses, such as "(club)", is not part of the name.
 */
export function teamInitials(name: string): string {
  const words = name
    .replace(/\([^)]*\)/g, " ")
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((word) => word.length > 0)
  return words
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("")
}
