import { describe, expect, it } from 'vitest'

import { SEALAND_CLIENT_ID } from '../config'
import type { AttributionInputs, TrackedBrands } from '../brands/attribution'
import { readingHandle } from '../reading/read'
import { fakeDb } from '../test/fake-db'
import { frozen, olderRead, sealandRead } from '../test/weekly-read-fixture'
import { loadWeekReadPage, paragraphs, readLead, weekReadPage, type QuoteOrigin } from './week-read'

const COTO = '11111111-1111-1111-1111-111111111111'
const PATA = '22222222-2222-2222-2222-222222222222'
const brands: TrackedBrands = { client: 'Sealand', rivals: new Map([[COTO, 'Cotopaxi'], [PATA, 'Patagonia']]), counts: () => true }
const names = { client: 'Sealand', market: { long: 'Other bags in your market', short: 'other bags' } }

/** Sixteen month videos behind the first finding: two filed under Cotopaxi,
 *  two whose talk names Patagonia, twelve of the category. */
const F1 = Array.from({ length: 16 }, (_, i) => `v${i}`)
function attribution(): AttributionInputs {
  const audiences = new Map(F1.map((v) => [v, 'industry-other']))
  audiences.set('v0', 'competitor:Cotopaxi')
  audiences.set('v1', 'competitor:Cotopaxi')
  audiences.set('q1', 'industry-other')
  audiences.set('w1', 'industry-other')
  return {
    audiences,
    namings: new Map([
      ['v2', [{ brandKey: PATA, commentId: 'c2', month: '2026-09-01' }]],
      ['v3', [{ brandKey: PATA, commentId: 'c3', month: '2026-09-01' }]],
      // A naming on a comment outside the finding's talk files nothing.
      ['v4', [{ brandKey: PATA, commentId: 'c-elsewhere', month: '2026-09-01' }]],
      ['w1', [{ brandKey: COTO, commentId: 'cw', month: '2026-09-01' }]],
    ]),
    brands,
  }
}

const read = () => sealandRead({
  findings: sealandRead().findings.map((f, i) => (i === 0 ? { ...f, monthVideoIds: F1 } : f)),
  alsoHeard: [
    { themeId: 'ta', label: 'Confusion over airline size rules', videos: 3, videoIds: ['x1', 'x2', 'x3'] },
    { themeId: 'tb', label: 'Cotopaxi praised for practical travel', videos: 1, videoIds: ['w1'] },
  ],
})
const themeComments = new Map([['t1', new Set(['c2', 'c3'])], ['tb', new Set(['cw'])]])
const origins = new Map<string, QuoteOrigin>([['e:e2aa9829-a7ec-4947-ac47-387a9a14133c', { commentId: 'cq', videoId: 'q1' }]])

describe('the pure half', () => {
  it('splits what was seen into paragraphs', () => {
    expect(paragraphs('One.\n\nTwo.\nThree.  ')).toEqual(['One.', 'Two.', 'Three.'])
    expect(paragraphs('')).toEqual([])
  })

  it('leads with the week in one line, or an older read’s In short', () => {
    expect(readLead(sealandRead())).toMatch(/^Buyers treated bag choice/)
    expect(readLead(olderRead())).toMatch(/^Buyers compared named bags/)
    expect(readLead(sealandRead({ headline: '  ' }))).toBeNull()
  })
})

