import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

import { candidate, fact, pool } from './test-fixtures'
import { writerFigures, type WeekReadOutput } from './write'
import { generateWeekRead, WeekReadWriteError, type ParseClient } from './write-model'

// The writing call's glue (plan T3): one strict call, one retry, and what it
// writes to ai_call_log. The model and the database are stand-ins that only
// record what they were handed; nothing leaves the machine.

const ANSWER: WeekReadOutput = {
  findings: [{ headline: 'Price decides it', saw: 's', means: 'm', for: { sales: 'x', marketing: '', content: '', leadership: '' }, based_on: ['C1'], quote_from: 'C1' }],
  in_short: 'The week turns on price.',
  standing: [],
}

function fakeAdmin() {
  const rows: { table: string; row: Record<string, unknown> }[] = []
  const admin = { from: (table: string) => ({ insert: async (row: Record<string, unknown>) => { rows.push({ table, row }); return { error: null } } }) }
  return { admin: admin as unknown as SupabaseClient, rows }
}

function fakeClient(answers: (WeekReadOutput | null | Error)[]) {
  const calls: Record<string, unknown>[] = []
  const client = {
    chat: {
      completions: {
        parse: async (body: Record<string, unknown>) => {
          calls.push(body)
          const next = answers.shift()
          if (next instanceof Error) throw next
          return { usage: { prompt_tokens: 1000, completion_tokens: 500 }, choices: [{ message: { parsed: next ?? null } }] }
        },
      },
    },
  }
  return { client: client as unknown as ParseClient, calls }
}

const p = pool([candidate({ id: 'C1' }), candidate({ id: 'C2' }), candidate({ id: 'C3' })])
const base = { company: 'Sealand', pool: p, standing: [fact({ subjectId: 's1', name: 'Comfort', notes: ['Straps.'] })], previous: null, figures: writerFigures(p), clientId: 'client-1', runId: 'run-27' }

describe('generateWeekRead', () => {
  it('makes one strict call on the synthesis model and logs it as week_read, week_read_v2', async () => {
    const { admin, rows } = fakeAdmin()
    const { client, calls } = fakeClient([ANSWER])
    const out = await generateWeekRead(admin, { ...base, client })
    expect(out.written).toEqual(ANSWER)
    expect(out.attempts).toBe(1)
    expect(out.subjects.map((s) => s.handle)).toEqual(['S1'])
    expect(out.costUsd).toBeGreaterThan(0)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ model: 'gpt-5.4', reasoning_effort: 'medium' })
    expect((calls[0].response_format as { json_schema: { strict: boolean } }).json_schema.strict).toBe(true)
    expect(rows).toHaveLength(1)
    expect(rows[0].table).toBe('ai_call_log')
    expect(rows[0].row).toMatchObject({ pass: 'week_read', prompt_version: 'week_read_v2', model: 'gpt-5.4', run_id: 'run-27', client_id: 'client-1', validation_status: 'ok' })
  })

  it('retries once, logging both attempts, and throws after the second failure', async () => {
    const { admin, rows } = fakeAdmin()
    const retried = fakeClient([new Error('timeout'), ANSWER])
    expect((await generateWeekRead(admin, { ...base, client: retried.client })).attempts).toBe(2)
    expect(rows.map((r) => r.row.validation_status)).toEqual(['parse_error', 'ok'])

    const failing = fakeClient([null, new Error('500')])
    await expect(generateWeekRead(admin, { ...base, client: failing.client })).rejects.toBeInstanceOf(WeekReadWriteError)
  })

  it('writes nothing to any database on a dry run', async () => {
    const { admin, rows } = fakeAdmin()
    const { client } = fakeClient([ANSWER])
    await generateWeekRead(admin, { ...base, client, log: false })
    expect(rows).toEqual([])
  })
})
