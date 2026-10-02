import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// The crowd backdrop (CROWD, 2 Oct; MASTER rule 6). Heinrich: "add the
// background art back again … it would add a nice depth to the page." It left
// once by accident of a rebuild, so where it sits and what it may never do are
// pinned here: on the ground right of the sidebar, under the cards, one
// element that takes no pointer and no print, coloured by a token.

const layout = readFileSync('app/dashboard/layout.tsx', 'utf8')
const css = readFileSync('app/globals.css', 'utf8')

/** The body of the first rule whose selector is exactly `sel`. */
const rule = (sel: string) => {
  const at = css.search(new RegExp(`^${sel.replace(/[.*+?^${}()|[\]\\:]/g, '\\$&')} \\{`, 'm'))
  return at < 0 ? '' : css.slice(at, css.indexOf('}', at))
}

describe('the crowd backdrop', () => {
  it('sits in the pane right of the sidebar, behind <main>, as one hidden element', () => {
    const sidebar = layout.indexOf('<AppSidebar')
    const pane = layout.indexOf('h-dvh overflow-hidden bg-[#F7F6F2]')
    const crowd = layout.indexOf('<div className="crowd-bg crowd-bg--shell" aria-hidden />')
    const main = layout.indexOf('<main className="relative z-10')
    expect(sidebar).toBeGreaterThan(-1)
    expect(pane).toBeGreaterThan(sidebar)
    expect(crowd).toBeGreaterThan(pane)
    expect(main).toBeGreaterThan(crowd)
    expect(layout.match(/className="crowd-bg/g)).toHaveLength(1)
  })

  it('never takes a pointer or a scroll height, never prints, and draws in the token', () => {
    expect(rule('.crowd-bg')).toContain('position: absolute')
    expect(rule('.crowd-bg')).toContain('pointer-events: none')
    expect(rule('.crowd-bg::before')).toContain('background-color: var(--crowd, #26292C)')
    expect(rule('.crowd-bg::before')).toContain('mask: url("/crowd.svg") center bottom / cover no-repeat')
    expect(rule('.crowd-bg--shell')).toContain('opacity: calc(0.07 * var(--crowd-gain, 1))')
    expect(css).toContain('@media print { .crowd-bg { display: none; } }')
  })

  it('is the ink in both themes, and the warm variant is set nowhere in the app', () => {
    expect(rule(':root')).toContain('--crowd: #26292C;')
    expect(rule('.dark')).toContain('--crowd: #ECEEF0;')
    expect(rule('[data-crowd="warm"]')).toContain('--crowd: #9A6B00;')
    const setters: string[] = []
    for (const top of ['app', 'components']) {
      for (const f of readdirSync(top, { recursive: true }) as string[]) {
        if (!/\.(tsx?|css)$/.test(f) || /\.test\.tsx?$/.test(f) || f.startsWith('site')) continue
        const src = readFileSync(join(top, f), 'utf8')
        if (/data-crowd|dataCrowd/.test(src) && !(top === 'app' && f === 'globals.css')) setters.push(join(top, f))
      }
    }
    expect(setters).toEqual([])
  })
})
