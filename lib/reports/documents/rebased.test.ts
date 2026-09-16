import { describe, expect, it } from 'vitest'

import { documentFigures, documentReading, methodItems } from './compose'
import { briefPeriod } from './steps'
import type { BriefReading } from './reading'
import type { Signals } from './signals'
import type { ResearchAnswer } from './research'

// Item 43 on one fixture: the same signals with and without a monthly reading,
// so what actually changed is visible rather than asserted.

const answers: ResearchAnswer[] = []

const reading = (over: Partial<BriefReading> = {}): BriefReading => ({
  month: '2026-09-01',
  monthLabel: 'September 2026',
  monthStatus: 'filling',
  readingAt: '2026-09-16T05:00:00.000Z',
  window: { horizon: 'this_month', kind: 'month', months: ['2026-09-01'], from: '2026-09-01T00:00:00.000Z', to: '2026-10-01T00:00:00.000Z', basis: null },
  measured: { category_videos: { value: 388, unit: 'videos', label: 'videos read for the category this month' } },
  figures: { category_videos: { label: 'videos read for the category this month', value: '388', kind: 'count' } },
  verdicts: [],
  denominators: [
    { audience: 'industry-other', label: 'the category', videos: 388, comments: 1406 },
    { audience: 'client', label: 'your own brand', videos: 158, comments: 198 },
    { audience: 'competitor:Ottobock', label: 'Ottobock', videos: 41, comments: 63 },
  ],
  platformMix: { tiktok: 161, youtube: 135 },
  notes: [],
  crossesClustering: false,
  ...over,
})

const signals = (over: Partial<Signals> = {}): Signals => ({
  clientId: 'c', runId: 'r', runDate: '2026-08-30', runStatus: 'completed', company: 'Ossur',
  brandKeywords: [], industryKeywords: [], trackedCompetitors: ['Ottobock'], updatesCount: 5,
  run: { conversations: 3270, videos: 469, clientVideos: 13, competitorVideos: 42, positivePct: 69.4, judged: 147, clientSharePct: 2.8, summary: {} as Signals['run']['summary'] },
  delta: { prevRunDate: '2026-08-23', sentiment: { now: 69.4, prev: 66, verdict: { state: 'no_clear_change', change: 3.4, band: 8 }, nowJudged: 147, prevJudged: 120 }, share: null, newThemes: { count: 15, labels: [] }, conversations: { now: 3270, prev: 2100 } },
  themes: [], concerns: [], trajectoryOf: () => null,
  competitors: [{ name: 'Ottobock', bucket: 'competitor:Ottobock', claims: [], about: [], praise: [], hurt: [], asks: [], shareNow: 9, shareAll: 12.4, videosNow: 42, thin: false }],
  sayVsHear: [], brandVoice: null, ciSummary: null, personas: [], phrases: [], heldBackPhrases: 0,
  competitiveInsights: [],
  reading: null, surfaces: {}, map: [], missing: [],
  ...over,
} as unknown as Signals)

describe('documentFigures, re-based', () => {
  it('without a reading it is the update, exactly as it was', () => {
    const f = documentFigures(signals(), answers)
    expect(f.videos).toEqual({ label: 'videos', value: '469', kind: 'count' })
    expect(f.conversations.value).toBe('3,270')
    expect(f.prev_conversations).toBeTruthy()
    expect(f.new_themes).toBeTruthy()
    expect(f.reading_month).toBeUndefined()
  })

  it('with a reading every headline number is the month, and says so in its label', () => {
    const f = documentFigures(signals({ reading: reading() }), answers)
    expect(f.videos).toEqual({ label: 'videos read for the category in September 2026', value: '388', kind: 'count' })
    expect(f.client_videos).toEqual({ label: 'Ossur videos in September 2026', value: '158', kind: 'count' })
    expect(f.ottobock_videos).toEqual({ label: 'Ottobock videos in September 2026', value: '41', kind: 'count' })
    expect(f.reading_month).toEqual({ label: 'the month this reading is of', value: 'September 2026', kind: 'name' })
  })

  it('comments sum across audiences; videos never do', () => {
    const f = documentFigures(signals({ reading: reading() }), answers)
    expect(f.conversations.value).toBe('1,667') // 1406 + 198 + 63
    expect(f.competitor_videos).toBeUndefined()
    expect(f.videos.value).toBe('388') // the category's own, not 388 + 158 + 41
  })

  it('the run-against-run figures are withdrawn, not left beside the month', () => {
    const f = documentFigures(signals({ reading: reading() }), answers)
    for (const key of ['prev_conversations', 'prev_positive_pct', 'new_themes', 'client_share_pct', 'ottobock_share_pct']) {
      expect(f[key], key).toBeUndefined()
    }
  })

  it('carries the blocks\' own figures through untouched', () => {
    const f = documentFigures(signals({ reading: reading() }), answers)
    expect(f.category_videos).toEqual({ label: 'videos read for the category this month', value: '388', kind: 'count' })
  })

  // Measured on production: OV0's month_videos and the standings block's
  // standings_videos both read 449 on Össur in September — 388 + 42 + 19,
  // with 6 videos naming two rivals counted twice — beside a method page
  // printing 388. The same sum competitor_videos was withdrawn for.
  it('withdraws the block figures that sum videos across audiences', () => {
    const f = documentFigures(signals({
      reading: reading({
        figures: {
          category_videos: { label: 'videos read for the category this month', value: '388', kind: 'count' },
          month_videos: { label: 'videos read into this month', value: '449', kind: 'count' },
          standings_videos: { label: 'videos read in Sep 2026', value: '449', kind: 'count' },
        },
      }),
    }), answers)
    expect(f.month_videos).toBeUndefined()
    expect(f.standings_videos).toBeUndefined()
    expect(f.category_videos).toBeTruthy()
  })
})

