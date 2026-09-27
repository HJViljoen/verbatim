import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  CADENCE_REFUSAL, cadenceEditIn, isAllowedRhythm, isPausedRhythm, nextUpdateWords, operatorRhythm,
  PAUSED_ON_SUNDAY, UPDATE_RHYTHM_WORDS, WEEKLY_ON_SUNDAY,
} from './update-rhythm'

// Every workspace is weekly, on Sunday (Heinrich, 27 Sep 2026: "remove cadence
// from settings, and always have it weekly on sunday"). The rule, the refusal,
// and the real Settings actions with the session and the database faked.

const form = (fields: Record<string, string | string[]>): FormData => {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) for (const one of Array.isArray(v) ? v : [v]) f.append(k, one)
  return f
}

describe('the rhythm', () => {
  it('is weekly on Sunday, and the pause keeps Sunday for the day it resumes on', () => {
    expect(WEEKLY_ON_SUNDAY).toEqual({ report_period: 'weekly', report_day: 'sunday' })
    expect(PAUSED_ON_SUNDAY).toEqual({ report_period: 'paused', report_day: 'sunday' })
    expect(operatorRhythm('weekly')).toEqual(WEEKLY_ON_SUNDAY)
    expect(operatorRhythm('paused')).toEqual(PAUSED_ON_SUNDAY)
  })

  it('allows weekly on Sunday and a pause, and nothing else', () => {
    expect(isAllowedRhythm({ report_period: 'weekly', report_day: 'sunday' })).toBe(true)
    // Össur, as staging holds it: paused, and a pause is never due on any day.
    expect(isAllowedRhythm({ report_period: 'paused', report_day: 'sunday' })).toBe(true)
    expect(isAllowedRhythm({ report_period: 'paused', report_day: 'monday' })).toBe(true)
    expect(isAllowedRhythm({ report_period: 'weekly', report_day: 'monday' })).toBe(false)
    expect(isAllowedRhythm({ report_period: 'monthly', report_day: 'sunday' })).toBe(false)
    expect(isAllowedRhythm({ report_period: 'daily', report_day: 'sunday' })).toBe(false)
    expect(isAllowedRhythm(null)).toBe(false)
  })

  it('names the next update in words, and promises a paused workspace none', () => {
    expect(nextUpdateWords(WEEKLY_ON_SUNDAY)).toBe('Sunday’s update')
    expect(nextUpdateWords(PAUSED_ON_SUNDAY)).toBe('the next update')
    expect(nextUpdateWords(null)).toBe('the next update')
    expect(isPausedRhythm(PAUSED_ON_SUNDAY)).toBe(true)
    expect(isPausedRhythm(WEEKLY_ON_SUNDAY)).toBe(false)
    expect(UPDATE_RHYTHM_WORDS).toBe('weekly, on Sunday')
  })
})

describe('a save that would move the cadence', () => {
  const stored = { report_period: 'weekly', report_day: 'sunday' }

  it('lets through a POST that carries no cadence, or the stored pair back', () => {
    expect(cadenceEditIn(form({ brand_keywords: 'sealand gear' }), stored)).toBe(false)
    // A page opened before the section went posts both fields on every save.
    expect(cadenceEditIn(form({ report_period: 'weekly', report_day: 'sunday' }), stored)).toBe(false)
    // …and a paused workspace's page posted the day alone.
    expect(cadenceEditIn(form({ report_day: 'sunday' }), { report_period: 'paused', report_day: 'sunday' })).toBe(false)
  })

  it('refuses a new day, a new period, and an unpause', () => {
    expect(cadenceEditIn(form({ report_period: 'weekly', report_day: 'monday' }), stored)).toBe(true)
    expect(cadenceEditIn(form({ report_period: 'monthly', report_day: 'sunday' }), stored)).toBe(true)
    expect(cadenceEditIn(form({ report_period: 'weekly' }), { report_period: 'paused', report_day: 'sunday' })).toBe(true)
    expect(cadenceEditIn(form({ report_period: 'paused' }), stored)).toBe(true)
    // No stored row: anything posted is a change.
    expect(cadenceEditIn(form({ report_day: 'sunday' }), null)).toBe(true)
  })

  it('says so in calibrated copy: no em dash, no digit', () => {
    expect(CADENCE_REFUSAL).not.toContain('—')
    expect(CADENCE_REFUSAL).not.toMatch(/\d/)
    expect(CADENCE_REFUSAL).toContain('weekly, on Sunday')
  })
})

// ---- The real actions -------------------------------------------------------------

const SEALAND = 'ac16988e-c4f3-4baf-b388-73895852a554'
const OSSUR = 'e52cac94-30e1-426a-9a36-31b11e0b30b6'

const h = vi.hoisted(() => ({
  session: null as null | Record<string, unknown>,
  admin: null as unknown,
}))

