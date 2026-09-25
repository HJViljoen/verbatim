import { describe, expect, it } from 'vitest'

import { CONFIG_SURFACES, type ConfigChange } from '../config-log'
import {
  activeCommunities,
  CHANGE_GROUP_WINDOW_MS,
  changeInSpan,
  changesFromLog,
  comparabilityOf,
  COMPARE_FLAG_SHARE,
  COMPARE_REFUSE_SHARE,
  DEPTH_RATIO_MIN,
  latestPairRow,
  modeForShare,
  movesActiveSet,
  nextComparablePair,
  NOT_OUR_CHANGES,
  OUR_CHANGE_SURFACES,
  pairShare,
  shareOf,
  VIEWS_BY_SURFACE,
  type OurChange,
  type PairRow,
} from './comparability'
import { scheduledUpdateAfter } from './reading-month'

// ---- Fixtures: Sealand's real change log ------------------------------------------------
//
// The rows are GC F2's table (staging, a production copy to about 20 Sep):
// every date, surface, field, source and count below is the research's. The
// ids are labels: production's are listed by WP1.0 read 10. Term lists are GC
// F28's eras.

let seq = 0
function row(over: Partial<ConfigChange> & Pick<ConfigChange, 'changed_at' | 'surface'>): ConfigChange {
  seq += 1
  return {
    id: over.id ?? `row-${String(seq).padStart(3, '0')}`,
    client_id: 'sealand',
    field: null,
    before: null,
    after: null,
    actor_kind: 'reconstructed',
    actor_user_id: null,
    actor_label: null,
    run_id: null,
    source: 'reconstructed',
    rows_affected: null,
    note: null,
    affects_audiences: null,
    affects_months: null,
    ...over,
  }
}

// The 9 Sep 18:17:56 term swap: seven out, seven in, one reconstructed row each.
const ERA_B_OUT = ['cotopaxi', 'freitag', 'patagonia', 'poler', 'sealandgear', 'sustainable bags', 'topo designs']
const ERA_B_IN = ['cotopaxi backpack', 'freitag bag', 'rareform bag', 'recycled sailcloth', 'sailcloth bag', 'sealand bag', 'upcycled backpack']
const TERMS_0909 = [
  ...ERA_B_OUT.map((t, i) => row({ id: `terms-0909-out-${i}`, changed_at: '2026-09-09T18:17:56.000Z', surface: 'terms', before: [t] })),
  ...ERA_B_IN.map((t, i) => row({ id: `terms-0909-in-${i}`, changed_at: '2026-09-09T18:17:56.000Z', surface: 'terms', after: [t] })),
]
const TERMS_0913 = [
  row({ id: 'terms-0913-industry', changed_at: '2026-09-13T10:00:58.000Z', surface: 'terms', field: 'industry_keywords', after: ['handmade bag', 'sustainable fashion', 'travel gear'], actor_kind: 'sql' }),
  row({ id: 'terms-0913-competitor', changed_at: '2026-09-13T10:00:58.000Z', surface: 'terms', field: 'competitor_keywords', after: ['frtg'], actor_kind: 'sql' }),
]
const TERMS_0917 = ['competitor_keywords', 'industry_keywords', 'exclude_terms'].map((field) =>
  row({ id: `terms-0917-${field}`, changed_at: '2026-09-17T16:02:56.000Z', surface: 'terms', field, source: 'trigger', actor_kind: 'script' }))

// Sealand's three searched communities, and the seventeen others it knows but
// does not search (20 in all, GC F2's "20 → 20"). The research names the three
// (r/backpacks from 17 Aug; r/travelgear and r/onebag from 9 Sep); it does not
// list the other seventeen, so they carry placeholder names.
const ACTIVE = ['backpacks', 'travelgear', 'onebag']
const KNOWN = Array.from({ length: 17 }, (_, i) => `known_${String(i + 1).padStart(2, '0')}`)
const entries = (over: Record<string, Record<string, unknown>> = {}): Record<string, unknown>[] => [
  ...ACTIVE.map((name) => ({ name, status: 'active', discovered_at: '2026-08-17', ...over[name] })),
  ...KNOWN.map((name) => ({ name, status: 'candidate', discovered_at: '2026-08-17', ...over[name] })),
]
// 20 Sep 04:04, the pipeline's discovery probe (trigger row): twenty entries on
// both sides, one candidate probed and rejected, the searched three unchanged.
const PROBE_0920 = row({
  id: 'subreddits-0920', changed_at: '2026-09-20T04:04:00.000Z', surface: 'subreddits', field: 'subreddits',
  source: 'trigger', actor_kind: 'pipeline', before: entries(),
  after: entries({ known_01: { status: 'rejected', probe: { at: '2026-09-20', sampled: 20, kept: 0 } } }),
})

