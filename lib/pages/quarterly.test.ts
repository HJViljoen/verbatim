import { describe, expect, it } from 'vitest'

import type { SupabaseClient } from '@supabase/supabase-js'

import { directionRe } from '../test/copy-contract'
import type { Verdict } from '../reading/verdicts'
import { RPC_WINDOW_DENOMINATORS, RPC_WINDOW_THEME_READINGS } from '../reading/types'
import { quarterFor } from '../reports/quarterly'
import {
  confidenceOf, countedLines, coverBody, flagOutcome, methodNumbers, ordinal, quarterWindowFor,
  readingCounter, unsettledItems, withFlags,
} from './quarterly'
import type { Mover } from './overview'
import { READER_FLAGS } from '../calibration'
import { quarterlyFixture, formingFixture, thinMonthFixture } from '../../components/blocks/quarterly/fixture'

const verdict = (over: Partial<Verdict> = {}): Verdict => ({
  objectKind: 'theme',
  objectId: 't1',
  objectLabel: 'Durability',
  audience: 'category',
  window: { kind: 'quarter', from: '2026-07-01', to: '2026-09-30' },
  value: { k: 30, n: 100 },
  changePts: 5,
  bandPts: 3,
  state: 'moved',
  flags: [],
  ...over,
})

describe('readingCounter', () => {
  it('counts the reading and attaches the gate below six', () => {
    expect(readingCounter(3)).toBe('your 3rd monthly reading, the quarter view needs 6')
    expect(readingCounter(1)).toBe('your 1st monthly reading, the quarter view needs 6')
    expect(readingCounter(2)).toContain('your 2nd')
    expect(readingCounter(0)).toBe('no monthly reading yet, the quarter view needs 6')
  })

  it('drops the gate once six stand behind it', () => {
    expect(readingCounter(6)).toBe('your 6th monthly reading')
    expect(readingCounter(11)).toBe('your 11th monthly reading')
  })

  it('ordinals the teens correctly', () => {
    expect(ordinal(11)).toBe('11th')
    expect(ordinal(12)).toBe('12th')
    expect(ordinal(13)).toBe('13th')
    expect(ordinal(21)).toBe('21st')
    expect(ordinal(22)).toBe('22nd')
    expect(ordinal(23)).toBe('23rd')
    expect(ordinal(4)).toBe('4th')
  })
})

describe('confidenceOf', () => {
  it('is never better than "partly" while the tenant’s own side is locked', () => {
    const all = [verdict(), verdict({ objectId: 't2' }), verdict({ objectId: 't3' })]
    expect(confidenceOf(all, false).word).toBe('partly')
    expect(confidenceOf(all, false).why).toContain('six monthly readings')
  })

  it('reads "reasonable" once two thirds of the comparisons were answered', () => {
    const answered = [verdict(), verdict({ objectId: 't2' }), verdict({ objectId: 't3', state: 'too_little_data' })]
    expect(confidenceOf(answered, true).word).toBe('reasonable')
  })

  it('reads "partly" when most comparisons went undrawn', () => {
    const thin = [verdict({ state: 'too_little_data' }), verdict({ objectId: 't2', state: 'refused' }), verdict({ objectId: 't3' })]
    expect(confidenceOf(thin, true).word).toBe('partly')
  })

  it('says so rather than guessing when nothing was compared', () => {
    expect(confidenceOf([], true).word).toBe('not yet')
  })

  it('prints every count with what it is out of', () => {
    const { why } = confidenceOf([verdict(), verdict({ objectId: 't2', state: 'refused' })], true)
    expect(why).toMatch(/1 of 2/)
  })
})

