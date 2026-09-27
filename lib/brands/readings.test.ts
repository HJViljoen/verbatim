import { describe, expect, it } from 'vitest'

import { OSSUR_CLIENT_ID, SEALAND_CLIENT_ID } from '../config'
import { COTOPAXI, NORTH_FACE, PATAGONIA, SEP, SEP_BASE, SEP_BRANDS, SEP_MARKET, SEP_RIVAL_FOUND, sepMentions } from '../test/s3-run-brands'
import { brandRulesFor, WATCHED_RULE_VERSION } from './aliases'
import { monthBrandCounts } from './mentions'
import { brandReadingRows, brandsOf, mergeBrandRows, pooledBrandMonth, toStoredBrand, type ReadBrand, type Tracking } from './readings'

// month_brand_readings (WP3.5) on Sealand's September staging figures, on the
// one base of the 27 Sep ruling (lib/test/s3-run-brands.ts): Patagonia 45 in
// all and 13 without any video our rival searches found, The North Face 36
// and 6, Cotopaxi 28 and 3; 654 in all, 516 without them, for every brand.

const tracking = (watched: string[] = []): Tracking => ({
  competitor_names: ['Patagonia', 'The North Face', 'Cotopaxi', 'Freitag'], competitor_keywords: [], competitor_handles: {}, own_handles: {}, brand_keywords: ['sealand gear'],
  watched_brands: watched,
})
const competitors = [
  { id: PATAGONIA, name: 'Patagonia', retired_at: null }, { id: NORTH_FACE, name: 'The North Face', retired_at: null }, { id: COTOPAXI, name: 'Cotopaxi', retired_at: null },
]

describe('the brands a tenant has', () => {
  it('the client, its tracked rivals with a live identity and a rule, and the watched brands', () => {
    const { brands, lines } = brandsOf(SEALAND_CLIENT_ID, tracking(['Peak Design', 'tomtoc', 'Patagonia']), competitors)
    expect(brands.map((b) => `${b.rule.brand}|${b.brandKey}|${b.ruleVersion}`)).toEqual([
      'Sealand|client|brands_v1', `Cotopaxi|${COTOPAXI}|brands_v1`, `The North Face|${NORTH_FACE}|brands_v1`, `Patagonia|${PATAGONIA}|brands_v1`,
      `Peak Design|watched:peak-design|${WATCHED_RULE_VERSION}`, `tomtoc|watched:tomtoc|${WATCHED_RULE_VERSION}`,
    ])
    expect(lines).toContain('  Freitag: not a tracked rival with a live competitors row here; skipped')
    expect(lines).toContain('  Patagonia: watched, but already counted as a tracked brand; skipped')
  })

  it('a tenant with no brand rules reads none, watched or not (Össur)', () => {
    expect(brandsOf(OSSUR_CLIENT_ID, tracking(['Ottobock']), []).brands).toEqual([])
  })
})

function sepRead() {
  const rules = brandRulesFor(SEALAND_CLIENT_ID)
  const brands: ReadBrand[] = SEP_BRANDS.map((b) => ({ rule: rules.find((r) => r.brand === b.brand)!, brandKey: b.key, ruleVersion: 'brands_v1' }))
  const { mentions, rivalFound } = sepMentions()
  return {
    brands, plan: { mentions, homonymVideos: new Map(), dropped: [] }, ownerOf: () => null,
    markets: new Map([[SEP, SEP_MARKET]]), rivalFound,
  }
}

describe('the rows', () => {
  it('pooled over the market\'s audiences: staging\'s September figures over one base, and monthBrandCounts\' own', () => {
    const read = sepRead()
    expect(read.rivalFound.size).toBe(SEP_RIVAL_FOUND)
    const rows = brandReadingRows('sealand', read)
    for (const b of SEP_BRANDS) {
      const p = pooledBrandMonth(rows, SEP, b.key)
      expect([p.k_any, p.k_content, p.k_comment, p.k_organic, p.n], b.brand).toEqual([b.all, b.all, 0, b.organic, 654])
      // one base for every brand: the market less every video a rival search found
      expect(p.n_organic).toBe(SEP_BASE)
    }
    const counts = monthBrandCounts(read.plan.mentions, read.brands.map((b) => ({ brand: b.rule.brand, brandKey: b.brandKey })), {
      markets: new Map([[SEP, SEP_MARKET.map((v) => v.id)]]), ownerOf: read.ownerOf, rivalFound: read.rivalFound,
    })
    for (const c of counts) {
      const p = pooledBrandMonth(rows, SEP, c.brandKey)
      expect([p.k_any, p.k_content, p.k_comment, p.k_organic, p.n, p.n_organic]).toEqual([c.kAny, c.kContent, c.kComment, c.kOrganic, c.n, c.nOrganic])
    }
  })

  it('one row per audience and brand, zeros included, so n pools whole', () => {
    const rows = brandReadingRows('sealand', sepRead())
    expect(rows.filter((r) => r.brand_key === COTOPAXI).map((r) => `${r.audience} ${r.k_any} of ${r.n}`)).toEqual([
      'competitor:Cotopaxi 0 of 29', 'industry-other 28 of 625',
    ])
  })

  it('a brand\'s own post is its post: in n, never in k', () => {
    const read = { ...sepRead(), ownerOf: (v: string) => (v === 'cat-0' ? PATAGONIA : null) }
    expect(pooledBrandMonth(brandReadingRows('sealand', read), SEP, PATAGONIA)).toMatchObject({ k_any: 44, n: 654 })
  })

  it('a rejected hit is left out when the confirm is on', () => {
    const read = sepRead()
    const rows = brandReadingRows('sealand', read, (m) => m.row.video_id !== 'cat-0')
    expect(pooledBrandMonth(rows, SEP, PATAGONIA).k_any).toBe(44)
  })
})

describe('the merge', () => {
  it('writes September frozen on the run past its line; a frozen row is kept', () => {
    const rows = brandReadingRows('sealand', sepRead())
    const now = '2026-11-01T07:00:00.000Z'
    const r = mergeBrandRows({ months: [SEP], fresh: rows, stored: [], now, runId: 'run-2026-11-01' })
    expect(r.writes.every((w) => w.status === 'frozen' && w.frozen_at === now)).toBe(true)
    const stored = toStoredBrand(r.writes.map((w) => ({ month: w.month, audience: w.audience, brand_key: w.brand_key, status: w.status, origin: w.origin, frozen_at: w.frozen_at })))
    const again = mergeBrandRows({ months: [SEP], fresh: rows, stored, now: '2026-11-08T07:00:00.000Z', runId: 'run-2026-11-08' })
    expect(again.writes).toEqual([])
    expect(again.keptFrozen).toBe(rows.length)
  })
})