const SEALAND_LOG: ConfigChange[] = [
  row({ id: 'terms-0706', changed_at: '2026-07-06T04:19:00.000Z', surface: 'terms', after: ['#sealandgear', 'cotopaxi', 'eco backpack', 'freitag', 'patagonia', 'poler', 'recycled bag', 'sealand gear', 'sealandgear', 'sustainable backpack', 'sustainable bags', 'topo designs', 'upcycled bag'] }),
  // r/onebag: reconstructed from its probe date; today it reads active.
  row({ id: 'subreddits-0909-onebag', changed_at: '2026-09-09T00:00:00.000Z', surface: 'subreddits', field: 'subreddits', before: { name: 'onebag', status: 'candidate' }, after: { name: 'onebag', status: 'active' } }),
  row({ id: 'rivals-0909', changed_at: '2026-09-09T16:24:15.000Z', surface: 'rivals', field: 'competitor_names', actor_kind: 'script' }),
  row({ id: 'retag-0909', changed_at: '2026-09-09T18:10:00.000Z', surface: 'entity_retag', rows_affected: 253, actor_kind: 'script' }),
  ...TERMS_0909,
  row({ id: 'handles-0909', changed_at: '2026-09-09T18:21:00.000Z', surface: 'handles', field: 'competitor_handles' }),
  ...TERMS_0913,
  ...TERMS_0917,
  row({ id: 'rivals-0917', changed_at: '2026-09-17T16:02:56.000Z', surface: 'rivals', field: 'competitor_names', source: 'trigger', actor_kind: 'script' }),
  row({ id: 'handles-0917-a', changed_at: '2026-09-17T16:02:00.000Z', surface: 'handles', field: 'competitor_handles', source: 'trigger', actor_kind: 'script' }),
  row({ id: 'handles-0917-b', changed_at: '2026-09-17T16:24:00.000Z', surface: 'handles', field: 'competitor_handles', source: 'trigger', actor_kind: 'script' }),
  PROBE_0920,
  // Not a change of ours: Sealand's September log holds one cadence/report_day
  // row (lib/config-log.ts TRACKING_SURFACES).
  row({ id: 'cadence-sep', changed_at: '2026-09-17T16:10:00.000Z', surface: 'cadence', field: 'report_day' }),
]
const CHANGES = changesFromLog(SEALAND_LOG)
const byId = (id: string): OurChange => {
  const c = CHANGES.find((x) => x.id === id)
  if (!c) throw new Error(`no change ${id}`)
  return c
}

// The gate fix and attribution v3 are logged by WP1.4, dated at the fix
// branch's actual production deploy, which is not knowable today. 26 Sep, the
// plan's target, stands in; any day in late September reads the same.
const GATE_FIX: OurChange = { id: 'gate-fix', surface: 'gate_rule', changedAt: '2026-09-26T12:00:00.000Z', note: null, affects: VIEWS_BY_SURFACE.gate_rule }
const ATTRIBUTION: OurChange = { id: 'attribution-v3', surface: 'attribution', changedAt: '2026-09-26T12:00:00.000Z', note: null, affects: VIEWS_BY_SURFACE.attribution }

// ---- Fixtures: pair rows -------------------------------------------------------------------
//
// AUGUST AGAINST SEPTEMBER, as WP1.4 would write it after the 4 Oct update,
// with the research's measured counts (category videos, as measured):
//   searches outside: August ~115 of 351 found only by the bare-name terms
//   removed on 9 Sep (CQ F25); September 206 of 625 found only by the 13–17 Sep
//   terms (GC F29; the measured lower bound, the strict figure is larger);
//   depth: median dated comments a video, August 23, September 15 (DR F39);
//   run health: September's 20 Sep run was partial (DR F21);
//   late capture: 4,923 of August's 10,188 comments captured after it ended.
const AUG_SEP: PairRow = {
  prevMonth: '2026-08-01',
  month: '2026-09-01',
  searchOutside: { prev: { k: 115, n: 351 }, curr: { k: 206, n: 625 } },
  codeChanges: [],
  depth: { prevMedian: 23, currMedian: 15 },
  gather: [
    { month: '2026-08-01', runs: 1, partial: 0, searchesShort: 0 },
    { month: '2026-09-01', runs: 4, partial: 1, searchesShort: 0 },
  ],
  lateCapture: { month: '2026-08-01', comments: 4923, of: 10188 },
  readThroughRun: 'run-1004',
  methodVersion: 'comparability_v1',
  computedAt: '2026-10-05T09:00:00.000Z',
}
const LATER_ENDED = { state: 'ended' as const, readToEnd: true, latestUpdateRunId: 'run-1004' }

// A PAIR READ THE SAME WAY. No such pair exists yet (October against November
// is the first, §2.11), so its numbers are August's real reading on BOTH sides:
// 377 market videos, median 23. Nothing is outside the searches because the
// search set has been held since 20 Sep (decision I): an expectation, not a
// measurement. Run counts are the schedule's Sundays (4 in October, 5 in November).
const SAME_WAY: PairRow = {
  prevMonth: '2026-10-01',
  month: '2026-11-01',
  searchOutside: { prev: { k: 0, n: 377 }, curr: { k: 0, n: 377 } },
  codeChanges: [],
  depth: { prevMedian: 23, currMedian: 23 },
  gather: [
    { month: '2026-10-01', runs: 4, partial: 0, searchesShort: 0 },
    { month: '2026-11-01', runs: 5, partial: 0, searchesShort: 0 },
  ],
  lateCapture: null,
  readThroughRun: 'run-1206',
  methodVersion: 'comparability_v1',
  computedAt: '2026-12-07T09:00:00.000Z',
}
const LATER_NOV = { state: 'ended' as const, readToEnd: true, latestUpdateRunId: 'run-1206' }

// ---- The change log -----------------------------------------------------------------------

