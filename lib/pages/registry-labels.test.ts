import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { fakeDb } from '../test/fake-db'
import { loadRegistryLabels } from './registry-labels'

// One read for every page's registry labels (Phase 4 fix round): chunked,
// paged and fail-soft. Market kept an unchunked copy that threw.

const CLIENT = 'c1'

describe('loadRegistryLabels', () => {
  it('chunks a long id list (250 a request) and reads only the ids named', async () => {
    const rows = Array.from({ length: 600 }, (_, i) => ({ id: `r${i}`, client_id: CLIENT, canonical_label: `Label ${i}` }))
    const db = fakeDb({ theme_registry: [...rows, { id: 'other', client_id: 'c2', canonical_label: 'Not ours' }] })
    const ids = [...rows.map((r) => r.id), 'other', 'r1']
    const got = await loadRegistryLabels(db.client as never, CLIENT, ids)
    expect(got.size).toBe(600)
    expect(got.get('r599')).toBe('Label 599')
    expect(got.has('other')).toBe(false)
    expect(db.calls.filter((c) => c.table === 'theme_registry').map((c) => c.filters.find((f) => f.startsWith('id in')))).toEqual(['id in 250', 'id in 250', 'id in 101'])
  })

  it('fails soft: a refused read is no labels, never a throw', async () => {
    expect((await loadRegistryLabels(fakeDb({}).client as never, CLIENT, ['r1'])).size).toBe(0)
  })

  it('is the one copy: Market, Your moves and the legacy surface read through it', () => {
    for (const f of ['lib/pages/v2/market.ts', 'lib/pages/v2/moves.ts', 'lib/pages/market-surface.ts']) {
      const src = readFileSync(f, 'utf8')
      expect(src, f).toContain("from './registry-labels'".replace('./', f.includes('/v2/') ? '../' : './'))
      expect(src, f).not.toMatch(/function loadRegistryLabels/)
    }
  })
})
