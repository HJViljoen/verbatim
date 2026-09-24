import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Two tiers, both offline.
//
// `lib/**/*.test.ts` — the PURE logic (clustering, quote scoping, merge
// validation, window math, the reading layer): no network, no DB, no GPT.
//
// `components/**/*.test.{ts,tsx}` — the component-render tier (Phase 1 WP0,
// decision X). One static `renderToStaticMarkup` per block, asserted against
// the copy-and-figures contract (lib/test/copy-contract.ts). No jsdom, no
// testing-library, no new dependency: it checks what a block PRINTS, which is
// the level the copy rules are written at. A block that needs a click needs a
// different kind of test.
//
// The dummy env vars exist because importing lib modules pulls in
// lib/openai.ts, whose client constructor throws without a key; no test ever
// calls it.
export default defineConfig({
  // The `@/*` alias tsconfig.json declares. Component files use it for every
  // cross-directory import, so the render tier cannot load one without it.
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  test: {
    // Both extensions under components/: a component-adjacent test with no JSX
    // in it — a registry or slide-key test, which is what
    // components/pages/gated-tiles.test.tsx nearly is — would otherwise sit
    // there not running, and nothing would say so.
    include: ['lib/**/*.test.ts', 'components/**/*.test.{ts,tsx}'],
    env: {
      OPENAI_API_KEY: 'test-dummy',
      NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-dummy',
      SUPABASE_SERVICE_ROLE_KEY: 'test-dummy',
    },
  },
})
