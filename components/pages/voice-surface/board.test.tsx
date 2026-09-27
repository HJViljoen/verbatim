import { describe, expect, it } from 'vitest'

import { blockContext, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { copyViolations } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { voiceBoard } from './board'
import { ossurVoiceFixture, refusedVoiceFixture, voiceFixture } from './fixture'

// C2 · every theme at 10 videos or more (market-first WP2.4, plan §2.4 C2,
// §5.9 "nothing skipped"), on staging's own September (the fixture's header).

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('', EMAIL, {})

const draw = (data = voiceFixture(), mode: RenderMode = 'app') => renderText(voiceBoard.render(data, mode, ctx))

describe('voiceBoard (C2): nothing skipped', () => {
  it('prints every theme at 10+ on staging’s September: 21 rows where the movers arms drew 7', () => {
    const data = voiceFixture()
    const every = [...data.board.rows, ...(data.board.makers ?? [])]
    expect(every).toHaveLength(21)
    expect(data.board.atTen).toBe(21)
    for (const mode of MODES) {
      const text = draw(data, mode)
      for (const t of every) expect(text, `${t.label} · ${mode}`).toContain(t.label)
    }
  })

  it('lists the 14 not led by makers first, biggest first, then the 7 maker-led themes grouped', () => {
    const text = draw()
    expect(text).toContain('Not led by makers 14')
    expect(text).toContain('Makers and DIY, grouped 7')
    expect(text).toContain('half or more of each theme’s videos are makers’ own')
    expect(text.indexOf('Buying interest and ordering questions')).toBeLessThan(text.indexOf('Praise for beautiful bag design'))
    expect(text.indexOf('Laundry planning for travel')).toBeLessThan(text.indexOf('Makers and DIY, grouped'))
    expect(text.indexOf('Makers and DIY, grouped')).toBeLessThan(text.indexOf('Love for creative upcycling'))
  })

  it('carries the base in its column heads and the month before as a level (August of 351)', () => {
    const text = draw()
    expect(text).toMatch(/Sep\s*of 625/)
    expect(text).toMatch(/Aug\s*of 351/)
    // Buying interest: 88 of 625 (14%) in September, 33 of 351 (9%) in August.
    expect(text).toMatch(/Buying interest and ordering questions[\s\S]*?88\s*14%\s*9%/)
  })

  it('prints each row’s maker share at a fifth or more, and its kind in the market’s words', () => {
    const text = draw()
    expect(text).toMatch(/Buying interest and ordering questions\s*Ready to buy\s*·\s*about a third makers/)
    // Under a fifth, nothing about makers: only the kind.
    expect(text).toMatch(/Confusion about airline size rules\s*Asking how it works\s*\d+ from searches/)
    // The maker-led rows say how far past half, not "mostly" seven times.
    expect(text).toMatch(/Love for creative upcycling\s*Praising it\s*·\s*over four in five makers/)
    expect(text).toMatch(/Requests for the sewing pattern\s*Asking how it works\s*·\s*all makers/)
  })

  it('flags New and Now 10+ with last month’s count, and says a flag is not a change (WP2.4)', () => {
    const text = draw()
    expect(text).toMatch(/Laundry planning for travel[\s\S]*?New\s*none in Aug/)
    expect(text).toMatch(/Preference for secondhand fashion[\s\S]*?New\s*none in Aug/)
    expect(text).toMatch(/More colors and variants wanted[\s\S]*?Now 10\+\s*2 in Aug/)
    const markup = render(voiceBoard.render(voiceFixture(), 'app', ctx))
    expect(markup.split('too few last month to call it a change').length - 1).toBeGreaterThanOrEqual(14)
    expect((markup.match(/>New</g) ?? []).length).toBe(2)
    expect((markup.match(/>Now 10\+</g) ?? []).length).toBe(12)
  })

  it('prints for every row how many of its videos came from searches added in September', () => {
    const data = voiceFixture()
    for (const t of [...data.board.rows, ...(data.board.makers ?? [])]) expect(t.provenance, t.label).not.toBeNull()
    expect(draw()).toMatch(/From searches\s*added in Sep/)
    // Price and sale questions: 11 of its 18 (the front page's lead count).
    expect(draw()).toMatch(/Price and sale questions[\s\S]*?18\s*3%\s*2%\s*11/)
  })

  it('opens the pane on the lead’s row with "in full below", and every other row is a link to its theme', () => {
    const markup = render(voiceBoard.render(voiceFixture(), 'app', ctx))
    expect(markup).toContain('in full below')
    expect(markup).toContain('href="/dashboard/voice?theme=03cabe7e#theme"')
    expect(markup).not.toContain('href="/dashboard/voice?theme=22e2445c#theme"')
  })

  it('keeps the reader’s month on every theme link', () => {
    const data = voiceFixture({ params: { month: '2026-08' } })
    expect(render(voiceBoard.render(data, 'app', ctx))).toContain('href="/dashboard/voice?month=2026-08&amp;theme=03cabe7e#theme"')
  })

  it('counts the 83 themes at 3 to 9 in its footer link, and lists them only when asked', () => {
    const markup = render(voiceBoard.render(voiceFixture(), 'app', ctx))
    expect(markup).toContain('href="/dashboard/voice?board=all#board"')
    expect(renderText(voiceBoard.render(voiceFixture(), 'app', ctx))).toContain('83 more themes at 3 to 9 videos →')
    expect(render(voiceBoard.render(voiceFixture(), 'print', ctx))).not.toContain('more themes at 3 to 9')
  })

  it('prints the themes view’s one chip, and no row carries a verdict, an arrow or a direction word', () => {
    for (const mode of MODES) {
      const text = draw(voiceFixture(), mode)
      expect(text).toContain('not read as a change: we changed our searches in September')
      expect(text).not.toMatch(/[▲▼]/)
      expect(copyViolations(voiceBoard.render(voiceFixture(), mode, ctx)).filter((v) => v.rule === 'direction-word')).toEqual([])
    }
  })

  it('Össur: 12 rows, no makers group, "Brand boycott over politics" New with none in August', () => {
    const text = draw(ossurVoiceFixture())
    expect(text).not.toContain('Not led by makers')
    expect(text).not.toContain('Makers and DIY')
    expect(text).toMatch(/Brand boycott over politics[\s\S]*?16[\s\S]*?New\s*none in Aug/)
    expect(ossurVoiceFixture().board.rows).toHaveLength(12)
  })

  // "AUG 0%" (the lead's ruling of 27 Sep): the preview's "·" where August did
  // not read the theme, in every mode; the flag says "none in Aug".
  it('Össur: "Brand boycott over politics" prints "·" in August, never "0%"', () => {
    for (const mode of MODES) {
      const text = draw(ossurVoiceFixture(), mode)
      expect(text, mode).toMatch(/Brand boycott over politics[\s\S]*?16\s+5%\s+·/)
      expect(text, mode).not.toMatch(/(^|\s)0%/)
    }
  })

  it('before MF1: nothing grouped, the one waiting line, and no provenance printed as a zero', () => {
    const text = draw(refusedVoiceFixture())
    expect(text).toContain('Makers’ videos are not marked yet; this list groups them once they are.')
    expect(refusedVoiceFixture().board.rows).toHaveLength(21)
    expect(text).not.toContain('Makers and DIY')
  })

  it('has a title alone in its header and a link alone in its footer (25 Sep rulings)', () => {
    const markup = render(voiceBoard.render(voiceFixture(), 'app', ctx))
    const footer = /<footer[\s\S]*?<\/footer>/.exec(markup)?.[0] ?? ''
    expect(footer).toContain('<a ')
    expect(footer).not.toContain('font-mono')
    expect(markup).toMatch(/<h2[^>]*>Every theme at 10 videos or more<\/h2>/)
  })

  it('renders in all three modes and keeps the copy contract', () => {
    for (const data of [voiceFixture(), ossurVoiceFixture(), refusedVoiceFixture()]) {
      for (const mode of MODES) {
        expect(copyViolations(voiceBoard.render(data, mode, ctx)), `${data.brand} · ${mode}`).toEqual([])
      }
    }
  })

  it('says the list opens at 10 when no theme reached it', () => {
    const data = voiceFixture()
    const empty = { ...data, board: { ...data.board, rows: [], makers: [], setAside: [], atTen: 0 } }
    expect(voiceBoard.emptyState(empty)).toBe('No theme reached 10 videos in September yet; the list opens at 10.')
  })
})

// ROW BY ROW: each of staging's themes at 10+ is on the board with its own
// figures, in the app and in the email. A theme missing from either, or
// printed with another theme's numbers, fails its own case.
describe('voiceBoard: every staging theme at 10+, row by row', () => {
  const rowsOf = (data: ReturnType<typeof voiceFixture>) => [...data.board.rows, ...(data.board.makers ?? []), ...(data.board.setAside ?? [])]
  const cases = [
    ...rowsOf(voiceFixture()).map((t) => ['Sealand', t.label, t.registryId] as const),
    ...rowsOf(ossurVoiceFixture()).map((t) => ['Össur', t.label, t.registryId] as const),
  ]
  it.each(cases)('%s · “%s” prints with its videos, its month’s level and its flag', (tenant, label, id) => {
    const data = tenant === 'Sealand' ? voiceFixture() : ossurVoiceFixture()
    const t = rowsOf(data).find((r) => r.registryId === id)!
    for (const mode of ['app', 'email'] as const) {
      const text = renderText(voiceBoard.render(data, mode, ctx))
      const at = text.indexOf(label)
      expect(at, mode).toBeGreaterThanOrEqual(0)
      const row = text.slice(at, at + 400)
      expect(row, mode).toContain(String(t.k))
      expect(row, mode).toContain(`${Math.round((t.k / t.n) * 100)}%`)
      if (t.flags[0] === 'new') expect(row, mode).toContain('New')
      if (t.flags[0] === 'now_10') expect(row, mode).toContain('Now 10+')
    }
  })

  const provenanceCases = rowsOf(voiceFixture()).map((t) => [t.label, t.registryId] as const)
  it.each(provenanceCases)('Sealand · “%s” prints how many of its videos came from searches added in September', (_label, id) => {
    const t = rowsOf(voiceFixture()).find((r) => r.registryId === id)!
    expect(t.provenance).not.toBeNull()
    expect(t.provenance!.of).toBe(t.k)
    expect(t.provenance!.fromNewSearches).toBeLessThanOrEqual(t.k)
    const text = renderText(voiceBoard.render(voiceFixture(), 'app', ctx))
    const row = text.slice(text.indexOf(t.label), text.indexOf(t.label) + 400)
    expect(row).toContain(`${t.provenance!.fromNewSearches} from searches added in Sep`)
  })
})