describe('changesFromLog: every surface mapped', () => {
  it('maps every CONFIG_SURFACES value, either to views or to "not ours"', () => {
    for (const s of CONFIG_SURFACES) {
      const mapped = (OUR_CHANGE_SURFACES as readonly string[]).includes(s)
      const dropped = NOT_OUR_CHANGES.includes(s)
      expect(mapped !== dropped, s).toBe(true)
    }
  })

  it('knows the three surfaces MF1 adds before the CHECK does', () => {
    for (const s of ['segment', 'gate_rule', 'attribution']) expect(OUR_CHANGE_SURFACES).toContain(s)
  })

  it('pins the views of each surface (decision E)', () => {
    const all = ['market', 'themes', 'brands', 'lens']
    for (const s of ['terms', 'platforms', 'knobs', 'subreddits', 'other', 'gate_rule', 'regate', 'prompt_version'] as const) {
      expect(VIEWS_BY_SURFACE[s], s).toEqual(all)
    }
    for (const s of ['rivals', 'handles', 'rival_rename', 'entity_retag', 'attribution'] as const) {
      expect(VIEWS_BY_SURFACE[s], s).toEqual(['themes', 'brands'])
    }
    expect(VIEWS_BY_SURFACE.segment).toEqual([])
  })
})

describe('changesFromLog: Sealand’s September', () => {
  it('shows each of the 9, 13 and 17 Sep term changes once, with every row under its change id', () => {
    const terms = CHANGES.filter((c) => c.surface === 'terms')
    expect(terms.map((c) => c.changedAt)).toEqual([
      '2026-07-06T04:19:00.000Z', '2026-09-09T18:17:56.000Z', '2026-09-13T10:00:58.000Z', '2026-09-17T16:02:56.000Z',
    ])
    expect(terms[1].rowIds).toHaveLength(14)
    expect(terms[2].rowIds).toEqual(['terms-0913-competitor', 'terms-0913-industry'])
    expect(terms[3].rowIds).toHaveLength(3)
    expect(terms[1].id).toBe(terms[1].rowIds?.[0])
  })

  it('drops the cadence row and the 20 Sep probe (twenty communities before and after, the searched three unchanged)', () => {
    expect(CHANGES.some((c) => c.id === 'cadence-sep')).toBe(false)
    expect(CHANGES.some((c) => c.id === 'subreddits-0920')).toBe(false)
    expect(movesActiveSet(PROBE_0920)).toBe(false)
  })

  it('keeps r/onebag becoming a searched community', () => {
    expect(byId('subreddits-0909-onebag').affects).toEqual(['market', 'themes', 'brands', 'lens'])
  })

  it('keeps the two 17 Sep handle writes apart: 22 minutes is two changes', () => {
    expect(CHANGES.filter((c) => c.surface === 'handles').map((c) => c.id)).toEqual(['handles-0909', 'handles-0917-a', 'handles-0917-b'])
  })

  it('files rivals and the re-tag under themes and brands only', () => {
    expect(byId('rivals-0909').affects).toEqual(['themes', 'brands'])
    expect(byId('retag-0909').affects).toEqual(['themes', 'brands'])
  })
})

describe('changesFromLog: subreddits rows move a comparison only when the searched set moved', () => {
  it('ignores a strike that does not demote', () => {
    const strike = row({ changed_at: '2026-09-27T08:00:00.000Z', surface: 'subreddits', before: entries(), after: entries({ travelgear: { strikes: 1 } }) })
    expect(movesActiveSet(strike)).toBe(false)
    expect(changesFromLog([strike])).toEqual([])
  })

  it('counts a demotion, and a promotion', () => {
    const demoted = row({ changed_at: '2026-10-04T08:00:00.000Z', surface: 'subreddits', before: entries(), after: entries({ travelgear: { status: 'candidate', strikes: 2 } }) })
    const promoted = row({ changed_at: '2026-10-04T08:00:00.000Z', surface: 'subreddits', before: entries(), after: entries({ known_02: { status: 'active' } }) })
    expect(changesFromLog([demoted])).toHaveLength(1)
    expect(changesFromLog([promoted])).toHaveLength(1)
  })

  it('ignores a proposal (nothing searched either side)', () => {
    const proposed = row({ changed_at: '2026-08-17T00:00:00.000Z', surface: 'subreddits', after: { name: 'onebag', status: 'candidate' } })
    expect(changesFromLog([proposed])).toEqual([])
  })

  it('reads a community edit’s logged row in words, and groups it with the trigger row it rode on', () => {
    // An operator adding r/ManyBaggers (a community the market talks in, DR
    // F32): the trigger's row and the action's logged row, 40 ms apart.
    const trigger = row({ id: 'edit-trigger', changed_at: '2026-10-05T09:00:00.000Z', surface: 'subreddits', source: 'trigger', before: entries(), after: [...entries(), { name: 'manybaggers', status: 'active', discovered_at: '2026-10-05' }] })
    const logged = row({ id: 'edit-logged', changed_at: '2026-10-05T09:00:00.040Z', surface: 'subreddits', source: 'logged', before: 'r/backpacks, r/travelgear, r/onebag', after: 'r/backpacks, r/travelgear, r/onebag, r/manybaggers', note: 'r/manybaggers was added to the communities we watch.' })
    const out = changesFromLog([logged, trigger])
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('edit-trigger')
    expect(out[0].rowIds).toEqual(['edit-trigger', 'edit-logged'])
    expect(out[0].note).toBe('r/manybaggers was added to the communities we watch.')
  })

  it('reads "nothing" as no community, and a truncated list as unreadable (so it counts)', () => {
    expect(activeCommunities('nothing')).toEqual(new Set())
    expect(activeCommunities('r/onebag')).toEqual(new Set(['onebag']))
    expect(activeCommunities('r/a1, r/b2, r/c3, r/d4, r/e5, r/f6, r/g7, r/h8 and 2 more')).toBeNull()
    expect(movesActiveSet({ before: 'r/onebag', after: 'r/onebag' })).toBe(false)
    expect(movesActiveSet({ before: 42, after: 'r/onebag' })).toBe(true)
  })

  it('a stopped candidate leaves both sides equal, and is ignored', () => {
    expect(movesActiveSet({ before: 'r/backpacks, r/travelgear, r/onebag', after: 'r/backpacks, r/travelgear, r/onebag' })).toBe(false)
  })
})

