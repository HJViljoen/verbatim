import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AnalystStage } from '@/app/site/_components/analyst-stage'
import { Reveal } from '@/app/site/_components/reveal'
import { analyst } from '@/app/site/_data/sample'

// sw-2 item 7: under "18,440 comments. Your name came up four times." the home
// page had a white slab where the dot field should be, and the panels below it
// were blank wherever their IntersectionObserver never fired (no JavaScript, a
// full-page capture, reduced motion before a scroll for the analyst stage).
// The content is now on the page as it ends; a reveal arms itself only where
// motion is allowed and the element is below the fold at load.

const ROOT = join(__dirname, '..', '..')
const css = readFileSync(join(ROOT, 'app', 'site', 'site.css'), 'utf8')

describe('the home page shows its content without a scripted reveal', () => {
  it('hides a tile, bar, register or card only while a reveal is armed', () => {
    const hiding = css.split('\n').filter((l) => /(?<![-\w])opacity:\s*0[;\s]|(?<![-\w])width:\s*0[;\s]/.test(l) && /\.(t|reg|vc|paper|cl|share i|bar i)\b/.test(l))
    expect(hiding.length).toBeGreaterThan(0)
    for (const l of hiding) expect(l.trim(), l).toMatch(/^\.reveal-armed:not\(\.is-on\) /)
  })

  it('draws the dot field in CSS until the script has drawn it', () => {
    expect(css).toMatch(/\.dots \{[^}]*height: 184px;[^}]*background-image: radial-gradient/)
    expect(css).toContain('.dots.drawn { background: none; }')
    const src = readFileSync(join(ROOT, 'app', 'site', '_components', 'dot-field.tsx'), 'utf8')
    // Whole field on mount; a resize redraws at the progress already drawn.
    expect(src).toMatch(/\n {4}draw\(1\)\n/)
    expect(src).toContain('draw(state.p)')
    expect(src).not.toContain('draw(ran ? 1 : 0)')
  })

  it('renders a reveal with nothing armed, as the server sends it', () => {
    const html = renderToStaticMarkup(<Reveal className="panel"><div className="t">tile</div></Reveal>)
    expect(html).toBe('<div class="panel"><div class="t">tile</div></div>')
  })

  it('renders the analyst stage answered, with its evidence shown', () => {
    const html = renderToStaticMarkup(<AnalystStage />)
    expect(html).toContain(analyst[0].answer)
    expect(html).toMatch(/class="stage[^"]* is-on"/)
    expect(html).not.toContain('reveal-armed')
  })
})
