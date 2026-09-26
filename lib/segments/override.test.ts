import type { SupabaseClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { OSSUR_CLIENT_ID, SEALAND_CLIENT_ID } from '../config'
import { scriptActor, type ConfigActor } from '../config-log'
import {
  NOT_MY_MARKET_COPY, NOT_MY_MARKET_NOTE, SEGMENT_OVERRIDE_VERSION, isMissingVideoSegments, writeNotMyMarket,
} from './override'
import { readerSegment, type StoredSegment } from './rules'

// "This is not my market": a video_segments override row, logged on surface
// 'segment' with the person as actor, refused for a video outside the tenant.
// Offline: the admin client is a small in-memory fake that answers the three
// reads and records the two inserts.

const SEALAND_VIDEO = '00000000-0000-4000-8000-0000000000b1'
const OSSUR_VIDEO = '00000000-0000-4000-8000-0000000000e1'

interface State {
  videos: { id: string; client_id: string }[]
  segments: (StoredSegment & { client_id: string; video_id: string; reason?: string | null; actor_label?: string })[]
  changes: Record<string, unknown>[]
  missingSegments?: boolean
  failRead?: boolean
}

const missingTable = { code: 'PGRST205', message: "Could not find the table 'public.video_segments' in the schema cache" }

function fakeAdmin(state: State): SupabaseClient {
  let clock = Date.parse('2026-11-23T09:00:00Z')
  const from = (table: string) => {
    const filters: Record<string, unknown> = {}
    const rows = (): unknown[] => {
      const match = (r: Record<string, unknown>) => Object.entries(filters).every(([k, v]) => r[k] === v)
      if (table === 'videos') return state.videos.filter(match)
      if (table === 'video_segments') return state.segments.filter((r) => match(r as unknown as Record<string, unknown>))
      return []
    }
    const builder = {
      select: () => builder,
      eq: (col: string, val: unknown) => { filters[col] = val; return builder },
      order: () => builder,
      limit: () => builder,
      insert: (row: Record<string, unknown> | Record<string, unknown>[]) => {
        if (table === 'video_segments') {
          if (state.missingSegments) return Promise.resolve({ error: missingTable })
          clock += 60_000
          state.segments.push({ ...(row as never), decided_at: new Date(clock).toISOString() })
        }
        if (table === 'config_changes') state.changes.push(...(Array.isArray(row) ? row : [row]))
        return Promise.resolve({ error: null })
      },
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
        const out = table === 'video_segments' && state.missingSegments ? { data: null, error: missingTable }
          : state.failRead ? { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } }
            : { data: rows(), error: null }
        return Promise.resolve(out).then(resolve, reject)
      },
    }
    return builder
  }
  return { from } as unknown as SupabaseClient
}

const person: ConfigActor = { kind: 'user', user_id: '5a1e0000-0000-4000-8000-000000000001', label: 'owner@sealand · this is not my market', at: '2026-11-23T09:00:00.000Z', nonce: 'n1' }

const sealandState = (): State => ({
  videos: [{ id: SEALAND_VIDEO, client_id: SEALAND_CLIENT_ID }, { id: OSSUR_VIDEO, client_id: OSSUR_CLIENT_ID }],
  // WP1.4's segments_v1 rule row, then the Nov judge's segments_v2 row.
  segments: [
    { client_id: SEALAND_CLIENT_ID, video_id: SEALAND_VIDEO, rule_version: 'segments_v1', segment: 'market', method: 'rule', decided_at: '2026-09-30T10:00:00Z' },
    { client_id: SEALAND_CLIENT_ID, video_id: SEALAND_VIDEO, rule_version: 'segments_v2', segment: 'market', method: 'judge', decided_at: '2026-11-10T09:00:00Z' },
  ],
  changes: [],
})

