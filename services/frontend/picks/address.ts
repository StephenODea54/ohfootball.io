/**
 * The key of a client address. One key gets one pick for each game.
 *
 * An IPv4 address is its own key, such as `v4:203.0.113.7`. An IPv6 address is keyed by its first
 * 64 bits, such as `v6:2001:db8:1:2`, because one home or one phone usually gets a whole /64. An
 * IPv4 address written in IPv6 form, such as `::ffff:203.0.113.7`, gets the IPv4 key.
 */

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
const GROUP = /^[0-9a-f]{1,4}$/i

/** The four numbers of an IPv4 address, or null when the text is not one. */
function ipv4(text: string): number[] | null {
  const match = IPV4.exec(text)
  if (!match) return null
  const parts = match.slice(1).map(Number)
  return parts.every((part) => part <= 255) ? parts : null
}

/** The groups of a list such as `2001:db8:0:1`. An IPv4 address at the end gives two groups. */
function groups(text: string, last: boolean): number[] | null {
  if (text === "") return []
  const found: number[] = []
  const parts = text.split(":")
  for (const [index, part] of parts.entries()) {
    const four = last && index === parts.length - 1 ? ipv4(part) : null
    if (four) {
      found.push(four[0] * 256 + four[1], four[2] * 256 + four[3])
    } else if (GROUP.test(part)) {
      found.push(Number.parseInt(part, 16))
    } else {
      return null
    }
  }
  return found
}

/** The eight groups of an IPv6 address, or null when the text is not one. */
function ipv6(text: string): number[] | null {
  const halves = text.split("::")
  if (halves.length > 2) return null
  if (halves.length === 1) {
    const all = groups(text, true)
    return all?.length === 8 ? all : null
  }
  const head = groups(halves[0], false)
  const tail = groups(halves[1], true)
  if (!head || !tail || head.length + tail.length > 7) return null
  return [...head, ...Array(8 - head.length - tail.length).fill(0), ...tail]
}

/** The key of the address that Cloudflare gives in CF-Connecting-IP, or null when it has none. */
export function addressKey(header: string | null): string | null {
  const text = header?.trim() ?? ""
  const four = ipv4(text)
  if (four) return `v4:${four.join(".")}`

  const all = ipv6(text.split("%")[0])
  if (!all) return null
  if (all.slice(0, 5).every((group) => group === 0) && all[5] === 0xffff) {
    return `v4:${[all[6] >> 8, all[6] & 255, all[7] >> 8, all[7] & 255].join(".")}`
  }
  return `v6:${all
    .slice(0, 4)
    .map((group) => group.toString(16))
    .join(":")}`
}
