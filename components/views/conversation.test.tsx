import { describe, expect, it } from 'vitest'

import { blockContext, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { copyViolations } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { conversationView } from '@/lib/views/conversation'
import { SEALAND_LENS } from '@/lib/views/fixture'
import { voiceAudience } from '@/components/pages/voice-surface/audience'
import { voiceFixture } from '@/components/pages/voice-surface/fixture'

// "The market in the month" (C1) read on a view (plan §2.4 C1, WP3.3), on
// staging's September: the stored reading of the Conversation fixture, and
// Sealand's buyers lens for the same month (lib/views/fixture.ts).

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('', EMAIL, {})
const RIVALS = ['competitor:Cotopaxi', 'competitor:Freitag', 'competitor:Patagonia', 'competitor:The North Face']

function onBuyers() {
  const stored = voiceFixture()
  const cv = conversationView({
    cfg: { views: true, setAside: false }, asked: 'buyers',
    read: { state: 'read', view: 'buyers', lens: 'buyers', rows: SEALAND_LENS.buyers },
    month: '2026-09-01', prevMonth: '2026-08-01',
  })
  const out = cv.finish(stored.market, { month: '2026-09-01', rivalAudiences: RIVALS, params: { view: 'buyers' } })
  return voiceFixture({ market: out.market, view: out.view, board: { ...stored.board, inThemes: cv.inThemes(stored.board.inThemes) } })
}

describe('C1 on the Buyers view', () => {
  it('prints the buyers’ own counts, the pill with Buyers pressed, and what the view set aside', () => {
    const text = renderText(voiceAudience.render(onBuyers(), 'app', ctx))
    expect(text).toContain('381 videos in your market in September.')
    expect(text).toContain('355 are in the category, where themes are grouped, and 26 are filed under a brand you track.')
    expect(text).toContain('Everything Buyers Makers 273 makers’ and off-topic videos set aside')
    const html = render(voiceAudience.render(onBuyers(), 'app', ctx))
    expect(html).toMatch(/<a aria-current="page"[^>]*href="\/dashboard\/voice\?view=buyers"/)
  })

  it('draws no platform split and no share of videos in themes, which the lens cannot say', () => {
    const text = renderText(voiceAudience.render(onBuyers(), 'app', ctx))
    expect(text).not.toContain('Where it was said')
    expect(text).not.toContain('sit in a theme of 10 or more')
  })

  it('prints the view in one line when printed or sent, and meets the copy contract in every mode', () => {
    expect(renderText(voiceAudience.render(onBuyers(), 'print', ctx))).toContain('Buyers · 273 makers’ and off-topic videos set aside')
    expect(renderText(voiceAudience.render(onBuyers(), 'email', ctx))).toContain('Buyers · 273 makers’ and off-topic videos set aside')
    for (const mode of MODES) expect(copyViolations(voiceAudience.render(onBuyers(), mode, ctx)), mode).toEqual([])
  })

  it('is today’s block where no view is live: no pill, no note', () => {
    const text = renderText(voiceAudience.render(voiceFixture(), 'app', ctx))
    expect(text).not.toContain('Buyers')
    expect(text).toContain('Where it was said')
  })
})
