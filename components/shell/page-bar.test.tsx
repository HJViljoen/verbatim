import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { render, renderText } from '@/lib/test/render'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { SurfacePageBar, HorizonControl } from './page-bar'
import { SkeletonSurfaceBar } from './skeleton'
import { PageBar } from './page-grid'
import { SURFACES, hasHorizon } from '@/lib/nav'
import { sealandReading } from '@/lib/test/reading-fixture'

// The page bar is what tells a reader which page they are on, which month it
// reads and how current it is. Since the 25 Sep rulings (market-first WP1.2) it
// is the title, the brand, the month selector and ONE quiet line, "as at the
// {update} update · next update {date}", and nothing else: no question, no
// "How sound is this" band.

const READING = sealandReading('2026-09-24T18:00:00.000Z')
/** What the reading view offers on 24 Sep and on 1 to 3 Oct: every earlier
 *  month with a row, newest first (default M-d). */
const EARLIER = ['2026-08-01', '2026-07-01', '2026-06-01', '2026-05-01', '2026-04-01'].map((month) => ({ month, isDefault: false }))
const CONTEXT = { brand: 'Sealand', reading: READING, others: EARLIER }
const UPDATE = {
  update: '2026-09-20T12:00:00.000Z',
  window: { from: '2026-09-10T08:00:00.000Z', to: '2026-09-20T06:00:00.000Z' },
  nextUpdate: '2026-09-27T04:00:00.000Z',
}

