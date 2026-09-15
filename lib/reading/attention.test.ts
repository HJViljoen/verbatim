import { describe, expect, it } from 'vitest'

import {
  PANEL_EXCLUDED_PLATFORMS,
  PANEL_LEAD_MONTHS,
  attentionSplit,
  derivePanel,
  isMissingKindMoodAttention,
  onPanel,
  PANEL_STALING_SURFACES,
  panelCutoff,
  panelStale,
  samePanelEra,
} from './attention'

const account = (platform: string, name: string, firstSeen: string) => ({
  platform,
  account_name: name,
  first_seen: firstSeen,
})

describe('panelCutoff', () => {
  it('is three whole months before the month being read', () => {
    expect(PANEL_LEAD_MONTHS).toBe(3)
    expect(panelCutoff('2026-09-01')).toBe('2026-06-01')
    expect(panelCutoff('2026-10-01')).toBe('2026-07-01')
  })

  it('crosses a year', () => {
    expect(panelCutoff('2027-01-01')).toBe('2026-10-01')
    expect(panelCutoff('2026-02-15')).toBe('2025-11-01')
  })

  it('takes another lead when a caller has a measured reason', () => {
    expect(panelCutoff('2026-09-01', 1)).toBe('2026-08-01')
    expect(panelCutoff('2026-09-01', 0)).toBe('2026-09-01')
  })
})

describe('derivePanel', () => {
  it('keeps the accounts first seen strictly before the cutoff', () => {
    const p = derivePanel(
      [
        account('tiktok', 'early', '2026-05-01T00:00:00Z'),
        account('tiktok', 'onTheLine', '2026-06-01T00:00:00Z'),
        account('youtube', 'late', '2026-07-15T00:00:00Z'),
      ],
      { cutoff: '2026-06-01' },
    )
    expect(p.members.map((m) => m.account_name)).toEqual(['early'])
    expect(p.tooNew).toBe(2)
    expect(p.empty).toBe(false)
  })

  it('never admits Reddit, and counts how many that was', () => {
    expect(PANEL_EXCLUDED_PLATFORMS).toEqual(['reddit'])
    const p = derivePanel(
      [
        account('reddit', 'r/prosthetics', '2026-01-01T00:00:00Z'),
        account('reddit', 'r/amputees', '2026-01-02T00:00:00Z'),
        account('tiktok', 'early', '2026-01-03T00:00:00Z'),
      ],
      { cutoff: '2026-06-01' },
    )
    expect(p.members.map((m) => m.platform)).toEqual(['tiktok'])
    expect(p.excluded).toEqual({ reddit: 2 })
  })

  it('says a panel with no members is empty rather than freezing one', () => {
    // Sealand at a September reading: its earliest scrape of anything is
    // 2026-06-28, so a 1 June cutoff admits nobody.
    const p = derivePanel([account('tiktok', 'sealandgear', '2026-06-28T14:41:28Z')], { cutoff: '2026-06-01' })
    expect(p.members).toHaveLength(0)
    expect(p.empty).toBe(true)
  })

  it('treats an account with no first-seen date as too new', () => {
    const p = derivePanel([{ platform: 'tiktok', account_name: 'nodate', first_seen: '' }], { cutoff: '2026-06-01' })
    expect(p.empty).toBe(true)
    expect(p.tooNew).toBe(1)
  })

  it('is stable in order, so two freezes of one corpus are byte-comparable', () => {
    const a = derivePanel([account('youtube', 'b', '2026-01-01Z'), account('tiktok', 'a', '2026-01-01Z')], { cutoff: '2026-06-01' })
    const b = derivePanel([account('tiktok', 'a', '2026-01-01Z'), account('youtube', 'b', '2026-01-01Z')], { cutoff: '2026-06-01' })
    expect(a.members).toEqual(b.members)
    expect(a.members.map((m) => m.platform)).toEqual(['tiktok', 'youtube'])
  })
})

describe('onPanel', () => {
  const panel = { accounts: [{ platform: 'tiktok', account_name: 'ossur_corp', first_seen: '2026-04-01Z' }] }

  it('is the (platform, account_name) pair exactly — the handle is the key', () => {
    expect(onPanel(panel, { platform: 'tiktok', account_name: 'ossur_corp' })).toBe(true)
    expect(onPanel(panel, { platform: 'youtube', account_name: 'ossur_corp' })).toBe(false)
    expect(onPanel(panel, { platform: 'tiktok', account_name: 'Ossur_Corp' })).toBe(false)
  })
})

