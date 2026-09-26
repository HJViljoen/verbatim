import { describe, it, expect } from 'vitest'

import { createCitedQuotePicker } from '../quotes'
import type { MarketTheme } from './overview-market/board'
import { ownPostFilings } from '../reading/own-posts'
import type { RecDecision } from '../rec-decisions'
import { afterwardsFor } from '../reading/afterwards'
import {
  acceptableRow, actedLine, adviceAnchor, ageInMonths, buildAdviceRows, currentTopLineage, ledgerRowsShown, lineageKey, madeInMonth,
  marketSurfaceHref, monthsMadeIn, moveLedgerLine, moveTargetLabel, orderedTargets, recurrenceForTarget,
  registryIdsByInsight, repeatCell, repeatLine, waysOfMoving,
  type AdviceRow, type RecCopy, type TargetPoint,
  buildClaimSubjects, buildQuestions, questionGroupsOf, questionTouch, questionWindowFrom,
  type QuestionPost,
} from './market-surface'
import { currentRecommendation, topRecommendation } from '../dashboard-tiles'

const copy = (over: Partial<RecCopy> = {}): RecCopy => ({
  id: 'r1',
  lineage_id: 'r1',
  title: 'Lead with repairability',
  type: 'positioning_messaging',
  status: null,
  created_at: '2026-06-13T09:00:00.000Z',
  run_id: 'run-1',
  ...over,
})

describe('the ledger’s identity', () => {
  it('takes lineage_id, and falls back to the row’s own id exactly as the backfill does', () => {
    expect(lineageKey({ id: 'a', lineage_id: 'L' })).toBe('L')
    expect(lineageKey({ id: 'a', lineage_id: null })).toBe('a')
  })

  it('folds every copy of one identity into one row, and dates it from the OLDEST', () => {
    const rows = buildAdviceRows(
      [
        copy({ id: 'new', lineage_id: 'L', created_at: '2026-09-13T00:00:00.000Z', run_id: 'run-2', title: 'Make every bag easy to buy' }),
        copy({ id: 'old', lineage_id: 'L', created_at: '2026-09-10T00:00:00.000Z', run_id: 'run-1', title: 'Add a Know Before You Buy standard' }),
      ],
      [],
    )
    expect(rows).toHaveLength(1)
    // The NEWEST wording, because that is the advice as it stands — and the
    // newest id, because that is the only copy the next update can re-find.
    expect(rows[0].title).toBe('Make every bag easy to buy')
    expect(rows[0].recommendationId).toBe('new')
    expect(rows[0].firstMade).toBe('2026-09-10')
    expect(rows[0].timesMade).toBe(2)
  })

  // THE LEAD'S R10: "First time" marks a lineage the latest update raised
  // for the first time, never one an earlier update raised too.
  it('marks a lineage first raised by the latest update, and no other', () => {
    const rows = buildAdviceRows(
      [
        copy({ id: 'a1', lineage_id: 'A', created_at: '2026-09-13T00:00:00.000Z', run_id: 'run-13' }),
        copy({ id: 'a2', lineage_id: 'A', created_at: '2026-09-20T00:00:00.000Z', run_id: 'run-20' }),
        copy({ id: 'b1', lineage_id: 'B', created_at: '2026-09-20T00:00:00.000Z', run_id: 'run-20' }),
        copy({ id: 'c1', lineage_id: 'C', created_at: '2026-09-13T00:00:00.000Z', run_id: 'run-13' }),
      ],
      [],
    )
    const first = Object.fromEntries(rows.map((r) => [r.lineageId, r.firstInLatest]))
    expect(first).toEqual({ A: false, B: true, C: false })
  })

  it('counts MONTHS repeated, not updates — production’s only repeat is inside one month', () => {
    const rows = buildAdviceRows(
      [
        copy({ id: 'a', lineage_id: 'L', created_at: '2026-09-10T00:00:00.000Z', run_id: 'run-1' }),
        copy({ id: 'b', lineage_id: 'L', created_at: '2026-09-13T00:00:00.000Z', run_id: 'run-2' }),
      ],
      [],
    )
    expect(rows[0].monthsRepeated).toBe(1)
    expect(rows[0].repeatedWithinMonth).toBe(true)
  })

  it('counts two months when two months carried it', () => {
    const rows = buildAdviceRows(
      [
        copy({ id: 'a', lineage_id: 'L', created_at: '2026-08-10T00:00:00.000Z', run_id: 'run-1' }),
        copy({ id: 'b', lineage_id: 'L', created_at: '2026-09-13T00:00:00.000Z', run_id: 'run-2' }),
      ],
      [],
    )
    expect(rows[0].monthsRepeated).toBe(2)
    expect(rows[0].repeatedWithinMonth).toBe(false)
  })

  it('runs newest first, not oldest first (market-first WP1.9, GR F34)', () => {
    const rows = buildAdviceRows(
      [
        copy({ id: 'young', lineage_id: 'young', created_at: '2026-09-13T00:00:00.000Z', run_id: 'run-2' }),
        copy({ id: 'old', lineage_id: 'old', created_at: '2026-06-13T00:00:00.000Z', run_id: 'run-1' }),
      ],
      [],
    )
    expect(rows.map((r) => r.lineageId)).toEqual(['young', 'old'])
    expect(rows.map((r) => r.number)).toEqual([1, 2])
  })

  it('takes the status from the ledger, and the ledger’s date with it', () => {
    const decisions: RecDecision[] = [
      { id: 'd1', lineage_id: 'L', status: 'acknowledged', decided_at: '2026-09-01T00:00:00.000Z' },
      { id: 'd2', lineage_id: 'L', status: 'acted_on', decided_at: '2026-09-05T00:00:00.000Z' },
    ]
    const rows = buildAdviceRows([copy({ id: 'a', lineage_id: 'L', status: 'new' })], decisions)
    expect(rows[0].status).toBe('acted_on')
    expect(rows[0].statusLabel).toBe('Done')
    expect(rows[0].decidedAt).toBe('2026-09-05T00:00:00.000Z')
  })

  it('falls back to the column when the ledger has never heard of the lineage', () => {
    const rows = buildAdviceRows([copy({ id: 'a', lineage_id: 'L', status: 'dismissed' })], [])
    expect(rows[0].status).toBe('dismissed')
  })

  it('takes the column when the ledger could not be read at all', () => {
    const rows = buildAdviceRows([copy({ id: 'a', lineage_id: 'L', status: 'in_progress' })], null)
    expect(rows[0].status).toBe('in_progress')
  })

  it('contributes no month for a copy with no created_at, rather than today’s', () => {
    expect(monthsMadeIn([copy({ created_at: null })])).toEqual([])
    expect(monthsMadeIn([copy({ created_at: '2026-06-13T09:00:00.000Z' })])).toEqual(['2026-06-01'])
  })
})