describe('SurfacePageBar', () => {
  it('prints the label and no question', () => {
    const text = renderText(<SurfacePageBar nav="voices" context={CONTEXT} />)
    expect(text).toContain('Voices')
    expect(text).not.toContain('Who is saying it, and who matters?') // title only, 2026-09-24
  })

  it('carries the brand, the month selector and the one line on a reading surface', () => {
    const text = renderText(<SurfacePageBar nav="market" context={CONTEXT} />)
    expect(text).toContain('Sealand')
    expect(text).toContain('September 2026')
    expect(text).toContain('as at the 24 Sep update · next update Sun 27 Sep')
    // The month's state is the selector's tooltip, never the visible line.
    expect(text).not.toContain('so far, ')
    expect(text).not.toContain('still filling')
  })

  it('puts the month\'s state in the selector\'s tooltip, and the chip opens a menu of months', () => {
    const markup = render(<SurfacePageBar nav="market" context={CONTEXT} params={{ horizon: 'last_3' }} />)
    expect(markup).toContain('title="September so far · 24 days · 4 updates"')
    // The months themselves are the menu's (`monthOptions`, lib/shell/bar.ts),
    // drawn when it opens; the chip says it has one.
    expect(markup).toMatch(/<button [^>]*aria-haspopup="menu"[^>]*>September 2026<svg/)
  })

  it('draws no menu where the market has no other month at all', () => {
    const markup = render(<SurfacePageBar nav="voices" context={{ ...CONTEXT, others: [] }} />)
    expect(markup).toContain('September 2026')
    expect(markup).not.toContain('aria-haspopup')
  })

  it('draws the preview\'s selector: a 32px chip with its chevron, a button reached by keyboard', () => {
    const menu = render(<SurfacePageBar nav="market" context={CONTEXT} />)
    expect(menu).toMatch(/<button [^>]*class="[^"]*h-8[^"]*rounded-lg[^"]*bg-inner[^"]*"[^>]*>September 2026<svg[^>]*lucide-chevron-down/)
    // A button (Tab reaches it, Enter or Space opens it) with a focus ring.
    expect(menu).toMatch(/<button type="button"[^>]*aria-haspopup="menu"[^>]*class="[^"]*focus-visible:ring-2[^"]*"/)
    // Nothing to change to: the month's name and its tooltip, and no chevron
    // promising a menu.
    const alone = render(<SurfacePageBar nav="market" context={{ ...CONTEXT, others: [] }} />)
    expect(alone).toMatch(/<span title="[^"]*" class="[^"]*h-8[^"]*bg-inner[^"]*">September 2026<\/span>/)
    expect(alone).not.toContain('lucide-chevron-down')
  })

  it('steps back on 1 to 3 Oct too: September, ended, with the chevron, and the line unchanged (default M-d)', () => {
    const october = { brand: 'Sealand', reading: sealandReading('2026-10-02T06:00:00.000Z'), others: EARLIER }
    const markup = render(<SurfacePageBar nav="market" context={october} />)
    expect(markup).toMatch(/aria-haspopup="menu"[^>]*>September 2026<svg[^>]*lucide-chevron-down/)
    const text = renderText(<SurfacePageBar nav="market" context={october} />)
    expect(text).toContain('as at the 27 Sep update · next update Sun 4 Oct')
    // The state words stay the tooltip's: none in the bar (§5.1).
    expect(text).not.toContain('so far')
    expect(text).not.toContain('still filling')
  })

  it('breaks the one line at its " · " on a phone, never inside a date', () => {
    const markup = render(<SurfacePageBar nav="market" context={CONTEXT} />)
    expect(markup).toContain('<span class="whitespace-nowrap">as at the 24 Sep update</span> · <span class="whitespace-nowrap">next update Sun 27 Sep</span>')
    expect(renderText(<SurfacePageBar nav="market" context={CONTEXT} />)).toContain('as at the 24 Sep update · next update Sun 27 Sep')
  })

  it('dates Content (This week\'s bar) by its update and its comment window, and offers no horizon', () => {
    const text = renderText(<SurfacePageBar nav="content" brand="Sealand" updates={UPDATE} />)
    expect(text).toContain('The 20 Sep update')
    expect(text).toContain('comments written 10 to 20 Sep · next update Sun 27 Sep')
    expect(text).not.toContain('Last 3 months')
  })

  it('gives the Studio a title and nothing else to read', () => {
    const markup = render(<SurfacePageBar nav="studio" context={CONTEXT} />)
    expect(markup).toContain('Studio')
    expect(markup).not.toContain('Last 12 months')
    expect(markup).not.toContain('September 2026')
  })

  it('shows no month on a reading surface that has not been given one', () => {
    // An honest blank, not a fabricated date.
    const text = renderText(<SurfacePageBar nav="moves" />)
    expect(text).not.toContain('as at')
    expect(text).not.toContain('2026')
  })

  it('offers the horizon on exactly the surfaces the table says', () => {
    for (const s of SURFACES) {
      const markup = render(<SurfacePageBar nav={s.key} context={CONTEXT} updates={UPDATE} />)
      expect(markup.includes('Since we started')).toBe(hasHorizon(s))
    }
  })

  it('says "how sound" on no surface, in any case (25 Sep rulings)', () => {
    for (const s of SURFACES) {
      const markup = render(<SurfacePageBar nav={s.key} context={CONTEXT} updates={UPDATE} brand="Sealand" />)
      expect(markup.toLowerCase(), s.key).not.toContain('how sound')
      expect(markup, s.key).not.toContain('the record →')
    }
  })
})

describe('SkeletonSurfaceBar', () => {
  it('holds a reading page\'s bar at the height it lands at: the 40px Export button and the 24px line', () => {
    const markup = render(<SkeletonSurfaceBar nav="market" button />)
    expect(markup).toContain('h-10 w-[98px] rounded-lg')
    expect(markup).not.toContain('rounded-full')
    expect(markup).toContain('my-1.5 h-3')
    // A page whose bar still pairs the pills keeps their bones.
    expect(render(<SkeletonSurfaceBar nav="voices" pills={2} />).match(/h-\[26px\] w-20 rounded-full/g)?.length).toBe(2)
  })
})

describe('HorizonControl', () => {
  it('is four addresses, with the current one marked', () => {
    const markup = render(<HorizonControl basePath="/dashboard/voice" params={{ theme: 't1' }} current="last_12" />)
    expect(markup).toContain('href="/dashboard/voice?theme=t1"')
    expect(markup).toContain('href="/dashboard/voice?theme=t1&amp;horizon=last_3"')
    expect(markup).toContain('aria-current="page"')
    // The selection travels with the horizon — changing how far back you look
    // must not drop the theme you were reading.
    expect(markup.match(/theme=t1/g)?.length).toBe(4)
  })

  it('never prints itself into an export', () => {
    expect(render(<HorizonControl basePath="/dashboard" params={{}} current="this_month" />)).toContain('data-print-hide')
  })

  it('wraps on a phone rather than widening the page (390px: the four pills are about 404px)', () => {
    const markup = render(<HorizonControl basePath="/dashboard/subjects" params={{}} current="this_month" />)
    expect(markup).toMatch(/<nav aria-label="How far back" class="[^"]*\bflex-wrap\b[^"]*"/)
    expect(markup).not.toMatch(/<nav aria-label="How far back" class="[^"]*\bshrink-0\b/)
  })
})

