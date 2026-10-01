import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

import { SEALAND_CLIENT_ID } from '../config'
import { fakeDb } from '../test/fake-db'
import { heldOf, heldSnapshotIds, mayReadHeld, snapshotHeld } from './held'

// A build that has not gone out belongs to its reviewer (writing back, review
// B1): the rule, the reads behind it, and every door that must ask it.

const CLIENT = SEALAND_CLIENT_ID
const send = (snapshot_id: string | null, status: string) => ({ client_id: CLIENT, snapshot_id, status, claimed_at: '2026-10-04T08:40:00Z' })

describe('heldOf: a snapshot is held until a send carrying it went out', () => {
  it('ready, claimed and failed hold it; sent releases it; a send with no build holds nothing', () => {
    const held = heldOf([send('a', 'ready'), send('b', 'claimed'), send('c', 'failed'), send('d', 'sent'), send(null, 'skipped')])
    expect([...held].sort()).toEqual(['a', 'b', 'c'])
  })
  it('a build that failed once and then went out is released', () => {
    expect(heldOf([send('a', 'failed'), send('a', 'sent')]).has('a')).toBe(false)
  })
})

describe('mayReadHeld: only whoever reviews the workspace', () => {
  it('the operator always', () => {
    expect(mayReadHeld({ operator: { clientId: CLIENT } }, CLIENT)).toBe(true)
  })
  it("a tenant's own user never, while the Studio is hidden (today) or the tenant is send-locked (Sealand)", () => {
    expect(mayReadHeld({ operator: null }, CLIENT)).toBe(false)
    expect(mayReadHeld({ operator: null }, 'another-tenant')).toBe(false)
    expect(mayReadHeld({ operator: null }, CLIENT, { studioVisible: true })).toBe(false)
  })
  it('the members, once they are the reviewers (the Studio open and nothing locked)', () => {
    expect(mayReadHeld({ operator: null }, 'another-tenant', { studioVisible: true, sendsLocked: false })).toBe(true)
  })
})

describe('the reads, failing closed', () => {
  it('heldSnapshotIds lists every held build of the workspace', async () => {
    const db = fakeDb({ report_sends: [send('a', 'ready'), send('b', 'sent'), { ...send('z', 'ready'), client_id: 'other' }] })
    expect([...((await heldSnapshotIds(db.client as SupabaseClient, CLIENT)) ?? [])]).toEqual(['a'])
  })
  it('sends it cannot read hide everything a send carries (null), and a snapshot it cannot vouch for is held', async () => {
    const db = fakeDb({})
    expect(await heldSnapshotIds(db.client as SupabaseClient, CLIENT)).toBeNull()
    expect(await snapshotHeld(db.client as SupabaseClient, CLIENT, 'a')).toBe(true)
  })
  it('snapshotHeld: a ready build is held, a sent one and a Studio build with no send are not', async () => {
    const db = fakeDb({ report_sends: [send('a', 'ready'), send('b', 'sent')] })
    const admin = db.client as SupabaseClient
    expect(await snapshotHeld(admin, CLIENT, 'a')).toBe(true)
    expect(await snapshotHeld(admin, CLIENT, 'b')).toBe(false)
    expect(await snapshotHeld(admin, CLIENT, 'studio-build')).toBe(false)
  })
})

describe('every door into a build asks the rule', () => {
  const src = (p: string) => readFileSync(resolve(__dirname, '../..', p), 'utf8')
  const doors: [string, RegExp[]][] = [
    // Built, the cards, the count, the Sent detail and the viewer.
    ['app/dashboard/reports/page.tsx', [/mayReadHeld\(session, clientId\)/, /heldSnapshotIds\(/, /\.filter\(\(b\) => showsBuild\(b\.id\)\)/, /snapshotHeld\(createAdminClient\(\), clientId, sp\.view\)/, /sendContent && selectedSend\?\.snapshot_id/, /\{sendContent && <DetailSection label="Files and links">/]],
    ['app/dashboard/studio/page.tsx', [/snapshotHeld\(createAdminClient\(\), clientId, sp\.view\)/]],
    ['app/api/share/route.ts', [/mayReadHeld\(session, session\.clientId\)/, /snapshotHeld\(admin, session\.clientId, snapshotId\)/]],
    ['app/api/artifacts/[id]/route.ts', [/mayReadHeld\(session, session\.clientId\)/, /snapshotHeld\(admin, session\.clientId, row\.snapshot_id\)/]],
    ['app/api/schedules/[id]/preview/route.ts', [/mayReadHeld\(session, session\.clientId\)/, /status !== 'sent'\) return note\(HELD/, /!readsHeld && s\.review\) return note\(HELD/]],
    ['app/api/schedules/[id]/send/route.ts', [/mode === 'test' && \(schedule as ScheduleRow\)\.review && !mayReadHeld\(session, session\.clientId\)/]],
  ]
  for (const [file, patterns] of doors) {
    it(file, () => {
      const text = src(file)
      for (const p of patterns) expect(text, String(p)).toMatch(p)
    })
  }
})