describe('what the ledger says about itself', () => {
  it('names what it counts rather than claiming a quarter', () => {
    expect(actedLine(1, 64)).toContain('1 of 64')
    expect(actedLine(1, 64)).not.toMatch(/quarter/i)
    expect(actedLine(0, 0)).toBe('Nothing has been recommended yet.')
  })

  it('says nothing has repeated when nothing has', () => {
    const rows = buildAdviceRows([copy({ id: 'a', lineage_id: 'a' })], [])
    expect(repeatLine(rows)).toContain('Nothing has been recommended twice yet')
  })

  it('says "twice inside one calendar month" — the state the design has no column for', () => {
    const rows = buildAdviceRows(
      [
        copy({ id: 'a', lineage_id: 'L', created_at: '2026-09-10T00:00:00.000Z', run_id: 'r1' }),
        copy({ id: 'b', lineage_id: 'L', created_at: '2026-09-13T00:00:00.000Z', run_id: 'r2' }),
      ],
      [],
    )
    const line = repeatLine(rows)
    expect(line).toContain('inside one calendar month')
    expect(line).toContain('reads as one month')
    expect(line).not.toContain('Nothing has been recommended twice yet')
  })

  it('says a later month’s repeat as a repeat', () => {
    const rows = buildAdviceRows(
      [
        copy({ id: 'a', lineage_id: 'L', created_at: '2026-08-10T00:00:00.000Z', run_id: 'r1' }),
        copy({ id: 'b', lineage_id: 'L', created_at: '2026-09-13T00:00:00.000Z', run_id: 'r2' }),
      ],
      [],
    )
    expect(repeatLine(rows)).toContain('come back in a later month')
  })
})

describe('a move’s line', () => {
  it('names the month its first score lands in, never a number of updates', () => {
    const line = moveLedgerLine({ title: 'Say less about recycling', declared_at: '2026-09-14' }, 'on the subject Durability')
    expect(line).toBe('Say less about recycling · on the subject Durability · tracked 14 Sep · first scoring lands with the October reading.')
    expect(line).not.toMatch(/update/i)
  })

  it('names what a move is on, per kind', () => {
    expect(moveTargetLabel({ kind: 'subject', registry_ids: null }, 'Durability', null)).toBe('on the subject Durability')
    expect(moveTargetLabel({ kind: 'subject', registry_ids: null }, null, null)).toBe('on a subject')
    expect(moveTargetLabel({ kind: 'theme', registry_ids: ['t1'] }, null, 'Wet commute')).toBe('on the theme Wet commute')
    expect(moveTargetLabel({ kind: 'theme', registry_ids: ['t1', 't2'] }, null, 'Wet commute')).toBe('on 2 themes')
    expect(moveTargetLabel({ kind: 'advice', registry_ids: null }, null, null)).toBe('on a piece of advice')
  })
})

describe('the five ways', () => {
  // THREE LIVE, NOT TWO, SINCE D4. "Upload a plan" was listed as not built
  // while `plan_checks` was written by Ask, re-tested by every update and read
  // by the thread page — the page naming as absent a feature the product had.
  // What D4 added is Market reading the result back; the way in was always
  // there, so the row is live and links to Ask.
  it('has five, three of them live when there is advice to accept', () => {
    const ways = waysOfMoving({ lineageId: 'L', recommendationId: 'r', title: 'x' }, 1)
    expect(ways).toHaveLength(5)
    expect(ways.filter((w) => w.live).map((w) => w.key)).toEqual(['track', 'advice', 'plan'])
  })

  it('keeps "upload a plan" live with nothing uploaded, and says nothing is', () => {
    const ways = waysOfMoving(null, 0)
    const plan = ways.find((w) => w.key === 'plan')
    expect(plan?.live).toBe(true)
    expect(plan?.href).toBe('/dashboard/agent')
    expect(plan?.unlock).toBe('Nothing has been uploaded for this workspace yet.')
  })

  it('drops "accept this advice" to not-live when the ledger is empty, and says why', () => {
    const ways = waysOfMoving(null)
    expect(ways.filter((w) => w.live).map((w) => w.key)).toEqual(['track', 'plan'])
    expect(ways.find((w) => w.key === 'advice')?.unlock).toBe('Advice lands with your next update.')
  })

  it('says the card is read and the press is not, because the card is built', () => {
    // `MovesBlock.card` is composed on this page (Phase 1 D2), so a row
    // claiming the card is not built would be copy the code contradicts —
    // while `live` stays false, because the one press really is missing.
    const card = waysOfMoving(null).find((w) => w.key === 'card')
    expect(card?.live).toBe(false)
    expect(card?.unlock).not.toMatch(/card is not built/i)
    expect(card?.unlock).toMatch(/confirming it in one press is not built yet/i)
  })

  it('never promises a month for a way that is not built', () => {
    for (const w of waysOfMoving(null)) {
      if (w.unlock) expect(w.unlock).not.toMatch(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+20\d\d/)
    }
  })
})
describe('the surface’s own links', () => {
  it('carries the horizon and drops the legacy selection parameters', () => {
    expect(marketSurfaceHref('L', { horizon: 'last_3', rec: 'old', item: 'other' })).toBe('/dashboard/market?horizon=last_3&item=L')
    expect(marketSurfaceHref(null, {})).toBe('/dashboard/market')
  })

  it('names the month a piece of advice was first made in', () => {
    expect(madeInMonth('2026-06-13')).toBe('Jun 2026')
  })
})


