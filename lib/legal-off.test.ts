import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { proxy } from '@/proxy'
import sitemap from '@/app/sitemap'

// The legal pages are off the site for now (Heinrich, 9 Nov 2026: Verbatim is
// not trading as a company yet) and come back later. An address already out
// there lands on the site's home with a TEMPORARY redirect, never a 404 and
// never a 308 a browser would keep after the pages return.

const ask = (host: string, path: string) =>
  proxy(new NextRequest(`https://${host}${path}`, { headers: { host } }))

const where = (res: Response) => res.headers.get('location')

describe('the legal pages, off the site', () => {
  it('307s the apex /privacy and /terms to the site home, the query kept', async () => {
    for (const path of ['/privacy', '/terms', '/site/privacy', '/site/terms']) {
      const res = await ask('verbatimintel.com', path)
      expect(res.status, path).toBe(307)
      expect(where(res), path).toBe('https://verbatimintel.com/')
    }
    expect(where(await ask('verbatimintel.com', '/privacy?ref=mail'))).toBe('https://verbatimintel.com/?ref=mail')
  })

  it('www and the app host reach the same redirect through their own 308s first', async () => {
    const www = await ask('www.verbatimintel.com', '/terms')
    expect([www.status, where(www)]).toEqual([308, 'https://verbatimintel.com/terms'])
    const app = await ask('app.verbatimintel.com', '/site/privacy')
    expect([app.status, where(app)]).toEqual([308, 'https://verbatimintel.com/privacy'])
  })

  it('307s the internal path to /site where the site is served under it (dev, a preview)', async () => {
    for (const path of ['/site/privacy', '/site/terms']) {
      const res = await ask('localhost:3000', path)
      expect(res.status, path).toBe(307)
      expect(new URL(where(res) ?? 'http://x/').pathname, path).toBe('/site')
    }
  })

  it('leaves every other site path to the rewrite', async () => {
    for (const path of ['/', '/how-it-works', '/privacy-notes', '/terms/old']) {
      const res = await ask('verbatimintel.com', path)
      expect(res.status, path).toBe(200)
      expect(res.headers.get('x-middleware-rewrite'), path).toContain('/site')
    }
  })

  it('has no page, and the sitemap names neither', () => {
    for (const p of ['privacy', 'terms']) {
      expect(existsSync(new URL(`../app/site/${p}/page.tsx`, import.meta.url))).toBe(false)
    }
    const urls = sitemap().map((e) => new URL(e.url).pathname)
    expect(urls).toContain('/how-it-works')
    expect(urls.filter((u) => /\/(privacy|terms)$/.test(u))).toEqual([])
  })
})
