import { createHmac } from "node:crypto"
import { describe, expect, it, vi } from "vitest"
import { createHasher, hasherCache, MIN_SECRET_LENGTH } from "./hash"

const SECRET = "k".repeat(MIN_SECRET_LENGTH)

describe("createHasher", () => {
  it("makes the HMAC-SHA256 of the key as 64 hexadecimal characters", async () => {
    const hasher = createHasher(SECRET)
    const expected = createHmac("sha256", SECRET).update("v4:203.0.113.7").digest("hex")

    expect(await hasher?.("v4:203.0.113.7")).toBe(expected)
    expect(expected).toMatch(/^[0-9a-f]{64}$/)
  })

  it("gives another hash for another secret", async () => {
    const one = await createHasher(SECRET)?.("v4:1.2.3.4")
    const two = await createHasher(`${SECRET}x`)?.("v4:1.2.3.4")

    expect(one).not.toBe(two)
  })

  it("refuses a missing or short secret", () => {
    expect(createHasher(undefined)).toBeNull()
    expect(createHasher("")).toBeNull()
    expect(createHasher("k".repeat(MIN_SECRET_LENGTH - 1))).toBeNull()
  })

  it("imports the key once", async () => {
    const importKey = vi.spyOn(crypto.subtle, "importKey")
    const hasher = createHasher(SECRET)

    await hasher?.("v4:1.2.3.4")
    await hasher?.("v4:1.2.3.5")

    expect(importKey).toHaveBeenCalledTimes(1)
    importKey.mockRestore()
  })
})

describe("hasherCache", () => {
  it("keeps the hasher while the secret stays the same", () => {
    const hasherFor = hasherCache()

    const first = hasherFor(SECRET)

    expect(first).not.toBeNull()
    expect(hasherFor(SECRET)).toBe(first)
    expect(hasherFor(`${SECRET}x`)).not.toBe(first)
  })

  it("gives no hasher for a missing secret", () => {
    const hasherFor = hasherCache()

    expect(hasherFor(undefined)).toBeNull()
    expect(hasherFor(undefined)).toBeNull()
    expect(hasherFor("short")).toBeNull()
  })
})