describe('ledgerRowsShown — the row a deep link named', () => {
  const rowAt = (n: number): AdviceRow => ({
    lineageId: `L${n}`,
    recommendationId: `r${n}`,
    title: `advice ${n}`,
    kind: 'positioning_messaging',
    firstMade: `2026-0${(n % 9) + 1}-01`,
    timesMade: 1,
    monthsRepeated: 1,
    repeatedWithinMonth: false,
    status: 'new',
    statusLabel: 'New',
    decidedAt: null,
    number: n + 1,
    basedOn: [],
    grounded: null,
    afterwards: afterwardsFor({ pair: null, decidedAt: null, targetIds: [], series: [], audience: 'client' }),
    why: null,
    quote: null,
  })
  // In the ledger's order, which `number` is read off.
  const rows = Array.from({ length: 20 }, (_, i) => rowAt(i))
    .sort((a, b) => a.firstMade.localeCompare(b.firstMade))
    .map((r, i) => ({ ...r, number: i + 1 }))

  it('draws the first twelve and nothing else when no link was followed', () => {
    expect(ledgerRowsShown(rows, null, 12)).toHaveLength(12)
    expect(ledgerRowsShown(rows, null, 12)).toEqual(rows.slice(0, 12))
  })

  it('adds the named row when it is not among the twelve', () => {
    const named = rows[rows.length - 1]
    const shown = ledgerRowsShown(rows, named.lineageId, 12)
    expect(shown).toHaveLength(13)
    expect(shown.map((r) => r.lineageId)).toContain(named.lineageId)
  })

  it('keeps the ledger’s order: the named row takes its own place, the first row stays first', () => {
    const shown = ledgerRowsShown(rows, rows[15].lineageId, 12)
    expect(shown.map((r) => r.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 16])
  })

  it('adds nothing when the named row is already drawn, or names nothing at all', () => {
    expect(ledgerRowsShown(rows, rows[0].lineageId, 12)).toHaveLength(12)
    expect(ledgerRowsShown(rows, 'L-not-here', 12)).toHaveLength(12)
  })

  it('offers to accept the named row only while nobody has decided it', () => {
    // MK5 prints "The oldest piece of advice you have not decided on: {title}"
    // over whatever the URL named; without a status check it printed it over a
    // row already marked Done and offered to accept it again.
    const done: AdviceRow = { ...rows[5], status: 'acted_on', statusLabel: 'Done' }
    const list = rows.map((r) => (r.lineageId === done.lineageId ? done : r))
    expect(acceptableRow(list, done)!.lineageId).toBe(list.find((r) => r.status === 'new')!.lineageId)
    expect(acceptableRow(list, list[3])!.lineageId).toBe(list[3].lineageId)
    expect(acceptableRow(list, null)!.lineageId).toBe(list.find((r) => r.status === 'new')!.lineageId)
    expect(acceptableRow(list.map((r) => ({ ...r, status: 'dismissed' as const })), null)).toBeNull()
  })

  it('gives every row an anchor a link can land on', () => {
    expect(adviceAnchor('L3')).toBe('advice-L3')
    expect(marketSurfaceHref('L3', { horizon: 'last_3', rec: 'r3' })).toBe('/dashboard/market?horizon=last_3&item=L3')
  })
})


describe('D4 · the ledger\u2019s number, its why and its quote', () => {
  it('numbers identities off the ledger\u2019s own order, oldest first', () => {
    const rows = buildAdviceRows(
      [
        copy({ id: 'c', lineage_id: 'c', created_at: '2026-08-01T00:00:00.000Z' }),
        copy({ id: 'a', lineage_id: 'a', created_at: '2026-06-01T00:00:00.000Z' }),
        copy({ id: 'b', lineage_id: 'b', created_at: '2026-07-01T00:00:00.000Z' }),
      ],
      [],
    )
    expect(rows.map((r) => r.lineageId)).toEqual(['a', 'b', 'c'])
    expect(rows.map((r) => r.number)).toEqual([1, 2, 3])
    // Not a row id and not a rank: the number is the place in the order the
    // block's own meta line promises ("oldest first").
    expect(rows[0].number).not.toBe(rows[0].recommendationId)
  })

  it('numbers over EVERY identity, so a deep-linked row keeps its real place', () => {
    const rows = buildAdviceRows(
      Array.from({ length: 20 }, (_, i) =>
        copy({ id: `r${i}`, lineage_id: `L${i}`, created_at: `2026-0${(i % 9) + 1}-0${(i % 9) + 1}T00:00:00.000Z` }),
      ),
      [],
    )
    expect(rows[rows.length - 1].number).toBe(20)
    const shown = ledgerRowsShown(rows, rows[rows.length - 1].lineageId, 12)
    expect(shown[shown.length - 1].number).toBe(20)
  })

  it('drops the SENTENCE a model typed a figure in, and keeps the rest of the argument', () => {
    // The leak this rule is for, verbatim off production (2026-08-09): a
    // model-typed figure with no denominator, naming an internal bucket string.
    const reasoning =
      'Answer the wet-commute question on the product page. Industry-other holds 81. ' +
      'Nobody in the category answers it on camera.'
    const [row] = buildAdviceRows([copy({ reasoning })], [])
    expect(row.why).toContain('Answer the wet-commute question')
    expect(row.why).toContain('Nobody in the category answers it on camera.')
    expect(row.why).not.toContain('81')
    expect(row.why).not.toContain('Industry-other holds')
  })

  it('keeps a reasoning with no figure whole, and says null for none at all', () => {
    const whole = 'Lead with the repair path, because that is what your audience already asks about.'
    expect(buildAdviceRows([copy({ reasoning: whole })], [])[0].why).toBe(whole)
    expect(buildAdviceRows([copy({ reasoning: null })], [])[0].why).toBeNull()
    expect(buildAdviceRows([copy({ reasoning: '   ' })], [])[0].why).toBeNull()
  })

  it('never puts the hero quote inside the why — two fields, two nodes', () => {
    const hero = 'What happens when a seam goes? Nobody says.'
    const [row] = buildAdviceRows([copy({ reasoning: 'Lead with the repair path.', hero_quote: hero })], [])
    // A number inside a quotation is still refused (AGENTS.md), so a quote
    // spliced into scrubbed prose would either lose the speaker's own figure or
    // smuggle it past the rule. `quote` is resolved by the loader, against the
    // evidence, into its own field.
    expect(row.why).not.toContain(hero)
    expect(row.quote).toBeNull()
  })

  it('carries the newest copy\u2019s based_on, deduplicated', () => {
    const [row] = buildAdviceRows(
      [
        copy({ id: 'old', lineage_id: 'L', created_at: '2026-06-01T00:00:00.000Z', based_on: { insight_ids: ['x'] } }),
        copy({ id: 'new', lineage_id: 'L', created_at: '2026-09-01T00:00:00.000Z', based_on: { insight_ids: ['mi-1', 'mi-1', 'mi-2'] } }),
      ],
      [],
    )
    expect(row.basedOn).toEqual(['mi-1', 'mi-2'])
  })

  it('defaults a row nothing was read for to a state and a sentence, never a dash', () => {
    // `too_soon`, not `no_target`: the row has not been decided on, and that
    // is the silence that resolves on the calendar. See `afterwardsFor`.
    const [row] = buildAdviceRows([copy()], [])
    expect(row.afterwards.state).toBe('too_soon')
    expect(row.afterwards.line.length).toBeGreaterThan(0)
    expect(row.afterwards.line).not.toBe('\u2014')
    expect(row.grounded).toBeNull()
  })
})

