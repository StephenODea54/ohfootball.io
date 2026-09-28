import react from "@astrojs/react"
import sitemap from "@astrojs/sitemap"
import babel from "@rolldown/plugin-babel"
import tailwindcss from "@tailwindcss/vite"
import { reactCompilerPreset } from "@vitejs/plugin-react"
import { defineConfig, envField } from "astro/config"

export default defineConfig({
  site: "https://ohfootball.io",
  // Every page is drawn while the site is built, so the deployed site is files and nothing runs to
  // answer a visitor. The browser never calls the API.
  output: "static",
  trailingSlash: "never",
  build: {
    // Cloudflare Pages serves /leaderboard from leaderboard.html. It serves
    // leaderboard/index.html only at /leaderboard/, and it sends /leaderboard there with a
    // redirect. So each page is written as a file named for its address. make pages checks this
    // before the site is published.
    format: "file",
    assets: "assets",
    // The work is mostly waiting on the API, so the build draws more than one page at a time.
    concurrency: 8,
  },
  server: { port: 3000 },
  devToolbar: { enabled: false },
  integrations: [
    react(),
    // Writes sitemap-index.xml and sitemap-0.xml from the pages the build wrote. Each address has
    // the form that Pages serves, with no .html and no slash at the end. The sitemap leaves out
    // 404. It gives no lastmod, because one date for every page would be wrong for pages such as
    // /about. make pages checks the sitemap before the site is published.
    sitemap(),
  ],
  vite: {
    plugins: [tailwindcss(), babel({ presets: [reactCompilerPreset()] })],
  },
  env: {
    // Only the build and the development server read these values. None of them goes into a page
    // or a script.
    schema: {
      GRAPHQL_URL: envField.string({ context: "server", access: "public", url: true }),
      // The build key. With it, the API lets the build skip the contact rule and the rate limits.
      // It must equal SITE_BUILD_KEY of the API.
      GRAPHQL_API_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      // Draws only this many team pages, to keep a build on a laptop short. Leave it unset for a
      // build that publishes.
      PRERENDER_TEAM_LIMIT: envField.number({
        context: "server",
        access: "public",
        optional: true,
        int: true,
        gt: 0,
      }),
    },
    validateSecrets: true,
  },
})