describe('writeNotMyMarket', () => {
  it('writes an override row marking the video off-topic, and the newest override now decides it', async () => {
    const state = sealandState()
    const r = await writeNotMyMarket(fakeAdmin(state), { clientId: SEALAND_CLIENT_ID, videoId: SEALAND_VIDEO, from: 'quote', actor: person })
    expect(r).toEqual({ outcome: 'written', logged: true })
    const row = state.segments.at(-1)!
    expect(row).toMatchObject({
      client_id: SEALAND_CLIENT_ID, video_id: SEALAND_VIDEO, rule_version: SEGMENT_OVERRIDE_VERSION, segment: 'noise', method: 'override',
      reason: 'not_my_market:quote', actor_label: 'owner@sealand · this is not my market',
    })
    expect(readerSegment(state.segments)).toMatchObject({ method: 'override', segment: 'noise' })
  })

  it('logs it on surface segment, with the person as actor and the reading it replaced', async () => {
    const state = sealandState()
    await writeNotMyMarket(fakeAdmin(state), { clientId: SEALAND_CLIENT_ID, videoId: SEALAND_VIDEO, from: 'video', actor: person })
    expect(state.changes).toHaveLength(1)
    expect(state.changes[0]).toMatchObject({
      client_id: SEALAND_CLIENT_ID, surface: 'segment', field: 'override', actor_kind: 'user', actor_user_id: person.user_id,
      actor_label: person.label, rows_affected: 1, note: NOT_MY_MARKET_NOTE, source: 'logged',
      before: { segment: 'market', method: 'judge', rule_version: 'segments_v2' },
      after: { video_id: SEALAND_VIDEO, segment: 'noise', method: 'override', reason: 'not_my_market:video' },
    })
  })

  it('refuses a video outside the tenant: nothing written, nothing logged', async () => {
    const state = sealandState()
    const before = state.segments.length
    // Össur's session naming Sealand's video, and Sealand's naming Össur's.
    expect(await writeNotMyMarket(fakeAdmin(state), { clientId: OSSUR_CLIENT_ID, videoId: SEALAND_VIDEO, from: 'video', actor: person }))
      .toEqual({ outcome: 'unknown_video', logged: false })
    expect(await writeNotMyMarket(fakeAdmin(state), { clientId: SEALAND_CLIENT_ID, videoId: OSSUR_VIDEO, from: 'video', actor: person }))
      .toEqual({ outcome: 'unknown_video', logged: false })
    expect(state.segments).toHaveLength(before)
    expect(state.changes).toEqual([])
  })

  it('a second click is the same statement: no second row, no second log', async () => {
    const state = sealandState()
    const admin = fakeAdmin(state)
    await writeNotMyMarket(admin, { clientId: SEALAND_CLIENT_ID, videoId: SEALAND_VIDEO, from: 'video', actor: person })
    const again = await writeNotMyMarket(admin, { clientId: SEALAND_CLIENT_ID, videoId: SEALAND_VIDEO, from: 'video', actor: person })
    expect(again).toEqual({ outcome: 'already', logged: false })
    expect(state.segments.filter((s) => s.method === 'override')).toHaveLength(1)
    expect(state.changes).toHaveLength(1)
  })

  it('writes over an older override that put the video back (the newest override wins)', async () => {
    const state = sealandState()
    state.segments.push(
      { client_id: SEALAND_CLIENT_ID, video_id: SEALAND_VIDEO, rule_version: 'override', segment: 'noise', method: 'override', decided_at: '2026-11-20T08:00:00Z' },
      { client_id: SEALAND_CLIENT_ID, video_id: SEALAND_VIDEO, rule_version: 'override', segment: 'market', method: 'override', decided_at: '2026-11-21T08:00:00Z' },
    )
    const r = await writeNotMyMarket(fakeAdmin(state), { clientId: SEALAND_CLIENT_ID, videoId: SEALAND_VIDEO, from: 'video', actor: person })
    expect(r.outcome).toBe('written')
    expect(state.changes[0]).toMatchObject({ before: { segment: 'market', method: 'override' } })
    expect(readerSegment(state.segments)?.segment).toBe('noise')
  })

  it('logs "no stored label" as a null before when only the rule inline decided the video', async () => {
    const state = sealandState()
    state.segments = []
    await writeNotMyMarket(fakeAdmin(state), { clientId: SEALAND_CLIENT_ID, videoId: SEALAND_VIDEO, from: 'video', actor: scriptActor('test') })
    expect(state.changes[0]).toMatchObject({ before: null, actor_kind: 'script', actor_label: 'test' })
  })

  it('says not ready before MF1, and failed on any other read error, writing nothing', async () => {
    const missing = { ...sealandState(), missingSegments: true }
    expect(await writeNotMyMarket(fakeAdmin(missing), { clientId: SEALAND_CLIENT_ID, videoId: SEALAND_VIDEO, from: 'video', actor: person }))
      .toEqual({ outcome: 'not_ready', logged: false })
    const failing = { ...sealandState(), failRead: true }
    const r = await writeNotMyMarket(fakeAdmin(failing), { clientId: SEALAND_CLIENT_ID, videoId: SEALAND_VIDEO, from: 'video', actor: person })
    expect(r.outcome).toBe('failed')
    expect(failing.changes).toEqual([])
    expect(isMissingVideoSegments(missingTable)).toBe(true)
    expect(isMissingVideoSegments({ code: '42P01', message: 'relation "public.video_provenance" does not exist' })).toBe(false)
  })

  it('its sentences are client copy: no digit, no em dash', () => {
    for (const s of [NOT_MY_MARKET_NOTE, ...Object.values(NOT_MY_MARKET_COPY)]) {
      expect(s).not.toMatch(/\d/)
      expect(s).not.toContain('—')
    }
  })
})

