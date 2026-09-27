import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { assertTenantMay, CADENCE_HELD, TENANT_LOCK_REFUSAL, TENANT_LOCKS, tenantLocked } from './tenant-locks'
import { CADENCE_REFUSAL } from './update-rhythm'
import { queuedMessage } from './settings/queue'

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
    // From deploy 5 a tracking "not now" also says the edit may be queued
    // (WP3.10); the message stays the refusal for what the queue does not take.
    expect(assertTenantMay({ operator: null }, SEALAND, 'tracking')).toEqual({
      ok: false,
      message: 'Searches are held still until January so October and November can be compared; tell us and we will note it for then.',
      queue: true,
    })
  })

  it('lets the platform operator through, and an unlocked tenant', () => {
    const operator = { homeClientId: OSSUR, viewingClientId: SEALAND, viewingName: 'Sealand', isHome: false }
    expect(assertTenantMay({ operator }, SEALAND, 'sends')).toEqual({ ok: true })
    expect(assertTenantMay({ operator }, SEALAND, 'tracking')).toEqual({ ok: true })
    expect(assertTenantMay({ operator: null }, OSSUR, 'tracking')).toEqual({ ok: true })
  })

  it('refusals are calibrated copy: no em dash, no digit', () => {
    for (const m of [...Object.values(TENANT_LOCK_REFUSAL), CADENCE_HELD]) {
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
    'adds the joining member to the default schedule’s list and never sets `active`; a default it has to create is born switched off for a locked tenant, and a list that is on for a locked tenant is left alone (lib/schedules/default.ts)',
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
 *  declaration: a `function` declaration, or a `const`/`let` bound to an arrow
 *  or a function expression (`export const save = async (…) => …`), which is a
 *  server action just the same. */
function topLevelFunctions(text: string): { name: string; body: string }[] {
  const lines = text.split('\n')
  const starts: { name: string | null; at: number }[] = []
  lines.forEach((line, i) => {
    const fn = line.match(/^(?:export\s+)?(?:async\s+)?function\s*\*?\s*(\w+)/)
      ?? line.match(/^(?:export\s+)?(?:const|let)\s+(\w+)\b.*?=\s*(?:async\s+)?(?:function\b|\(|\w+\s*=>)/)
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
  // An arrow-function export is a server action too; a scan that saw only
  // `function` declarations would skip one silently.
  it('sees an action however it is declared', () => {
    const text = [
      "'use server'",
      'export async function a() {}',
      'export const b = async (x: string) => x',
      'export const c: (x: string) => Promise<void> = async (x) => {}',
      'const d = async function () {}',
      'export const e = async x => x',
      'export const LIMIT = 3',
      'type T = string',
    ].join('\n')
    expect(topLevelFunctions(text).map((f) => f.name)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(topLevelFunctions(text).find((f) => f.name === 'e')?.body).not.toContain('LIMIT')
  })

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

  // AND EVERY ROUTE HANDLER (deploy 1 review): a route that sends, or writes a
  // schedule or a tracking column, on a tenant's session must call the lock;
  // an admin-key route is the operator's or the scheduler's, never a tenant's.
  it('every route handler that sends or writes the locked columns calls it, or is the operator’s', () => {
    const SENDS = [...WRITES, /\b(?:runSchedule|deliverSend)\(/]
    const ROUTE_EXEMPT: Readonly<Record<string, string>> = {
      'app/api/schedules/[id]/preview/route.ts#GET': 'builds the email as a preview (`mode: \'preview\'`): no send, no rows',
    }
    const routes = files(join(ROOT, 'app/api')).filter((f) => /\/route\.tsx?$/.test(f))
    const senders = routes.flatMap((f) => {
      const rel = relative(ROOT, f)
      const text = readFileSync(f, 'utf8')
      const operatorOnly = /\badminKeyValid\(/.test(text)
      return topLevelFunctions(text)
        .filter((fn) => SENDS.some((re) => re.test(fn.body)))
        .map((fn) => ({ key: `${rel}#${fn.name}`, operatorOnly, guarded: fn.body.includes('assertTenantMay(') }))
    })
    // It finds what it is checking: the tenant's send route, and the operator's.
    expect(senders.map((x) => x.key)).toContain('app/api/schedules/[id]/send/route.ts#POST')
    expect(senders.some((x) => x.operatorOnly)).toBe(true)
    expect(senders.filter((x) => !x.operatorOnly && !x.guarded && !(x.key in ROUTE_EXEMPT)).map((x) => x.key)).toEqual([])
    for (const key of Object.keys(ROUTE_EXEMPT)) expect(senders.map((x) => x.key), key).toContain(key)
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
  sent: [] as string[],
}))

vi.mock('@/lib/auth', async () => {
  const roles = await import('@/lib/roles')
  return { ROLES: roles.ROLES, canManageTenant: roles.canManageTenant, getSessionContext: async () => h.session, getRouteSession: async () => h.session }
})
// The send route's two senders, recorded rather than run (deploy 1 review):
// the lock must refuse before either is reached.
vi.mock('@/lib/schedules/run', () => ({
  runSchedule: async (args: { mode: string }) => {
    h.sent.push(`run:${args.mode}`)
    return { status: 'sent', subject: 's', shareUrl: null, notified: 0, ms: 1, error: null }
  },
}))
vi.mock('@/lib/schedules/deliver', () => ({
  deliverSend: async () => {
    h.sent.push('deliver')
    return { status: 'sent', subject: 's', ms: 1, error: null }
  },
}))
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
  h.sent = []
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
  const month = '2027-01-01'
  const queued = { ok: true, message: queuedMessage(month), queued: month }
  const queueWrites = () => admin.writes.filter((w) => w.table === 'tracking_config_queue')

  // WP3.10: the queue replaces the deploy-1 refusal for terms and rivals.
  it('queues a tenant edit of terms and rivals for 1 Jan 2027, on the admin client, and writes no tracking_configs row', async () => {
    const actions = await import('../app/dashboard/settings/actions')
    h.session = tenantAdmin(SEALAND, session.client)
    expect(await actions.updateSearchTerms({ ok: false, message: '' }, terms())).toEqual(queued)
    expect(await actions.updateTrackingConfig({ ok: false, message: '' }, form({ competitor_names: ['Cotopaxi', 'Topo Designs'] }))).toEqual(queued)
    expect(queueWrites().map((w) => w.op)).toEqual(['insert', 'insert'])
    expect([...admin.writes, ...session.writes].filter((w) => w.table === 'tracking_configs')).toEqual([])
    expect(session.writes).toEqual([])
  })

  it('still refuses a community edit, a rival rename and a cadence change, and writes nothing', async () => {
    const actions = await import('../app/dashboard/settings/actions')
    const { renameTrackedRival } = await import('../app/dashboard/settings/rivals-actions')
    h.session = tenantAdmin(SEALAND, session.client)
    const refused = { ok: false, message: TENANT_LOCK_REFUSAL.tracking }
    expect(await actions.updateCommunity({ ok: false, message: '' }, form({ op: 'add', name: 'onebag' }))).toEqual(refused)
    expect(await renameTrackedRival({ ok: false, message: '' }, form({ id: '5d3b4c1e-2f60-4a8b-9c7d-0e1f2a3b4c5d', name: 'Topo' }))).toEqual(refused)
    // A cadence change is not a setting at all since 27 Sep (deploy 2b): it
    // is refused for every workspace, before anything is written.
    expect(await actions.updateTrackingConfig({ ok: false, message: '' }, form({ competitor_names: [], report_period: 'weekly', report_day: 'sunday' })))
      .toEqual({ ok: false, message: CADENCE_REFUSAL })
    expect(admin.writes).toEqual([])
    expect(session.writes).toEqual([])
  })

  it('says what the one save did: the terms queued, and the month', async () => {
    const actions = await import('../app/dashboard/settings/actions')
    h.session = tenantAdmin(SEALAND, session.client)
    const save = form({ brand_keywords: 'sealand gear', competitor_keywords: 'cotopaxi', industry_keywords: 'upcycled bag', exclude_terms: [] })
    expect(await actions.saveTracking({ ok: false, message: '' }, save)).toEqual(queued)
  })

  it('accepts the operator', async () => {
    const actions = await import('../app/dashboard/settings/actions')
    h.session = operatorIn(SEALAND, session.client)
    expect((await actions.updateSearchTerms({ ok: false, message: '' }, terms())).ok).toBe(true)
    expect((await actions.updateCommunity({ ok: false, message: '' }, form({ op: 'add', name: 'onebag' }))).ok).toBe(true)
    expect([...admin.writes, ...session.writes].some((w) => w.table === 'tracking_configs')).toBe(true)
    expect(queueWrites()).toEqual([])
  })

  it('leaves a tenant that is not locked alone', async () => {
    const actions = await import('../app/dashboard/settings/actions')
    h.session = tenantAdmin(OSSUR, session.client)
    expect((await actions.updateSearchTerms({ ok: false, message: '' }, terms())).ok).toBe(true)
    expect(queueWrites()).toEqual([])
  })
})

// ---- R12 (deploy-1 review): the tracking writes go out on the admin client ----
//
// The R12 file (20260928091000_market_first_r12_grants.sql, applied once
// deploy 2 is live) revokes `authenticated`'s column UPDATE on the search-set
// and sending columns, so a tenant's session token cannot PATCH them around
// the lock. MF1 leaves them alone: deploy 1's code still saves through them.
// The three actions that wrote them through the session client now write through
// the admin client, AFTER their role and lock checks: an operator's and an
// unlocked tenant admin's saves still land, a locked tenant's never reach
// either client, and no tracking_configs write is left on a session client.

describe('R12: the three tracking writes use the admin client, after the checks', () => {
  const terms = () => form({ brand_keywords: 'sealand gear', competitor_keywords: 'cotopaxi', industry_keywords: 'upcycled bag', exclude_terms: ['poker'] })
  const cadence = () => form({ competitor_names: ['Cotopaxi', 'Topo Designs'], report_period: 'weekly', report_day: 'sunday' })
  // The rival list alone: since 27 Sep the cadence is not a setting, and a POST
  // that moves it is refused (deploy 2b, lib/update-rhythm.ts).
  const rivals = () => form({ competitor_names: ['Cotopaxi', 'Topo Designs'] })
  const trackingWrites = (w: Write[]) => w.filter((x) => x.table === 'tracking_configs')

  for (const [who, make] of [
    ['the operator on Sealand', () => operatorIn(SEALAND, session.client)],
    ['an admin of an unlocked tenant', () => tenantAdmin(OSSUR, session.client)],
  ] as const) {
    it(`writes for ${who}, on the admin client only`, async () => {
      const actions = await import('../app/dashboard/settings/actions')
      h.session = make()
      expect(await actions.updateTrackingConfig({ ok: false, message: '' }, rivals())).toEqual({ ok: true, message: 'Settings saved.' })
      expect((await actions.updateSearchTerms({ ok: false, message: '' }, terms())).ok).toBe(true)
      expect((await actions.updateCommunity({ ok: false, message: '' }, form({ op: 'add', name: 'onebag' }))).ok).toBe(true)
      // updateTrackingConfig: its update; updateSearchTerms: terms, then
      // exclusions; updateCommunity: the communities.
      expect(trackingWrites(admin.writes).filter((w) => w.op === 'update').length).toBeGreaterThanOrEqual(4)
      expect(trackingWrites(session.writes)).toEqual([])
    })
  }

  it('never writes tracking_configs for a locked tenant: the cadence and a community refused, the terms queued', async () => {
    const actions = await import('../app/dashboard/settings/actions')
    h.session = tenantAdmin(SEALAND, session.client)
    expect(await actions.updateTrackingConfig({ ok: false, message: '' }, cadence())).toEqual({ ok: false, message: CADENCE_REFUSAL })
    expect((await actions.updateSearchTerms({ ok: false, message: '' }, terms())).queued).toBe('2027-01-01')
    expect(await actions.updateCommunity({ ok: false, message: '' }, form({ op: 'stop', name: 'onebag' }))).toEqual({ ok: false, message: TENANT_LOCK_REFUSAL.tracking })
    expect(trackingWrites([...admin.writes, ...session.writes])).toEqual([])
    expect(admin.writes).toEqual([{ table: 'tracking_config_queue', op: 'insert' }])
    expect(session.writes).toEqual([])
  })

  it('refuses a tenant member without a manager role before either client is written', async () => {
    const actions = await import('../app/dashboard/settings/actions')
    h.session = { ...tenantAdmin(OSSUR, session.client), role: 'member' }
    expect((await actions.updateTrackingConfig({ ok: false, message: '' }, rivals())).ok).toBe(false)
    expect((await actions.updateSearchTerms({ ok: false, message: '' }, terms())).ok).toBe(false)
    expect((await actions.updateCommunity({ ok: false, message: '' }, form({ op: 'add', name: 'onebag' }))).ok).toBe(false)
    expect([...admin.writes, ...session.writes]).toEqual([])
  })

  // The SQL without its comments: the R12 file's header names the grant that
  // would undo it, and a comment grants nothing.
  const sqlOf = (file: string) => readFileSync(join(ROOT, 'supabase/migrations', file), 'utf8').replace(/--[^\n]*/g, '')

  it('the R12 file revokes exactly the search-set and sending columns from authenticated, and grants none back', () => {
    const r12 = sqlOf('20260928091000_market_first_r12_grants.sql')
    const revoked = r12.match(/revoke update \(([^)]*)\)\s+on public\.tracking_configs from authenticated;/)?.[1]
    expect(revoked, 'the R12 revoke is no longer where this test looks for it').toBeTruthy()
    expect(revoked!.split(',').map((c) => c.trim()).sort()).toEqual([
      'brand_keywords', 'competitor_keywords', 'competitor_names', 'exclude_terms', 'industry_keywords',
      'report_day', 'report_period', 'subreddits',
    ])
    expect(r12).not.toMatch(/grant update[^;]*on public\.tracking_configs/i)
    // The runtime proof is on the throwaway cluster (has_column_privilege, and a
    // tenant owner's session refused): scripts/pg-shim/r12-checks.sql.
  })

  it('MF1 changes no tracking_configs grant: deploy 1 still saves through them after it (rollback rule 3)', () => {
    const mf1 = sqlOf('20260928090000_market_first_s1.sql')
    expect(mf1).not.toMatch(/(revoke|grant)[^;]*on public\.tracking_configs/i)
    // At runtime: scripts/pg-shim/mf1-checks.sql, sections 1 and 7.
  })

  it('no server action writes tracking_configs through a session client', () => {
    // The session client is `supabase` (SessionContext) in every action; the
    // admin client is `createAdminClient()` or a local bound to it.
    const onSession = /\bsupabase\s*\.from\(\s*['"]tracking_configs['"]\s*\)\s*\.(?:update|insert|upsert)\(/
    const offenders = serverActionModules
      .filter((f) => onSession.test(readFileSync(f, 'utf8')))
      .map((f) => relative(ROOT, f))
    expect(offenders).toEqual([])
  })
})

// ---- The send-now route, run (deploy 1 review) ----------------------------------
//
// The string match above proves the call is in the file; these prove it runs
// first: a Sealand admin's "now" and "deliver" are refused before any sender is
// reached, a test to the caller's own address and the operator go through.

describe('POST /api/schedules/[id]/send under the lock', () => {
  const SCHEDULE = '451aa647-0000-4000-8000-000000000000'
  const SEND = '00000000-0000-4000-8000-000000000001'
  const post = async (body: Record<string, unknown>) => {
    const { POST } = await import('../app/api/schedules/[id]/send/route')
    const res = await POST(new Request('https://app.example/api', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ id: SCHEDULE }) })
    return { status: res.status, json: (await res.json()) as Record<string, unknown> }
  }
  const routeSession = (s: Record<string, unknown>) => ({ ...s, email: 'admin@tenant.example' })

  it('refuses a Sealand admin’s send now and deliver, before any sender', async () => {
    h.session = routeSession(tenantAdmin(SEALAND, session.client))
    for (const body of [{ mode: 'now' }, { mode: 'deliver', sendId: SEND }]) {
      const r = await post(body)
      expect(r.status).toBe(403)
      expect(r.json.error).toBe(TENANT_LOCK_REFUSAL.sends)
    }
    expect(h.sent).toEqual([])
  })

  it('lets a Sealand admin send a test to their own address', async () => {
    h.admin = fakeClient({ report_schedules: { id: SCHEDULE, client_id: SEALAND, recipients: ['daniela@sealand.example'] }, pipeline_runs: { id: 'run-1' } }).client
    h.session = routeSession(tenantAdmin(SEALAND, session.client))
    const r = await post({ mode: 'test' })
    expect(r.status).toBe(200)
    expect(h.sent).toEqual(['run:test'])
  })

  it('lets the operator send now', async () => {
    h.admin = fakeClient({ report_schedules: { id: SCHEDULE, client_id: SEALAND, recipients: ['daniela@sealand.example'] }, pipeline_runs: { id: 'run-1' } }).client
    h.session = routeSession(operatorIn(SEALAND, session.client))
    const r = await post({ mode: 'now' })
    expect(r.status).toBe(200)
    expect(h.sent).toEqual(['run:send'])
  })
})

// ---- An invite does not grow a list that is sending (deploy 1 review) -----------

describe('joinDefaultSchedule under the lock', () => {
  const defaultRow = (active: boolean) => ({ id: 's-1', client_id: SEALAND, name: 'Weekly digest', recipients: ['daniela@sealand.example'], active, is_default: true })

  it('adds no one to a locked tenant’s list while it is on', async () => {
    const { joinDefaultSchedule } = await import('./schedules/default')
    const fake = fakeClient({ report_schedules: defaultRow(true) })
    expect(await joinDefaultSchedule(fake.client as never, SEALAND, 'new@sealand.example')).toBe(false)
    expect(fake.writes).toEqual([])
  })

  it('still adds the member to a list that is off, which sends nothing', async () => {
    const { joinDefaultSchedule } = await import('./schedules/default')
    const fake = fakeClient({ report_schedules: defaultRow(false) })
    expect(await joinDefaultSchedule(fake.client as never, SEALAND, 'new@sealand.example')).toBe(true)
    expect(fake.writes.some((w) => w.table === 'report_schedules' && w.op === 'update')).toBe(true)
  })
})