describe('coverBody', () => {
  it('names the lead and its denominator as tokens, never as digits', () => {
    const body = coverBody({ lead: verdict(), monthLabel: 'September', quarterLabel: 'Q3 2026', unlocked: true, readings: 8 })
    // ONE SENTENCE, ONE PERIOD. The lead is a MONTH verdict and the sentence
    // used to call it "the biggest banded change this quarter … in September".
    expect(body).toContain('The biggest banded change in September')
    expect(body).not.toMatch(/banded change this quarter/)
    expect(body).toContain('[[lead_share]]')
    expect(body).toContain('[[lead_of]]')
    expect(body).toContain('[[quarter_videos]]')
    // The cover is code's prose and may carry a figure, but only as a token:
    // a bare digit here is a number nobody can re-substitute at render. The
    // quarter's own NAME is not a figure — "Q3 2026" is a period, the same
    // call WP17 made about a date on the weekly report's first screen.
    expect(body.replace(/\[\[[a-z_]+\]\]/g, '').replace(/Q3 2026/g, '')).not.toMatch(/\d/)
  })

  it('says the gate in its own words when the quarter is locked', () => {
    const body = coverBody({ lead: verdict(), monthLabel: 'September', quarterLabel: 'Q3 2026', unlocked: false, readings: 3 })
    // Lower-cased mid-sentence: the gate is a clause here, not a heading.
    expect(body).toContain('quarter against quarter needs six months')
    expect(body).toContain('you have 3')
  })

  it('says the month the lead is of is not a month of the quarter, when it is not', () => {
    const body = coverBody({ lead: verdict(), monthLabel: 'October', quarterLabel: 'Q3 2026', unlocked: true, readings: 9, monthOutside: true })
    expect(body).toContain('the month in hand rather than a month of Q3 2026')
  })

  it('says nothing cleared rather than inventing a lead', () => {
    const body = coverBody({ lead: null, monthLabel: 'September', quarterLabel: 'Q3 2026', unlocked: true, readings: 8 })
    expect(body).toContain('Nothing on either side cleared its band')
    expect(body).not.toContain('[[lead_share]]')
  })
})

describe('countedLines', () => {
  it('prints only what cleared a band, biggest first, with both sides', () => {
    const lines = countedLines([
      verdict({ objectLabel: 'Small', changePts: 1 }),
      verdict({ objectId: 't2', objectLabel: 'Big', changePts: 9, baseline: { k: 10, n: 100 } }),
      verdict({ objectId: 't3', objectLabel: 'Unsettled', state: 'too_little_data', changePts: 20 }),
    ])
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain('Big')
    expect(lines[0]).toContain('against 10 of 100 before it')
    expect(lines[1]).toContain('Small')
  })

  it('answers nothing when nothing moved', () => {
    expect(countedLines([verdict({ state: 'no_clear_change' })])).toEqual([])
  })
})

describe('flagOutcome', () => {
  const flag = { objectKind: 'theme', objectId: 't1' }

  it('says what the later reading of the same object turned out to be', () => {
    expect(flagOutcome(flag, [verdict()])).toContain('cleared its band')
    expect(flagOutcome(flag, [verdict({ state: 'no_clear_change' })])).toContain('inside the band')
    expect(flagOutcome(flag, [verdict({ state: 'too_little_data' })])).toContain('too little')
    expect(flagOutcome(flag, [verdict({ state: 'refused' })])).toContain('could not be compared')
    expect(flagOutcome(flag, [verdict({ state: 'baseline_forming' })])).toContain('no baseline')
  })

  it('never claims an outcome nobody read', () => {
    expect(flagOutcome({ objectKind: 'theme', objectId: 'other' }, [verdict()]))
      .toBe('no later reading of the same object has been taken')
  })

  // THE JOIN IS KIND AND ID, NOT THE LABEL. A flag is written weeks earlier by
  // a different run and `anomaly_flags.label` is decoration by its own column
  // comment; theme labels churn about 88% run to run.
  it('finds the object again after its label has been rewritten', () => {
    expect(flagOutcome(flag, [verdict({ objectLabel: 'How long it lasts' })])).toContain('cleared its band')
  })

  it('does not take another kind of object’s reading because the labels match', () => {
    expect(flagOutcome({ objectKind: 'rival', objectId: 'competitor:Ottobock' }, [verdict({ objectLabel: 'Durability' })]))
      .toBe('no later reading of the same object has been taken')
  })

  // ALL FIVE BRANCHES, NOT THE ONE THE FIXTURE REACHES. `method.tsx` prints
  // these unmarked ("What it turned out to be: …"), so a direction word in any
  // of them breaks rule (c) on QR7 — and three of the five opened "the month it
  // fell in", with `fell` in DIRECTION_WORDS. The block test was green because
  // the fixture's single flag resolves to the one branch that had none.
  it('never puts a direction word in an outcome', () => {
    const outcomes = [
      flagOutcome(flag, []),
      ...(['moved', 'no_clear_change', 'too_little_data', 'refused', 'baseline_forming'] as const)
        .map((state) => flagOutcome(flag, [verdict({ state })])),
    ]
    expect(outcomes.length).toBe(6)
    for (const line of outcomes) expect(line).not.toMatch(directionRe())
  })
})