// 4 Oct: the 4 Oct run's freeze-months step freezes Sealand's first attention
// panel (plan §3.0: cutoff 1 Jul, October's three months of lead), and
// `freezePanel` logs it on other/attention_panel with the pipeline's actor.
// 08:20 UTC stands in for the step's time inside the run (06:00 SAST start,
// about 4.5 h); the account count the row also carries is not knowable before
// the run, so it is left out.
const PANEL_1004 = row({
  id: 'panel-1004', changed_at: '2026-10-04T08:20:00.000Z', surface: 'other', field: 'attention_panel',
  source: 'logged', actor_kind: 'pipeline', after: { cutoff: '2026-07-01', reason: 'first_freeze' },
})

describe('changesFromLog: an attention-panel freeze moves no view', () => {
  const WITH_PANEL = changesFromLog([...SEALAND_LOG, PANEL_1004])
  const sunday = scheduledUpdateAfter({ report_period: 'weekly', report_day: 'sunday' })

  it('is kept as a change, moving nothing', () => {
    const panel = WITH_PANEL.find((c) => c.id === 'panel-1004')
    expect(panel?.surface).toBe('other')
    expect(panel?.affects).toEqual([])
  })

  it('leaves the 5 Oct next pair at October against November, from the 6 Dec update', () => {
    expect(nextComparablePair('2026-10-05T06:00:00.000Z', WITH_PANEL, [], { nextUpdateAfter: sunday })).toEqual({
      prevMonth: '2026-10-01',
      month: '2026-11-01',
      sameAgeFrom: '2026-12-06T04:00:00.000Z',
      inFullExpected: '2027-01-03T04:00:00.000Z',
      assumes: 'no_further_change',
    })
  })

  it('leaves October against November comparable on every view', () => {
    for (const view of ['market', 'themes', 'brands', 'lens'] as const) {
      const r = comparabilityOf('2026-10-01', '2026-11-01', { row: SAME_WAY, changes: WITH_PANEL, view, later: LATER_NOV })
      expect(r.mode, view).toBe('comparable')
    }
  })

  // A re-freeze after a tracking change (reason `tracking_change`), stood in on
  // the 8 Nov run with November's cutoff.
  const REFREEZE = row({ id: 'panel-1108', changed_at: '2026-11-08T08:20:00.000Z', surface: 'other', field: 'attention_panel', source: 'logged', actor_kind: 'pipeline', after: { cutoff: '2026-08-01', reason: 'tracking_change' } })

  it('a re-freeze moves nothing either', () => {
    expect(changesFromLog([REFREEZE])[0].affects).toEqual([])
  })

  it('any other `other` row is still a change of every view, and is never grouped with a panel freeze', () => {
    // Stage 3's operator-only columns are logged on `other` (plan §4.2, MF3):
    // what they move is not settled, so they refuse rather than pass. Thirty
    // seconds after the re-freeze, inside one grouping window, to show the two
    // stay apart.
    const brands = row({ id: 'watched-1108', changed_at: '2026-11-08T08:20:30.000Z', surface: 'other', field: 'watched_brands', actor_kind: 'operator', source: 'logged' })
    const out = changesFromLog([REFREEZE, brands])
    expect(out.map((c) => [c.id, c.affects])).toEqual([
      ['panel-1108', []],
      ['watched-1108', ['market', 'themes', 'brands', 'lens']],
    ])
  })
})

describe('changesFromLog: other surfaces', () => {
  it('a knobs row is a change of every view', () => {
    const knobs = changesFromLog([row({ changed_at: '2026-10-05T09:00:00.000Z', surface: 'knobs', field: 'max_comments', source: 'trigger' })])
    expect(knobs[0].affects).toEqual(['market', 'themes', 'brands', 'lens'])
  })

  it('a segment row is kept, moving no view', () => {
    const seg = changesFromLog([row({ changed_at: '2026-09-30T20:00:00.000Z', surface: 'segment' as ConfigChange['surface'] })])
    expect(seg).toHaveLength(1)
    expect(seg[0].affects).toEqual([])
  })

  it('a surface this file does not know is read as "other": it refuses rather than passes', () => {
    const odd = changesFromLog([row({ changed_at: '2026-10-05T09:00:00.000Z', surface: 'watched_brands' as ConfigChange['surface'] })])
    expect(odd[0].surface).toBe('other')
    expect(odd[0].affects).toEqual(['market', 'themes', 'brands', 'lens'])
  })

  it('drops a row whose date does not parse, and groups within one minute only', () => {
    expect(changesFromLog([row({ changed_at: 'yesterday', surface: 'terms' })])).toEqual([])
    const a = row({ changed_at: '2026-10-05T09:00:00.000Z', surface: 'terms' })
    const b = row({ changed_at: new Date(Date.parse('2026-10-05T09:00:00.000Z') + CHANGE_GROUP_WINDOW_MS + 1).toISOString(), surface: 'terms' })
    expect(changesFromLog([a, b])).toHaveLength(2)
  })
})

