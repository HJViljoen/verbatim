import { describe, it, expect } from 'vitest'

import { createCitedQuotePicker } from '../quotes'
import type { RecDecision } from '../rec-decisions'
import { afterwardsFor } from '../reading/afterwards'
import {
  acceptableRow, actedLine, adviceAnchor, buildAdviceRows, ledgerRowsShown, lineageKey, madeInMonth,
  marketSurfaceHref, monthsMadeIn, moveLedgerLine, moveTargetLabel, orderedTargets, registryIdsByInsight, repeatLine,
  unlockRows, waysOfMoving, type AdviceRow, type RecCopy,
} from './market-surface'

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

  it('sorts by age, oldest first — not by evidence tier', () => {
    const rows = buildAdviceRows(
      [
        copy({ id: 'young', lineage_id: 'young', created_at: '2026-09-13T00:00:00.000Z' }),
        copy({ id: 'old', lineage_id: 'old', created_at: '2026-06-13T00:00:00.000Z' }),
      ],
      [],
    )
    expect(rows.map((r) => r.lineageId)).toEqual(['old', 'young'])
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

  it('never promises a month for a way that is not built', () => {
    for (const w of waysOfMoving(null)) {
      if (w.unlock) expect(w.unlock).not.toMatch(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+20\d\d/)
    }
  })
})

describe('what is not built', () => {
  // MK6 LEAVES THE LIST WHEN THE WORKSPACE HAS A PLAN (D4). It is still named
  // for a workspace with none, because for them the feature really is absent —
  // but "not built yet · Verbatim engineering" beside a card printing three
  // claims and their verdicts would be the page arguing with itself.
  it('drops MK6 once a plan has been checked, and keeps MK3', () => {
    expect(unlockRows(1).map((r) => r.section)).toEqual(['MK3'])
  })

  it('names MK3 and MK6, each with an owner and no invented date', () => {
    const rows = unlockRows(0)
    expect(rows.map((r) => r.section)).toEqual(['MK3', 'MK6'])
    for (const r of rows) {
      expect(r.owner).toBeTruthy()
      expect(r.line).not.toMatch(/\bby \d/)
      expect(`${r.line} ${r.title}`).not.toMatch(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+20\d\d/)
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
    afterwards: afterwardsFor({ decidedAt: null, targetIds: [], series: [], audience: 'client' }),
    why: null,
    quote: null,
  })
  const rows = Array.from({ length: 20 }, (_, i) => rowAt(i)).sort((a, b) => a.firstMade.localeCompare(b.firstMade))

  it('draws the oldest and nothing else when no link was followed', () => {
    expect(ledgerRowsShown(rows, null, 12)).toHaveLength(12)
    expect(ledgerRowsShown(rows, null, 12)).toEqual(rows.slice(0, 12))
  })

  it('adds the named row when it is not among the oldest', () => {
    const named = rows[rows.length - 1]
    const shown = ledgerRowsShown(rows, named.lineageId, 12)
    expect(shown).toHaveLength(13)
    expect(shown.map((r) => r.lineageId)).toContain(named.lineageId)
  })

  it('keeps the list oldest-first, because the block says it is', () => {
    const shown = ledgerRowsShown(rows, rows[rows.length - 1].lineageId, 12)
    expect([...shown].sort((a, b) => a.firstMade.localeCompare(b.firstMade) || a.lineageId.localeCompare(b.lineageId)))
      .toEqual(shown)
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
