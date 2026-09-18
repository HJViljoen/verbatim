import { describe, it, expect } from 'vitest'

import type { RecDecision } from '../rec-decisions'
import {
  acceptableRow, actedLine, adviceAnchor, buildAdviceRows, ledgerRowsShown, lineageKey, madeInMonth,
  marketSurfaceHref, monthsMadeIn, moveLedgerLine, moveTargetLabel, repeatLine, unlockRows,
  waysOfMoving, type AdviceRow, type RecCopy,
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
  it('has five, two of them live when there is advice to accept', () => {
    const ways = waysOfMoving({ lineageId: 'L', recommendationId: 'r', title: 'x' })
    expect(ways).toHaveLength(5)
    expect(ways.filter((w) => w.live).map((w) => w.key)).toEqual(['track', 'advice'])
  })

  it('drops "accept this advice" to not-live when the ledger is empty, and says why', () => {
    const ways = waysOfMoving(null)
    expect(ways.filter((w) => w.live).map((w) => w.key)).toEqual(['track'])
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

describe('what is not built', () => {
  it('names MK3 and MK6, each with an owner and no invented date', () => {
    const rows = unlockRows()
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