describe('registryIdsByInsight \u2014 the join a recommendation never had', () => {
  it('maps a cited insight to every registry identity carrying it', () => {
    const map = registryIdsByInsight([
      { supporting_insight_ids: ['ai-1', 'ai-2'], registry_id: 'reg-a' },
      { supporting_insight_ids: ['ai-2'], registry_id: 'reg-b' },
    ])
    expect(map.get('ai-1')).toEqual(['reg-a'])
    expect(map.get('ai-2')).toEqual(['reg-a', 'reg-b'])
  })

  it('contributes nothing for a theme with no registry identity — never a label', () => {
    const map = registryIdsByInsight([
      { supporting_insight_ids: ['ai-1'], registry_id: null },
      { supporting_insight_ids: ['ai-1'], registry_id: undefined },
      { supporting_insight_ids: null, registry_id: 'reg-a' },
    ])
    expect(map.size).toBe(0)
  })
})

describe('orderedTargets — one ledger row, one identity', () => {
  const reg = new Map<string, string[]>([
    ['ai-1', ['reg-a']],
    ['ai-2', ['reg-a', 'reg-b']],
    ['ai-3', ['reg-b']],
    ['ai-4', ['reg-a']],
  ])

  it('leads with the identity most of the row’s own evidence points at', () => {
    expect(orderedTargets(['ai-1', 'ai-2', 'ai-3', 'ai-4'], reg)).toEqual(['reg-a', 'reg-b'])
  })

  it('breaks a tie on the id, so the object is the same between renders', () => {
    expect(orderedTargets(['ai-2'], reg)).toEqual(['reg-a', 'reg-b'])
    expect(orderedTargets(['ai-3', 'ai-1'], reg)).toEqual(['reg-a', 'reg-b'])
  })

  it('contributes nothing for evidence no theme carries', () => {
    expect(orderedTargets(['ai-9'], reg)).toEqual([])
    expect(orderedTargets([], reg)).toEqual([])
  })

  it('never pools two identities’ months into one comparison', () => {
    // The defect this ordering exists for: target A carries Jul–Sep and target
    // B Jan–Jun, so a concatenation takes the "after" month from A and the
    // "before" month from B and bands one theme's rise against another's.
    const aOnly = [
      { month: '2026-07-01', k: 11, n: 118 },
      { month: '2026-09-01', k: 21, n: 130 },
    ]
    const bOnly = [{ month: '2026-01-01', k: 40, n: 100 }]
    const points = new Map([['reg-a', aOnly], ['reg-b', bOnly]])
    const [target] = orderedTargets(['ai-1', 'ai-2', 'ai-4'], reg)
    const out = afterwardsFor({
      pair: null,
      decidedAt: '2026-06-02T00:00:00.000Z',
      targetIds: [target],
      series: points.get(target) ?? [],
      audience: 'client',
      objectLabel: 'Repair & warranty',
    })
    expect(target).toBe('reg-a')
    // Both sides after the decision, so there is no "before" month of A's to
    // read — and the answer is that, not B's January.
    expect(out.state).toBe('too_soon')
    expect(out.line).not.toContain('January')
  })
})

