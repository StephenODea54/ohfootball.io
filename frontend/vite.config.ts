import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

import { type PrerenderPage, teamPages } from './prerender'

/**
 * How many pages are drawn at once while building. The work is mostly waiting on the API, so more
 * than one at a time helps, and forty thousand pages one after another would not finish quickly.
 */
const PRERENDER_CONCURRENCY = 8

export default defineConfig(async ({ command }) => {
  // Every page is drawn while the site is built, so the deployed site is files and nothing runs to
  // answer a visitor. The team pages are asked for by address, because the plugin cannot find an
  // address that carries a key only the data knows.
  const endpoint = process.env.VITE_GRAPHQL_URL
  const cap = process.env.PRERENDER_TEAM_LIMIT
    ? Number(process.env.PRERENDER_TEAM_LIMIT)
    : undefined

  let pages: PrerenderPage[] = []
  if (command === 'build') {
    if (!endpoint) {
      throw new Error(
        'VITE_GRAPHQL_URL is required to build the site, because every team page is drawn ' +
          'from the API while the site is built.',
      )
    }
    pages = await teamPages(endpoint, cap)
    console.log(`prerendering ${pages.length} team pages from ${endpoint}`)
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
        },
        pages,
      }),
      viteReact(),
      babel({ presets: [reactCompilerPreset()] }),
    ],
  }
})
