import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { assertTenantMay, TENANT_LOCK_REFUSAL, TENANT_LOCKS, tenantLocked } from './tenant-locks'

// The tenant lock (market-first decisions I and J, plan WP1.2): Sealand cannot
// switch sending on or change what we track; the platform operator can.

const SEALAND = 'ac16988e-c4f3-4baf-b388-73895852a554'
const OSSUR = 'e52cac94-30e1-426a-9a36-31b11e0b30b6'

// ---- The rule --------------------------------------------------------------------

describe('assertTenantMay', () => {
  it('locks Sealand for sends and tracking, with no expiry, and no one else', () => {
    expect(TENANT_LOCKS).toEqual({ [SEALAND]: { sends: true, tracking: true } })
    expect(tenantLocked(SEALAND, 'sends')).toBe(true)
    expect(tenantLocked(SEALAND, 'tracking')).toBe(true)
    expect(tenantLocked(OSSUR, 'sends')).toBe(false)
    expect(tenantLocked(OSSUR, 'tracking')).toBe(false)
  })

  it('refuses a tenant’s own user in the plan’s words', () => {
    expect(assertTenantMay({ operator: null }, SEALAND, 'sends'))
      .toEqual({ ok: false, message: 'Sending is switched on by Verbatim during your trial.' })
    expect(assertTenantMay({ operator: null }, SEALAND, 'tracking')).toEqual({
      ok: false,
      message: 'Searches are held still until January so October and November can be compared; tell us and we will note it for then.',
    })
  })

  it('lets the platform operator through, and an unlocked tenant', () => {
    const operator = { homeClientId: OSSUR, viewingClientId: SEALAND, viewingName: 'Sealand', isHome: false }
    expect(assertTenantMay({ operator }, SEALAND, 'sends')).toEqual({ ok: true })
    expect(assertTenantMay({ operator }, SEALAND, 'tracking')).toEqual({ ok: true })
    expect(assertTenantMay({ operator: null }, OSSUR, 'tracking')).toEqual({ ok: true })
  })

  it('refusals are calibrated copy: no em dash, no digit', () => {
    for (const m of Object.values(TENANT_LOCK_REFUSAL)) {
      expect(m).not.toContain('—')
      expect(m).not.toMatch(/\d/)
    }
  })
})

// ---- The sweep: every writer calls it ----------------------------------------------
//
// Every server action ('use server' module) that writes `report_schedules`
// (whose `active` switches sending on) or a `tracking_configs` column, directly
// or through the rival and default-schedule writers, must call
// `assertTenantMay`, or be listed below with the reason it cannot reach a
// locked tenant's switch.

const ROOT = join(__dirname, '..')