// ---- Shares ---------------------------------------------------------------------------------

describe('shares and their thresholds', () => {
  it('reads real shares against the 10% and 1% lines', () => {
    // 2 of August's 351 found only by the 13–17 Sep terms (DR F37): under 1%.
    expect(modeForShare(shareOf({ k: 2, n: 351 }))).toBe('comparable')
    // 9 of 625 where two provenance records disagree (GC F29): over 1%.
    expect(modeForShare(shareOf({ k: 9, n: 625 }))).toBe('flag')
    // The gate fix: 63 of September's 655 market videos, 9.6% (§2.11).
    expect(modeForShare(shareOf({ k: 63, n: 655 }))).toBe('flag')
    // The same 63 of the category's 626: 10.1%, a refusal.
    expect(modeForShare(shareOf({ k: 63, n: 626 }))).toBe('refuse')
    // 206 of 625 found only by the 13–17 Sep terms.
    expect(modeForShare(shareOf({ k: 206, n: 625 }))).toBe('refuse')
  })

  it('refuses at exactly 10% and flags at exactly 1%', () => {
    expect(COMPARE_REFUSE_SHARE).toBe(0.1)
    expect(COMPARE_FLAG_SHARE).toBe(0.01)
    expect(modeForShare(0.1)).toBe('refuse')
    expect(modeForShare(0.01)).toBe('flag')
    expect(modeForShare(0.0099)).toBe('comparable')
  })

  it('n = 0, NaN, k over n and "not measured" are never a share, and refuse', () => {
    expect(shareOf({ k: 0, n: 0 })).toBeNull()
    expect(shareOf({ k: Number.NaN, n: 377 })).toBeNull()
    expect(shareOf({ k: 400, n: 377 })).toBeNull()
    expect(pairShare({ k: 0, n: 377 }, { k: Number.NaN, n: 377 })).toBeNull()
    expect(modeForShare(null)).toBe('refuse')
    expect(modeForShare(Number.NaN)).toBe('refuse')
  })

  it('the pair’s share is the larger side', () => {
    expect(pairShare({ k: 115, n: 351 }, { k: 206, n: 625 })).toBeCloseTo(206 / 625, 10)
  })
})

describe('changeInSpan', () => {
  it('from the earlier month’s first day to the later month’s freeze line', () => {
    expect(changeInSpan({ changedAt: '2026-07-31T23:59:59.000Z' }, '2026-08-01', '2026-09-01')).toBe(false)
    expect(changeInSpan({ changedAt: '2026-08-01T00:00:00.000Z' }, '2026-08-01', '2026-09-01')).toBe(true)
    expect(changeInSpan({ changedAt: '2026-10-30T23:59:59.000Z' }, '2026-08-01', '2026-09-01')).toBe(true)
    expect(changeInSpan({ changedAt: '2026-10-31T00:00:00.000Z' }, '2026-08-01', '2026-09-01')).toBe(false)
    expect(changeInSpan({ changedAt: 'not a date' }, '2026-08-01', '2026-09-01')).toBe(true)
  })
})

// ---- The rule --------------------------------------------------------------------------------

describe('comparabilityOf: the month states', () => {
  it('a so-far later month is never compared, whatever its row', () => {
    const r = comparabilityOf('2026-10-01', '2026-11-01', { row: SAME_WAY, changes: [], view: 'market', later: { ...LATER_NOV, state: 'so_far' } })
    expect(r.mode).toBe('refuse')
    expect(r.reasons).toEqual([{ kind: 'incomplete', changeId: null, share: null }])
  })

  it('Össur’s August against September: September was read only to 13 Sep', () => {
    const r = comparabilityOf('2026-08-01', '2026-09-01', { row: null, changes: [], view: 'market', later: { state: 'ended', readToEnd: false, latestUpdateRunId: 'ossur-0913' } })
    expect(r.mode).toBe('refuse')
    expect(r.reasons.map((x) => x.kind)).toEqual(['not_read_to_end'])
  })

  it('a pair in the wrong order is not measured', () => {
    expect(comparabilityOf('2026-09-01', '2026-08-01', { row: null, changes: [], view: 'market', later: LATER_ENDED }).mode).toBe('refuse')
  })
})

