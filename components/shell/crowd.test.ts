import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// The crowd backdrop (CROWD, 2 Oct; MASTER rule 6). It sat on the dashboard's
// ground from 2 Oct until the audit design (7 Nov), whose boards draw the
// plain ground: it is retired from the app shell and stays on the signed-out
// frame. So what is pinned here: no crowd in the dashboard layout, the one on
// the signed-out frame, and the rules its CSS keeps for it (no pointer, no
// print, coloured by a token).

const layout = readFileSync('app/dashboard/layout.tsx', 'utf8')
const authCard = readFileSync('components/auth/auth-card.tsx', 'utf8')
const css = readFileSync('app/globals.css', 'utf8')

/** The body of the first rule whose selector is exactly `sel`. */
const rule = (sel: string) => {
  const at = css.search(new RegExp(`^${sel.replace(/[.*+?^${}()|[\]\\:]/g, '\\$&')} \\{`, 'm'))
  return at < 0 ? '' : css.slice(at, css.indexOf('}', at))
}

describe('the crowd backdrop', () => {
  it('is not in the dashboard layout: the pane right of the sidebar is the plain ground (the audit design)', () => {
    const sidebar = layout.indexOf('<AppSidebar')
    const pane = layout.indexOf('h-dvh overflow-hidden bg-[#F7F6F2]')
    const main = layout.indexOf('<main className="relative z-10')
    expect(sidebar).toBeGreaterThan(-1)
    expect(pane).toBeGreaterThan(sidebar)
    expect(main).toBeGreaterThan(pane)
    expect(layout).not.toMatch(/className="crowd-bg/)
  })

  it('stays on the signed-out frame, as one hidden element', () => {
    expect(authCard.match(/className="crowd-bg"/g)).toHaveLength(1)
    expect(authCard).toContain('<div className="crowd-bg" aria-hidden />')
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
