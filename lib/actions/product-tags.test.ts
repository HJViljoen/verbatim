import { describe, expect, it, vi } from 'vitest'

// The action's gate and its replies; what a tag writes is lib/products/tags.test.ts.
const h = vi.hoisted(() => ({
  role: 'owner' as string,
  revalidate: vi.fn(),
  write: vi.fn(async () => ({ outcome: 'written', logged: true, reread: ['2026-10-01'] })),
}))
vi.mock('next/cache', () => ({ revalidatePath: h.revalidate }))
vi.mock('@/lib/auth', () => ({
  getSessionContext: async () => ({ supabase: null, userId: 'u-1', email: 'owner@ossur.test', clientId: 'e52cac94-30e1-426a-9a36-31b11e0b30b6', role: h.role, operator: null }),
}))
vi.mock('@/lib/supabase-admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/products/tags', async (orig) => {
  const real = await orig<typeof import('@/lib/products/tags')>()
  return { ...real, writeProductTag: h.write }
})

import { PRODUCT_TAG_COPY } from '@/lib/products/tags'
import { tagProduct } from './product-tags'

const V = '00000000-0000-4000-8000-0000000000a1'
const C = '00000000-0000-4000-8000-0000000000c1'
const G = '00000000-0000-4000-8000-0000000000b1'
const form = (fields: Record<string, string>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.set(k, v)
  return f
}
const idle = { ok: false, outcome: 'unread' as const, message: '' }

describe('tagProduct', () => {
  it('a member who is not an owner or an admin is refused before anything is read', async () => {
    h.role = 'member'
    const r = await tagProduct(idle, form({ videoId: V, commentId: C, choice: `unclear:${G}` }))
    expect(r).toEqual({ ok: false, outcome: 'role', message: PRODUCT_TAG_COPY.role })
    expect(h.write).not.toHaveBeenCalled()
    h.role = 'owner'
  })

  it('an owner\'s tag is written with the session\'s tenant and the person as actor, and the page refreshed', async () => {
    const r = await tagProduct(idle, form({ videoId: V, commentId: C, choice: `unclear:${G}`, clientId: 'someone-else' }))
    expect(r).toEqual({ ok: true, outcome: 'written', message: PRODUCT_TAG_COPY.done })
    expect(h.write).toHaveBeenCalledWith({}, expect.objectContaining({
      clientId: 'e52cac94-30e1-426a-9a36-31b11e0b30b6', videoId: V, commentId: C, choice: { placement: 'unclear', groupId: G },
      actor: expect.objectContaining({ kind: 'user', user_id: 'u-1', label: 'owner@ossur.test · tagged a product' }),
    }))
    expect(h.revalidate).toHaveBeenCalledWith('/dashboard/products')
  })

  it('a video as a whole posts no comment', async () => {
    await tagProduct(idle, form({ videoId: V, choice: 'none' }))
    expect(h.write).toHaveBeenLastCalledWith({}, expect.objectContaining({ commentId: null, choice: { placement: 'none' } }))
  })

  it('refuses a form it cannot read', async () => {
    for (const f of [form({ videoId: 'x', choice: 'none' }), form({ videoId: V, choice: 'maybe' }), form({ videoId: V, commentId: 'nope', choice: 'none' })]) {
      expect(await tagProduct(idle, f)).toEqual({ ok: false, outcome: 'unread', message: PRODUCT_TAG_COPY.unread })
    }
  })

  it('says what happened in the outcome\'s own words', async () => {
    for (const [outcome, message, ok] of [
      ['already', PRODUCT_TAG_COPY.already, true], ['changed', PRODUCT_TAG_COPY.changed, false], ['unknown_text', PRODUCT_TAG_COPY.unknown, false],
      ['unknown_target', PRODUCT_TAG_COPY.unknownTarget, false], ['not_ready', PRODUCT_TAG_COPY.notReady, false], ['failed', PRODUCT_TAG_COPY.failed, false],
    ] as const) {
      h.write.mockResolvedValueOnce({ outcome, logged: false, reread: [] } as never)
      expect(await tagProduct(idle, form({ videoId: V, choice: 'none' }))).toEqual({ ok, outcome, message })
    }
  })
})
