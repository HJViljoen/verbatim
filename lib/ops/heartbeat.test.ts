import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { touchHeartbeat } from './heartbeat'

// The contract under test is "cannot break its host". No DB is involved: the
// factory and the two-method stub below are the whole surface touchHeartbeat
// uses, and the point is that every way they can fail is swallowed.

const stub = (result: { error: { message: string } | null }) =>
  (() => ({ from: () => ({ upsert: async () => result }) }) as unknown as SupabaseClient)

describe('touchHeartbeat', () => {
  it('records the beat when the write succeeds', async () => {
    const upsert = vi.fn(async () => ({ error: null }))
    const admin = () => ({ from: () => ({ upsert }) }) as unknown as SupabaseClient
    expect(await touchHeartbeat(admin, 'inngest', { ms: 12 })).toEqual({ ok: true })
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'inngest', detail: { ms: 12 } }),
      { onConflict: 'name' },
    )
  })

  it('swallows a factory that throws', async () => {
    // createAdminClient() throws synchronously on a missing env var. Evaluated
    // at the call site this would have taken down keep-warm and the
    // dispatcher's first step — the two things the beacon exists to watch.
    const admin = () => { throw new Error('supabaseUrl is required.') }
    expect(await touchHeartbeat(admin, 'dispatcher')).toEqual({ ok: false })
  })

  it('swallows a missing table', async () => {
    // The code can deploy before the migration is applied; the ops check reads
    // the absent beat as a finding, which is the right outcome anyway.
    const res = await touchHeartbeat(stub({ error: { message: "Could not find the table 'public.ops_heartbeats'" } }), 'inngest')
    expect(res).toEqual({ ok: false })
  })

  it('swallows a write that throws', async () => {
    const admin = () => ({ from: () => ({ upsert: async () => { throw new Error('network') } }) }) as unknown as SupabaseClient
    expect(await touchHeartbeat(admin, 'inngest')).toEqual({ ok: false })
  })
})
