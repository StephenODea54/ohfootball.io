/**
 * The database never holds a client address. It holds an HMAC-SHA256 of the address key, made
 * with a secret that only the Function knows. Without the secret, the hash of a known address
 * cannot be made again.
 */

/** A secret shorter than this is refused, so the Function answers as if it had none. */
export const MIN_SECRET_LENGTH = 32

/** Turns an address key into its hash: 64 hexadecimal characters. */
export type Hasher = (key: string) => Promise<string>

const encoder = new TextEncoder()

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

/** A hasher for `secret`, or null when the secret is missing or short. It imports the key once. */
export function createHasher(secret: string | undefined): Hasher | null {
  if (!secret || secret.length < MIN_SECRET_LENGTH) return null
  let key: Promise<CryptoKey> | null = null
  return async (text) => {
    key ??= crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    )
    return hex(await crypto.subtle.sign("HMAC", await key, encoder.encode(text)))
  }
}

/**
 * Keeps one hasher for the secret it saw last, so an isolate imports the key once. A new secret
 * gets a new hasher.
 */
export function hasherCache(): (secret: string | undefined) => Hasher | null {
  let last: { secret: string | undefined; hasher: Hasher | null } | null = null
  return (secret) => {
    if (!last || last.secret !== secret) last = { secret, hasher: createHasher(secret) }
    return last.hasher
  }
}
