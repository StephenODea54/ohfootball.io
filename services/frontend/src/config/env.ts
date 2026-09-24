import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'

export const env = createEnv({
  /** The prefix a client variable must carry. The rule holds at the type level and at runtime. */
  clientPrefix: 'VITE_',

  client: {
    VITE_GRAPHQL_URL: z.string().url().optional(),
  },

  runtimeEnv: import.meta.env,

  /**
   * An empty value in a ".env" file becomes undefined. Without this, Zod reads the empty string and
   * reports a type error, and a variable with a default value never receives it.
   */
  emptyStringAsUndefined: true,
})
