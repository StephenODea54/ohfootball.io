/**
 * A pair of well known rivals. Each side is the source id of a program, so the pair stays the same
 * from one season to the next.
 */
export interface Rivalry {
  a: string
  b: string
}

/**
 * The rivalries that the team page links to. Each link opens the compare page with the pair. To
 * add one, add a pair of source ids. A team page shows the link only when both schools have a page
 * in the current season.
 */
export const rivalries: readonly Rivalry[] = [
  { a: "1624", b: "306" },
  { a: "1258", b: "1552" },
  { a: "1354", b: "1346" },
  { a: "522", b: "1388" },
  { a: "472", b: "1106" },
  { a: "760", b: "1268" },
  { a: "958", b: "394" },
  { a: "1736", b: "1210" },
]

/** The rivalries of one program. */
export function rivalriesOf(sourceId: string, list: readonly Rivalry[] = rivalries): Rivalry[] {
  return list.filter((rivalry) => rivalry.a === sourceId || rivalry.b === sourceId)
}

/** The name of a rivalry, for example "Piqua vs. Troy". */
export function rivalryName(a: { name: string }, b: { name: string }) {
  return `${a.name} vs. ${b.name}`
}
