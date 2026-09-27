import { describe, expect, it } from 'vitest'

import type { RenderMode } from '@/lib/blocks/types'
import { copyViolations } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { viewState, type ViewState } from '@/lib/views/state'
import { ViewPill, ViewRow } from './view-pill'

// The view pill (plan §2.4 C1, WP3.3), as the approved preview draws it under
// "The market in the month" (Conversation.dc.html): Everything · Buyers ·
// Makers, then one quiet note. Staging's September counts: 654 market videos,
// 381 buyers, 601 once the 53 off-topic ones are set aside.

const MODES: RenderMode[] = ['app', 'print', 'email']
const BASE = '/dashboard/voice'

const state = (over: Partial<Parameters<typeof viewState>[0]> = {}): ViewState => viewState({
  read: { state: 'read', view: 'buyers', lens: 'buyers', rows: [] },
  cfg: { views: true, setAside: false },
  basePath: BASE,
  params: { month: '2026-09', view: 'buyers' },
  month: '2026-09-01',
  everything: 654,
  inView: 381,
  ...over,
})

describe('ViewPill', () => {
  it('draws the three options as addresses, the pressed one marked, in the preview’s order', () => {
    const html = render(<ViewPill choices={state().choices} />)
    expect(renderText(<ViewPill choices={state().choices} />)).toBe('Everything Buyers Makers')
    expect(html).toContain('aria-label="View"')
    expect(html).toContain('href="/dashboard/voice?month=2026-09"')
    expect(html).toMatch(/<a aria-current="page"[^>]*href="\/dashboard\/voice\?month=2026-09&amp;view=buyers"/)
    expect(html).toContain('href="/dashboard/voice?month=2026-09&amp;view=makers"')
    expect(html.match(/aria-current/g)).toHaveLength(1)
  })

  it('takes the preview’s measures: a 44px tinted group of 36px segments at 14px, the pressed one white on a hairline', () => {
    const html = render(<ViewPill choices={state().choices} />)
    expect(html).toContain('h-11')
    expect(html).toContain('bg-inner')
    expect(html).toContain('h-9')
    expect(html).toContain('text-[14px]')
    expect(html).toContain('bg-tile font-semibold text-foreground shadow-[0_0_0_1px_var(--border),0_1px_2px_rgba(38,41,44,0.06)]')
    expect(html).toContain('data-print-hide')
  })

  it('draws nothing without options', () => {
    expect(render(<ViewPill choices={[]} />)).toBe('')
  })
})

describe('ViewRow', () => {
  it('draws the pill and the note in the app', () => {
    expect(renderText(<ViewRow state={state()} />)).toBe('Everything Buyers Makers 273 makers’ and off-topic videos set aside')
  })

  it('prints the view in one line on a page printed or sent, never a control', () => {
    for (const mode of ['print', 'email'] as const) {
      const html = render(<ViewRow state={state()} mode={mode} />)
      expect(renderText(<ViewRow state={state()} mode={mode} />)).toBe('Buyers · 273 makers’ and off-topic videos set aside')
      expect(html).not.toContain('href')
    }
  })

  it('draws nothing where no view is live, and on a printed page reading every video with nothing to add', () => {
    expect(render(<ViewRow state={undefined} />)).toBe('')
    const all = state({ read: { state: 'everything', view: 'everything' }, params: {} })
    expect(render(<ViewRow state={all} mode="print" />)).toBe('')
    const off = state({ cfg: { views: false, setAside: false }, read: { state: 'everything', view: 'everything' } })
    expect(render(<ViewRow state={off} />)).toBe('')
  })

  it('keeps the note without a pill where only the default count sets off-topic videos aside', () => {
    const s = state({ cfg: { views: false, setAside: true }, read: { state: 'read', view: 'market', lens: 'all_but_noise', rows: [] }, inView: 601, params: {} })
    expect(renderText(<ViewRow state={s} />)).toBe('53 off-topic videos set aside')
    expect(render(<ViewRow state={s} />)).not.toContain('aria-label="View"')
  })

  it('meets the copy contract in every mode: each count is a figure node', () => {
    for (const mode of MODES) {
      expect(copyViolations(<ViewRow state={state()} mode={mode} />), mode).toEqual([])
    }
    expect(render(<ViewRow state={state()} />)).toContain('<span data-copy="figure">273</span>')
  })
})