describe('weekReadPage', () => {
  const page = weekReadPage({ read: read(), brand: 'Sealand', names, attribution: attribution(), themeComments, origins })

  it('prints every finding in the read’s order, numbered for the email’s anchors', () => {
    expect(page.findings.map((f) => [f.n, f.headline])).toEqual([
      [1, 'Buyers ask for named alternatives that match exact bag needs'],
      [2, 'Colour choice can decide whether buyers want the bag'],
      [3, 'A high price is accepted when quality looks built to last'],
    ])
    expect(page.lead).toMatch(/^Buyers treated bag choice/)
  })

  it('splits a finding’s month videos by who the talk is about, adding up to its count', () => {
    expect(page.findings[0].who).toEqual([
      { about: 'rival:Cotopaxi', videos: 2 },
      { about: 'rival:Patagonia', videos: 2 },
      { about: 'market', videos: 12 },
    ])
    expect(page.findings[0].who!.reduce((s, p) => s + p.videos, 0)).toBe(16)
  })

  it('prints no brand line for a finding stored before its videos were', () => {
    expect(page.findings[1].who).toBeNull()
  })

  it('a quote is about its own video and comment', () => {
    expect(page.findings[0].quote?.who).toEqual([{ about: 'market', videos: 1 }])
    expect(page.findings[1].quote).toBeNull()
  })

  it('also heard: label, the week’s videos and who', () => {
    expect(page.alsoHeard).toEqual([
      { label: 'Confusion over airline size rules', videos: 3, who: [{ about: 'market', videos: 3 }] },
      { label: 'Cotopaxi praised for practical travel', videos: 1, who: [{ about: 'rival:Cotopaxi', videos: 1 }] },
    ])
  })

  it('a label naming a brand its talk does not bear out says "a brand"', () => {
    const named = weekReadPage({
      read: sealandRead({ alsoHeard: [
        { themeId: 'ta', label: 'Patagonia praised for warmth', videos: 3, videoIds: ['x1', 'x2', 'x3'] },
        { themeId: 'tb', label: 'Cotopaxi praised for practical travel', videos: 1, videoIds: ['w1'] },
      ] }),
      brand: 'Sealand', names, attribution: attribution(), themeComments, origins, trackedNames: ['Sealand', 'Cotopaxi', 'Patagonia'],
    })
    expect(named.alsoHeard.map((x) => x.label)).toEqual(['A brand praised for warmth', 'Cotopaxi praised for practical travel'])
  })

  it('with no attribution read, no item carries a brand line', () => {
    const bare = weekReadPage({ read: read(), brand: 'Sealand', names, attribution: null, themeComments: null, origins: new Map() })
    expect(bare.findings.every((f) => f.who === null && (f.quote?.who ?? null) === null)).toBe(true)
    expect(bare.alsoHeard.every((x) => x.who === null)).toBe(true)
  })

  it('a read with no finding prints nothing else either', () => {
    const empty = weekReadPage({ read: sealandRead({ findings: [] }), brand: 'Sealand', names, attribution: null, themeComments: null, origins: new Map() })
    expect(empty).toMatchObject({ lead: null, findings: [], alsoHeard: [] })
  })
})

describe('loadWeekReadPage', () => {
  it('reads the newest ready read for the session’s client and who its talk is about', async () => {
    const stored = frozen(read())
    const db = fakeDb({
      clients: [{ id: SEALAND_CLIENT_ID, company_name: 'Sealand' }],
      competitors: [{ id: COTO, client_id: SEALAND_CLIENT_ID, name: 'Cotopaxi', slug: 'cotopaxi', retired_at: null }],
      week_reads: [
        { client_id: SEALAND_CLIENT_ID, run_id: 'old', kind: 'week', status: 'ready', window_end: '2026-09-20T04:00:00Z', data: sealandRead({ headline: 'An older week.' }) },
        { client_id: SEALAND_CLIENT_ID, run_id: 'thin', kind: 'week', status: 'thin', window_end: '2026-10-04T04:00:00Z', data: sealandRead({ findings: [] }) },
        { client_id: SEALAND_CLIENT_ID, run_id: 'r27', kind: 'week', status: 'ready', window_end: '2026-09-27T04:03:42Z', data: stored },
        { client_id: 'someone-else', run_id: 'x', kind: 'week', status: 'ready', window_end: '2026-10-05T04:00:00Z', data: sealandRead({ headline: 'Not yours.' }) },
      ],
      month_evidence_refs: [
        { client_id: SEALAND_CLIENT_ID, month: '2026-09-01', audience: 'industry-other', object_kind: 'theme', object_id: 't1', comment_ids: ['c2', 'c3'] },
      ],
      insight_evidence: [
        { id: 'e2aa9829-a7ec-4947-ac47-387a9a14133c', quote: 'If you think you’ll be doing a lot of walking, I’d recommend the Osprey Farpoint.', comment_id: 'cq', source_video_id: 'q1', redacted: false },
      ],
      videos: [
        ...F1.map((id, i) => ({ id, client_id: SEALAND_CLIENT_ID, is_client: false, is_competitor: i < 2, competitor_name: i < 2 ? 'Cotopaxi' : null })),
        { id: 'q1', client_id: SEALAND_CLIENT_ID, is_client: false, is_competitor: false, competitor_name: null },
      ],
      brand_mentions: [],
    })
    const page = await loadWeekReadPage({ supabase: db.client, clientId: SEALAND_CLIENT_ID, reading: readingHandle(SEALAND_CLIENT_ID, db.client as never), params: {} })
    expect(page?.lead).toMatch(/^Buyers treated bag choice/)
    expect(page?.findings[0].quote?.text).toMatch(/Osprey Farpoint/)
    expect(page?.findings[0].who).toEqual([{ about: 'rival:Cotopaxi', videos: 2 }, { about: 'market', videos: 14 }])
    expect(page?.names.market.long).toBe('Other bags in your market')
  })

  it('is null where no ready read exists, or the table is not there', async () => {
    const none = fakeDb({ clients: [], competitors: [], week_reads: [] })
    expect(await loadWeekReadPage({ supabase: none.client, clientId: 'c', reading: readingHandle('c', none.client as never), params: {} })).toBeNull()
    const missing = fakeDb({ clients: [], competitors: [] })
    expect(await loadWeekReadPage({ supabase: missing.client, clientId: 'c', reading: readingHandle('c', missing.client as never), params: {} })).toBeNull()
  })
})
