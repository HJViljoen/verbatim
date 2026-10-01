import { describe, expect, it } from 'vitest'

import { fakeDb } from '../test/fake-db'
import { HYPOTHETICAL_SAME_WAY } from '../test/pair-fixture'
import { sealandJudge } from '../test/sealand-pairs'
import { pairOn, type PairOn } from '../reading/pairs'
import {
  loadObjectReadings,
  objectLine,
  objectReading,
  renderObjects,
  subjectPoints,
  axisFromStart,
  type MarketObjectRef,
  type MarketPoint,
} from './movement'
import { askWindow, kindsNamedIn, moodAsked, namedIn, names, parseAskWindow, withoutQuoted } from './scope'
import type { ReadingMonth } from '../reading/reading-month'
import type { MonthSeries } from '../reading/series'

// Sealand's real figures (plan §2.2, prod as at 24 Sep, and the staging
// research it cites). Where a figure is an inference it says so beside it.
const AUG = '2026-08-01'
const SEP = '2026-09-01'
const OCT = '2026-10-01'
const NOV = '2026-11-01'
// 1–15 Oct: every page reads September, ended (decision A). The Aug→Sep pair
// is refused: we changed our searches in September (no pair row yet: MF1's
// row is Heinrich's paste, so the judge refuses it as unmeasured and names
// the in-span search change).
const ON_2_OCT = '2026-10-02T06:00:00.000Z'
const judgeOn2Oct = pairOn(sealandJudge(ON_2_OCT))

const SUBJECTS = [
  { id: 'subj-looks', name: 'Looks & style' },
  { id: 'subj-water', name: 'Waterproofing' },
  { id: 'subj-repair', name: 'Repair & warranty' },
  { id: 'subj-price', name: 'Price' },
]

describe('what a question names (the client’s own words)', () => {
  it('lands "Ask about this" on the subject its question names', () => {
    // d3's Subjects link sends exactly this sentence.
    expect(namedIn('What does my market say about Waterproofing?', SUBJECTS).map((s) => s.id)).toEqual(['subj-water'])
    expect(namedIn('How are we seen on Looks & style?', SUBJECTS).map((s) => s.id)).toEqual(['subj-looks'])
    // A reader types the word, the subject's name carries the symbol.
    expect(namedIn('what about looks and style this month', SUBJECTS).map((s) => s.id)).toEqual(['subj-looks'])
  })

  it('names a rival by its name, accents and case folded, never inside another word', () => {
    const rivals = [{ name: 'Cotopaxi' }, { name: 'Patagonia' }, { name: 'The North Face' }]
    expect(namedIn('What do people say about Cotopaxi backpacks?', rivals).map((r) => r.name)).toEqual(['Cotopaxi'])
    expect(namedIn('the north face vs patagonia', rivals).map((r) => r.name)).toEqual(['Patagonia', 'The North Face'])
    expect(names('Ossur legs', 'Össur')).toBe(true)
    expect(names('Pricey', 'Price')).toBe(false)
    expect(names('Prices', 'Price')).toBe(true)
  })

  it('reads the kind a reader names, and the mood', () => {
    expect(kindsNamedIn('What does my market complain about?')).toEqual(['pain_point'])
    expect(kindsNamedIn('What makes people ready to buy?')).toEqual(['purchase_intent'])
    expect(kindsNamedIn('Which colours does my market wish for?')).toEqual(['feature_request'])
    expect(kindsNamedIn('What do people say about zips?')).toEqual([])
    expect(moodAsked('How does my market feel about Cotopaxi?')).toBe(true)
    expect(moodAsked('What do people say about zips?')).toBe(false)
  })

  it('a quoted theme label is a name: its words name no kind and not the mood, and a subject in it is still named', () => {
    // Conversation's "Ask about this" as deploy 3 drew it, and as a snapshot
    // stored before WP3.9 still carries it, on Sealand's September themes
    // (staging, 27 Sep): read as the reader's words, these named "asking how
    // it works", "ready to buy", "saying it worked" and "hitting a problem".
    const ask = (label: string) => `What is behind “${label}” in September?`
    for (const label of ['Buying interest and ordering questions', 'Praise for beautiful bag design', 'Frustration with bag weight', 'Price and sale questions', 'Comfort problems when carrying']) {
      expect(kindsNamedIn(ask(label)), label).toEqual([])
      expect(moodAsked(ask(label)), label).toBe(false)
    }
    // Össur's: "Questions about prosthetic function", "Requests for prosthetic help".
    expect(kindsNamedIn(ask('Questions about prosthetic function'))).toEqual([])
    expect(kindsNamedIn(ask('Requests for prosthetic help'))).toEqual([])
    // A subject named inside the label is a name all the same.
    expect(namedIn(ask('Price and sale questions'), SUBJECTS).map((s) => s.id)).toEqual(['subj-price'])
    // The reader's own words around a quotation still name a kind.
    expect(kindsNamedIn('What do people complain about in “Praise for beautiful bag design”?')).toEqual(['pain_point'])
    expect(withoutQuoted('What is behind “Frustration with bag weight” in September?')).toBe('What is behind   in September?')
  })
})