describe('the ledger’s hero quote burns nothing it does not print', () => {
  // The contract `HERO_ONLY` rests on: the picker takes its lead quote before
  // it checks n, so asking for zero returns a vouched hero and consumes
  // nothing otherwise. Asserted against the picker itself — this is about the
  // picker's order, not about a comment in the loader.
  const rows = [
    { quote: 'Wat gebeur as ’n naat gee?', rank: 1, evidenceId: 'e1' },
    { quote: 'Die rits het na ’n maand gebreek.', rank: 2, evidenceId: 'e2' },
  ]
  const byAudience = new Map([['ai-1', rows]])

  it('returns the hero when the evidence carries the same words', () => {
    const pick = createCitedQuotePicker(byAudience, new Map())
    const out = pick(['ai-1'], 0, 'a title', 'Wat gebeur as ’n naat gee?')
    expect(out).toHaveLength(1)
    expect(out[0].ref).toBe('e:e1')
  })

  it('takes NOTHING from the pool when the hero cannot be vouched, so a later row keeps its own', () => {
    const pick = createCitedQuotePicker(byAudience, new Map())
    expect(pick(['ai-1'], 0, 'a title', 'a sentence nobody in the evidence said')).toEqual([])
    // The row that really owns e2 can still be vouched for it.
    expect(pick(['ai-1'], 0, 'another title', 'Die rits het na ’n maand gebreek.')[0]?.ref).toBe('e:e2')
  })

  it('is exactly what asking for ONE would have broken', () => {
    const english = new Map([['ai-1', [
      { quote: 'What happens when a seam goes? Nobody says.', rank: 1, evidenceId: 'e1' },
      { quote: 'The zip broke after a month of commuting.', rank: 2, evidenceId: 'e2' },
    ]]])
    const pick = createCitedQuotePicker(english, new Map())
    // n = 1 falls through to the heuristic path and marks a candidate used…
    expect(pick(['ai-1'], 1, 'the zip broke after a month', 'a sentence nobody said').length).toBe(1)
    // …and that candidate is now unavailable to the row whose hero it is.
    expect(pick(['ai-1'], 0, 'another title', 'The zip broke after a month of commuting.')).toEqual([])
  })
})


describe('the ledger’s two new cells (the artboard port)', () => {
  it('ages a piece of advice in CALENDAR months, and says nothing at zero', () => {
    // The unit is the ledger's own: the column beside it counts the months an
    // identity was repeated in, so an age counted in days over thirty would put
    // two clocks in two adjacent cells.
    expect(ageInMonths('2026-06-28', '2026-09-18T09:00:00.000Z')).toBe('3 months')
    expect(ageInMonths('2026-08-04', '2026-09-18T09:00:00.000Z')).toBe('1 month')
    // Raised this month: "0 months" under "September" is a reader doing
    // arithmetic to learn what the cell above already says.
    expect(ageInMonths('2026-09-10', '2026-09-18T09:00:00.000Z')).toBeNull()
    expect(ageInMonths('', '2026-09-18T09:00:00.000Z')).toBeNull()
  })

  it('counts repeats in UPDATES, with the months only where there is more than one', () => {
    // D9. `timesMade` is the update count and the word goes on it; the column
    // used to print `monthsRepeated` with nothing saying which it was.
    expect(repeatCell({ timesMade: 3, monthsRepeated: 3 })).toEqual({ updates: '3 updates running', months: 'in 3 months' })
    expect(repeatCell({ timesMade: 1, monthsRepeated: 1 })).toEqual({ updates: '1 update', months: null })
    // Production's only repeat: twice inside one calendar month.
    expect(repeatCell({ timesMade: 2, monthsRepeated: 1 })).toEqual({ updates: '2 updates running', months: null })
  })
})

describe('a conclusion’s recurrence — the artboard’s "New" chip', () => {
  const point = (month: string, k: number): TargetPoint =>
    ({ month, k, n: 100, clusteringKey: null, audience: null })
  const points = (entries: [string, TargetPoint[]][]) => new Map(entries)

  it('is new where the record holds no earlier month for the theme', () => {
    const r = recurrenceForTarget('reg-1', points([['client|reg-1', [point('2026-09-01', 4)]]]), '2026-09-01')
    expect(r?.isNew).toBe(true)
  })

  it('is not new where an earlier month carried a reading, in EITHER audience', () => {
    // A conclusion is not scoped to one bucket — "Durability is the category's
    // rising subject" is about the category and the ledger reads the client's.
    const r = recurrenceForTarget('reg-1', points([
      ['industry-other|reg-1', [point('2026-07-01', 9), point('2026-09-01', 12)]],
    ]), '2026-09-01')
    expect(r?.isNew).toBe(false)
    expect(r?.seenIn).toEqual(['2026-07-01', '2026-09-01'])
  })

  it('does NOT count a month the theme was not heard in', () => {
    // A month whose denominator we read and whose theme nobody mentioned is not
    // a month it was heard in.
    const r = recurrenceForTarget('reg-1', points([
      ['client|reg-1', [point('2026-07-01', 0), point('2026-09-01', 5)]],
    ]), '2026-09-01')
    expect(r?.isNew).toBe(true)
  })

  it('is NULL, never new, where the month tables hold nothing for it', () => {
    // An absent record is not a new theme — `recurrenceOf` would otherwise call
    // it first-heard-this-month, a claim about the conversation made out of a
    // gap in our own bookkeeping. This is the state production is in.
    expect(recurrenceForTarget('reg-1', points([]), '2026-09-01')).toBeNull()
    expect(recurrenceForTarget(null, points([['client|reg-1', [point('2026-09-01', 4)]]]), '2026-09-01')).toBeNull()
  })
})

// ---- market-first WP1.9: the current recommendation first, then the newest ------
//
// SEALAND'S OWN ADVICE ON STAGING (to 20 Sep), read 25 Sep: the 20 Sep update's
// four copies, the 13 Sep update's five, the 10 Sep copy that started lineage
// a89fcdee, and the two older high-priority rows that rank beside it. Ids,
// dates, priorities, lineages and the NUMBER of cited insights are the rows'
// own; the insight ids themselves are stand-ins of the same count.

