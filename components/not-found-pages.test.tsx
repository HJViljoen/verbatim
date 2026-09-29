import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, renderText } from '@/lib/test/render'
import RootNotFound, { metadata as rootMeta } from '@/app/not-found'
import SiteNotFound, { metadata as siteMeta } from '@/app/site/not-found'
import DashboardNotFound from '@/app/dashboard/not-found'

// Every 404 has a way back (finish-list item 25 polish). There was no
// not-found file anywhere, so the site and the app both served Next's bare
// "404 | This page could not be found".

const ROOT = join(__dirname, '..')

describe('the not-found pages', () => {
  it('the root one wears the signed-out frame and links home', () => {
    const html = render(RootNotFound())
    expect(html).toContain('viewBox="0 0 64 64"')
    expect(html).toContain('href="/"')
    expect(renderText(RootNotFound())).toContain('Page not found')
  })

  it('the site one keeps the site header and offers the home page and How it works', () => {
    const html = render(SiteNotFound())
    expect(html).toContain('class="nav light"')
    expect(html).toContain('href="/"')
    expect(html).toContain('href="/how-it-works"')
  })

  it('the dashboard one names the front page by its sidebar label and links to it', () => {
    const html = render(DashboardNotFound())
    expect(renderText(DashboardNotFound())).toContain('Go to Your market')
    expect(html).toContain('href="/dashboard"')
  })

  it('unknown site and dashboard addresses are routed to their own 404, not the root one', () => {
    for (const dir of ['app/site/[...rest]', 'app/dashboard/[...rest]']) {
      const page = join(ROOT, dir, 'page.tsx')
      expect(existsSync(page), dir).toBe(true)
      expect(readFileSync(page, 'utf8')).toContain('notFound()')
    }
  })

  it('each names its tab: the app template adds the product, the site writes it in full', () => {
    expect(rootMeta.title).toBe('Page not found')
    expect(siteMeta.title).toBe('Page not found · Verbatim')
  })
})