describe('the window: 90 days by default, all time on the switch', () => {
  const reading = (asAt: string, month = SEP): ReadingMonth =>
    ({ month, asAt } as unknown as ReadingMonth)

  it('ends where the pages’ 90-day windows end, never at the clock', () => {
    // On 2 Oct the pages read September. Read before September's last update
    // had landed, the window ends with the 27 Sep update's day.
    expect(askWindow(reading('2026-09-27T08:30:00.000Z'), 'days90', ON_2_OCT)).toEqual({ from: '2026-06-30', to: '2026-09-28' })
    // With an update after the month ended, the month's own end closes it.
    expect(askWindow(reading('2026-10-04T08:30:00.000Z'), 'days90', ON_2_OCT)).toEqual({ from: '2026-07-03', to: '2026-10-01' })
  })

  it('is all time only when the reader asks for it', () => {
    expect(askWindow(reading('2026-09-27T08:30:00.000Z'), 'all', ON_2_OCT)).toBeNull()
    expect(parseAskWindow('all')).toBe('all')
    expect(parseAskWindow(undefined)).toBe('days90')
    expect(parseAskWindow('forever')).toBe('days90')
  })
})

// Category figures stand in for the pooled market in the PURE tests: the
// pooling is `loadObjectReadings`'s and is tested on rows below. Looks &
// style: 38 of 351 in August (research §1) and 104 of 626 in September
// (prod, 24 Sep).
const looks = (calibration: MarketObjectRef['calibration']): MarketObjectRef => ({ kind: 'subject', id: 'subj-looks', label: 'Looks & style', calibration })
const LOOKS_POINTS: MarketPoint[] = [
  { month: AUG, k: 38, n: 351 },
  { month: SEP, k: 104, n: 626 },
]