const cited = (n: number) => ({ insight_ids: Array.from({ length: n }, (_, i) => `mi-${i}`) })
const SEP20 = { created_at: '2026-09-20T08:31:54.388Z', run_id: 'b67b56de' }
const SEP13 = { created_at: '2026-09-13T13:05:46.504Z', run_id: '5a2ebc43' }
const SEALAND_COPIES: RecCopy[] = [
  copy({ ...SEP20, id: '8196074b', lineage_id: 'a89fcdee', priority: 'high', based_on: cited(4), status: 'in_progress', title: 'Add a “fit and facts” layer to every Sealand bag page and shopping touchpoint' }),
  copy({ ...SEP20, id: '750ffbc0', lineage_id: '750ffbc0', priority: 'medium', based_on: cited(4), title: 'Seed travel and family-routine creators with proof-led briefs, not just aesthetic gifting' }),
  copy({ ...SEP20, id: '9e0e2dbc', lineage_id: '9e0e2dbc', priority: 'low', based_on: cited(2), title: 'Turn Sealand’s circular story into item-level proof' }),
  copy({ ...SEP20, id: 'b3c74ac5', lineage_id: 'b3c74ac5', priority: 'medium', based_on: cited(2), title: 'Make carrying comfort a product claim Sealand can defend' }),
  copy({ ...SEP13, id: '110bdfe8', lineage_id: '110bdfe8', priority: 'medium', based_on: cited(2), title: 'Publish a Sealand material passport that proves the sustainability story' }),
  copy({ ...SEP13, id: '2f3d08ce', lineage_id: '2f3d08ce', priority: 'medium', based_on: cited(3), title: 'Reduce fit risk with clearer carry specs now and a larger, lighter next product revision' }),
  copy({ ...SEP13, id: '85ae2afe', lineage_id: '85ae2afe', priority: 'low', based_on: cited(5), title: 'Compete where bag decisions are made by building a consideration-stage creator program' }),
  copy({ ...SEP13, id: '85ecc340', lineage_id: '85ecc340', priority: 'low', based_on: cited(3), title: 'Make local buying and stockist access visible, then test retail partners' }),
  copy({ ...SEP13, id: 'e3e03d0c', lineage_id: 'a89fcdee', priority: 'high', based_on: cited(4), title: 'Make every core Sealand bag easy to buy in one visit' }),
  copy({ created_at: '2026-09-10T07:15:04.938Z', run_id: 'cb0d97b2', id: 'a89fcdee', lineage_id: 'a89fcdee', priority: 'high', based_on: cited(6), title: 'Add a “Know Before You Buy” standard to every Sealand bag page and social shop link' }),
  copy({ created_at: '2026-07-18T10:18:18.889Z', run_id: '2039968a', id: 'bff7bb66', lineage_id: 'bff7bb66', priority: 'high', based_on: cited(6), title: 'Put a standard buyer-answer block on every core SKU and commerce post' }),
  copy({ created_at: '2026-06-28T21:49:51.080Z', run_id: '2d17ac90', id: '061f442e', lineage_id: '061f442e', priority: 'high', based_on: cited(2), title: 'Develop Brand Loyalty and Product Enthusiasm Campaigns' }),
]