describe('samePanelEra', () => {
  it('needs both sides to name the same panel', () => {
    expect(samePanelEra('p1', 'p1')).toBe(true)
    expect(samePanelEra('p1', 'p2')).toBe(false)
    expect(samePanelEra(null, null)).toBe(false)
    expect(samePanelEra('p1', null)).toBe(false)
  })
})

describe('panelStale', () => {
  const panel = { frozen_at: '2026-08-01T00:00:00Z' }

  it('is stale after a tracking change', () => {
    expect(panelStale(panel, [{ changed_at: '2026-09-09T10:00:00Z', surface: 'rivals' }])).toBe(true)
    expect(panelStale(panel, [{ changed_at: '2026-09-09T10:00:00Z', surface: 'terms' }])).toBe(true)
  })

  it('is not stale for a change before it was frozen, or on another surface', () => {
    expect(panelStale(panel, [{ changed_at: '2026-07-01T00:00:00Z', surface: 'rivals' }])).toBe(false)
    expect(panelStale(panel, [{ changed_at: '2026-09-09T10:00:00Z', surface: 'cadence' }])).toBe(false)
    expect(panelStale(panel, [])).toBe(false)
  })

  // The list is what `freezeMonths` re-freezes on, so it is pinned here rather
  // than left to a default argument nobody reads: every surface that moves
  // WHERE we gather, and no surface that only moves how often or how deeply.
  it('names every surface that moves where we gather, and none that does not', () => {
    for (const surface of PANEL_STALING_SURFACES) {
      expect(panelStale(panel, [{ changed_at: '2026-09-09T10:00:00Z', surface }])).toBe(true)
    }
    expect(PANEL_STALING_SURFACES).toContain('regate')
    expect(PANEL_STALING_SURFACES).toContain('entity_retag')
    for (const surface of ['cadence', 'knobs', 'schedule', 'subjects', 'prompt_version', 'other']) {
      expect(PANEL_STALING_SURFACES).not.toContain(surface)
      expect(panelStale(panel, [{ changed_at: '2026-09-09T10:00:00Z', surface }])).toBe(false)
    }
  })
})

describe('attentionSplit', () => {
  // Össur's August 2026 panel at a 1 June cutoff, measured read-only:
  // client 13 videos / 6 comments, Ottobock 10 / 92, category 122 / 2,047.
  const AUG = [
    { audience: 'client', panel_videos: 13, attention_comments: 6 },
    { audience: 'competitor:Ottobock', panel_videos: 10, attention_comments: 92 },
    { audience: 'industry-other', panel_videos: 122, attention_comments: 2047 },
  ]

  it('reads two shares off two denominators', () => {
    const split = attentionSplit(AUG)
    const otto = split.find((s) => s.audience === 'competitor:Ottobock')!
    expect(otto.content).toEqual({ k: 10, n: 145, pct: 6.9 })
    expect(otto.attention).toEqual({ k: 92, n: 2145, pct: 4.3 })
  })

  it('tells the two stories apart — posting is not being talked about', () => {
    const split = attentionSplit([
      { audience: 'competitor:Ottobock', panel_videos: 70, attention_comments: 450 },
      { audience: 'industry-other', panel_videos: 390, attention_comments: 79724 },
      { audience: 'client', panel_videos: 54, attention_comments: 804 },
    ])
    const otto = split.find((s) => s.audience === 'competitor:Ottobock')!
    expect(otto.content.pct).toBe(13.6)
    expect(otto.attention.pct).toBe(0.6)
  })

  it('has no share when the panel carried nothing that month', () => {
    const split = attentionSplit([{ audience: 'client', panel_videos: 0, attention_comments: 0 }])
    expect(split[0].content.pct).toBeNull()
    expect(split[0].attention.pct).toBeNull()
  })
})

describe('isMissingKindMoodAttention', () => {
  it('recognises the shapes a deploy before the migration produces', () => {
    expect(isMissingKindMoodAttention({ code: 'PGRST202', message: 'Could not find the function public.monthly_kind_readings' })).toBe(true)
    expect(isMissingKindMoodAttention(new Error('relation "public.attention_panels" does not exist'))).toBe(true)
    expect(isMissingKindMoodAttention({ code: '42P01', message: 'month_audience_stats' })).toBe(true)
  })

  it('never swallows anything else', () => {
    expect(isMissingKindMoodAttention(new Error('relation "public.videos" does not exist'))).toBe(false)
    expect(isMissingKindMoodAttention(new Error('timeout'))).toBe(false)
    expect(isMissingKindMoodAttention(null)).toBe(false)
  })
})
