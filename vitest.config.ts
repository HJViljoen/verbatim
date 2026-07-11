import { defineConfig } from 'vitest/config'

// Unit tests cover the PURE pipeline logic only (clustering, quote scoping,
// merge validation, window math) — no network, no DB, no GPT. The dummy env
// vars exist because importing lib modules pulls in lib/openai.ts, whose
// client constructor throws without a key; no test ever calls it.
export default defineConfig({
  test: {
    include: ['lib/**/*.test.ts'],
    env: {
      OPENAI_API_KEY: 'test-dummy',
      NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-dummy',
      SUPABASE_SERVICE_ROLE_KEY: 'test-dummy',
    },
  },
})