// ---- The server action (app/dashboard/segments/actions.ts) ------------------------------
//
// vitest runs lib/** and components/** only, so the action's test lives here.

const session = vi.hoisted(() => ({ current: null as null | { clientId: string; role: string; userId: string; email?: string; operator: null } }))
const store = vi.hoisted(() => ({ state: null as unknown, revalidated: [] as string[] }))

vi.mock('@/lib/auth', () => ({
  getSessionContext: async () => session.current,
  canManageTenant: (role: string) => role === 'owner' || role === 'admin',
}))
vi.mock('@/lib/supabase-admin', () => ({ createAdminClient: () => fakeAdmin(store.state as State) }))
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => { store.revalidated.push(p) } }))

describe('markNotMyMarket (the action)', () => {
  const form = (fields: Record<string, string>) => {
    const f = new FormData()
    for (const [k, v] of Object.entries(fields)) f.set(k, v)
    return f
  }
  const prev = { ok: false, message: '' }
  let state: State
  beforeEach(() => {
    state = sealandState()
    store.state = state
    store.revalidated = []
    session.current = { clientId: SEALAND_CLIENT_ID, role: 'owner', userId: person.user_id!, email: 'owner@sealand', operator: null }
  })

  it('writes and logs for an owner, stamped with the person, and revalidates the pages', async () => {
    const { markNotMyMarket } = await import('@/app/dashboard/segments/actions')
    expect(await markNotMyMarket(prev, form({ videoId: SEALAND_VIDEO }))).toEqual({ ok: true, message: NOT_MY_MARKET_COPY.done })
    expect(state.segments.at(-1)).toMatchObject({ method: 'override', segment: 'noise', reason: 'not_my_market:video', actor_label: 'owner@sealand · this is not my market' })
    expect(state.changes[0]).toMatchObject({ surface: 'segment', actor_kind: 'user', actor_user_id: person.user_id })
    expect(store.revalidated).toEqual(['/dashboard'])
    expect(await markNotMyMarket(prev, form({ videoId: SEALAND_VIDEO }))).toEqual({ ok: true, message: NOT_MY_MARKET_COPY.already })
  })

  it('refuses a user outside the tenant: the tenant is the session’s, never the form’s', async () => {
    const { markNotMyMarket } = await import('@/app/dashboard/segments/actions')
    session.current = { clientId: OSSUR_CLIENT_ID, role: 'owner', userId: 'e55e0000-0000-4000-8000-000000000002', operator: null }
    const f = form({ videoId: SEALAND_VIDEO, clientId: SEALAND_CLIENT_ID })
    expect(await markNotMyMarket(prev, f)).toEqual({ ok: false, message: NOT_MY_MARKET_COPY.unknown })
    expect(state.segments.filter((s) => s.method === 'override')).toEqual([])
    expect(state.changes).toEqual([])
  })

  it('refuses a member, and a form it cannot read, before any read', async () => {
    const { markNotMyMarket } = await import('@/app/dashboard/segments/actions')
    session.current = { clientId: SEALAND_CLIENT_ID, role: 'member', userId: person.user_id!, operator: null }
    expect(await markNotMyMarket(prev, form({ videoId: SEALAND_VIDEO }))).toEqual({ ok: false, message: NOT_MY_MARKET_COPY.role })
    session.current = { clientId: SEALAND_CLIENT_ID, role: 'admin', userId: person.user_id!, operator: null }
    expect(await markNotMyMarket(prev, form({ videoId: 'not-a-uuid' }))).toEqual({ ok: false, message: NOT_MY_MARKET_COPY.unread })
    expect(await markNotMyMarket(prev, form({ videoId: SEALAND_VIDEO, from: 'account' }))).toEqual({ ok: false, message: NOT_MY_MARKET_COPY.unread })
    expect(state.changes).toEqual([])
  })

  it('says so before MF1, and writes nothing', async () => {
    const { markNotMyMarket } = await import('@/app/dashboard/segments/actions')
    state.missingSegments = true
    expect(await markNotMyMarket(prev, form({ videoId: SEALAND_VIDEO }))).toEqual({ ok: false, message: NOT_MY_MARKET_COPY.notReady })
    expect(store.revalidated).toEqual([])
  })
})
