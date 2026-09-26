import { describe, it, expect } from 'vitest'

import type { ConfigChange } from '../../config-log'
import { changesFromLog, comparabilityOf, nextComparablePair, type PairRow } from '../../reading/comparability'
import { withGatherFlags } from '../../reading/gather-flags'
import { pairJudge } from '../../reading/pairs'
import { scheduledUpdateAfter } from '../../reading/reading-month'
import {
  CHANGE_NEW,
  CHANGE_OF,
  addedOnlyRecordSentence,
  changeLead,
  compareRules,
  buildChangeBlock,
  measuredSearchSentence,
  nextPairLine,
  nextPairParts,
  placeInMonth,
  readTheSameWay,
  rowMeasuresPair,
  searchChangeDays,
  searchChangesLine,
  whyCells,
  whyNotCompared,
  type ChangeBlock,
} from './change'

// Sealand's real change log around September (GC F2, staging's copy of
// production to 20 Sep): the 13 Sep term additions and the 17 Sep script.
const row = (over: Partial<ConfigChange> & Pick<ConfigChange, 'id' | 'changed_at' | 'surface'>): ConfigChange => ({
  client_id: 'sealand', field: null, before: null, after: null, actor_kind: 'sql', actor_user_id: null, actor_label: null,
  run_id: null, source: 'trigger', rows_affected: null, note: null, affects_audiences: null, affects_months: null, ...over,
})
const LOG = [
  row({ id: 'terms-0913', changed_at: '2026-09-13T10:00:58.000Z', surface: 'terms', field: 'industry_keywords', after: ['handmade bag', 'sustainable fashion', 'travel gear'] }),
  row({ id: 'terms-0917', changed_at: '2026-09-17T16:02:56.000Z', surface: 'terms', field: 'industry_keywords', actor_kind: 'script' }),
]
const CHANGES = changesFromLog(LOG)

/**
 * A measured August against September row: staging's (Aug, Sep) row as
 * measure-comparability wrote it on 26 Sep (the MF1 rehearsal): the strict
 * search-outside counts, 148 of 351 and 376 of 625 (category), and WP1.8's
 * one figure, 356 of September's 654 market videos found only by searches
 * first run in September (the 26 Sep ruling). Depth is DR F39's medians, 23
 * and 15.
 */
const ROW: PairRow = {
  prevMonth: '2026-08-01',
  month: '2026-09-01',
  searchOutside: { prev: { k: 148, n: 351 }, curr: { k: 376, n: 625 } },
  addedOnly: { k: 356, n: 654 },
  codeChanges: [],
  depth: { prevMedian: 23, currMedian: 15 },
  gather: [],
  lateCapture: null,
  readThroughRun: 'run-27sep',
  methodVersion: 'mf1',
  computedAt: '2026-09-30T10:00:00.000Z',
}

const pair = (state: 'so_far' | 'ended', row: PairRow | null = ROW) =>
  comparabilityOf('2026-08-01', '2026-09-01', {
    row,
    changes: CHANGES,
    view: 'market',
    later: { state, readToEnd: state === 'ended', latestUpdateRunId: 'run-27sep' },
  })

const block = (over: Partial<ChangeBlock> = {}): ChangeBlock => ({
  prevMonth: '2026-08-01',
  month: '2026-09-01',
  pair: pair('ended'),
  next: nextComparablePair('2026-10-02T06:00:00.000Z', CHANGES, [ROW], {
    view: 'market',
    readingMonth: '2026-09-01',
    nextUpdateAfter: scheduledUpdateAfter({ report_period: 'weekly', report_day: 'sunday' }),
  }),
  checks: [],
  readWith: '2026-09-27T08:30:00.000Z',
  ...over,
})