const WRITES: readonly RegExp[] = [
  /\.from\(\s*['"]tracking_configs['"]\s*\)\s*\.(?:update|insert|upsert)\(/,
  /\.from\(\s*['"]report_schedules['"]\s*\)\s*\.(?:update|insert|upsert)\(/,
  /\b(?:renameRival|retireRival|ensureRivals|joinDefaultSchedule|ensureDefaultSchedule)\(/,
]

const EXEMPT: Readonly<Record<string, string>> = {
  'app/onboarding/actions.ts#createWorkspace':
    'creates a new workspace: its client id is minted in this action, so it is never a locked tenant',
  'app/invite/[token]/actions.ts#addToReportRecipients':
    'adds the joining member to the default schedule’s list and never sets `active`; a default it has to create is born switched off for a locked tenant (lib/schedules/default.ts)',
}

/** The writers the lock is known to guard. The sweep must FIND them, so a scan
 *  that silently matched nothing cannot pass. */
const GUARDED = [
  'app/dashboard/settings/reports/actions.ts#updateArtefactRecipients',
  'app/dashboard/studio/actions.ts#saveSchedule',
  'app/dashboard/settings/actions.ts#updateTrackingConfig',
  'app/dashboard/settings/actions.ts#updateSearchTerms',
  'app/dashboard/settings/actions.ts#updateCommunity',
  'app/dashboard/settings/rivals-actions.ts#renameTrackedRival',
]

function files(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...files(p))
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

/** Each top-level function of a module and its text, up to the next top-level
 *  declaration. */
function topLevelFunctions(text: string): { name: string; body: string }[] {
  const lines = text.split('\n')
  const starts: { name: string | null; at: number }[] = []
  lines.forEach((line, i) => {
    const fn = line.match(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)/)
    if (fn) starts.push({ name: fn[1], at: i })
    else if (/^(?:export\s+)?(?:const|let|interface|type|class)\s/.test(line)) starts.push({ name: null, at: i })
  })
  return starts.flatMap((s, i) =>
    s.name ? [{ name: s.name, body: lines.slice(s.at, starts[i + 1]?.at ?? lines.length).join('\n') }] : [])
}

const serverActionModules = ['app', 'lib']
  .flatMap((d) => files(join(ROOT, d)))
  .filter((f) => /^\s*['"]use server['"]/.test(readFileSync(f, 'utf8')))

const writers = serverActionModules.flatMap((f) => {
  const rel = relative(ROOT, f)
  return topLevelFunctions(readFileSync(f, 'utf8'))
    .filter((fn) => WRITES.some((re) => re.test(fn.body)))
    .map((fn) => ({ key: `${rel}#${fn.name}`, guarded: fn.body.includes('assertTenantMay(') }))
})

describe('the sweep: every server action that can switch sending on or change tracking calls the lock', () => {
  it('finds the server actions it is checking', () => {
    expect(serverActionModules.length).toBeGreaterThan(10)
    for (const key of GUARDED) expect(writers.map((w) => w.key), key).toContain(key)
  })

  it('every writer calls assertTenantMay, or is exempt with its reason', () => {
    const unguarded = writers.filter((w) => !w.guarded && !(w.key in EXEMPT)).map((w) => w.key)
    expect(unguarded).toEqual([])
  })

  it('every exemption still names a writer, so the list cannot go stale', () => {
    for (const key of Object.keys(EXEMPT)) expect(writers.map((w) => w.key), key).toContain(key)
  })

  it('the send-now route checks it too: a send by hand is sending', () => {
    const route = readFileSync(join(ROOT, 'app/api/schedules/[id]/send/route.ts'), 'utf8')
    expect(route).toContain("assertTenantMay(session, session.clientId, 'sends')")
  })

  it('a default schedule is born switched off for a locked tenant', () => {
    const src = readFileSync(join(ROOT, 'lib/schedules/default.ts'), 'utf8')
    expect(src).toContain("active: !tenantLocked(clientId, 'sends')")
  })
})

// ---- The actions themselves ---------------------------------------------------------
//
// The real server actions, with the session and the database faked: the lock
// must refuse BEFORE anything is written, and let the operator write.

const h = vi.hoisted(() => ({
  session: null as null | Record<string, unknown>,
  admin: null as unknown,
}))

vi.mock('@/lib/auth', async () => {
  const roles = await import('@/lib/roles')
  return { ROLES: roles.ROLES, canManageTenant: roles.canManageTenant, getSessionContext: async () => h.session }
})
vi.mock('@/lib/supabase-admin', async (orig) => ({
  ...(await orig<typeof import('@/lib/supabase-admin')>()),
  createAdminClient: () => h.admin,
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('next/navigation', () => ({ redirect: () => {}, notFound: () => {} }))

interface Write { table: string | null; op: string }

/** A chainable stand-in for a Supabase client: every call returns the chain,
 *  awaiting it answers the table's canned read (or an empty success), and every
 *  write is recorded. */
function fakeClient(reads: Record<string, unknown> = {}): { client: unknown; writes: Write[] } {
  const writes: Write[] = []
  const chain = (table: string | null): unknown => {
    let op: string | null = null
    const proxy: unknown = new Proxy(() => {}, {
      get(_t, prop) {
        if (prop === 'then') {
          const data = op ? (op === 'insert' ? { id: 'new-id' } : null) : table ? reads[table] ?? null : null
          return (resolve: (v: unknown) => void) => resolve({ data, error: null, count: 1 })
        }
        return (...args: unknown[]) => {
          const p = String(prop)
          if (p === 'from') return chain(String(args[0]))
          if (p === 'rpc') return chain(`rpc:${String(args[0])}`)
          if (p === 'update' || p === 'insert' || p === 'upsert' || p === 'delete') {
            op = p
            writes.push({ table, op: p })
          }
          return proxy
        }
      },
    })
    return proxy
  }
  return { client: chain(null), writes }
}

const tenantAdmin = (clientId: string, supabase: unknown) =>
  ({ supabase, userId: 'u-1', email: 'admin@tenant.example', clientId, role: 'admin', operator: null })
const operatorIn = (clientId: string, supabase: unknown) => ({
  supabase, userId: 'u-op', email: 'operator@verbatim.example', clientId, role: 'owner',
  operator: { homeClientId: OSSUR, viewingClientId: clientId, viewingName: 'Sealand', isHome: false },
})

const form = (fields: Record<string, string | string[]>): FormData => {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) for (const one of Array.isArray(v) ? v : [v]) f.append(k, one)
  return f
}

let admin: ReturnType<typeof fakeClient>
let session: ReturnType<typeof fakeClient>

beforeEach(() => {
  admin = fakeClient()
  session = fakeClient({ tracking_configs: { subreddits: [], report_period: 'weekly', competitor_names: [], competitor_keywords: [] } })
  h.admin = admin.client
})

describe('Settings › Reports and recipients', () => {
  const recipients = () => form({ artefact: 'weekly', recipients: 'daniela@sealand.example', active: 'on' })

  it('refuses a tenant admin switching a schedule on, and writes nothing', async () => {
    const { updateArtefactRecipients } = await import('../app/dashboard/settings/reports/actions')
    h.session = tenantAdmin(SEALAND, session.client)
    expect(await updateArtefactRecipients({ ok: false, message: '' }, recipients()))
      .toEqual({ ok: false, message: TENANT_LOCK_REFUSAL.sends })
    expect(admin.writes).toEqual([])
  })

  it('lets a tenant admin keep a list switched off', async () => {
    const { updateArtefactRecipients } = await import('../app/dashboard/settings/reports/actions')
    h.session = tenantAdmin(SEALAND, session.client)
    const off = form({ artefact: 'weekly', recipients: 'daniela@sealand.example' })
    expect((await updateArtefactRecipients({ ok: false, message: '' }, off)).ok).toBe(true)
    expect(admin.writes.some((w) => w.table === 'report_schedules')).toBe(true)
  })

  it('accepts the operator', async () => {
    const { updateArtefactRecipients } = await import('../app/dashboard/settings/reports/actions')
    h.session = operatorIn(SEALAND, session.client)
    expect((await updateArtefactRecipients({ ok: false, message: '' }, recipients())).ok).toBe(true)
    expect(admin.writes.some((w) => w.table === 'report_schedules')).toBe(true)
  })
})

describe('the Studio’s sendings', () => {
  const input = (active: boolean) => ({
    name: 'Weekly report', starterKey: 'weekly_report', reportId: null, cadence: 'every_update' as const,
    recipients: ['daniela@sealand.example'], attachPdf: true, shareDays: 30 as const, active, review: false,
  })

  it('refuses a tenant admin saving a sending switched on (new, or toggled on), and writes nothing', async () => {
    const { saveSchedule } = await import('../app/dashboard/studio/actions')
    h.session = tenantAdmin(SEALAND, session.client)
    expect(await saveSchedule({ input: input(true) })).toEqual({ ok: false, message: TENANT_LOCK_REFUSAL.sends })
    expect(await saveSchedule({ id: '5d3b4c1e-2f60-4a8b-9c7d-0e1f2a3b4c5d', input: input(true) }))
      .toEqual({ ok: false, message: TENANT_LOCK_REFUSAL.sends })
    expect(admin.writes).toEqual([])
  })

  it('accepts the operator', async () => {
    const { saveSchedule } = await import('../app/dashboard/studio/actions')
    h.session = operatorIn(SEALAND, session.client)
    expect((await saveSchedule({ input: input(true) })).ok).toBe(true)
    expect(admin.writes.some((w) => w.table === 'report_schedules' && w.op === 'insert')).toBe(true)
  })
})

describe('Settings › Tracking: terms, communities and rivals', () => {
  const terms = () => form({ brand_keywords: 'sealand gear', competitor_keywords: 'cotopaxi', industry_keywords: 'upcycled bag', exclude_terms: [] })

  it('refuses a tenant edit of terms, communities, rivals and a rival rename, and writes nothing', async () => {
    const actions = await import('../app/dashboard/settings/actions')
    const { renameTrackedRival } = await import('../app/dashboard/settings/rivals-actions')
    h.session = tenantAdmin(SEALAND, session.client)
    const refused = { ok: false, message: TENANT_LOCK_REFUSAL.tracking }
    expect(await actions.updateSearchTerms({ ok: false, message: '' }, terms())).toEqual(refused)
    expect(await actions.updateCommunity({ ok: false, message: '' }, form({ op: 'add', name: 'onebag' }))).toEqual(refused)
    expect(await actions.updateTrackingConfig({ ok: false, message: '' }, form({ competitor_names: ['Cotopaxi', 'Topo Designs'], report_period: 'weekly', report_day: 'sunday' }))).toEqual(refused)
    expect(await actions.saveTracking({ ok: false, message: '' }, terms())).toEqual(refused)
    expect(await renameTrackedRival({ ok: false, message: '' }, form({ id: '5d3b4c1e-2f60-4a8b-9c7d-0e1f2a3b4c5d', name: 'Topo' }))).toEqual(refused)
    expect(admin.writes).toEqual([])
    expect(session.writes).toEqual([])
  })

  it('accepts the operator', async () => {
    const actions = await import('../app/dashboard/settings/actions')
    h.session = operatorIn(SEALAND, session.client)
    expect((await actions.updateSearchTerms({ ok: false, message: '' }, terms())).ok).toBe(true)
    expect((await actions.updateCommunity({ ok: false, message: '' }, form({ op: 'add', name: 'onebag' }))).ok).toBe(true)
    expect([...admin.writes, ...session.writes].some((w) => w.table === 'tracking_configs')).toBe(true)
  })

  it('leaves a tenant that is not locked alone', async () => {
    const actions = await import('../app/dashboard/settings/actions')
    h.session = tenantAdmin(OSSUR, session.client)
    expect((await actions.updateSearchTerms({ ok: false, message: '' }, terms())).ok).toBe(true)
  })
})
