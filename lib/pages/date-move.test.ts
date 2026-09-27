import { describe, expect, it } from 'vitest'

import { canDate, dateMoveLead, dateMoveSaid, dayWindowLine, parseMoveTarget, targetGroups, targetValue, type MoveDating } from './date-move'
import { DIRECTION_WORDS } from '../calibration'

const SUBJECT = '00000000-0000-4000-8000-0000000005f1'

const dating = (over: Partial<MoveDating> = {}): MoveDating => ({
  datable: true, today: '2026-10-02', earliest: '2026-08-01', month: '2026-09-01',
  subjects: [], themes: [], advice: null, ...over,
})

describe('the target, as one form value', () => {
  it('names its kind and its one id, and reads back as the move’s one target', () => {
    expect(parseMoveTarget(targetValue('subject', SUBJECT))).toEqual({ kind: 'subject', subjectId: SUBJECT })
    expect(parseMoveTarget(targetValue('theme', SUBJECT))).toEqual({ kind: 'theme', registryIds: [SUBJECT] })
    expect(parseMoveTarget(targetValue('advice', SUBJECT))).toEqual({ kind: 'advice', lineageId: SUBJECT })
  })

  it('refuses anything else before a write', () => {
    for (const bad of ['', 'subject', `plan:${SUBJECT}`, 'subject:not-a-uuid', `subject:${SUBJECT}:x`]) {
      expect(parseMoveTarget(bad)).toBe('Pick what the move is about.')
    }
  })
})

describe('the form', () => {
  it('is offered only where there is something to date a move on', () => {
    expect(canDate(null)).toBe(false)
    expect(canDate(dating())).toBe(false)
    expect(canDate(dating({ subjects: [{ id: SUBJECT, name: 'Waterproofing' }] }))).toBe(true)
    expect(canDate(dating({ themes: [{ registryId: SUBJECT, label: 'Confusion over airline bag sizes' }] }))).toBe(true)
    expect(canDate(dating({ advice: { lineageId: SUBJECT, title: 'Add a fit and facts layer' } }))).toBe(true)
  })

  it('groups what a move can be about, naming the questions’ month', () => {
    expect(targetGroups(dating())).toEqual({
      subjects: 'Your subjects',
      themes: 'What your market asked most in September',
      advice: 'The current recommendation',
    })
  })

  it('asks when only where the form takes a day (MF5 applied)', () => {
    expect(dateMoveLead(true)).toBe('Name what you changed and when. This page then reads what your market said that month and the two after it, as a level.')
    expect(dateMoveLead(false)).toBe('Name what you changed. This page then reads what your market said that month and the two after it, as a level.')
  })

  it('says the window and what landed, with no direction word and no cause', () => {
    expect(dayWindowLine('2026-08-01')).toBe('From 1 Aug to today.')
    expect(dateMoveSaid('2026-09-15')).toBe('Dated 15 Sep.')
    expect(dateMoveSaid(null)).toBe('Dated today.')
    for (const said of [dayWindowLine('2026-08-01'), dateMoveSaid('2026-09-15'), dateMoveLead(true), ...Object.values(targetGroups(dating()))]) {
      expect(said).not.toMatch(/caus/i)
      for (const w of DIRECTION_WORDS) expect(said.toLowerCase().split(/\W+/)).not.toContain(w)
    }
  })
})