describe('a subject named in a question: its own figure and trail', () => {
  it('a READY subject gets its level, its trail and the pair’s refusal, never "moved" on Aug→Sep', () => {
    // HYPOTHETICAL calibration: no production subject is ready yet (decision C,
    // Waterproofing measured 0.52), so the fixture's Looks & style is marked
    // ready to exercise the verdict path.
    const r = objectReading({ object: looks('ready'), points: LOOKS_POINTS }, SEP, judgeOn2Oct, ON_2_OCT)
    expect(r.state).toBe('read')
    expect(r.curr).toEqual({ month: SEP, k: 104, n: 626 })
    // T0a (the one condition): the trail stops at the refused step, and no
    // month before is offered beside September.
    expect(r.trail.map((p) => p.month)).toEqual([SEP])
    expect(r.prev).toBeNull()
    expect(r.verdict?.state).toBe('refused')
    expect(r.verdict?.state).not.toBe('moved')
    expect(r.direction).toBeNull()
    const line = objectLine(r)
    expect(line).not.toContain('Aug 2026')
    expect(line).toContain('Looks & style (a subject) · your market')
    expect(line).toContain('Sep 2026 104 of 626 videos (16.6%)')
    expect(line).toContain('comparison refused')
    expect(line).toContain('Not read as a change: we changed our searches in September.')
    expect(line).not.toMatch(/\bmoved\b/)
  })

  it('a pair read the same way is banded, and a direction word needs three comparable ended months', () => {
    // HYPOTHETICAL: October against November read the same way
    // (HYPOTHETICAL_SAME_WAY); the counts are Looks & style's real ones
    // re-dated.
    // Read at 7 Dec, when the 6 Dec update is the last to read November.
    const judge = pairOn(sealandJudge('2026-12-07T06:00:00.000Z', [HYPOTHETICAL_SAME_WAY]))
    const points: MarketPoint[] = [{ month: OCT, k: 38, n: 377 }, { month: NOV, k: 104, n: 626 }]
    const r = objectReading({ object: looks('ready'), points }, NOV, judge, '2026-12-07T06:00:00.000Z')
    expect(r.verdict?.pair ?? null).toBeNull()
    expect(['moved', 'no_clear_change']).toContain(r.verdict?.state)
    // Two months are not three: no word.
    expect(r.direction).toBeNull()
  })

  // T0a (AK-5; ruling U6): a PROVISIONAL subject's level rests on matching
  // that is not yet verified, so it goes the way a failed one's always did:
  // the name, no figure, no verdict and no word.
  it('a PROVISIONAL subject is named with no figure, no verdict and no word', () => {
    const r = objectReading({ object: looks('provisional'), points: LOOKS_POINTS }, SEP, judgeOn2Oct, ON_2_OCT)
    expect(r.verdict).toBeNull()
    expect(r.direction).toBeNull()
    expect(r.curr).toBeNull()
    expect(r.trail).toEqual([])
    expect(objectLine(r)).toBe('- Looks & style (a subject) · your market: no figure is given')
  })

  it('a FAILED subject prints no figure, only its name', () => {
    const r = objectReading({ object: { kind: 'subject', id: 'subj-repair', label: 'Repair & warranty', calibration: 'failed' }, points: LOOKS_POINTS }, SEP, judgeOn2Oct, ON_2_OCT)
    expect(r.curr).toBeNull()
    expect(objectLine(r)).toBe('- Repair & warranty (a subject) · your market: no figure is given')
    expect(objectLine(r)).not.toMatch(/\d+ of \d+/)
  })

  it('the block tells the model to name the month and never to type a figure', () => {
    const block = renderObjects([objectReading({ object: looks('ready'), points: LOOKS_POINTS }, SEP, judgeOn2Oct, ON_2_OCT)])
    expect(block).toContain('WHAT THE QUESTION NAMES')
    expect(block).toContain('never type a figure yourself')
    expect(renderObjects([])).toBe('')
  })
})

// ── the loader, on rows ───────────────────────────────────────────────────────

const CLIENT = 'client-sealand'
// The market's two parts: the category (351 in August, 626 in September) and
// the videos filed under a tracked brand (26 and 29: 377 − 351 and 655 − 626).
// The research does not split the 26 and 29 by brand, so they are held under
// one audience here.
const RIVALS = 'competitor:Tracked brands'
const denom = (month: string, audience: string, videos: number, comments: number) => ({
  client_id: CLIENT, month, audience, videos, comments, status: 'filling', origin: 'live', read_at: '2026-09-27T08:30:00.000Z', run_id: 'run-0927',
})
function tables(extra: Record<string, Record<string, unknown>[]> = {}) {
  return {
    config_changes: [],
    pipeline_runs: [],
    subjects: SUBJECTS.map((s) => ({ ...s, client_id: CLIENT })),
    month_denominators: [
      denom(AUG, 'industry-other', 351, 10188),
      denom(SEP, 'industry-other', 626, 16233),
      denom(AUG, RIVALS, 26, 0),
      denom(SEP, RIVALS, 29, 0),
    ],
    ...extra,
  }
}

