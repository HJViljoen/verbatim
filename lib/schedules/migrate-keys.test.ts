import { describe, expect, it } from 'vitest'
import { chooseSchedules, describes, migration, parseArgs, validate } from './migrate-keys'
import { WEEKLY_STARTER_KEY } from './artefact'

describe('the flags', () => {
  it('is dry unless --apply is passed', () => {
    expect(parseArgs(['--client', 'c1']).apply).toBe(false)
    expect(parseArgs(['--client', 'c1', '--apply']).apply).toBe(true)
  })

  it('refuses to run without a workspace', () => {
    expect(validate(parseArgs([]))).toHaveLength(1)
    expect(validate(parseArgs(['--client', 'c1']))).toEqual([])
  })

  it('takes one schedule at a time when asked', () => {
    expect(parseArgs(['--client', 'c1', '--schedule', 's2']).scheduleId).toBe('s2')
  })

  it('refuses a flag it does not know rather than ignoring it', () => {
    expect(() => parseArgs(['--clientt', 'c1'])).toThrow(/unknown flag/)
  })
})

describe('what a schedule sends now', () => {
  it('names the stored report and how many sections it carries', () => {
    expect(describes({ starter_key: null, report_id: 'abcdef12-0000-0000-0000-000000000000', sections: 3 }))
      .toBe('the stored report abcdef12 (3 sections)')
  })

  it('names the starter where there is one', () => {
    expect(describes({ starter_key: 'weekly_digest', report_id: null })).toBe("starter 'weekly_digest'")
  })

  it('names the artefact once the column answers', () => {
    expect(describes({ starter_key: 'weekly_digest', report_id: null, artefact: 'weekly' })).toBe("artefact 'weekly'")
  })

  it('says so plainly when nothing recognisable is stored', () => {
    expect(describes({ starter_key: null, report_id: null })).toBe('nothing this build recognises')
  })
})

describe('what it writes', () => {
  it('moves the schedule onto the weekly report and lets go of the stored report', () => {
    const m = migration(false)
    expect(m.starter_key).toBe(WEEKLY_STARTER_KEY)
    expect(m.report_id).toBeNull()
  })

  it('writes the artefact column only where M8 has been applied', () => {
    // Naming a column that is not there fails the whole update, not the field.
    expect('artefact' in migration(false)).toBe(false)
    expect(migration(true).artefact).toBe('weekly')
  })

  it('stamps the row it touches', () => {
    expect(migration(false, new Date('2026-09-18T09:00:00.000Z')).updated_at).toBe('2026-09-18T09:00:00.000Z')
  })
})

// `--client` alone used to convert EVERY schedule of the workspace, including a
// document or brief schedule with its own report_id. The script's own header
// says "row by row".
describe('which schedules a run touches', () => {
  const rows = [
    { id: 'a', is_default: true },
    { id: 'b', is_default: false },
    { id: 'c', is_default: false },
  ]

  it('takes the default schedule when nothing else is named', () => {
    expect(chooseSchedules(rows, { scheduleId: null, all: false }).map((s) => s.id)).toEqual(['a'])
  })

  it('takes exactly the one named', () => {
    expect(chooseSchedules(rows, { scheduleId: 'c', all: false }).map((s) => s.id)).toEqual(['c'])
  })

  it('takes every one only when asked for every one', () => {
    expect(chooseSchedules(rows, { scheduleId: null, all: true }).map((s) => s.id)).toEqual(['a', 'b', 'c'])
  })

  it('reads --all off the command line, and does not invent it', () => {
    expect(parseArgs(['--client', 'x', '--all']).all).toBe(true)
    expect(parseArgs(['--client', 'x']).all).toBe(false)
  })
})