describe('MK2 · the current recommendation first, then the newest (market-first WP1.9)', () => {
  it('leads with the current recommendation: the top of the newest update, in its newest wording', () => {
    const rows = buildAdviceRows(SEALAND_COPIES, [])
    expect(rows[0].lineageId).toBe('a89fcdee')
    expect(rows[0].number).toBe(1)
    expect(rows[0].title).toBe('Add a “fit and facts” layer to every Sealand bag page and shopping touchpoint')
    expect(rows[0].timesMade).toBe(3)
    expect(rows[0].firstMade).toBe('2026-09-10')
    expect(currentTopLineage(SEALAND_COPIES)).toBe(rows[0].lineageId)
  })

  it('then runs newest first, each update’s rows in that update’s own ranking', () => {
    const rows = buildAdviceRows(SEALAND_COPIES, [])
    expect(rows.map((r) => r.lineageId)).toEqual([
      // 20 Sep: high 4 · medium 4 · medium 2 · low 2
      'a89fcdee', '750ffbc0', 'b3c74ac5', '9e0e2dbc',
      // 13 Sep: medium 3 · medium 2 · low 5 · low 3 (its high one is a89fcdee's, above)
      '2f3d08ce', '110bdfe8', '85ae2afe', '85ecc340',
      // then July, then June
      'bff7bb66', '061f442e',
    ])
    expect(rows.map((r) => r.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('draws no June row in the first twelve while newer advice exists (GR F34)', () => {
    const shown = ledgerRowsShown(buildAdviceRows(SEALAND_COPIES, []), null, 4)
    expect(shown.every((r) => r.firstMade >= '2026-09-10')).toBe(true)
    expect(shown.map((r) => r.lineageId)).toContain('a89fcdee')
  })

  it('dates a row by the update that last raised it, not the one that first made it', () => {
    // A July row raised again by the newest update is current advice.
    const again = copy({ ...SEP20, id: 'bff-again', lineage_id: 'bff7bb66', priority: 'low', based_on: cited(1) })
    const rows = buildAdviceRows([...SEALAND_COPIES, again], [])
    const at = rows.findIndex((r) => r.lineageId === 'bff7bb66')
    expect(at).toBeLessThan(4 + 1)
    expect(rows[at].firstMade).toBe('2026-07-18')
  })

  it('names the same advice, in the same words, as Overview’s recommendation block (review fix)', () => {
    // Overview's `loadLedger` prints `currentRecommendation`'s newest copy. On
    // staging's 20 Sep data both pages name a89fcdee in its 20 Sep wording and
    // the copy a status write must name, not the 10 Sep "Know Before You Buy".
    const overview = currentRecommendation(SEALAND_COPIES)!
    const ledger = buildAdviceRows(SEALAND_COPIES, [])[0]
    expect(overview.lineage).toBe(ledger.lineageId)
    expect(overview.newest.id).toBe(ledger.recommendationId)
    expect(overview.newest.title).toBe(ledger.title)
    expect(overview.newest.title).toBe('Add a “fit and facts” layer to every Sealand bag page and shopping touchpoint')
    expect(new Set(overview.copies.map((c) => c.run_id)).size).toBe(ledger.timesMade)
  })

  it('keeps the two pages on one piece of advice when a new top cites fewer insights than an old copy', () => {
    // The case the old Overview rule (every copy ever written) got wrong: a
    // new lineage leads the next update citing five insights, and the 10 Sep
    // and July copies cite six.
    const next = copy({ created_at: '2026-09-27T08:30:00.000Z', run_id: 'next', id: '0a0a0a0a', lineage_id: '0a0a0a0a', priority: 'high', based_on: cited(5), title: 'A new top' })
    const copies = [...SEALAND_COPIES, next]
    const everyCopy = topRecommendation([...copies].sort((a, b) => a.id.localeCompare(b.id)).map((c) => ({ ...c, priority: c.priority ?? null, based_on: c.based_on ?? null })))
    expect(lineageKey(everyCopy!)).toBe('a89fcdee')
    expect(currentRecommendation(copies)!.lineage).toBe('0a0a0a0a')
    expect(buildAdviceRows(copies, [])[0].lineageId).toBe('0a0a0a0a')
  })

  it('leads with the tagged row when two of the newest update’s copies tie on priority and grounding', () => {
    // The reviewer's case: copy `aaa` carries lineage `zzz`, copy `bbb` its own
    // lineage, both high priority citing four insights. `topRecommendation` is
    // handed the copies by id and keeps the first, so the current advice is
    // `zzz`; the lineage id alone would have put `bbb` first, untagged.
    const tied = [
      copy({ ...SEP20, id: 'aaa', lineage_id: 'zzz', priority: 'high', based_on: cited(4) }),
      copy({ ...SEP20, id: 'bbb', lineage_id: 'bbb', priority: 'high', based_on: cited(4) }),
    ]
    expect(currentTopLineage(tied)).toBe('zzz')
    const rows = buildAdviceRows(tied, [])
    expect(rows.map((r) => r.lineageId)).toEqual(['zzz', 'bbb'])
    expect(rows[0].lineageId).toBe(currentTopLineage(tied))
    expect(rows.map((r) => r.number)).toEqual([1, 2])
    // The same with the rest of Sealand's ledger behind them.
    const all = [...SEALAND_COPIES.filter((c) => c.run_id !== SEP20.run_id), ...tied]
    expect(buildAdviceRows(all, [])[0].lineageId).toBe(currentTopLineage(all))
  })

  it('has no current recommendation when there is no advice', () => {
    expect(currentTopLineage([])).toBeNull()
    expect(buildAdviceRows([], [])).toEqual([])
  })

  it('offers the oldest undecided row to accept, whatever order the ledger runs in', () => {
    const rows = buildAdviceRows(SEALAND_COPIES, [])
    expect(acceptableRow(rows, null)!.lineageId).toBe('061f442e')
  })
})

// ---- WP3.6 · Your moves: the pure half ------------------------------------------

describe('buildQuestions (WP3.6 Y1)', () => {
  // Staging, Sealand, September (measured 27 Sep): the category's question
  // themes at 10+ and their maker shares off `theme_maker_shares`.
  const t = (id: string, label: string, k: number, maker: number): MarketTheme => ({
    registryId: id, label, labelStripped: false, kind: 'question', k, n: 625, prev: null, makerShare: maker / k, noiseShare: 0, identityNewThisRun: false, flags: [], provenance: null,
  })
  const themes = [
    t('tut', 'Requests for step-by-step tutorials', 28, 23),
    t('mat', 'Questions about materials and tools', 25, 24),
    t('meas', 'Need for exact measurements', 15, 12),
    t('air', 'Confusion about airline size rules', 12, 1),
    t('sew', 'Requests for the sewing pattern', 11, 11),
    t('laundry', 'Laundry planning for travel', 10, 1),
  ]
  const posts: QuestionPost[] = [
    { id: 'p-sep', upload_date: '2026-09-07', topics: ['giveaway', 'event', 'crossbody bags', 'trail running'], video_url: null },
    { id: 'p-aug', upload_date: '2026-08-26', topics: ['sustainable fashion', 'raffle', 'handmade bags'], video_url: null },
  ]

  it('drops the maker-led questions and ranks the rest by videos', () => {
    const q = buildQuestions({ month: '2026-09-01', themes, segments: 'measured', n: 625, brandNames: ['Sealand'], posts, subjects: [], filings: null })
    expect(q.themes.map((r) => [r.label, r.videos])).toEqual([['Confusion about airline size rules', 12], ['Laundry planning for travel', 10]])
    expect(q.monthPosts).toBe(1)
    expect(q.windowPosts).toBe(2)
    expect(q.window).toEqual({ from: '2026-07-01', to: '2026-09-01' })
    expect(q.empty).toBeNull()
  })

  it('groups nothing for a tenant with no maker rule (Össur)', () => {
    const q = buildQuestions({ month: '2026-09-01', themes, segments: 'no_rule', n: 625, brandNames: [], posts, subjects: [], filings: null })
    expect(q.themes.map((r) => r.videos)).toEqual([28, 25, 15])
    expect(q.themes.every((r) => r.makers == null)).toBe(true)
  })

  it('reads a brand a question names with no evidence here as "a brand"', () => {
    const q = buildQuestions({ month: '2026-09-01', themes: [t('cot', 'Questions about Cotopaxi sizing', 12, 0)], segments: 'measured', n: 625, brandNames: ['Cotopaxi'], posts, subjects: [], filings: null })
    expect(q.themes[0].label).toBe('Questions about a brand sizing')
  })

  it('hides a subject being re-described, and says its empty state when nothing is left', () => {
    const q = buildQuestions({
      month: '2026-09-01', themes: [], segments: 'measured', n: 625, brandNames: [], posts, filings: null,
      subjects: [{ id: 's-rw', name: 'Repair & warranty', calibration: 'failed', videos: 11, groups: [] }],
    })
    expect(q.subjects).toEqual([])
    expect(q.empty).toContain('No question theme in your market reached 10 videos in September')
  })

  it('counts the window from two months before the reading month', () => {
    expect(questionWindowFrom('2026-10-01')).toBe('2026-08-01')
    expect(questionWindowFrom('2026-01-01')).toBe('2025-11-01')
  })
})

describe('questionTouch (WP3.6 Y1: words, and the judge for a subject)', () => {
  const posts: QuestionPost[] = [
    { id: 'a', upload_date: '2026-09-15', topics: ['event', 'yoga', 'coastal clean-up', 'community'], video_url: 'https://x/a' },
    { id: 'b', upload_date: '2026-09-02', topics: null, video_url: null },
  ]
  it('touched on two or more of one label’s words, with the post and the words', () => {
    const r = questionTouch({ labels: ['Questions about coastal clean-up events'], posts })
    expect(r.state).toBe('touched')
    expect(r.matched).toEqual([{ id: 'a', postedOn: '2026-09-15', href: 'https://x/a', words: ['coastal', 'clean', 'events'], by: 'words' }])
    expect(r.posts).toBe(2)
  })
  it('a theme row nobody touched is none, with the words checked', () => {
    expect(questionTouch({ labels: ['Confusion over airline bag sizes'], posts })).toMatchObject({ state: 'none', checked: ['airline', 'sizes'], matched: [] })
  })
  it('a subject row before MF3 is not checked yet, never none', () => {
    expect(questionTouch({ labels: ['Worries about zippers in rain'], posts, judge: { subjectId: 's', filings: null } })).toMatchObject({ state: 'unchecked', unfiled: 2 })
  })
  it('a subject row every post of which the judge filed is none; a filed touching post touches', () => {
    const row = (video_id: string, touches: boolean) => ({ video_id, claim_id: null, subject_id: 's', touches, matched_words: touches ? ['rain'] : [], method: 'judge', judge_version: 'v1', decided_at: '2026-11-22T00:00:00Z' })
    expect(questionTouch({ labels: ['Worries about zippers in rain'], posts, judge: { subjectId: 's', filings: ownPostFilings([row('a', false), row('b', false)]) } })).toMatchObject({ state: 'none', unfiled: 0 })
    expect(questionTouch({ labels: ['Worries about zippers in rain'], posts, judge: { subjectId: 's', filings: ownPostFilings([row('a', false)]) } })).toMatchObject({ state: 'unchecked', unfiled: 1 })
    const touched = questionTouch({ labels: ['Worries about zippers in rain'], posts, judge: { subjectId: 's', filings: ownPostFilings([row('a', false), row('b', true)]) } })
    expect(touched.state).toBe('touched')
    expect(touched.matched).toEqual([{ id: 'b', postedOn: '2026-09-02', href: null, words: ['rain'], by: 'judge' }])
  })
  it('your posts unread is unread, claiming nothing', () => {
    expect(questionTouch({ labels: ['Worries about zippers in rain'], posts: null, judge: { subjectId: 's', filings: null } }).state).toBe('unread')
  })
})

describe('buildClaimSubjects (WP3.6 Y3)', () => {
  const subjects = [
    { id: 's-w', name: 'Waterproofing', calibration: 'provisional' as const },
    { id: 's-d', name: 'Durability', calibration: 'provisional' as const },
    { id: 's-r', name: 'Repair & warranty', calibration: 'failed' as const },
  ]
  // Two rows of one claim on one post (a re-read), and a second claim.
  const claims = [
    { id: 'c1', source_video_id: 'p1', claim: 'Made from  rescued sailcloth.' },
    { id: 'c1b', source_video_id: 'p1', claim: 'made from rescued sailcloth.' },
    { id: 'c2', source_video_id: 'p2', claim: 'Built to last ten years.' },
  ]
  const row = (claim_id: string, subject_id: string, touches: boolean) => ({ video_id: 'p', claim_id, subject_id, touches, matched_words: [], method: 'judge', judge_version: 'v1', decided_at: '2026-11-22T00:00:00Z' })

  it('counts a claim once across its re-reads, and is unchecked before MF3', () => {
    expect(buildClaimSubjects({ claims, subjects, filings: null })).toMatchObject({ claims: 2, unfiled: 2, state: 'unchecked' })
    expect(buildClaimSubjects({ claims: null, subjects, filings: null })).toBeNull()
  })

  it('counts subjects once every claim is filed for every subject not being re-described', () => {
    const filings = ownPostFilings([row('c1', 's-w', false), row('c1', 's-d', false), row('c2', 's-w', false), row('c2', 's-d', true)])
    const c = buildClaimSubjects({ claims, subjects, filings })
    expect(c).toMatchObject({ claims: 2, unfiled: 0, state: 'checked' })
    expect(c!.subjects).toEqual([{ subjectId: 's-d', name: 'Durability', k: 1 }, { subjectId: 's-w', name: 'Waterproofing', k: 0 }])
    expect(buildClaimSubjects({ claims, subjects, filings: ownPostFilings([row('c2', 's-w', false), row('c2', 's-d', true)]) })).toMatchObject({ unfiled: 1, state: 'partial' })
  })
})

describe('questionGroupsOf', () => {
  it('names each insight by the first theme that cites it, keyed on the registry id', () => {
    const g = questionGroupsOf([
      { registry_id: 'r1', label: 'Demand for real waterproofing', supporting_insight_ids: ['i1', 'i2'] },
      { registry_id: 'r2', label: 'Worries about zippers in rain', supporting_insight_ids: ['i2', 'i3'] },
      { registry_id: null, label: 'Unkeyed', supporting_insight_ids: ['i4'] },
    ])
    expect(g.get('i2')).toEqual({ registryId: 'r1', label: 'Demand for real waterproofing' })
    expect(g.get('i3')?.registryId).toBe('r2')
    expect(g.has('i4')).toBe(false)
  })
})