describe('comparabilityOf: unmeasured', () => {
  it('no row, with the 9, 13 and 17 Sep term changes in span: refused, and each named', () => {
    const r = comparabilityOf('2026-08-01', '2026-09-01', { row: null, changes: CHANGES, view: 'market', later: LATER_ENDED })
    expect(r.mode).toBe('refuse')
    expect(r.reasons[0]).toEqual({ kind: 'unmeasured', changeId: null, share: null })
    expect(r.reasons.slice(1)).toEqual([
      { kind: 'searches', changeId: 'subreddits-0909-onebag', share: null },
      { kind: 'searches', changeId: 'terms-0909-in-0', share: null },
      { kind: 'searches', changeId: 'terms-0913-competitor', share: null },
      { kind: 'searches', changeId: 'terms-0917-competitor_keywords', share: null },
    ])
  })

  it('for themes the same pair also names the rival and re-tag changes', () => {
    const r = comparabilityOf('2026-08-01', '2026-09-01', { row: null, changes: CHANGES, view: 'themes', later: LATER_ENDED })
    const codes = r.reasons.filter((x) => x.kind === 'code_change').map((x) => x.changeId)
    expect(codes).toEqual(['rivals-0909', 'retag-0909', 'handles-0909', 'handles-0917-a', 'rivals-0917', 'handles-0917-b'])
  })

  it('a row that does not account for the later month’s latest update is unmeasured', () => {
    const r = comparabilityOf('2026-08-01', '2026-09-01', { row: AUG_SEP, changes: [], view: 'market', later: { ...LATER_ENDED, latestUpdateRunId: 'run-1011' } })
    expect(r.reasons.map((x) => x.kind)).toEqual(['unmeasured'])
  })

  it('a row for another pair, or with n = 0 on a side, is unmeasured', () => {
    expect(comparabilityOf('2026-09-01', '2026-10-01', { row: AUG_SEP, changes: [], view: 'market', later: LATER_ENDED }).reasons[0].kind).toBe('unmeasured')
    const empty = { ...SAME_WAY, searchOutside: { prev: { k: 0, n: 0 }, curr: { k: 0, n: 377 } } }
    const r = comparabilityOf('2026-10-01', '2026-11-01', { row: empty, changes: [], view: 'market', later: LATER_NOV })
    expect(r.mode).toBe('refuse')
    expect(r.reasons[0].kind).toBe('unmeasured')
  })
})

describe('comparabilityOf: August against September, measured', () => {
  it('refuses on searches (the latest search change named), on depth, and flags the partial run', () => {
    const r = comparabilityOf('2026-08-01', '2026-09-01', { row: AUG_SEP, changes: CHANGES, view: 'market', later: LATER_ENDED })
    expect(r.mode).toBe('refuse')
    expect(r.reasons.map((x) => x.kind)).toEqual(['searches', 'depth', 'gather'])
    expect(r.reasons[0].changeId).toBe('terms-0917-competitor_keywords')
    expect(r.reasons[0].share).toBeCloseTo(206 / 625, 10)
    // DR F39: 15 against 23 is 0.65, under four fifths.
    expect(r.reasons[1].share).toBeCloseTo(15 / 23, 10)
    expect(DEPTH_RATIO_MIN).toBe(0.8)
    expect(r.row).toBe(AUG_SEP)
  })

  it('no "moved" can come from it: the mode is refuse for every view', () => {
    for (const view of ['market', 'themes', 'brands', 'lens'] as const) {
      expect(comparabilityOf('2026-08-01', '2026-09-01', { row: AUG_SEP, changes: CHANGES, view, later: LATER_ENDED }).mode).toBe('refuse')
    }
  })
})

describe('comparabilityOf: a pair read the same way', () => {
  it('with a fresh row, no change in span and matched depth, compares', () => {
    const r = comparabilityOf('2026-10-01', '2026-11-01', { row: SAME_WAY, changes: CHANGES, view: 'market', later: LATER_NOV })
    expect(r).toEqual({ prevMonth: '2026-10-01', month: '2026-11-01', mode: 'comparable', reasons: [], row: SAME_WAY })
  })

  it('depth alone refuses: the later month at 15 against 23', () => {
    const r = comparabilityOf('2026-10-01', '2026-11-01', { row: { ...SAME_WAY, depth: { prevMedian: 23, currMedian: 15 } }, changes: [], view: 'market', later: LATER_NOV })
    expect(r.mode).toBe('refuse')
    expect(r.reasons.map((x) => x.kind)).toEqual(['depth'])
  })

  it('an unmeasured or NaN depth refuses', () => {
    for (const depth of [{ prevMedian: null, currMedian: 23 }, { prevMedian: 23, currMedian: Number.NaN }, { prevMedian: 0, currMedian: 23 }]) {
      const r = comparabilityOf('2026-10-01', '2026-11-01', { row: { ...SAME_WAY, depth }, changes: [], view: 'market', later: LATER_NOV })
      expect(r.mode).toBe('refuse')
      expect(r.reasons).toEqual([{ kind: 'depth', changeId: null, share: null }])
    }
  })

  it('a partial run flags; run health that is not a number flags', () => {
    const partial = { ...SAME_WAY, gather: [{ month: '2026-11-01', runs: 5, partial: 1, searchesShort: 0 }] }
    expect(comparabilityOf('2026-10-01', '2026-11-01', { row: partial, changes: [], view: 'market', later: LATER_NOV }).mode).toBe('flag')
    const nan = { ...SAME_WAY, gather: [{ month: '2026-10-01', runs: 4, partial: Number.NaN, searchesShort: 0 }] }
    expect(comparabilityOf('2026-10-01', '2026-11-01', { row: nan, changes: [], view: 'market', later: LATER_NOV }).reasons.map((x) => x.kind)).toEqual(['gather'])
    const otherMonth = { ...SAME_WAY, gather: [{ month: '2026-09-01', runs: 4, partial: 1, searchesShort: 0 }] }
    expect(comparabilityOf('2026-10-01', '2026-11-01', { row: otherMonth, changes: [], view: 'market', later: LATER_NOV }).mode).toBe('comparable')
  })

  it('a NaN search count never reads as comparable', () => {
    const r = comparabilityOf('2026-10-01', '2026-11-01', {
      row: { ...SAME_WAY, searchOutside: { prev: { k: Number.NaN, n: 377 }, curr: { k: 0, n: 377 } } },
      changes: [], view: 'market', later: LATER_NOV,
    })
    expect(r.mode).toBe('refuse')
    expect(r.reasons[0]).toEqual({ kind: 'searches', changeId: null, share: null })
  })
})

