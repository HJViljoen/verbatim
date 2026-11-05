import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { changesFromLog } from '../reading/comparability'
import type { ConfigChange } from '../config-log'
import { checkMarketDefinition, marketDefinitionChange, planMarketDefinition, rejudgedBand } from '../gather/market-definition'
import { relevancePromptVersion } from '../gather/relevance'
import { runSetMarketDescription, type DefinitionAdmin } from '../../scripts/set-market-description'

// scripts/set-market-description.ts (5 Nov): read-only by default; --apply
// writes market_description with the actor stamped and logs ONE gate_rule /
// market_description row whose affects_months is the comparison break. The
// database is a fake that answers the script's reads and records its writes.

const SEALAND = 'ac16988e-c4f3-4baf-b388-73895852a554'
const SEED_PATH = 'scripts/seeds/sealand-market-description.txt'
const SEED = readFileSync(join(__dirname, '../..', SEED_PATH), 'utf8')
const PROD_URL = 'https://mkwjlckescdveosvrvaq.supabase.co'
const NOW = '2026-11-07T15:00:00.000Z'

interface Call { table: string; op: 'select' | 'update' | 'insert'; payload?: Record<string, unknown>; filters: [string, unknown][] }

function fakeAdmin(state: { stored?: string | null; frozen?: string[]; running?: string[]; insertError?: string } = {}) {
  const calls: Call[] = []
  const admin: DefinitionAdmin = {
    from: (table: string) => {
      const call: Call = { table, op: 'select', filters: [] }
      calls.push(call)
      const result = () => {
        if (call.op === 'update') return { error: null, count: 1 }
        if (table === 'clients') return { data: [{ id: SEALAND }], error: null }
        if (table === 'tracking_configs') return { data: { market_description: state.stored ?? null }, error: null }
        if (table === 'month_denominators') return { data: (state.frozen ?? ['2026-09-01']).map((month) => ({ month })), error: null }
        if (table === 'pipeline_runs') return { data: (state.running ?? []).map((id) => ({ id })), error: null }
        return { data: null, error: null }
      }
      const q = {
        select: () => q, eq: (k: string, v: unknown) => { call.filters.push([k, v]); return q }, order: () => q, limit: () => q,
        maybeSingle: () => Promise.resolve(result()),
        update: (payload: Record<string, unknown>) => { call.op = 'update'; call.payload = payload; return q },
        insert: (payload: Record<string, unknown>) => {
          call.op = 'insert'; call.payload = payload
          return Promise.resolve(state.insertError ? { error: { message: state.insertError } } : { error: null })
        },
        then: (ok: (r: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(result()).then(ok, ko),
      }
      return q as unknown as ReturnType<DefinitionAdmin['from']>
    },
  }
  return { admin, calls, writes: () => calls.filter((c) => c.op !== 'select') }
}

const run = (argv: string[], state?: Parameters<typeof fakeAdmin>[0]) => {
  const db = fakeAdmin(state)
  const lines: string[] = []
  const done = runSetMarketDescription(argv, { admin: db.admin, supabaseUrl: PROD_URL, now: () => NOW, log: (l) => lines.push(l), readFile: () => SEED })
  return { db, lines, done }
}
const ARGS = ['--client', SEALAND, '--project', 'mkwjlckescdveosvrvaq', '--file', SEED_PATH]

describe('set-market-description: the dry run', () => {
  it('reads, prints the plan and writes nothing', async () => {
    const { db, lines, done } = run(ARGS)
    const out = await done
    expect(out.applied).toBe(false)
    expect(db.writes()).toEqual([])
    expect(db.calls.map((c) => c.table)).toEqual(['clients', 'tracking_configs', 'month_denominators', 'pipeline_runs'])
    expect(db.calls.every((c) => c.filters.some(([k, v]) => (k === 'client_id' || k === 'id') && v === SEALAND))).toBe(true)
    expect(out.plan).toMatchObject({ moves: true, band: '[2026-10-01,2026-12-01)', rejudgedFrom: '2026-10-01' })
    expect(lines.join('\n')).toContain('read-only on production mkwjlckescdveosvrvaq')
    expect(lines.join('\n')).toContain(`the gate's prompt version: relevance_gpt → ${relevancePromptVersion('gpt', { market_description: SEED })}`)
    expect(lines.join('\n')).toContain('month comparisons refused: any month before October 2026 against October 2026 or later; the weekly bars are not cut')
    expect(lines.join('\n')).toContain('read-only, nothing written')
  })

  it('refuses the wrong project, a missing or doubled source, and a definition that breaks the copy rules, before any read', async () => {
    const bad = async (argv: string[], url = PROD_URL, file = SEED) => {
      const db = fakeAdmin()
      await expect(runSetMarketDescription(argv, { admin: db.admin, supabaseUrl: url, readFile: () => file, log: () => {} })).rejects.toThrow()
      expect(db.calls).toEqual([])
    }
    await bad(ARGS, 'https://zfmxrrugaihxpubunleu.supabase.co')
    await bad(['--client', SEALAND, '--project', 'mkwjlckescdveosvrvaq'])
    await bad([...ARGS, '--clear'])
    await bad(ARGS, PROD_URL, 'Bags — all of them')
    await bad(ARGS, PROD_URL, 'Bags under 40 litres')
    await bad(ARGS, PROD_URL, '   ')
    // The first paragraph is the writers' summary: prose, not a list, short.
    await bad(ARGS, PROD_URL, '- backpacks\n- duffels\n\nNot the market: crochet.')
    await bad(ARGS, PROD_URL, `${'carry gear '.repeat(80)}\n\nNot the market: crochet.`)
  })
})

describe('set-market-description: --apply', () => {
  it('writes the column with the actor stamped, then logs ONE break row', async () => {
    const { db, done } = run([...ARGS, '--apply'])
    expect((await done).applied).toBe(true)
    const [update, insert] = db.writes()
    expect(update).toMatchObject({ table: 'tracking_configs', op: 'update', filters: [['client_id', SEALAND]] })
    expect(update.payload?.market_description).toBe(SEED.trim())
    expect(update.payload?.last_actor).toMatchObject({ kind: 'script', label: `scripts/set-market-description.ts --client ${SEALAND} --file <file> --apply --project mkwjlckescdveosvrvaq` })
    expect(insert).toMatchObject({ table: 'config_changes', op: 'insert' })
    expect(insert.payload).toMatchObject({
      client_id: SEALAND, surface: 'gate_rule', field: 'market_description', affects_months: '[2026-10-01,2026-12-01)',
      before: { market_description: null, prompt_version: 'relevance_gpt' },
      after: { market_description: SEED.trim(), prompt_version: relevancePromptVersion('gpt', { market_description: SEED }) },
      actor_kind: 'script', note: null, run_id: null, source: 'logged',
    })
    // The row reads back as the break: re-judged from October.
    const [change] = changesFromLog([{ id: 'x', ...(insert.payload as Omit<ConfigChange, 'id'>) } as ConfigChange])
    expect(change.rejudgedFrom).toBe('2026-10-01')
  })

  it('writes nothing where the stored words are the ones given, or while an update runs', async () => {
    const same = run([...ARGS, '--apply'], { stored: `${SEED}\n` })
    expect((await same.done).applied).toBe(false)
    expect(same.db.writes()).toEqual([])
    const busy = run([...ARGS, '--apply'], { running: ['run-1'] })
    await expect(busy.done).rejects.toThrow(/REFUSED: an update is running/)
    expect(busy.db.writes()).toEqual([])
  })

  it('says so loudly when the column landed and the row did not', async () => {
    const { done } = run([...ARGS, '--apply'], { insertError: 'permission denied' })
    await expect(done).rejects.toThrow(/WAS WRITTEN but its change row was NOT recorded/)
  })

  it('--clear writes null back, logging a row of its own', async () => {
    const { db, done } = run(['--client', SEALAND, '--project', 'mkwjlckescdveosvrvaq', '--clear', '--apply'], { stored: SEED })
    expect((await done).applied).toBe(true)
    const [update, insert] = db.writes()
    expect(update.payload?.market_description).toBeNull()
    expect(insert.payload).toMatchObject({ before: { market_description: SEED.trim() }, after: { market_description: null, prompt_version: 'relevance_gpt' } })
  })
})

describe('the pure half', () => {
  it('Sealand’s seed passes the copy rules and fits', () => {
    expect(checkMarketDefinition(SEED)).toBe(SEED.trim())
  })
  it('re-judges from the month after the newest frozen one to the end of this month', () => {
    expect(rejudgedBand('2026-09-01', NOW)).toBe('[2026-10-01,2026-12-01)')
    expect(rejudgedBand(null, NOW)).toBe('[2026-11-01,2026-12-01)')
    expect(rejudgedBand('2026-08-01', '2026-11-30T23:00:00.000Z')).toBe('[2026-09-01,2026-12-01)')
    expect(() => rejudgedBand('2026-11-01', NOW)).toThrow(/nothing is filling/)
  })
  it('the row carries no note and no words in its label', () => {
    const row = marketDefinitionChange({ clientId: SEALAND, plan: planMarketDefinition(null, SEED, '2026-09-01', NOW), actorLabel: 'scripts/x.ts --file <file> --apply', at: NOW })
    expect(row.note).toBeNull()
    expect(String(row.actor_label)).not.toContain('carry')
  })
})