describe('what changed, and what is ours (plan §2.2 block 10)', () => {
  it('prints WP1.8’s one figure from the pair row in the preview’s sentence, read with its update, over the market', () => {
    const lead = changeLead(block())
    expect(lead?.body).toBe(
      `Not a change we can stand behind yet: about half of September came from searches we added in September ([[${CHANGE_NEW}]] of [[${CHANGE_OF}]], read with the 27 Sep update).`,
    )
    expect(lead?.figures[CHANGE_NEW]).toMatchObject({ value: 356, unit: 'videos' })
    expect(lead?.figures[CHANGE_OF]).toMatchObject({ value: 654, unit: 'videos' })
  })

  it('takes the share word from the ladder, never from the copy', () => {
    const third: PairRow = { ...ROW, addedOnly: { k: 206, n: 626 } }
    expect(changeLead(block({ pair: pair('ended', third) }))?.body).toContain(': about a third of September came from searches we added in September (')
    const most: PairRow = { ...ROW, addedOnly: { k: 480, n: 654 } }
    expect(changeLead(block({ pair: pair('ended', most) }))?.body).toContain(': about three quarters of September came')
  })

  it('reads with no update named when the row’s update is unknown', () => {
    expect(changeLead(block({ readWith: null }))?.body).toBe(
      `Not a change we can stand behind yet: about half of September came from searches we added in September ([[${CHANGE_NEW}]] of [[${CHANGE_OF}]]).`,
    )
  })

  it('never prints the strict count: a row without the figure prints the refusal with no figure', () => {
    for (const addedOnly of [null, undefined, { k: 0, n: 654 }]) {
      const r: PairRow = { ...ROW, addedOnly }
      const b = block({ pair: pair('ended', r) })
      expect(measuredSearchSentence(b)).toBeNull()
      expect(changeLead(b)).toEqual({ body: 'Not read as a change: we changed our searches in September.', figures: {} })
      expect(JSON.stringify(whyNotCompared(b))).not.toMatch(/376|625/)
    }
  })

  it('prints only where the strict count refuses the pair on what we search', () => {
    // Rule 2 under a tenth on both sides: the pair is not refused on searches,
    // so the sentence does not print, whatever the added-only figure says.
    const flagged: PairRow = { ...ROW, searchOutside: { prev: { k: 2, n: 351 }, curr: { k: 30, n: 625 } }, depth: { prevMedian: 20, currMedian: 19 } }
    expect(measuredSearchSentence(block({ pair: pair('ended', flagged) }))).toBeNull()
  })

  it('never gives a figure under the line as the refusal’s reason: July against August at 2 of 377 (deploy 2 review)', () => {
    // Staging's (Jul, Aug) row: refused on searches at 170 of 351 strict (the
    // September terms read back into August), with August's added-only figure
    // 2 of 377. The figure is not why the pair is refused, so it is not printed
    // as the reason, in the sentence or in a cell; the refusal names its change.
    const JUL_AUG: PairRow = {
      ...ROW,
      prevMonth: '2026-07-01',
      month: '2026-08-01',
      searchOutside: { prev: { k: 20, n: 36 }, curr: { k: 170, n: 351 } },
      addedOnly: { k: 2, n: 377 },
      depth: { prevMedian: 20, currMedian: 21 },
    }
    const julAug = comparabilityOf('2026-07-01', '2026-08-01', {
      row: JUL_AUG,
      changes: CHANGES,
      view: 'market',
      later: { state: 'ended', readToEnd: true, latestUpdateRunId: 'run-27sep' },
    })
    expect(julAug.mode).toBe('refuse')
    const b = block({ prevMonth: '2026-07-01', month: '2026-08-01', pair: julAug })
    expect(measuredSearchSentence(b)).toBeNull()
    expect(changeLead(b)?.body).toBe('Not read as a change: we changed our searches in September.')
    expect(changeLead(b)?.figures).toEqual({})
    expect(whyCells(b).map((c) => c.key)).not.toContain('searches')
    expect(JSON.stringify(whyNotCompared(b))).not.toMatch(/377|under a tenth/)
  })

  it('prints the sentence only at a tenth or more; a smaller figure is a cell at the flag line, never the reason', () => {
    const small: PairRow = { ...ROW, addedOnly: { k: 40, n: 654 } } // 6.1%
    const b = block({ pair: pair('ended', small) })
    expect(measuredSearchSentence(b)).toBeNull()
    expect(changeLead(b)?.body).toBe('Not read as a change: we changed our searches in September.')
    expect(whyCells(b)[0]).toMatchObject({ key: 'searches', figure: 40, base: { word: 'of', value: 654 } })
    const atLine: PairRow = { ...ROW, addedOnly: { k: 66, n: 654 } } // 10.1%
    expect(measuredSearchSentence(block({ pair: pair('ended', atLine) }))?.body).toContain(': about a tenth of September came from searches we added in September (')
  })

  it('without a measured row (MF1 not applied) prints the refusal in its own words', () => {
    const b = block({ pair: pair('ended', null), readWith: null })
    expect(changeLead(b)).toEqual({ body: 'Not read as a change: we changed our searches in September.', figures: {} })
  })

  it('names October against November, from the 6 Dec update, as the first pair read the same way', () => {
    expect(nextPairLine(block())).toBe(
      'The first comparison read the same way: October against November, from the 6 Dec update, if nothing we search changes.',
    )
  })

  it('promises no update for a paused tenant', () => {
    expect(nextPairLine(block({ paused: true }))).toBeNull()
  })

  it('a first month compares nothing, and says so', () => {
    expect(changeLead(block({ prevMonth: null, pair: null }))?.body).toBe('Nothing is compared yet: September is the first month we read.')
  })

  it('never prints a "moved": a comparable pair is only said to be read the same way', () => {
    const comparable = comparabilityOf('2026-10-01', '2026-11-01', {
      row: { ...ROW, prevMonth: '2026-10-01', month: '2026-11-01', searchOutside: { prev: { k: 0, n: 600 }, curr: { k: 0, n: 610 } }, depth: { prevMedian: 20, currMedian: 19 } },
      changes: [],
      view: 'market',
      later: { state: 'ended', readToEnd: true, latestUpdateRunId: 'run-27sep' },
    })
    expect(comparable.mode).toBe('comparable')
    expect(changeLead(block({ prevMonth: '2026-10-01', month: '2026-11-01', pair: comparable }))?.body).toBe('October and November were read the same way.')
  })
})