describe('one title for every page (integration, 1 Oct)', () => {
  // Every artboard draws its title the same way: 26px bold in a 40px bar,
  // its controls 10px apart. The shared PageBar draws it, and the rebuilt
  // pages and their skeletons go through it instead of each writing a local
  // 26px h1 (lead's ruling 12).
  const ROOT = join(__dirname, '..', '..')
  const files = (dir: string): string[] =>
    readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? files(join(dir, e.name)) : /\.tsx$/.test(e.name) && !/\.test\.tsx$/.test(e.name) ? [join(dir, e.name)] : [])
  const PAGES = [
    'components/pages/home', 'components/pages/overview/picture', 'components/pages/week', 'components/pages/voice-surface',
    'components/pages/competitive-surface/page', 'components/pages/subjects', 'components/pages/moves', 'components/pages/agent',
    'components/pages/studio', 'components/pages/settings', 'components/settings-frame.tsx', 'components/settings-skeleton.tsx', 'app/dashboard',
  ]
  it.each(PAGES)('%s draws no title of its own', (p) => {
    const list = p.endsWith('.tsx') ? [p] : files(p)
    for (const f of list) expect(readFileSync(join(ROOT, f), 'utf8'), f).not.toMatch(/<h1[^>]*text-\[26px\]/)
  })

  it('the bar keeps the artboards\' 10px between its controls', () => {
    expect(render(<PageBar title="Your moves"><a>Check a plan</a><a>Date a move</a></PageBar>)).toContain('justify-end gap-2.5')
  })
})

describe('the depth boards\' meta line (depth v2, T2)', () => {
  // The v2 boards put one quiet mono line under the title and the period
  // switch at the right-hand end, level with its foot. It is the shared bar's
  // `meta`, not a second page header.
  const meta = <><span data-copy="figure">241</span> videos · <span data-copy="figure">3,912</span> comments</>

  it('prints the meta under the title in the mono, with the control at the foot of the pair', () => {
    const markup = render(<PageBar title="Market" meta={meta}><a href="?period=week">This week</a></PageBar>)
    expect(markup).toMatch(/<h1[^>]*>Market<\/h1>/)
    expect(markup).toMatch(/<p data-bar-meta="" class="[^"]*row-start-2[^"]*font-mono[^"]*text-\[12\.5px\][^"]*text-muted-foreground/)
    // The control spans the title and the meta, and the pair aligns at its foot.
    expect(markup).toContain('sm:items-end')
    expect(markup).toContain('sm:row-end-3')
    expect(renderText(<PageBar title="Market" meta={meta} />)).toBe('Market 241 videos · 3,912 comments')
    assertCopyContract(<PageBar title="Market" meta={meta}><a href="?period=week">This week</a></PageBar>)
  })

  it('sits under the context line where a page has both, the control spanning all three rows', () => {
    const markup = render(<PageBar title="Market" line="Össur" meta={meta}><a>Export</a></PageBar>)
    expect(markup).toMatch(/<p data-bar-meta="" class="[^"]*row-start-3/)
    expect(markup).toContain('sm:row-end-4')
  })

  it('leaves every existing caller as it was: no meta, no meta row', () => {
    const plain = render(<PageBar title="Your moves"><a>Check a plan</a></PageBar>)
    expect(plain).not.toContain('data-bar-meta')
    expect(plain).not.toContain('sm:items-end')
    expect(plain).not.toContain('sm:row-end')
    const lined = render(<PageBar title="Subjects" line="Sealand"><a>Export</a></PageBar>)
    expect(lined).toContain('sm:items-end')
    expect(lined).toContain('sm:row-end-3')
    expect(lined).not.toContain('data-bar-meta')
  })
})