describe('unsettledItems', () => {
  it('lists refusals before thin readings before forming baselines', () => {
    const items = unsettledItems([
      verdict({ objectId: 'a', objectLabel: 'Forming', state: 'baseline_forming' }),
      verdict({ objectId: 'b', objectLabel: 'Thin', state: 'too_little_data' }),
      verdict({ objectId: 'c', objectLabel: 'Refused', state: 'refused' }),
      verdict({ objectId: 'd', objectLabel: 'Answered' }),
    ])
    expect(items.map((i) => i.title)).toEqual(['Whether Refused moved', 'Whether Thin moved', 'Whether Forming moved'])
  })

  it('says each one once, however many verdicts name it', () => {
    const items = unsettledItems([
      verdict({ objectId: 'a', objectLabel: 'Thin', state: 'too_little_data' }),
      verdict({ objectId: 'a', objectLabel: 'Thin', state: 'too_little_data' }),
    ])
    expect(items).toHaveLength(1)
  })

  it('names the side, so two audiences’ readings of one object are two rows', () => {
    // The dedup key is object AND audience, and the title carried
    // `${v.audience ? '' : ''}` — both branches empty — so the last page
    // printed two identically-titled rows.
    const side = (a: string) => (a === 'client' ? 'in your own videos' : a === 'industry-other' ? 'in the category' : null)
    const items = unsettledItems(
      [
        verdict({ objectId: 'a', objectLabel: 'Durability', audience: 'client', state: 'too_little_data' }),
        verdict({ objectId: 'a', objectLabel: 'Durability', audience: 'industry-other', state: 'too_little_data' }),
      ],
      { side },
    )
    expect(items.map((i) => i.title).sort()).toEqual([
      'Whether Durability moved, in the category',
      'Whether Durability moved, in your own videos',
    ])
    // A side nobody can name leaves the title as it was, rather than inventing.
    expect(unsettledItems([verdict({ state: 'refused', audience: 'competitor:Nobody' })], { side })[0].title)
      .toBe('Whether Durability moved')
  })

  it('carries a band where there is one and the honest phrase where there is not', () => {
    const [banded] = unsettledItems([verdict({ state: 'too_little_data', bandPts: 6.75 })])
    expect(banded.why).toBe('band ±6.8')
    const [unbanded] = unsettledItems([verdict({ state: 'too_little_data', bandPts: null })])
    expect(unbanded.why).toBe('too few to compare')
  })

  it('prints both sides of the comparison with their denominators', () => {
    const [item] = unsettledItems([verdict({ state: 'too_little_data', value: { k: 26, n: 84 }, baseline: { k: 20, n: 90 } })])
    expect(item.body).toContain('26 of 84 videos')
    expect(item.body).toContain('20 of 90')
  })
})