/**
 * A capped Sunday in October (R-c): October against November measured with the
 * 6 Dec update and read the same way on all four rules, with one spending-capped
 * update on 11 Oct. The judge flags the pair for run health only.
 */
describe('a pair flagged only by a capped update is read the same way (deploy 2 review)', () => {
  const OCT_NOV: PairRow = {
    ...ROW,
    prevMonth: '2026-10-01',
    month: '2026-11-01',
    searchOutside: { prev: { k: 0, n: 700 }, curr: { k: 0, n: 720 } },
    addedOnly: { k: 0, n: 720 },
    depth: { prevMedian: 20, currMedian: 19 },
    readThroughRun: 'run-6dec',
    computedAt: '2026-12-07T10:00:00.000Z',
  }
  const SUNDAYS = ['2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25', '2026-11-01', '2026-11-08', '2026-11-15', '2026-11-22', '2026-11-29', '2026-12-06']
  const updates = SUNDAYS.map((d) => ({ id: d === '2026-12-06' ? 'run-6dec' : `run-${d}`, finishedAt: `${d}T08:00:00.000Z` }))
  const base = pairJudge({ now: '2026-12-08T06:00:00.000Z', changes: [], rows: [OCT_NOV], updates, nextUpdateAfter: null })
  const capped = withGatherFlags(base, [{ id: 'capped-1011', at: '2026-10-11T04:18:00.000Z', month: '2026-10-01', runId: 'run-2026-10-11' }])
  const at = (pair: ReturnType<typeof base>): ChangeBlock => ({
    prevMonth: '2026-10-01',
    month: '2026-11-01',
    pair,
    next: { prevMonth: '2026-10-01', month: '2026-11-01', sameAgeFrom: '2026-12-06T04:00:00.000Z', inFullExpected: '2027-01-03T04:00:00.000Z' },
    checks: [],
    readWith: '2026-12-06T08:00:00.000Z',
    paused: false,
    asAt: '2026-12-06T08:00:00.000Z',
  })

  it('says the pair was read the same way, and does not name it again as the first such pair', () => {
    const flagged = capped('2026-10-01', '2026-11-01', 'market')
    expect(flagged.mode).toBe('flag')
    expect(flagged.reasons.map((r) => r.kind)).toEqual(['gather'])
    expect(readTheSameWay(flagged)).toBe(true)
    for (const pair of [base('2026-10-01', '2026-11-01', 'market'), flagged]) {
      const b = at(pair)
      expect(changeLead(b)?.body).toBe('October and November were read the same way.')
      expect(nextPairLine(b)).toBeNull()
      expect(whyNotCompared(b)).toBeNull()
      expect(whyCells(b)).toEqual([])
    }
  })

  it('still names the next pair where the pair read is a different one, or is refused', () => {
    const b = at(capped('2026-10-01', '2026-11-01', 'market'))
    expect(nextPairLine({ ...b, next: { ...b.next!, prevMonth: '2026-11-01', month: '2026-12-01', sameAgeFrom: '2027-01-03T04:00:00.000Z' } })).toBe(
      'The first comparison read the same way: November against December, from the 3 Jan update, if nothing we search changes.',
    )
    expect(nextPairLine(block())).toContain('October against November')
  })

  it('a flag for a change of ours is not read the same way', () => {
    expect(readTheSameWay({ mode: 'flag', reasons: [{ kind: 'code_change', changeId: 'x', share: 0.05 }] })).toBe(false)
    expect(readTheSameWay({ mode: 'flag', reasons: [{ kind: 'gather', changeId: null, share: null }, { kind: 'searches', changeId: null, share: 0.02 }] })).toBe(false)
    expect(readTheSameWay({ mode: 'refuse', reasons: [{ kind: 'gather', changeId: null, share: null }, { kind: 'depth', changeId: null, share: 0.5 }] })).toBe(false)
  })
})