describe('loadObjectReadings: on the market, one read per kind of object', () => {
  const base = { clientId: CLIENT, month: SEP, pair: judgeOn2Oct, asOf: ON_2_OCT, rivalAudiences: [RIVALS] }

  it('a brand topic reads "not read yet" until MF3 creates month_brand_readings', async () => {
    const { client } = fakeDb(tables())
    const [r] = await loadObjectReadings(client as never, { ...base, objects: [{ kind: 'brand', id: 'comp-cotopaxi', label: 'Cotopaxi' }] })
    expect(r.state).toBe('not_read')
    expect(objectLine(r)).toContain('Cotopaxi (a brand, named in the video or its comments) · your market: not read yet')
  })

  it('reads a brand topic off month_brand_readings once it exists, and refuses Aug→Sep on the brands view', async () => {
    // Cotopaxi on the market, August 39 of 377 and September 31 of 654
    // (plan §2.5 B1, staging raw, BC F35), as pooled rows.
    const { client } = fakeDb(tables({
      month_brand_readings: [
        { client_id: CLIENT, month: AUG, audience: 'market', brand_key: 'comp-cotopaxi', k_any: 39, n: 377 },
        { client_id: CLIENT, month: SEP, audience: 'market', brand_key: 'comp-cotopaxi', k_any: 31, n: 654 },
      ],
    }))
    const [r] = await loadObjectReadings(client as never, { ...base, objects: [{ kind: 'brand', id: 'comp-cotopaxi', label: 'Cotopaxi' }] })
    expect(r.state).toBe('read')
    expect(r.curr).toEqual({ month: SEP, k: 31, n: 654 })
    // Refused: August does not travel beside September (T0a).
    expect(r.prev).toBeNull()
    expect(r.trail.map((p) => p.month)).toEqual([SEP])
    expect(r.verdict?.state).toBe('refused')
    expect(objectLine(r)).not.toMatch(/\bmoved\b/)
  })

  it('pools a subject over the market’s audiences, the client’s own posts left out', async () => {
    // Looks & style in the category (104 of 626, prod); the rival-filed side
    // and the client's own are not in the research, so the fixture holds the
    // client's own row only to show it is left out.
    const { client } = fakeDb(tables({
      month_subject_readings: [
        { client_id: CLIENT, month: AUG, audience: 'industry-other', subject_id: 'subj-looks', videos: 38, comments: 0 },
        { client_id: CLIENT, month: SEP, audience: 'industry-other', subject_id: 'subj-looks', videos: 104, comments: 0 },
        { client_id: CLIENT, month: SEP, audience: 'client', subject_id: 'subj-looks', videos: 9, comments: 0 },
      ],
    }))
    const [r] = await loadObjectReadings(client as never, { ...base, objects: [looks('ready')] })
    // n is the pooled market: 626 + 29 = 655 in September, 351 + 26 = 377 in
    // August. The client's 9 never reach k.
    expect(r.curr).toEqual({ month: SEP, k: 104, n: 655 })
    // The pair is refused on 2 Oct, so August does not travel (T0a).
    expect(r.prev).toBeNull()
    expect(r.verdict?.state).toBe('refused')
  })

  it('reads a kind and the mood on the market; each refuses Aug→Sep and none says "moved"', async () => {
    // Praising it: 450 of 626 in September (prod); August 79% of 351 (stg),
    // 277 as a count (est.). Mood: positive 484 of 626 judged in September
    // (prod); August 69% of 351 (stg), 242 (est.).
    const { client } = fakeDb(tables({
      month_kind_readings: [
        { client_id: CLIENT, month: AUG, audience: 'industry-other', kind: 'praise', videos: 277 },
        { client_id: CLIENT, month: SEP, audience: 'industry-other', kind: 'praise', videos: 450 },
      ],
      month_audience_stats: [
        { client_id: CLIENT, month: AUG, audience: 'industry-other', judged: 351, positive: 242 },
        { client_id: CLIENT, month: SEP, audience: 'industry-other', judged: 626, positive: 484 },
      ],
    }))
    const out = await loadObjectReadings(client as never, {
      ...base,
      objects: [{ kind: 'kind', id: 'praise', label: 'praise' }, { kind: 'mood', id: 'positive', label: 'Positive' }],
    })
    expect(out.map((r) => r.curr)).toEqual([{ month: SEP, k: 450, n: 655 }, { month: SEP, k: 484, n: 626 }])
    for (const r of out) {
      expect(r.verdict?.state).toBe('refused')
      expect(objectLine(r)).not.toMatch(/\bmoved\b/)
    }
  })

  it('a month table that is not there answers "not read yet" for its objects and leaves the rest', async () => {
    const { client } = fakeDb(tables())
    const out = await loadObjectReadings(client as never, { ...base, objects: [{ kind: 'kind', id: 'praise', label: 'praise' }, looks('ready')] })
    expect(out.map((r) => r.state)).toEqual(['not_read', 'not_read'])
  })
})

