import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { BUILDS_ARE_OURS, canSeeStudio, mayBuildReports, studioRedirect, STUDIO_AWAY_HREF, STUDIO_HREF, STUDIO_TENANT_REVIEWS, STUDIO_TENANT_VISIBLE } from './studio-visibility'
import { reviewAudience } from './schedules/members'
import type { OperatorView } from './auth'

// The gate that hides the Studio from tenant users (owner's call 2026-09-17).
// Both answers stay tested while the flag is off: the call sites read the
// constant, these tests pass it explicitly.

const tenant = { operator: null }
const operatorHome: { operator: OperatorView } = {
  operator: { homeClientId: 'c1', viewingClientId: 'c1', viewingName: 'Össur', isHome: true },
}
const operatorViewingTenant: { operator: OperatorView } = {
  operator: { homeClientId: 'c1', viewingClientId: 'c2', viewingName: 'Sealand', isHome: false },
}

describe('canSeeStudio', () => {
  it('hides the Studio from a tenant user while the flag is off', () => {
    expect(canSeeStudio(tenant, false)).toBe(false)
  })

  it('shows it to a platform operator on their own workspace', () => {
    expect(canSeeStudio(operatorHome, false)).toBe(true)
  })

  it('shows it to an operator viewing a tenant through the workspace switcher', () => {
    expect(canSeeStudio(operatorViewingTenant, false)).toBe(true)
  })

  it('shows it to everyone once the flag is flipped back on', () => {
    expect(canSeeStudio(tenant, true)).toBe(true)
    expect(canSeeStudio(operatorHome, true)).toBe(true)
  })

  it('reads the shipped constant when no flag is passed', () => {
    expect(canSeeStudio(tenant)).toBe(STUDIO_TENANT_VISIBLE)
    expect(canSeeStudio(operatorHome)).toBe(true)
  })

  it('is on for tenants as shipped (1 Oct: clients see the Studio)', () => {
    expect(STUDIO_TENANT_VISIBLE).toBe(true)
  })

  it('does not make the members a build\'s reviewers: review stays the operator\'s', () => {
    // Opening the page to clients is not opening its review controls. If this
    // ever goes true by accident, a held build and its review email reach
    // the members of every tenant whose sending is not locked.
    expect(STUDIO_TENANT_REVIEWS).toBe(false)
    expect(reviewAudience('a-tenant-not-locked', { sendsLocked: false })).toBe('operator')
  })

  it('names one route, the one every surface links to', () => {
    expect(STUDIO_HREF).toBe('/dashboard/studio')
  })
})

// Finish-list item 16: `/dashboard/studio` opened for a tenant who typed it.
describe('studioRedirect', () => {
  it('sends a tenant user to the Dashboard while the flag is off, never to Reports (which redirects into the Studio)', () => {
    expect(studioRedirect(tenant, false)).toBe(STUDIO_AWAY_HREF)
    expect(STUDIO_AWAY_HREF).toBe('/dashboard')
  })

  it('lets a tenant user in as shipped', () => {
    expect(studioRedirect(tenant)).toBeNull()
  })

  it('lets an operator in, on their own workspace and viewing a tenant', () => {
    expect(studioRedirect(operatorHome)).toBeNull()
    expect(studioRedirect(operatorViewingTenant)).toBeNull()
  })

  it('lets everyone in once the flag is flipped back on', () => {
    expect(studioRedirect(tenant, true)).toBeNull()
  })
})

describe('mayBuildReports: building and sending are the operator\'s (lead\'s ruling 6)', () => {
  it('the operator, on their own workspace or viewing a tenant; never a client user, whatever their role', () => {
    expect(mayBuildReports(operatorHome)).toBe(true)
    expect(mayBuildReports(operatorViewingTenant)).toBe(true)
    expect(mayBuildReports(tenant)).toBe(false)
  })

  // Every door that builds, composes or sends asks it before it reads
  // anything; the preview lets a client read a SENT send only.
  const src = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8')
  const refuses = /if \(!mayBuildReports\(session\)\) return NextResponse\.json\(\{ error: BUILDS_ARE_OURS \}, \{ status: 403 \}\)/
  // The publish route too (the backfill, 1 Oct): what goes on the platform
  // without its email is Heinrich's decision, never a client's.
  for (const file of ['app/api/reports/[id]/build/route.ts', 'app/api/reports/[id]/sections/route.ts', 'app/api/schedules/[id]/send/route.ts', 'app/api/schedules/[id]/publish/route.ts']) {
    it(`${file} refuses a client before it reads`, () => {
      const text = src(file)
      expect(text).toMatch(refuses)
      // Ahead of the handler's first query and its first admin client.
      const body = text.indexOf('export async function')
      const gate = text.search(refuses)
      for (const first of ['.from(', 'createAdminClient()']) {
        const at = text.indexOf(first, body)
        // A route that reads only through a library call has no `.from(` of its own.
        if (at < 0 && first === '.from(') continue
        expect(at, `${file}: ${first}`).toBeGreaterThan(gate)
      }
    })
  }

  it('the dry preview is the operator\'s; a client reads the email of a send on the platform only', () => {
    const text = src('app/api/schedules/[id]/preview/route.ts')
    // On the platform: sent, or published without its email (`onPlatform`, the
    // rule the pages and the snapshots' RLS read; release/oct2 review item 5).
    const sentOnly = text.indexOf('if (!readsHeld && !(send && onPlatform(send))) return note(HELD, 404)')
    expect(text).toContain("readSend('snapshot_id, share_link_id, status, published_at')")
    expect(text).not.toMatch(/status !== 'sent'\) return note/)
    expect(text).not.toMatch(/\.eq\('status', 'sent'\)\.not\('snapshot_id'/)
    const dry = text.indexOf('if (!mayBuildReports(session)) return note(HELD, 403)')
    const build = text.indexOf("runSchedule({ admin, schedule: s, runId, baseUrl: appBaseUrl(), mode: 'preview' })")
    expect(sentOnly).toBeGreaterThan(0)
    expect(dry).toBeGreaterThan(sentOnly)
    expect(build).toBeGreaterThan(dry)
  })

  it('says so in the client\'s terms', () => {
    expect(BUILDS_ARE_OURS).toBe('Reports are built and sent by Verbatim.')
  })
})