vi.mock('@/lib/auth', async () => {
  const roles = await import('@/lib/roles')
  return { ROLES: roles.ROLES, canManageTenant: roles.canManageTenant, getSessionContext: async () => h.session, getRouteSession: async () => h.session }
})
vi.mock('@/lib/supabase-admin', async (orig) => ({
  ...(await orig<typeof import('@/lib/supabase-admin')>()),
  createAdminClient: () => h.admin,
}))
vi.mock('@/lib/rivals', () => ({ ensureRivals: async () => {} }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

interface Write { table: string | null; op: string; payload: Record<string, unknown> | null }

/** A chainable stand-in for a Supabase client that records every write WITH its
 *  payload, so a test can say which columns a statement carried. */
function fakeClient(reads: Record<string, unknown> = {}): { client: unknown; writes: Write[] } {
  const writes: Write[] = []
  const chain = (table: string | null): unknown => {
    let op: string | null = null
    const proxy: unknown = new Proxy(() => {}, {
      get(_t, prop) {
        if (prop === 'then') {
          const data = op ? null : table ? reads[table] ?? null : null
          return (resolve: (v: unknown) => void) => resolve({ data, error: null, count: 1 })
        }
        return (...args: unknown[]) => {
          const p = String(prop)
          if (p === 'from') return chain(String(args[0]))
          if (p === 'update' || p === 'insert' || p === 'upsert' || p === 'delete') {
            op = p
            writes.push({ table, op: p, payload: (args[0] ?? null) as Record<string, unknown> | null })
          }
          return proxy
        }
      },
    })
    return proxy
  }
  return { client: chain(null), writes }
}

const ownerOf = (clientId: string, supabase: unknown) =>
  ({ supabase, userId: 'u-1', email: 'owner@ossur.example', clientId, role: 'owner', operator: null })
const operatorIn = (clientId: string, supabase: unknown) => ({
  supabase, userId: 'u-op', email: 'operator@verbatim.example', clientId, role: 'owner',
  operator: { homeClientId: OSSUR, viewingClientId: clientId, viewingName: 'Sealand', isHome: false },
})

let admin: ReturnType<typeof fakeClient>
let session: ReturnType<typeof fakeClient>
const idle = { ok: false, message: '' }
const terms = { brand_keywords: 'ossur', competitor_keywords: 'ottobock', industry_keywords: 'prosthetic leg', exclude_terms: ['poker'] }
const rivals = { competitor_names: ['Ottobock', 'Fillauer'], competitor_names_present: '1' }
const cadenceColumns = (w: Write[]) => w.filter((x) => x.table === 'tracking_configs' && x.payload && ('report_period' in x.payload || 'report_day' in x.payload))

beforeEach(() => {
  admin = fakeClient()
  session = fakeClient({
    tracking_configs: { report_period: 'paused', report_day: 'sunday', competitor_names: ['Ottobock'], competitor_keywords: ['ottobock'], subreddits: [] },
  })
  h.admin = admin.client
})

describe('the Settings save writes no cadence, and refuses one that moves', () => {
  it('saves the rivals on a paused workspace without touching report_period or report_day', async () => {
    const actions = await import('../app/dashboard/settings/actions')
    h.session = ownerOf(OSSUR, session.client)
    expect(await actions.updateTrackingConfig(idle, form(rivals))).toEqual({ ok: true, message: 'Settings saved.' })
    const updates = admin.writes.filter((w) => w.table === 'tracking_configs' && w.op === 'update')
    expect(updates.length).toBeGreaterThan(0)
    expect(updates[0].payload).toMatchObject({ competitor_names: ['Ottobock', 'Fillauer'] })
    expect(cadenceColumns([...admin.writes, ...session.writes])).toEqual([])
  })

  it('lets a page opened before the change save, when it posts the stored day back', async () => {
    const actions = await import('../app/dashboard/settings/actions')
    h.session = ownerOf(OSSUR, session.client)
    const stale = form({ ...terms, ...rivals, report_day: 'sunday' })
    expect((await actions.saveTracking(idle, stale)).ok).toBe(true)
    expect(cadenceColumns([...admin.writes, ...session.writes])).toEqual([])
  })

  it('refuses a new day or an unpause before anything is written, the terms included', async () => {
    const actions = await import('../app/dashboard/settings/actions')
    h.session = ownerOf(OSSUR, session.client)
    const moves: Record<string, string>[] = [{ report_day: 'monday' }, { report_period: 'weekly', report_day: 'sunday' }, { report_period: 'monthly' }]
    for (const cadence of moves) {
      expect(await actions.saveTracking(idle, form({ ...terms, ...rivals, ...cadence }))).toEqual({ ok: false, message: CADENCE_REFUSAL })
      expect(await actions.updateTrackingConfig(idle, form({ ...rivals, ...cadence }))).toEqual({ ok: false, message: CADENCE_REFUSAL })
    }
    expect([...admin.writes, ...session.writes]).toEqual([])
  })

  it('refuses the operator too: the pause moves only through the operator’s CLI', async () => {
    const actions = await import('../app/dashboard/settings/actions')
    h.session = operatorIn(SEALAND, session.client)
    expect(await actions.updateTrackingConfig(idle, form({ ...rivals, report_period: 'weekly' }))).toEqual({ ok: false, message: CADENCE_REFUSAL })
    expect([...admin.writes, ...session.writes]).toEqual([])
  })
})

// ---- The sweep: no server action writes the cadence -------------------------------

const ROOT = join(__dirname, '..')
function files(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...files(p))
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

describe('no server action writes report_period or report_day', () => {
  it('holds across every “use server” module', () => {
    const modules = ['app', 'lib'].flatMap((d) => files(join(ROOT, d)))
      .filter((f) => /^\s*['"]use server['"]/.test(readFileSync(f, 'utf8')))
    expect(modules.length).toBeGreaterThan(10)
    // A property written in an object literal: `report_period:` / `report_day:`.
    const writes = modules.filter((f) => /\breport_(?:period|day)\s*:/.test(readFileSync(f, 'utf8'))).map((f) => relative(ROOT, f))
    expect(writes).toEqual([])
  })
})
