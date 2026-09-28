import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Astro makes this module while it builds. The unit tests run without Astro, so they read a
      // stand-in with fixed values, and a test can replace it with vi.mock.
      "astro:env/server": fileURLToPath(new URL("./src/test/astro-env-server.ts", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
})