describe('methodNumbers', () => {
  const overview = { monthStatus: 'filling', month: '2026-09-01', bar: { videos: 449 } } as never
  // Inside Q3: the quarter itself is still filling.
  const INSIDE = '2026-09-16T00:00:00Z'

  it('tells a record that could not be read apart from a window that is not counted', () => {
    const q = quarterFor(2026, 3)
    // No record at all: nothing to say, and it says that.
    const none = methodNumbers(null, q, overview, INSIDE)
    expect(none.at(-1)?.value).toBe('not recorded')

    // The record read, but the WINDOWED count (M3) is unapplied. The month
    // tables ARE applied and seeded on both tenants, so "the month tables are
    // not applied" would have been a false sentence on the artefact; what is
    // missing is the one-window read, and the month in hand is stated instead.
    const unwindowed = methodNumbers(
      { coverage: null, delivery: { delivered: 10, dates: [], longestGapDays: 37, failed: 0, basis: 'run_clock' } } as never,
      q,
      overview,
      INSIDE,
    )
    expect(unwindowed.find((r) => r.label === 'Videos in September')?.value).toBe('449')
    expect(unwindowed.find((r) => r.label === 'Videos in September')?.note).toContain('not counted as one window')
    expect(unwindowed.find((r) => r.label === 'Updates')?.value).toBe('10 this quarter')
  })

  it('counts videos and comments over the quarter and names the gap', () => {
    const q = quarterFor(2026, 3)
    const rows = methodNumbers(
      {
        coverage: [
          { audience: 'category', videos: 1000, comments: 8000, platformMix: {}, dualMention: 0, excludedUndated: 0 },
          { audience: 'client', videos: 84, comments: 900, platformMix: {}, dualMention: 0, excludedUndated: 0 },
        ],
        delivery: { delivered: 13, dates: [], longestGapDays: 35, failed: 0, basis: 'run_clock' },
      } as never,
      q,
      overview,
      INSIDE,
    )
    expect(rows.find((r) => r.label === 'Videos')?.value).toBe('1,084')
    // COMMENTS, not "Conversations": lib/calibration.ts fixes a conversation
    // as one video and the comments it sparked, so 8,900 conversations beside
    // 1,084 videos was the glossary's own pair contradicted on one table.
    expect(rows.find((r) => r.label === 'Comments')?.value).toBe('8,900')
    expect(rows.map((r) => r.label)).not.toContain('Conversations')
    expect(rows.find((r) => r.label === 'Updates')?.note).toBe('longest gap 35 days')
    expect(rows[0]).toMatchObject({ label: 'Period', value: '1 Jul – 30 Sep 2026', note: 'still filling' })
  })

  it('says a CLOSED quarter is closed, whatever the month the product is in', () => {
    // The defect: the note keyed off `overview.monthStatus`, so a Q3 review
    // built in November printed "still filling" over a quarter that had closed
    // weeks earlier — because November was filling.
    const rows = methodNumbers(null, quarterFor(2026, 3), overview, '2026-11-02T00:00:00Z')
    expect(rows[0].note).toBeUndefined()
  })
})

describe('the window pair', () => {
  /** A client that records every RPC and answers each with no rows. */
  const recorder = () => {
    const calls: { fn: string; args: Record<string, unknown> }[] = []
    const chain = {
      order: () => chain,
      range: () => Promise.resolve({ data: [], error: null }),
    }
    const client = {
      rpc(fn: string, args: Record<string, unknown>) {
        calls.push({ fn, args })
        return chain
      },
    } as unknown as SupabaseClient
    return { calls, client }
  }

  it('asks for BOTH halves — a read with no clustering carries no themes at all', async () => {
    // The defect: `loadWindowReading` reads `window_theme_readings` only when
    // it is given a run id, and the quarter asked for none — so the theme half
    // of the pair was never read, `thisQuarter.themes` was null on every real
    // load, and the theme loop that draws the quarter-on-quarter comparison
    // was unreachable in production with M3 applied or not.
    const { calls, client } = recorder()
    const q = quarterFor(2026, 3)
    const reading = await quarterWindowFor(client, 'c1', q, { runId: 'run-9', objectIds: ['t1'] })
    expect(calls.map((c) => c.fn)).toEqual([RPC_WINDOW_DENOMINATORS, RPC_WINDOW_THEME_READINGS])
    expect(calls[1].args).toMatchObject({ p_client: 'c1', p_run: 'run-9' })
    // Half-open: `window_denominators` is `>= from and < to`, so the quarter's
    // last day is inside the window and the next quarter's first is not.
    expect(String(calls[0].args.p_from)).toContain('2026-07-01')
    expect(String(calls[0].args.p_to)).toContain('2026-10-01')
    expect(reading.themes).toEqual([])
  })

  it('tells "no clustering" apart from "not read": themes stay null with no run', async () => {
    const { calls, client } = recorder()
    const reading = await quarterWindowFor(client, 'c1', quarterFor(2026, 3), { runId: null })
    expect(calls.map((c) => c.fn)).toEqual([RPC_WINDOW_DENOMINATORS])
    expect(reading.themes).toBeNull()
  })
})