// BETWEEN A SUNDAY UPDATE AND THE MONDAY RE-RUN (deploy 2 review): on 4 Oct the
// (Aug, Sep) row read through the 27 Sep update is still attached, and the
// judge counts the pair unmeasured. Nothing prints a figure from that row: the
// block prints the refusal with no figure, Settings prints no cell, and rules 2
// to 4 read "not measured yet", as the judge counts them.
describe('a row from an earlier update prints no figure (the stale window)', () => {
  const stale = comparabilityOf('2026-08-01', '2026-09-01', {
    row: {
      ...ROW,
      codeChanges: [
        { changeId: 'gate-fix', surface: 'gate_rule', prev: { k: 0, n: 377 }, curr: { k: 65, n: 654 }, population: 'market' },
        { changeId: 'gate-fix', surface: 'gate_rule', prev: { k: 0, n: 351 }, curr: { k: 64, n: 625 }, population: 'category' },
      ],
    },
    changes: CHANGES,
    view: 'market',
    later: { state: 'ended', readToEnd: true, latestUpdateRunId: 'run-4oct' },
  })
  const b = block({ pair: stale })

  it('is refused as unmeasured with the old row still attached', () => {
    expect(stale.mode).toBe('refuse')
    expect(stale.reasons[0].kind).toBe('unmeasured')
    expect(stale.row).not.toBeNull()
    expect(rowMeasuresPair(stale)).toBe(false)
    expect(rowMeasuresPair(pair('ended'))).toBe(true)
    expect(rowMeasuresPair(pair('so_far'))).toBe(true)
  })

  it('prints the refusal with no figure, no cell and no measured rule', () => {
    expect(measuredSearchSentence(b)).toBeNull()
    expect(changeLead(b)).toEqual({ body: 'Not read as a change: we changed our searches in September.', figures: {} })
    expect(whyCells(b)).toEqual([])
    expect(JSON.stringify(whyNotCompared(b))).not.toMatch(/356|654|65 of/)
    expect(compareRules(stale).map((r) => [r.n, r.state, r.answer])).toEqual([
      [1, 'held', 'September has ended and was read past it'],
      [2, 'unmeasured', 'not measured yet'],
      [3, 'unmeasured', 'not measured yet'],
      [4, 'unmeasured', 'not measured yet'],
    ])
  })
})

describe('Settings › What we changed: the rules and why September is not compared', () => {
  it('reads the four rules off the pair (the preview’s August against September column)', () => {
    expect(compareRules(pair('ended')).map((r) => [r.n, r.state, r.answer])).toEqual([
      [1, 'held', 'September has ended and was read past it'],
      [2, 'not_held', '376 of 625'],
      [3, 'held', 'none touched a tenth'],
      [4, 'not_held', '15 against 23'],
    ])
  })

  it('on a month still running says it is not over, and does not pretend to have measured the rest', () => {
    const rules = compareRules(pair('so_far', null))
    expect(rules[0]).toMatchObject({ state: 'not_held', answer: 'September is not over' })
    expect(rules.slice(1).map((r) => r.state)).toEqual(['unmeasured', 'unmeasured', 'unmeasured'])
  })

  it('rule 2 keeps the strict count, on the category, even with the added-only figure measured', () => {
    const r2 = compareRules(pair('ended'))[1]
    expect(r2).toMatchObject({ state: 'not_held', answer: '376 of 625', counts: { figure: 376, word: 'of', base: 625 } })
    expect(compareRules(pair('ended', { ...ROW, addedOnly: null }))[1]).toEqual(r2)
  })

  it('titles the section by the month and prints the one figure in Settings’ form (the SettingsRecord artboard)', () => {
    const why = whyNotCompared(block())
    expect(why?.title).toBe('Why September is not compared')
    expect(why?.body).toBe(`About half of September came from searches we added in September: [[${CHANGE_NEW}]] of [[${CHANGE_OF}]], measured on 30 Sep.`)
    expect(why?.figures).toEqual(changeLead(block())?.figures)
    expect(addedOnlyRecordSentence(block())?.body).toBe(why?.body)
  })
})