describe('comparabilityOf: changes of ours inside the span', () => {
  // September against October holds the gate fix. Its searches refuse it in
  // reality (§2.11); here the search counts are zeroed so the gate fix's own
  // share is the only thing read. Its reach is §2.11's: 63 of September's 655
  // market videos, 63 of the category's 626; October 0 (every admission is
  // judged after the fix), with September's n standing in for October's.
  const SEP_OCT: PairRow = {
    ...SAME_WAY,
    prevMonth: '2026-09-01',
    month: '2026-10-01',
    searchOutside: { prev: { k: 0, n: 655 }, curr: { k: 0, n: 655 } },
    codeChanges: [
      { changeId: 'gate-fix', surface: 'gate_rule', prev: { k: 63, n: 655 }, curr: { k: 0, n: 655 } },
      { changeId: 'gate-fix', surface: 'gate_rule', prev: { k: 63, n: 626 }, curr: { k: 0, n: 626 }, population: 'category' },
    ],
    gather: [],
    readThroughRun: 'run-1101',
  }
  const later = { state: 'ended' as const, readToEnd: true, latestUpdateRunId: 'run-1101' }

  it('flags the market at 9.6% and refuses themes at 10.1% (category population)', () => {
    const market = comparabilityOf('2026-09-01', '2026-10-01', { row: SEP_OCT, changes: [GATE_FIX], view: 'market', later })
    expect(market.mode).toBe('flag')
    expect(market.reasons).toEqual([{ kind: 'code_change', changeId: 'gate-fix', share: 63 / 655 }])
    const themes = comparabilityOf('2026-09-01', '2026-10-01', { row: SEP_OCT, changes: [GATE_FIX], view: 'themes', later })
    expect(themes.mode).toBe('refuse')
    expect(themes.reasons).toEqual([{ kind: 'code_change', changeId: 'gate-fix', share: 63 / 626 }])
  })

  it('an unmeasured attribution change refuses themes and brands, not the market', () => {
    for (const view of ['themes', 'brands'] as const) {
      const r = comparabilityOf('2026-10-01', '2026-11-01', { row: SAME_WAY, changes: [{ ...ATTRIBUTION, changedAt: '2026-10-20T12:00:00.000Z' }], view, later: LATER_NOV })
      expect(r.mode).toBe('refuse')
      expect(r.reasons).toEqual([{ kind: 'code_change', changeId: 'attribution-v3', share: null }])
    }
    const market = comparabilityOf('2026-10-01', '2026-11-01', { row: SAME_WAY, changes: [{ ...ATTRIBUTION, changedAt: '2026-10-20T12:00:00.000Z' }], view: 'market', later: LATER_NOV })
    expect(market.mode).toBe('comparable')
  })

  it('an entity re-tag refuses themes, not the market', () => {
    const retag: OurChange = { id: 'retag', surface: 'entity_retag', changedAt: '2026-10-20T12:00:00.000Z', note: null, affects: VIEWS_BY_SURFACE.entity_retag }
    expect(comparabilityOf('2026-10-01', '2026-11-01', { row: SAME_WAY, changes: [retag], view: 'themes', later: LATER_NOV }).mode).toBe('refuse')
    expect(comparabilityOf('2026-10-01', '2026-11-01', { row: SAME_WAY, changes: [retag], view: 'market', later: LATER_NOV }).mode).toBe('comparable')
  })

  it('a segment change refuses nothing', () => {
    const seg: OurChange = { id: 'segments-v1', surface: 'segment', changedAt: '2026-10-20T12:00:00.000Z', note: null, affects: VIEWS_BY_SURFACE.segment }
    for (const view of ['market', 'themes', 'brands', 'lens'] as const) {
      expect(comparabilityOf('2026-10-01', '2026-11-01', { row: SAME_WAY, changes: [seg], view, later: LATER_NOV }).mode).toBe('comparable')
    }
  })

  it('a knobs change with no measure of its own refuses (a change we have not measured counts as 10%)', () => {
    const knobs = changesFromLog([row({ id: 'knobs-1020', changed_at: '2026-10-20T12:00:00.000Z', surface: 'knobs', field: 'max_comments' })])
    const r = comparabilityOf('2026-10-01', '2026-11-01', { row: SAME_WAY, changes: knobs, view: 'market', later: LATER_NOV })
    expect(r.mode).toBe('refuse')
    expect(r.reasons).toEqual([{ kind: 'code_change', changeId: 'knobs-1020', share: null }])
  })

  it('a term change inside the span is read through the search-outside count, not refused unmeasured', () => {
    const term: OurChange = { id: 'terms-1020', surface: 'terms', changedAt: '2026-10-20T12:00:00.000Z', note: null, affects: VIEWS_BY_SURFACE.terms }
    expect(comparabilityOf('2026-10-01', '2026-11-01', { row: SAME_WAY, changes: [term], view: 'market', later: LATER_NOV }).mode).toBe('comparable')
  })

  it('matches a measure keyed on any row of the change', () => {
    const grouped: OurChange = { ...GATE_FIX, id: 'gate-fix-a', rowIds: ['gate-fix-a', 'gate-fix'] }
    const r = comparabilityOf('2026-09-01', '2026-10-01', { row: SEP_OCT, changes: [grouped], view: 'market', later })
    expect(r.reasons).toEqual([{ kind: 'code_change', changeId: 'gate-fix-a', share: 63 / 655 }])
  })

  it('judges a measure for a change it was not handed by the measure’s own surface, and ignores one out of span', () => {
    const orphan = comparabilityOf('2026-09-01', '2026-10-01', { row: SEP_OCT, changes: [], view: 'market', later })
    expect(orphan.reasons).toEqual([{ kind: 'code_change', changeId: 'gate-fix', share: 63 / 655 }])
    const outOfSpan = { ...GATE_FIX, changedAt: '2026-06-01T00:00:00.000Z' }
    expect(comparabilityOf('2026-09-01', '2026-10-01', { row: SEP_OCT, changes: [outOfSpan], view: 'market', later }).mode).toBe('comparable')
  })
})

