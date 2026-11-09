import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@/lib/test/render'

// The two account-creation forms after the legal pages came off the site
// (9 Nov 2026, proxy.ts). Both asked for an `accept_terms` checkbox linking
// the terms and the privacy notice, and both actions refused a form without
// it; nothing ever stored it. Now neither form asks, and each action still
// validates and still creates the account.

class Redirected extends Error {
  constructor(readonly to: string) { super(`redirect ${to}`) }
}

const h = vi.hoisted(() => ({
  created: [] as Array<Record<string, unknown>>,
  inserted: [] as Array<{ table: string; row: unknown }>,
  signedIn: [] as Array<{ email: string }>,
}))

const admin = {
  auth: {
    admin: {
      createUser: async (args: Record<string, unknown>) => {
        h.created.push(args)
        return { data: { user: { id: 'u-new' } }, error: null }
      },
    },
  },
  from: (table: string) => ({
    insert: async (row: unknown) => { h.inserted.push({ table, row }); return { error: null } },
    update: () => ({ eq: async () => ({ error: null }) }),
  }),
}
const server = {
  auth: {
    getUser: async () => ({ data: { user: null } }),
    signInWithPassword: async ({ email }: { email: string }) => { h.signedIn.push({ email }); return { error: null } },
  },
}

vi.mock('@/lib/supabase-admin', () => ({ createAdminClient: () => admin }))
vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: async () => server }))
vi.mock('@/lib/schedules/default', () => ({ joinDefaultSchedule: async () => {} }))
vi.mock('@/app/invite/[token]/data', () => ({
  loadInvite: async () => ({
    invite: { id: 'inv-1', client_id: 'c-1', email: 'reader@brand.com', role: 'member', status: 'pending', expires_at: '2999-01-01' },
    reason: '',
  }),
}))
vi.mock('next/navigation', async (orig) => ({
  ...(await orig<typeof import('next/navigation')>()),
  redirect: (to: string) => { throw new Redirected(to) },
}))

const { signUp } = await import('@/app/signup/actions')
const { acceptInvitation } = await import('@/app/invite/[token]/actions')
const { default: SignupPage } = await import('@/app/signup/page')
const { SignupAcceptForm } = await import('@/app/invite/[token]/invite-ui')

const form = (fields: Record<string, string>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.append(k, v)
  return f
}
const idle = { ok: false, message: '' }
/** The `<input>` tag carrying `name`, so its attributes can be read in any order. */
const field = (html: string, name: string) => html.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`))?.[0] ?? ''
const landsOn = async (p: Promise<unknown>) => {
  try { await p } catch (e) { if (e instanceof Redirected) return e.to; throw e }
  return null
}

const SIGNUP = { full_name: 'Jordan Lee', email: ' Jordan@Brand.com ', password: 'correct-horse', invite_code: 'LetMeIn' }

beforeEach(() => {
  h.created.length = 0
  h.inserted.length = 0
  h.signedIn.length = 0
  vi.stubEnv('SIGNUP_INVITE_CODE', 'letmein')
})

describe('the forms ask for no consent', () => {
  it('signup: its four fields, no checkbox, no terms or privacy', () => {
    const html = render(<SignupPage />)
    for (const name of ['full_name', 'email', 'password', 'invite_code']) expect(field(html, name), name).toContain('required=""')
    expect(html).not.toContain('type="checkbox"')
    expect(html).not.toContain('accept_terms')
    expect(html).not.toMatch(/terms|privacy/i)
  })

  it('invite acceptance: name and password, no checkbox, no terms or privacy', () => {
    const html = render(<SignupAcceptForm token="tok" email="reader@brand.com" />)
    expect(field(html, 'full_name')).toContain('required=""')
    expect(field(html, 'password')).toContain('required=""')
    expect(html).not.toContain('type="checkbox"')
    expect(html).not.toMatch(/terms|privacy/i)
  })
})

describe('signup submits without accept_terms', () => {
  it('creates the account, signs in and goes to onboarding', async () => {
    expect(await landsOn(signUp(idle, form(SIGNUP)))).toBe('/onboarding')
    expect(h.created).toEqual([{ email: 'jordan@brand.com', password: 'correct-horse', email_confirm: true, user_metadata: { full_name: 'Jordan Lee' } }])
    expect(h.signedIn).toEqual([{ email: 'jordan@brand.com' }])
  })

  it('still refuses a bad form, and creates nothing', async () => {
    expect(await signUp(idle, form({ ...SIGNUP, invite_code: '' }))).toEqual({ ok: false, message: 'Enter your invite code.' })
    expect(await signUp(idle, form({ ...SIGNUP, invite_code: 'nope' }))).toEqual({ ok: false, message: 'That invite code is not valid.' })
    const invalid = { ok: false, message: 'Enter your name, a valid email, and a password of at least 8 characters.' }
    expect(await signUp(idle, form({ ...SIGNUP, email: 'not-an-email' }))).toEqual(invalid)
    expect(await signUp(idle, form({ ...SIGNUP, password: 'short' }))).toEqual(invalid)
    expect(await signUp(idle, form({ ...SIGNUP, full_name: '  ' }))).toEqual(invalid)
    expect(h.created).toEqual([])
  })
})

describe('invite acceptance submits without accept_terms', () => {
  it('creates the account on the invite email, joins the workspace and goes to the dashboard', async () => {
    expect(await landsOn(acceptInvitation(idle, form({ token: 'tok', full_name: 'Jordan Lee', password: 'correct-horse' })))).toBe('/dashboard')
    expect(h.created).toEqual([{ email: 'reader@brand.com', password: 'correct-horse', email_confirm: true, user_metadata: { full_name: 'Jordan Lee' } }])
    expect(h.inserted).toEqual([{ table: 'users', row: { id: 'u-new', client_id: 'c-1', email: 'reader@brand.com', full_name: 'Jordan Lee', role: 'member' } }])
    expect(h.signedIn).toEqual([{ email: 'reader@brand.com' }])
  })

  it('still refuses a short password, and creates nothing', async () => {
    expect(await acceptInvitation(idle, form({ token: 'tok', full_name: 'Jordan Lee', password: 'short' })))
      .toEqual({ ok: false, message: 'Enter your name and a password of at least 8 characters.' })
    expect(h.created).toEqual([])
  })
})