describe('withFlags — the two READER_FLAGS on a mover (qr.p4.flags)', () => {
  const mover = (over: Partial<Mover> = {}): Mover => ({
    id: 'm1',
    label: 'Durability',
    k: 30,
    n: 100,
    pct: 30,
    verdict: verdict(),
    direction: null,
    isNew: false,
    ...over,
  })

  it('carries new off the row', () => {
    expect(withFlags(mover({ isNew: true })).flags).toEqual(['new'])
    expect(withFlags(mover()).flags).toEqual([])
  })

  it('carries only the two READER_FLAGS off the verdict — the rest are about our bookkeeping', () => {
    const flags = withFlags(mover({ verdict: verdict({ flags: ['clustering_unknown', 'gone_quiet', 'renamed', 'thin'] }) })).flags
    expect(flags).toEqual(['gone_quiet'])
    for (const f of flags) expect(READER_FLAGS as readonly string[]).toContain(f)
  })

  it('never repeats a flag the row and the verdict both carry', () => {
    expect(withFlags(mover({ isNew: true, verdict: verdict({ flags: ['new'] }) })).flags).toEqual(['new'])
  })
})

describe('what the quarterly pages now carry (package D7)', () => {
  it('page 3 keeps the rival column and the category series', () => {
    const q = quarterlyFixture()
    const row = q.subjects.rows[0]
    expect(row).toHaveProperty('rival')
    expect(row.spark.length).toBe(row.sparkMonths.length)
    // A LEVEL, never a difference. Nothing on the page subtracts the rival's
    // share from yours: two proportions on two different denominators have no
    // band (deviation D1).
    expect(Object.keys(row)).not.toContain('gap')
  })

  it('page 3 draws its line only where the side has the readings, and names no direction', () => {
    const q = quarterlyFixture()
    if (q.subjects.line) {
      const printed = [q.subjects.line.label, q.subjects.line.empty, ...q.subjects.line.series.map((s) => s.label)]
        .filter(Boolean)
        .join(' ')
      expect(printed).not.toMatch(directionRe())
      for (const side of q.subjects.line.series) expect(side.readings).toBeGreaterThanOrEqual(3)
    }
  })

  it('tells a register it could not read from a register with nothing in it', () => {
    expect(formingFixture().category.quiet).toBeNull()
    expect(formingFixture().category.quietNote).toContain('could not be read')
    expect(thinMonthFixture().category.quiet).toEqual([])
    expect(thinMonthFixture().category.quietNote).toContain('has gone quiet')
    expect(quarterlyFixture().category.quiet).toHaveLength(2)
    expect(quarterlyFixture().category.quietNote).toBeNull()
  })

  it('carries the same voices to both pages, as refs, and never two sets of words', () => {
    const q = quarterlyFixture()
    expect(q.subjects.quotes.map((x) => x.quote.ref)).toEqual(q.category.quotes.map((x) => x.quote.ref))
    expect(q.subjects.quotes.map((x) => x.quote.ref)).toEqual(q.read.quotes.map((x) => x.quote.ref))
  })
})