describe('briefPeriod', () => {
  it('is the month, the instant and the freeze day', () => {
    expect(briefPeriod(signals({ reading: reading() })))
      .toBe('September 2026 · reading as at 16 Sep 2026 · still filling until 31 Oct 2026')
  })

  it('falls back to the update where there is no reading — never a month over update figures', () => {
    expect(briefPeriod(signals())).toBe('Update of 30 Aug 2026')
  })
})

describe('the method page', () => {
  const kinds = ['method' as const]

  it('prints the month, its denominator per audience and the platform mix', () => {
    const items = methodItems(signals({ reading: reading() }), briefPeriod(signals({ reading: reading() })), false, 5, kinds)
    const basis = items.find((i) => i.includes('reading of September 2026'))
    expect(basis).toBeTruthy()
    expect(basis).toContain('388 videos in the category · 158 videos in your own brand · 41 videos in Ottobock · 1,667 comments read.')
    expect(basis).toContain('TikTok 161 · YouTube 135')
    expect(basis).toContain('reading as at 16 Sep 2026')
    expect(basis).toContain('still filling')
  })

  it('says the month-by-month reading is not recorded rather than passing an update off as a month', () => {
    const items = methodItems(signals(), 'Update of 30 Aug 2026', false, 5, kinds)
    expect(items.join(' ')).toContain('The month-by-month reading is not recorded for this workspace yet')
    expect(items.join(' ')).not.toContain('reading as at')
  })

  it('carries decision L\'s label where the window crosses a boundary', () => {
    const items = methodItems(signals({ reading: reading({ crossesClustering: true }) }), 'x', false, 5, kinds)
    expect(items.join(' ')).toContain('not like for like')
  })

  it('names every missing input and who closes it', () => {
    const items = methodItems(
      signals({ reading: reading(), missing: [{ id: 'subject-set', input: 'the subjects', owner: 'Client', ownerRole: 'client', unlocks: 'Name them in Settings › Subjects.', sections: ['Your subjects'] }] }),
      'x', false, 5, kinds,
    )
    const joined = items.join(' ')
    expect(joined).toContain('One thing this brief needed is not recorded')
    expect(joined).toContain('Your subjects could not be filled')
    expect(joined).toContain('This one is yours to close')
    expect(joined).toContain('Name them in Settings › Subjects')
    // The method page is a printed page behind a share link: it names the act,
    // never our own readiness screen.
    expect(joined).not.toContain('Settings › Readiness')
  })
})

describe('documentReading', () => {
  it('freezes the stamp and the denominators, and no quote and no verdict', () => {
    const d = documentReading(reading())
    expect(d.stamp).toContain('September 2026')
    expect(d.denominators).toHaveLength(3)
    expect(JSON.stringify(d)).not.toContain('verdict')
    expect(Object.keys(d).sort()).toEqual(
      ['crossesClustering', 'denominators', 'month', 'monthLabel', 'monthStatus', 'platformMix', 'readingAt', 'stamp'],
    )
  })
})