/**
 * The gate fix's reach as WP1.4's read-only staging dry run measured it (26
 * Sep, `exec/logs/wp1-4-confirm-dry-measure-comparability-staging.txt`): 65 of
 * September's 654 market videos and 64 of its 625 category videos were let in
 * without the relevance check; none of August's. Its depth line there reads
 * August 21 and September 14.
 */
const GATE_FIX: PairRow['codeChanges'] = [
  { changeId: 'gate-fix', surface: 'gate_rule', prev: { k: 0, n: 377 }, curr: { k: 65, n: 654 }, population: 'market' },
  { changeId: 'gate-fix', surface: 'gate_rule', prev: { k: 0, n: 351 }, curr: { k: 64, n: 625 }, population: 'category' },
]
const withGate: PairRow = { ...ROW, codeChanges: GATE_FIX }

describe('Settings › What we changed: the three cells behind the refusal (the approved preview)', () => {
  it('prints what came from the new searches and how shallow the threads are, each with its base and its update', () => {
    expect(whyCells(block()).map((c) => [c.key, c.figure, c.base.word, c.base.value, c.caption, c.readWith])).toEqual([
      ['searches', 356, 'of', 654, 'September videos came from searches we added in September', '2026-09-27T08:30:00.000Z'],
      ['depth', 15, 'against', 23, 'Dated comments a video: September’s median, against August’s', '2026-09-27T08:30:00.000Z'],
    ])
  })

  it('adds the gate fix in the market’s own count, in the preview’s words', () => {
    const cells = whyCells(block({ pair: pair('ended', withGate) }))
    expect(cells.map((c) => c.key)).toEqual(['searches', 'code_change', 'depth'])
    expect(cells[1]).toMatchObject({ figure: 65, base: { word: 'of', value: 654 }, caption: 'September videos had been let in without our relevance check' })
  })

  it('prints no cell for a measure that holds, or for a change that does not move the market', () => {
    const shallowNot: PairRow = { ...ROW, depth: { prevMedian: 23, currMedian: 20 } }
    expect(whyCells(block({ pair: pair('ended', shallowNot) })).map((c) => c.key)).toEqual(['searches'])
    const refiled: PairRow = { ...ROW, codeChanges: [{ changeId: 'attr', surface: 'attribution', prev: { k: 20, n: 377 }, curr: { k: 90, n: 654 }, population: 'market' }] }
    expect(whyCells(block({ pair: pair('ended', refiled) })).map((c) => c.key)).toEqual(['searches', 'depth'])
  })

  it('prints the added-only figure where the strict share only flags, and no searches cell without it', () => {
    const flagged: PairRow = { ...ROW, searchOutside: { prev: { k: 2, n: 351 }, curr: { k: 30, n: 625 } }, addedOnly: { k: 12, n: 654 } }
    expect(whyCells(block({ pair: pair('ended', flagged) }))[0]).toMatchObject({ key: 'searches', figure: 12, base: { word: 'of', value: 654 } })
    expect(whyCells(block({ pair: pair('ended', { ...ROW, addedOnly: null }) })).map((c) => c.key)).toEqual(['depth'])
  })

  it('on a month still running, still says why from its row, and calls the median so far', () => {
    const cells = whyCells(block({ pair: pair('so_far') }))
    expect(cells.map((c) => c.key)).toEqual(['searches', 'depth'])
    expect(cells[1].caption).toBe('Dated comments a video: September’s median so far, against August’s')
  })

  it('without a measured row prints no cell and keeps the refusal’s own sentence, never a zero', () => {
    const why = whyNotCompared(block({ pair: pair('ended', null) }))
    expect(why?.cells).toEqual([])
    expect(why?.body).toBe('Not read as a change: we changed our searches in September.')
  })

  it('reads rule 3 as the count the preview prints, never a share rounded up to the line', () => {
    expect(compareRules(pair('ended', withGate))[2]).toMatchObject({ state: 'held', answer: '65 of 654' })
  })

  it('sets the next pair apart in the same sentence', () => {
    const parts = nextPairParts(block())
    expect(parts?.pair).toBe('October against November, from the 6 Dec update')
    expect(`${parts?.lead}${parts?.pair}${parts?.tail}`).toBe(nextPairLine(block()))
  })
})

