import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import { clientChains, hardStop } from './client-chains'

// A CLIENT FILE NEVER REACHES WHAT A BROWSER BUNDLE CANNOT HOLD (Phase 4 fix
// round; the walker and its rules: ./client-chains.ts). `next build` caught
// the Tag control (3abd43be) minutes in; this catches its shape in the test
// tier, in about a second.

describe('the client bundle guard', () => {
  it('no \'use client\' file\'s runtime imports reach a node: builtin, an unpolyfilled builtin, server-only or next/headers', () => {
    const { checked, chains } = clientChains(process.cwd())
    // Every client file was read (94 on 13 Oct), so an empty answer is an
    // answer and not a walk that found nothing.
    expect(checked).toBeGreaterThan(80)
    expect(chains.map((c) => `${c.file} -> ${c.hit}\n    ${c.trail.join('\n    -> ')}`)).toEqual([])
  })

  it('knows which builtins Next polyfills for the client', () => {
    expect(hardStop('node:fs')).toBe('a node: builtin')
    expect(hardStop('node:crypto')).toBe('a node: builtin')
    expect(hardStop('fs')).toBe('a Node builtin Next does not polyfill')
    expect(hardStop('fs/promises')).toBe('a Node builtin Next does not polyfill')
    expect(hardStop('child_process')).toBe('a Node builtin Next does not polyfill')
    expect(hardStop('server-only')).toBe('server-only')
    expect(hardStop('next/headers')).toBe('next/headers')
    for (const ok of ['crypto', 'path', 'url', 'buffer', 'react', 'next/link', 'lucide-react', '@/lib/format', './parts']) expect(hardStop(ok), ok).toBeNull()
  })
})

describe('it catches the Tag control\'s shape (99021861, fixed in 3abd43be)', () => {
  const root = mkdtempSync(join(tmpdir(), 'client-chains-'))
  afterAll(() => rmSync(root, { recursive: true, force: true }))
  const put = (path: string, text: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  // The shape the build failed on: a client control importing a style from
  // the page's parts, which import the page's loader, which reaches the
  // gather code and its node: modules.
  put('components/products/tag-control.tsx', `'use client'\nimport { BTN } from './parts'\nexport const TagControl = () => BTN\n`)
  put('components/products/parts.tsx', `import { loadProducts } from '@/lib/pages/products'\nexport const BTN = 'btn'\nexport const load = loadProducts\n`)
  put('lib/pages/products.ts', `import { gatherAll } from '../gather'\nexport const loadProducts = gatherAll\n`)
  put('lib/gather/index.ts', `import { readFileSync } from 'node:fs'\nexport const gatherAll = readFileSync\n`)
  // The fix: the style from a client-safe module.
  put('components/products/tag-control-fixed.tsx', `'use client'\nimport { BTN } from './buttons'\nexport const TagControl = () => BTN\n`)
  put('components/products/buttons.ts', `export const BTN = 'btn'\n`)
  // Not followed: a type-only import (erased), a 'use server' module (a
  // reference to an action, not its code), a polyfilled builtin.
  put('components/types-only.tsx', `'use client'\nimport type { gatherAll } from '@/lib/gather'\nimport { type loadProducts } from '@/lib/pages/products'\nexport type X = typeof gatherAll | typeof loadProducts\n`)
  put('components/action-button.tsx', `'use client'\nimport { save } from '@/lib/actions/save'\nexport const B = save\n`)
  put('lib/actions/save.ts', `'use server'\nimport { headers } from 'next/headers'\nexport async function save() { return headers() }\n`)
  put('components/hash.tsx', `'use client'\nimport { createHash } from 'crypto'\nexport const h = createHash\n`)
  // Caught: next/headers and server-only two hops down, an unpolyfilled bare
  // builtin, and a re-export.
  put('components/who.tsx', `'use client'\nimport { who } from './who-read'\nexport const W = who\n`)
  put('components/who-read.ts', `import { cookies } from 'next/headers'\nexport const who = cookies\n`)
  put('components/secret.tsx', `'use client'\nexport { secret } from '@/lib/secret'\n`)
  put('lib/secret.ts', `import 'server-only'\nexport const secret = 1\n`)
  put('hooks/use-file.ts', `'use client'\nimport { readFile } from 'fs/promises'\nexport const useFile = readFile\n`)

  it('names each broken chain, shortest first, and nothing else', () => {
    const { checked, chains } = clientChains(root)
    expect(checked).toBe(8)
    const byFile = Object.fromEntries(chains.map((c) => [c.file, c]))
    expect(Object.keys(byFile).sort()).toEqual(['components/products/tag-control.tsx', 'components/secret.tsx', 'components/who.tsx', 'hooks/use-file.ts'])
    expect(byFile['components/products/tag-control.tsx']).toEqual({
      file: 'components/products/tag-control.tsx',
      hit: 'a node: builtin',
      trail: ['components/products/tag-control.tsx', 'components/products/parts.tsx', 'lib/pages/products.ts', 'lib/gather/index.ts', 'node:fs'],
    })
    expect(byFile['components/who.tsx'].hit).toBe('next/headers')
    expect(byFile['components/secret.tsx'].hit).toBe('server-only')
    expect(byFile['hooks/use-file.ts'].hit).toBe('a Node builtin Next does not polyfill')
  })
})