// ---- The next pair ------------------------------------------------------------------------------

describe('nextComparablePair', () => {
  const sunday = scheduledUpdateAfter({ report_period: 'weekly', report_day: 'sunday' })

  it('Sealand on 24 Sep: October against November, from the 6 Dec update, in full around the 3 Jan update', () => {
    expect(nextComparablePair('2026-09-24T18:00:00.000Z', CHANGES, [], { nextUpdateAfter: sunday })).toEqual({
      prevMonth: '2026-10-01',
      month: '2026-11-01',
      sameAgeFrom: '2026-12-06T04:00:00.000Z',
      inFullExpected: '2027-01-03T04:00:00.000Z',
      assumes: 'no_further_change',
    })
  })

  it('without a schedule: the instants themselves (November ends; November’s freeze line)', () => {
    const next = nextComparablePair('2026-09-24T18:00:00.000Z', CHANGES, [])
    expect(next?.sameAgeFrom).toBe('2026-12-01T00:00:00.000Z')
    expect(next?.inFullExpected).toBe('2026-12-31T00:00:00.000Z')
  })

  it('the gate fix and attribution v3 in late September leave it at October against November, for every view', () => {
    for (const view of ['market', 'themes', 'brands'] as const) {
      expect(nextComparablePair('2026-10-02T06:00:00.000Z', [...CHANGES, GATE_FIX, ATTRIBUTION], [], { view })?.prevMonth).toBe('2026-10-01')
    }
  })

  it('a searched community moving in October pushes it to November against December; a probe does not', () => {
    const promoted = changesFromLog([row({ changed_at: '2026-10-11T08:00:00.000Z', surface: 'subreddits', before: entries(), after: entries({ known_03: { status: 'active' } }) })])
    expect(nextComparablePair('2026-10-12T06:00:00.000Z', [...CHANGES, ...promoted], [])?.prevMonth).toBe('2026-11-01')
    const probed = changesFromLog([row({ changed_at: '2026-10-11T08:00:00.000Z', surface: 'subreddits', before: entries(), after: entries({ known_03: { status: 'rejected' } }) })])
    expect(nextComparablePair('2026-10-12T06:00:00.000Z', [...CHANGES, ...probed], [])?.prevMonth).toBe('2026-10-01')
  })

  it('a segment change in October does not move the market’s pair', () => {
    const seg: OurChange = { id: 'segments-v1', surface: 'segment', changedAt: '2026-10-01T10:00:00.000Z', note: null, affects: [] }
    expect(nextComparablePair('2026-10-02T06:00:00.000Z', [...CHANGES, seg], [])?.prevMonth).toBe('2026-10-01')
  })

  it('skips a pair whose measured row refuses on a share; depth never skips one', () => {
    // A stand-in row for October against November that measured as August
    // against September did (206 of 625 outside the searches): not knowable today.
    const refused: PairRow = { ...SAME_WAY, searchOutside: { prev: { k: 0, n: 377 }, curr: { k: 206, n: 625 } } }
    expect(nextComparablePair('2026-12-07T12:00:00.000Z', CHANGES, [refused])?.prevMonth).toBe('2026-11-01')
    const shallow: PairRow = { ...SAME_WAY, depth: { prevMedian: 23, currMedian: 15 } }
    expect(nextComparablePair('2026-12-07T12:00:00.000Z', CHANGES, [shallow])?.prevMonth).toBe('2026-10-01')
  })

  it('with no change of ours logged, the month before now against now', () => {
    expect(nextComparablePair('2026-09-24T18:00:00.000Z', [], [])?.prevMonth).toBe('2026-08-01')
  })
})

describe('latestPairRow', () => {
  it('the newest computedAt wins; another pair never does', () => {
    const older = { ...AUG_SEP, computedAt: '2026-09-30T20:00:00.000Z', readThroughRun: 'run-0927' }
    expect(latestPairRow([older, AUG_SEP], '2026-08-01', '2026-09-01')).toBe(AUG_SEP)
    expect(latestPairRow([AUG_SEP, older], '2026-08-01', '2026-09-01')).toBe(AUG_SEP)
    expect(latestPairRow([AUG_SEP], '2026-09-01', '2026-10-01')).toBeNull()
  })
})