describe('the month strip: our search changes and the "as at" mark (the approved preview)', () => {
  // Sealand's August and September on staging's log (read 26 Sep, first row
  // of each surface a day): the 17 Aug own accounts; on 9 Sep a rival swap at
  // 16:24:15, the re-filing at 18:10, the term swap at 18:17:56 and an account
  // at 18:21:36; the 13 Sep terms; the 17 Sep script's terms, rival and
  // accounts at 16:02:56.
  const FULL = changesFromLog([
    row({ id: 'own-0817', changed_at: '2026-08-17T07:05:43.716Z', surface: 'handles' }),
    row({ id: 'rivals-0909', changed_at: '2026-09-09T16:24:15.000Z', surface: 'rivals' }),
    row({ id: 'retag-0909', changed_at: '2026-09-09T18:10:00.000Z', surface: 'entity_retag' }),
    row({ id: 'terms-0909', changed_at: '2026-09-09T18:17:56.893Z', surface: 'terms', field: 'industry_keywords' }),
    row({ id: 'handles-0909', changed_at: '2026-09-09T18:21:36.570Z', surface: 'handles' }),
    ...LOG,
    row({ id: 'rivals-0917', changed_at: '2026-09-17T16:02:56.000Z', surface: 'rivals' }),
  ])

  it('marks the days we changed what we search in the two months read, once a day: 9, 13 and 17 Sep', () => {
    const days = searchChangeDays(FULL, '2026-08-01', '2026-09-01')
    expect(days).toEqual(['2026-09-09T18:17:56.893Z', '2026-09-13T10:00:58.000Z', '2026-09-17T16:02:56.000Z'])
    // Rivals, accounts and a re-filing are changes of ours, not searches.
    expect(searchChangeDays(FULL, '2026-08-01', '2026-08-01')).toEqual([])
    // Nothing outside the pair: an October change is not September's.
    const october = changesFromLog([row({ id: 'terms-1003', changed_at: '2026-10-03T08:00:00.000Z', surface: 'terms' })])
    expect(searchChangeDays(october, '2026-08-01', '2026-09-01')).toEqual([])
  })

  it('keys them as the preview does, each month named once', () => {
    expect(searchChangesLine(searchChangeDays(FULL, '2026-08-01', '2026-09-01'))).toBe('our search changes, 9, 13 and 17 Sep')
    expect(searchChangesLine(['2026-08-17T07:05:43.716Z', '2026-09-09T18:17:56.893Z'])).toBe('our search changes, 17 Aug and 9 Sep')
    expect(searchChangesLine(['2026-09-13T10:00:58.000Z'])).toBe('our search change, 13 Sep')
    expect(searchChangesLine([])).toBeNull()
  })

  it('places a day at its middle in its month, as the preview draws 9 Sep and the 24 Sep "as at"', () => {
    expect(placeInMonth('2026-09-09T18:17:56.893Z', '2026-09-01')).toBeCloseTo(8.5 / 30)
    expect(placeInMonth('2026-09-24T18:00:00.000Z', '2026-09-01')).toBeCloseTo(23.5 / 30)
    expect(placeInMonth('2026-10-04T06:00:00.000Z', '2026-10-01')).toBeCloseTo(3.5 / 31)
    expect(placeInMonth('2026-10-04T06:00:00.000Z', '2026-09-01')).toBeNull()
  })

  it('carries both on the block the page and Settings build', () => {
    const b = buildChangeBlock({
      prevMonth: '2026-08-01', month: '2026-09-01', hasPrev: true, pair: pair('ended'), changes: FULL, pairRows: [ROW],
      nextUpdateAfter: scheduledUpdateAfter({ report_period: 'weekly', report_day: 'sunday' }),
      asAt: '2026-09-27T08:30:00.000Z', paused: false, runFinish: new Map(),
    })
    expect(b.asAt).toBe('2026-09-27T08:30:00.000Z')
    expect(b.searchChanges).toEqual(['2026-09-09T18:17:56.893Z', '2026-09-13T10:00:58.000Z', '2026-09-17T16:02:56.000Z'])
  })
})
