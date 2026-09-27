import { describe, expect, it } from 'vitest'

import { changeRow, scriptActor } from '../config-log'
import { asChangeInput } from '../config-surfaces-mf1'
import * as eras from '../../scripts/log-tracking-eras'
import * as segments from '../../scripts/label-segments'

// The change rows the Stage 1 scripts write to `config_changes` in production
// (plan WP1.4: log-tracking-eras' gate fix, attribution v3 and, with
// --capped-run, a capped update; label-segments' one segment row;
// reconstruct-provenance and measure-comparability write no change row).
//
// NO NOTE ON ANY OF THEM (Heinrich, 27 Sep: "lets just not add those notes";
// plan §8). The rows stay, because decision D's comparison refusals and the
// record's reach figures read them, but no sentence explaining the change is
// stored, so none can reach a client. The four note constants the scripts
// held are gone, and the dry runs print "note: none".

const CLIENT = 'ac16988e-c4f3-4baf-b388-73895852a554'
const actor = scriptActor('scripts/log-tracking-eras.ts --apply')

describe('the change rows the Stage 1 scripts store carry no note (27 Sep)', () => {
  const rows = [
    eras.ourChangeRow({ clientId: CLIENT, surface: 'gate_rule', field: 'relevance_gate', actor, changedAt: '2026-09-25T16:18:47.000Z', affects: { months: '[2026-08-01,2026-10-01)' } }),
    eras.ourChangeRow({ clientId: CLIENT, surface: 'attribution', field: 'attribution_v3', actor, changedAt: '2026-09-25T16:18:47.000Z' }),
    eras.ourChangeRow({ clientId: CLIENT, surface: 'other', field: 'gather_capped', actor, runId: 'b67b56de-0000-4000-8000-000000000000', changedAt: '2026-09-20T08:33:00.000Z' }),
    segments.segmentChangeRow({ clientId: CLIENT, actor: scriptActor('scripts/label-segments.ts --apply'), rowsAffected: 5256 }),
  ]

  it.each(rows.map((r) => [r.surface, r] as const))('%s: stored with note NULL', (_surface, row) => {
    expect(row.note).toBeNull()
    expect(changeRow(asChangeInput(row)).note).toBeNull()
  })

  it('keeps every other field as it was: surface, field, date, actor, source, months', () => {
    const [gate, attribution, capped, segment] = rows.map((r) => changeRow(asChangeInput(r)))
    expect(gate).toMatchObject({
      client_id: CLIENT, surface: 'gate_rule', field: 'relevance_gate', changed_at: '2026-09-25T16:18:47.000Z',
      actor_kind: 'script', actor_label: 'scripts/log-tracking-eras.ts --apply', source: 'reconstructed',
      affects_months: '[2026-08-01,2026-10-01)', note: null,
    })
    expect(attribution).toMatchObject({ surface: 'attribution', field: 'attribution_v3', changed_at: '2026-09-25T16:18:47.000Z', source: 'reconstructed', note: null })
    expect(attribution).not.toHaveProperty('affects_months')
    expect(capped).toMatchObject({ surface: 'other', field: 'gather_capped', run_id: 'b67b56de-0000-4000-8000-000000000000', source: 'reconstructed', note: null })
    expect(segment).toMatchObject({
      surface: 'segment', field: 'segments_v1', actor_label: 'scripts/label-segments.ts --apply', source: 'logged', rows_affected: 5256, note: null,
    })
  })

  it('no note constant is left to print', () => {
    for (const mod of [eras, segments] as Record<string, unknown>[]) {
      for (const [name, value] of Object.entries(mod)) {
        expect(name).not.toMatch(/_NOTE$/)
        expect(typeof value === 'string' && value.length > 40).toBe(false)
      }
    }
  })

  it('the dry runs print each planned row with "note: none", never a quoted note', () => {
    const [gate, attribution, , segment] = rows
    expect(eras.newRowLine(gate)).toBe('  new row: gate_rule at 2026-09-25T16:18:47.000Z · note: none · months [2026-08-01,2026-10-01)')
    expect(eras.newRowLine(attribution)).toBe('  new row: attribution at 2026-09-25T16:18:47.000Z · note: none')
    expect(segments.segmentRowLine(segment)).toBe('  new row: segment segments_v1, written with the labels · note: none')
    // An empty or blank note is no note.
    expect(eras.newRowLine({ ...attribution, note: '  ' })).toContain('note: none')
    for (const line of [eras.newRowLine(gate), eras.newRowLine(attribution), segments.segmentRowLine(segment)]) {
      expect(line).not.toMatch(/"/)
      expect(line).not.toMatch(/undefined|null/)
    }
  })
})
