import { defineConfig, loadEnv } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

import { type PrerenderPage, teamPages } from './prerender'

/**
 * How many pages are drawn at once while building. The work is mostly waiting on the API, so more
 * than one at a time helps, and a page for every team of the season one after another would not
 * finish quickly.
 */
const PRERENDER_CONCURRENCY = 8

export default defineConfig(async ({ command, mode }) => {
  // Every page is drawn while the site is built, so the deployed site is files and nothing runs to
  // answer a visitor. The team pages are asked for by address, because the plugin cannot find an
  // address that carries a key only the data knows. Only the current season is drawn; see
  // ./prerender.ts for what that leaves out.
  //
  // Vite gives the .env files to the browser code but not to this file, so they are read here. A
  // value set in the environment of the shell takes precedence over the same value in a file.
  const settings = loadEnv(mode, process.cwd(), '')
  const endpoint = settings.VITE_GRAPHQL_URL
  const cap = settings.PRERENDER_TEAM_LIMIT ? Number(settings.PRERENDER_TEAM_LIMIT) : undefined

  let pages: PrerenderPage[] = []
  if (command === 'build') {
    if (!endpoint) {
      throw new Error(
        'VITE_GRAPHQL_URL is required to build the site, because every team page is drawn ' +
          'from the API while the site is built.',
      )
    }
    pages = await teamPages(endpoint, cap)
    console.log(`prerendering ${pages.length} current season team pages from ${endpoint}`)
  }

  return {
    resolve: { tsconfigPaths: true },
    plugins: [
      devtools(),
      nitro({ rollupConfig: { external: [/^@sentry\//] } }),
      tailwindcss(),
      tanstackStart({
        prerender: {
          enabled: true,
          concurrency: PRERENDER_CONCURRENCY,
          // A page that fails to draw would otherwise be published as a missing address, and
          // nothing would report it until somebody visited.
          failOnError: true,
          crawlLinks: false,
          // Cloudflare Pages serves /leaderboard from leaderboard.html. It serves
          // leaderboard/index.html only at /leaderboard/, and it sends /leaderboard there with a
          // redirect. The router removes that slash again, so each page is written as a file named
          // for its address. make pages checks this before the site is published.
          autoSubfolderIndex: false,
        },
        pages,
      }),
      viteReact(),
      babel({ presets: [reactCompilerPreset()] }),
    ],
  }
})
