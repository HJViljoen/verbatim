import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { readingHandle } from './read'

// Scope.reading is required, so every dashboard route fills it — including
// loaders that read no month. What that must NOT mean is a service-role client
// constructed on every render of every page.

const ENV = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const

function withoutServiceRole<T>(fn: () => T): T {
  const saved = ENV.map((k) => [k, process.env[k]] as const)
  for (const k of ENV) delete process.env[k]
  try {
    return fn()
  } finally {
    for (const [k, v] of saved) if (v !== undefined) process.env[k] = v
  }
}

describe('readingHandle', () => {
  it('builds nothing until a month is actually read', () => {
    withoutServiceRole(() => {
      const h = readingHandle('client-1')
      expect(h.clientId).toBe('client-1')
      // The page that reads no month renders; the one that does still needs
      // the key, and says so where the read is.
      expect(() => h.client).toThrow()
    })
  })

  it('builds the client once and keeps it', () => {
    const h = readingHandle('client-1')
    expect(h.client).toBe(h.client)
  })

  it('keeps an injected client — an operator script’s or a test’s', () => {
    const fake = { from: () => undefined } as unknown as SupabaseClient
    const h = withoutServiceRole(() => readingHandle('client-1', fake))
    expect(h.client).toBe(fake)
  })
})
