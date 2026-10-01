import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { config, proxy } from '@/proxy'

// TWO FAVICONS UNTIL THE SITE IS RECOLOURED (Heinrich, 1 Oct). Next allows a
// favicon.ico at the root segment only and every page links it, so the app's
// yellow app/favicon.ico would reach the marketing site too. proxy.ts hands the
// apex the site's green one instead; the app host keeps the yellow.

const ask = (host: string, path: string) =>
  proxy(new NextRequest(`https://${host}${path}`, { headers: { host } }))

describe('the favicon split', () => {
  it('hands the apex (and www) the site\'s green favicon', async () => {
    for (const host of ['verbatimintel.com', 'www.verbatimintel.com']) {
      const res = await ask(host, '/favicon.ico?75b8132307f433ee')
      expect(new URL(res.headers.get('x-middleware-rewrite') ?? 'http://x/').pathname, host).toBe('/brand/favicon-site.ico')
    }
  })

  it('leaves the app host its own, untouched and ungated', async () => {
    const res = await ask('app.verbatimintel.com', '/favicon.ico')
    expect(res.headers.get('x-middleware-rewrite')).toBeNull()
    expect(res.headers.get('x-middleware-next')).toBe('1')
  })

  it('runs for /favicon.ico at all: the matcher no longer skips it', () => {
    const matcher = new RegExp(`^${config.matcher[0]}$`)
    expect(matcher.test('/favicon.ico')).toBe(true)
    expect(matcher.test('/_next/static/chunks/a.js')).toBe(false)
  })
})