// ── "Ask about this" on a subject lands on Subjects' own number (S7) ─────────
//
// Staging, Sealand, read 27 Sep (the scratch probe of mf/s4-ask-links): the
// market is the category and the seven tracked brands' filed videos, and in
// September three of the seven (Freedom of Movement, Old School, Rareform)
// have no denominator row at all. The month series still carries a point for
// each of them, with no k and no videos, and pooling that point read the whole
// side as unknown: every subject read "null of 654", which the block printed
// as "0 of 654". Subjects prints Looks & style at 103 of 654 (102 in the
// category, 1 filed under Freitag).
describe('a subject pooled as Subjects pools it', () => {
  const STG = {
    cat: 'industry-other',
    cotopaxi: 'competitor:Cotopaxi',
    fom: 'competitor:Freedom of Movement',
    freitag: 'competitor:Freitag',
    oldSchool: 'competitor:Old School',
    patagonia: 'competitor:Patagonia',
    rareform: 'competitor:Rareform',
    tnf: 'competitor:The North Face',
  }
  const rivals = [STG.cotopaxi, STG.fom, STG.freitag, STG.oldSchool, STG.patagonia, STG.rareform, STG.tnf]
  const WRITTEN = '2026-09-27T08:30:00.000Z'
  // Staging's denominators: August 351 + 22 + 4 = 377; September
  // 625 + 12 + 6 + 5 + 6 = 654.
  const denominators = [
    denom(AUG, STG.cat, 351, 10188), denom(AUG, STG.cotopaxi, 22, 0), denom(AUG, STG.freitag, 4, 0),
    denom(SEP, STG.cat, 625, 16233), denom(SEP, STG.cotopaxi, 12, 0), denom(SEP, STG.freitag, 6, 0),
    denom(SEP, STG.patagonia, 5, 0), denom(SEP, STG.tnf, 6, 0),
  ]
  const looksRows = [
    { client_id: CLIENT, month: AUG, audience: STG.cat, subject_id: 'subj-looks', videos: 37, comments: 0 },
    { client_id: CLIENT, month: AUG, audience: STG.cotopaxi, subject_id: 'subj-looks', videos: 1, comments: 0 },
    { client_id: CLIENT, month: SEP, audience: STG.cat, subject_id: 'subj-looks', videos: 102, comments: 0 },
    { client_id: CLIENT, month: SEP, audience: STG.freitag, subject_id: 'subj-looks', videos: 1, comments: 0 },
  ]
  // Community & purpose (lib/subjects/read-in.ts): named 24 Sep at 12:41,
  // after the update that last wrote the months, so no month was read for it.
  const community = { id: 'subj-community', name: 'Community & purpose', client_id: CLIENT, named_at: '2026-09-24', created_at: '2026-09-24T12:41:00.000Z' }
  const stagingTables = () => ({
    config_changes: [],
    pipeline_runs: [],
    subjects: [
      { id: 'subj-looks', name: 'Looks & style', client_id: CLIENT, named_at: '2026-09-15', created_at: '2026-09-15T09:00:00.000Z' },
      community,
    ],
    month_denominators: denominators.map((d) => ({ ...d, read_at: d.month === SEP ? '2026-09-24T12:15:00.000Z' : '2026-09-15T08:00:00.000Z' })),
    month_subject_readings: looksRows,
  })
  const base = { clientId: CLIENT, month: SEP, pair: judgeOn2Oct, asOf: ON_2_OCT, rivalAudiences: rivals }

  it('leaves out a brand with no videos that month, as Subjects does: 103 of 654, not "0 of 654"', async () => {
    const { client } = fakeDb(stagingTables())
    // HYPOTHETICAL: the pair read the same way, so August is shown and its
    // pooling can be checked (on 2 Oct the judge refuses it, and T0a prints
    // no month before beside a refusal).
    const joined: PairOn = (prevMonth, month) => ({ prevMonth, month, mode: 'comparable', reasons: [], row: null, checkWith: null })
    const [r] = await loadObjectReadings(client as never, { ...base, pair: joined, objects: [looks('ready')] })
    expect(r.state).toBe('read')
    expect(r.curr).toEqual({ month: SEP, k: 103, n: 654 })
    expect(r.prev).toEqual({ month: AUG, k: 38, n: 377 })
    const [refused] = await loadObjectReadings(fakeDb(stagingTables()).client as never, { ...base, objects: [looks('ready')] })
    expect(refused.prev).toBeNull()
    expect(objectLine(r)).toContain('Sep 2026 103 of 654 videos')
    expect(objectLine(r)).not.toMatch(/\b0 of \d/)
  })

  it('a subject no month was read for says so in Subjects’ words, never "0 of 654"', async () => {
    const { client } = fakeDb(stagingTables())
    const withNext = await loadObjectReadings(client as never, {
      ...base,
      objects: [{ kind: 'subject', id: 'subj-community', label: 'Community & purpose', calibration: 'ready' }],
      nextUpdate: '2026-10-04T06:00:00.000Z',
    })
    expect(withNext[0].state).toBe('unread')
    expect(withNext[0].curr).toEqual({ month: SEP, k: null, n: 654 })
    expect(withNext[0].unread).toBe('no reading yet')
    expect(objectLine(withNext[0])).toContain('Community & purpose (a subject) · your market: no reading yet')
    expect(objectLine(withNext[0])).not.toMatch(/\d+ of \d+/)
    // No update to come (a paused tenant, or an older month): the month
    // will not be read for it.
    const paused = await loadObjectReadings(client as never, {
      ...base,
      objects: [{ kind: 'subject', id: 'subj-community', label: 'Community & purpose', calibration: 'ready' }],
    })
    expect(paused[0].unread).toBe('not read in September')
  })

  it('starts the trail where the pages’ charts start: the first month the market cleared 100 videos', () => {
    // Staging's category: June 45, July 35, August 351 (Cotopaxi 5 and 1
    // beside the first two). Subjects' chart and trail start in August.
    const axis = ['2026-06-01', '2026-07-01', AUG, SEP]
    const rows = [
      { month: '2026-06-01', audience: STG.cat, videos: 45 }, { month: '2026-06-01', audience: STG.cotopaxi, videos: 5 },
      { month: '2026-07-01', audience: STG.cat, videos: 35 }, { month: '2026-07-01', audience: STG.cotopaxi, videos: 1 },
      { month: AUG, audience: STG.cat, videos: 351 }, { month: SEP, audience: STG.cat, videos: 625 },
      // The client's own posts are not the market and never start it.
      { month: '2026-06-01', audience: 'client', videos: 120 },
    ]
    expect(axisFromStart(axis, rows, [STG.cat, ...rivals])).toEqual([AUG, SEP])
    // Nothing has cleared the floor yet: the month read stays.
    expect(axisFromStart(axis, rows.filter((r) => r.videos < 100), [STG.cat, ...rivals])).toEqual(axis)
  })

  it('subjectPoints: a month written before the subject was counted, with no row, is no reading', () => {
    const line = (audience: string, points: { month: string; k: number | null; videos: number | null }[]) =>
      ({ audience, objectId: 'subj-x', points }) as unknown as MonthSeries
    const counts = new Map([[AUG, { month: AUG, videos: 377, comments: 0, category: 351, rivalFiled: 26 }], [SEP, { month: SEP, videos: 654, comments: 0, category: 625, rivalFiled: 29 }]])
    const lines = [
      line(STG.cat, [{ month: AUG, k: 0, videos: 351 }, { month: SEP, k: 0, videos: 625 }]),
      line(STG.fom, [{ month: AUG, k: null, videos: null }, { month: SEP, k: null, videos: null }]),
    ]
    const writtenAt = new Map([[AUG, Date.parse('2026-09-15T08:00:00.000Z')], [SEP, Date.parse(WRITTEN)]])
    // Counted on 20 Sep: August (written 15 Sep) was not read for it,
    // September (written 27 Sep) was, and its 0 is a reading.
    const pts = subjectPoints(lines, [AUG, SEP], counts, rivals, { seeded: true, countedFrom: Date.parse('2026-09-20T00:00:00.000Z'), writtenAt })
    expect(pts).toEqual([{ month: AUG, k: null, n: 377 }, { month: SEP, k: 0, n: 654 }])
  })
})
