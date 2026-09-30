/**
 * The width and height in pixels of each logo file. Each file is two times the largest size that
 * the site shows it at, so that it stays sharp on a high-density screen.
 *
 * The script in scripts/logos writes one file of each size for each team. The site reads the same
 * values to select a file.
 */
export const LOGO_SIZES = {
  /** For a logo in a row or on a card, shown at 40 pixels or less. */
  small: 80,
  /** For the logo at the top of a team page, shown at 96 pixels or less. */
  large: 192,
} as const

export type LogoSize = keyof typeof LOGO_SIZES

/** The name of the file that holds the logo of a team at one size, for example 842-80.webp. */
export function logoFileName(sourceId: string, size: LogoSize): string {
  return `${sourceId}-${LOGO_SIZES[size]}.webp`
}
