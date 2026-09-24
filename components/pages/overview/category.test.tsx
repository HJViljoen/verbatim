import { describe, it, expect } from 'vitest'

import { blockAnswers, blockContext, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract, copyViolations } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { KIND_NOT_COMPARED, categoryMeta, overviewCategory, panelNote, panelRule } from './category'
import { overviewFixture, refusedFixture } from './fixture'

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('https://app.verbatimintel.com', EMAIL)

describe('OV3 · what the category is saying', () => {
  it('renders in all three modes and keeps the copy contract', () => {
    for (const data of [overviewFixture(), refusedFixture()]) {
      for (const mode of MODES) {
        assertCopyContract(render(overviewCategory.render(data, mode, ctx)))
      }
    }
  })

  // `CalendarLine` sizes every label in VIEWBOX UNITS and scales its drawing
  // uniformly into its container, so the intrinsic width is the scale factor.
  // In the third of a `TileColumns of={3}` — about 352px at 1440 — the 880-unit
  // default is a 0.40 downscale: a 10px axis label at 4.0px and the end label's
  // own figure at 4.4px (Block D wave 3, M2 / SH1).
  it('draws the attention chart at its column’s own width, not the 880 default', () => {
    const markup = render(overviewCategory.render(overviewFixture(), 'app', ctx))
    const view = /viewBox="0 0 (\d+) (\d+)"/.exec(markup)
    expect(view?.[1]).toBe('352')
    expect(view?.[2]).toBe('110')
    // And the end label sits INSIDE the box: it is drawn at
    // `width - padR + 10` and clipped by nothing.
    // SH1 moved the end label's size off the `font-size` ATTRIBUTE and into a
    // `style="font-size:calc(11px * var(--cal-ke, 1))"` so it scales with the
    // container; the anchor is now the weight, which SH1 left alone.
    const end = /<text x="(\d+(?:\.\d+)?)" y="[^"]*" style="font-size:calc\(11px[^"]*" font-weight="600"/.exec(markup)
    expect(Number(end?.[1])).toBeLessThanOrEqual(232)
  })

  // A FROZEN ARTEFACT PREDATES A REQUIRED FIELD (Block D wave 3, M6).
  // `CategoryBlock.quiet` is new and required in Block D, and `overview
  // .category` was already named by a section map at 017fc6e — so the brief
  // deck hands a snapshot built then to this block today with a bare
  // `as never`. `c.quiet.length` on it threw inside a SERVER COMPONENT, which
  // takes the share link, the viewer, the Studio preview and the PDF route
  // rather than one tile.
  it('renders a stored surface that predates `quiet`, in every mode', () => {
    for (const mode of MODES) {
      const data = overviewFixture()
      const category = { ...data.category } as Record<string, unknown>
      delete category.quiet
      const stale = { ...data, category: category as unknown as typeof data.category }
      expect(() => render(overviewCategory.render(stale, mode, ctx))).not.toThrow()
      expect(renderText(overviewCategory.render(stale, mode, ctx))).toContain('No longer being said')
    }
  })

  it('prints the four lines with their headings', () => {
    const text = renderText(overviewCategory.render(overviewFixture(), 'app', ctx))
    for (const heading of ['Kind of thing said', 'What moved most', 'Mood', 'Attention']) {
      expect(text).toContain(heading)
    }
  })

  it('states each kind against one denominator, and leaves the Reddit split to Voice (A38)', () => {
    const text = renderText(overviewCategory.render(overviewFixture(), 'app', ctx))
    expect(text).toContain('470 of 1,388')
    expect(text).not.toContain('Reddit carried')
    expect(text).not.toContain('a video carrying both is counted in each')
  })

  // A CHANGE WITHOUT ITS BAND OR ITS BASIS IS A NUMBER A READER CANNOT WEIGH.
  // The band lived in a `title` attribute — invisible in print and in email,
  // where the email arm dropped it entirely — and nothing on OV3 said what the
  // two sides of "▲ 5.3 pts" were, while This week prints a different figure for
  // the same theme in the same month.
  it('prints the band and the basis, not a tooltip', () => {
    for (const mode of MODES) {
      const text = renderText(overviewCategory.render(overviewFixture(), mode, ctx))
      // Ruling I: the band is text on paper and in email, a tooltip on screen.
      if (mode === 'app') expect(render(overviewCategory.render(overviewFixture(), mode, ctx))).toContain('pt margin of this measurement')
      else expect(text).toContain('band')
      expect(text).toContain('What moved most')
      expect(text).not.toContain('What moved most · Sep 2026')
    }
  })

  it('keeps every direction word inside a verdict node', () => {
    const markup = render(overviewCategory.render(overviewFixture(), 'app', ctx))
    expect(markup).toContain('growing, 3rd month')
    expect(markup).toContain('fading, 3rd month')
    expect(copyViolations(markup).filter((v) => v.rule === 'direction-word')).toEqual([])
  })

  it('prints the mood with its judged denominator and the framing footnote', () => {
    const text = renderText(overviewCategory.render(overviewFixture(), 'app', ctx))
    expect(text).toContain('of 1,112 judged')
    expect(text).toContain('9.7% judged on the video’s framing')
  })

  it('says what is not recorded rather than printing zeros', () => {
    const text = renderText(overviewCategory.render(refusedFixture(), 'app', ctx))
    expect(text).toContain('What kind of thing is being said is not recorded month by month')
    expect(text).toContain('How the month was received is not recorded month by month')
    expect(text).toContain('No panel has been frozen')
    // The movers still read, because the theme months are seeded.
    expect(text).toContain('Will it survive a wet commute')
  })

  it('draws the attention line as a month chart and names its exclusion', () => {
    const markup = render(overviewCategory.render(overviewFixture(), 'app', ctx))
    expect(markup).toContain('<svg')
    // Why Reddit is left out is How to read's; the panel note says that it is.
    expect(markup).toContain('excl. Reddit')
    expect(markup).not.toContain('Reddit is left out of this comparison')
  })

  it('falls back to the numbers in an email with no image', () => {
    const markup = render(overviewCategory.render(overviewFixture(), 'email', ctx))
    expect(markup).not.toContain('<svg')
    expect(markup).toContain('41,200')
    expect(markup).not.toContain('class=')
    expect(markup).not.toContain('var(--')
  })

  it('declares the block’s own figures and hands back every verdict behind them', () => {
    const { figures, verdicts } = blockAnswers(overviewCategory, overviewFixture())
    expect(Object.keys(figures).sort()).toEqual([
      'attention_comments', 'attention_videos', 'category_videos',
      'kind_pain_point_share', 'kind_praise_share', 'kind_question_share', 'mood_negative_share',
    ])
    expect(verdicts.length).toBeGreaterThanOrEqual(5)
  })

  it('does not publish the panel’s size as a figure — there is no unit for a count of accounts', () => {
    const { figures } = blockAnswers(overviewCategory, overviewFixture())
    // `sent-figures.ts` files anything that is not 'comments' as 'videos', and
    // `sent_figures` has no UPDATE grant, so a count of accounts published here
    // would be written down as a count of videos permanently. It is rendered
    // beside the line instead, where the reader can see what it counts.
    expect(figures.attention_panel_accounts).toBeUndefined()
    for (const f of Object.values(figures)) {
      expect(['videos', 'comments', 'pts', 'pct']).toContain(f.unit)
    }
    expect(renderText(overviewCategory.render(overviewFixture(), 'app', ctx))).toContain('a fixed panel of 214 accounts')
  })

  it('carries the attention verdict — declared since WP11, and null in the loader until now', () => {
    const { verdicts } = blockAnswers(overviewCategory, overviewFixture())
    const attention = verdicts.find((v) => v.objectKind === 'audience' && v.countedOver?.measure === 'comments')
    expect(attention).toBeDefined()
    // The panel re-froze inside the window, so the two sides were read over two
    // different sets of accounts. That is the honest answer in place of the
    // mock's "−18% since June", and it is a refusal with a reason, not a silence.
    expect(attention?.state).toBe('refused')
    expect(attention?.refusedReason).toBe('tracking_change')
  })

  it('publishes no change figure for a comparison that refused', () => {
    const { figures } = blockAnswers(overviewCategory, overviewFixture())
    expect(figures.attention_change).toBeUndefined()
    expect(figures.attention_band).toBeUndefined()
  })

  it('names the panel’s size, which is the only denominator a comment count has', () => {
    // BLOCK D WAVE 2 (`main.category.attention.note`, D7): the artboard's line
    // carries five facts and the build printed one. The two levels print with
    // no magnitude across them — the panel re-froze between the two months, so
    // the mock's "−18% since June" compares two populations.
    // AND NO ARROW ACROSS THE RE-FREEZE (code review I5, fix pass). The line
    // argued that the mock's "−18% since June" is refused BECAUSE the panel
    // re-froze between the two months, and then printed those same two numbers
    // with an arrow between them — which is the subtraction the verdict beside
    // it refuses, invited in the reader's own eye. The break is named between
    // them now, with its date, and the second month says which panel it is on.
    const text = renderText(overviewCategory.render(overviewFixture(), 'app', ctx))
    expect(text).toContain(
      'a fixed panel of 214 accounts · first seen before 1 Apr · excl. Reddit · Jul 2026 50,300 comments · panel re-frozen 3 Sep · Sep 2026 41,200 comments under the new panel',
    )
    expect(text).not.toContain('18% since June')
    expect(text).not.toContain('50,300 → 41,200')
  })

  it('draws the axis rule where the panel re-froze, and nowhere else', () => {
    const data = overviewFixture()
    // ONE WORD FOR ONE EVENT: the rule's kind is the refusal reason the verdict
    // on the same card carries, not a second vocabulary for the same re-freeze.
    expect(panelRule(data.category)).toEqual([
      { month: '2026-09-01', kind: 'tracking_change', label: 'panel re-frozen', at: '2026-09-03' },
    ])
    expect(panelRule(data.category)[0].kind).toBe(data.category.attention?.verdict?.refusedReason)
    // A rule on the first month of the axis marks a break with nothing on the
    // other side of it, so it is not drawn.
    const first = overviewFixture({
      category: {
        ...data.category,
        attention: { ...data.category.attention!, axis: ['2026-09-01'], months: data.category.attention!.months.slice(-1) },
      },
    })
    expect(panelRule(first.category)).toEqual([])
  })

  it('prints the gone-quiet flag as a flag, with no direction word outside it', () => {
    const markup = render(overviewCategory.render(overviewFixture(), 'app', ctx))
    expect(markup).toContain('No longer being said')
    // The heading carries no direction word; the flag lives inside a verdict
    // node, which is what makes it sayable at all (copy contract rule (c)).
    expect(markup).toMatch(/data-copy="verdict"[^>]*>gone quiet · last heard Jun 2026/)
    assertCopyContract(markup)
  })

  it('tells "we do not record dormancy" from "nothing has stopped"', () => {
    const text = renderText(overviewCategory.render(refusedFixture(), 'app', ctx))
    expect(text).toContain('Which themes have stopped being said is not recorded for this workspace yet.')
  })
})

describe('the quotes this block declares (mkt.p3.quote)', () => {
  it('claims the month’s voices only where the lead is a theme in this audience', () => {
    const data = overviewFixture()
    const lead = data.sentence.lead
    const refs = blockAnswers(overviewCategory, data).quotes
    if (lead && lead.objectKind === 'theme' && lead.audience === data.category.audience) {
      expect(refs).toEqual(data.sentence.voices.map((v) => v.quote.ref))
      // Refs, never words — a snapshot freezes ids and resolves at render.
      for (const ref of refs) expect(ref).toMatch(/^[ecvmp]:|^h:|^b:/)
    } else {
      expect(refs).toEqual([])
    }
  })

  it('claims none when the month’s lead is a subject — a quote is only about the category when its citation was', () => {
    const data = overviewFixture()
    const asSubject = { ...data, sentence: { ...data.sentence, lead: data.sentence.lead ? { ...data.sentence.lead, objectKind: 'subject' as const } : null } }
    expect(blockAnswers(overviewCategory, asSubject).quotes).toEqual([])
  })

  it('claims none on a workspace whose month could not be read', () => {
    expect(blockAnswers(overviewCategory, refusedFixture()).quotes).toEqual([])
  })
})

// ---- Block D wave 2 · the artboard's §3 ------------------------------------

describe('OV3, ported to the artboard', () => {
  it('lays the four lines out in the artboard’s three columns', () => {
    // mock-gap §Visual fidelity: the mood-beside-attention arrangement and the
    // kind-rows-beside-more control all collapsed into one stacked column.
    const markup = render(overviewCategory.render(overviewFixture(), 'app', ctx))
    expect(markup).toContain('xl:grid-cols-3')
  })

  it('gives every kind row its own "of N" and draws no partition', () => {
    // D4/D10: kinds overlap (175%–228% of one denominator), so each row is an
    // independent share and there is no remainder slice to draw.
    const text = renderText(overviewCategory.render(overviewFixture(), 'app', ctx))
    expect(text).toContain('Questions 33.9% 470 of 1,388')
    expect(text).toContain('Praise 28.0% 389 of 1,388')
    expect(text).not.toContain('Other kinds')
  })

  it('heads the two mover arms with a band, never with a direction word', () => {
    const markup = render(overviewCategory.render(overviewFixture(), 'app', ctx))
    const text = renderText(overviewCategory.render(overviewFixture(), 'app', ctx))
    expect(text).toContain('Larger share than last month')
    expect(text).toContain('Smaller share than last month')
    expect(text).not.toContain('Cleared their band')
    // The mock's own headings would have failed rule (c) outright.
    expect(copyViolations(markup).filter((v) => v.rule === 'direction-word')).toEqual([])
  })

  it('states the basis in the header as well as the denominator', () => {
    const c = overviewFixture().category
    expect(categoryMeta(c)).toBe('1,388 category videos this month · Sep 2026 against Aug 2026')
    expect(categoryMeta({ ...c, denominator: null })).toBeUndefined()
  })

  it('drops a panel clause that has no field behind it rather than inventing one', () => {
    const a = overviewFixture().category.attention!
    // With no panel row there is no re-freeze to name, and the two months are
    // still two dated levels rather than a run.
    expect(panelNote({ ...a, accountCount: null, panel: null })).toBe('Jul 2026 50,300 comments · Sep 2026 41,200 comments')
    expect(panelNote(null)).toBeNull()
  })

  it('prints the banded step on its own line, never orphaned beside a wrapped note', () => {
    // Design review High 7b: the note and the verdict shared one flex-wrap
    // paragraph, so in a 380px column the verdict landed alone on a third line
    // as "comparison refused" with nothing naming what was refused.
    const text = renderText(overviewCategory.render(overviewFixture(), 'app', ctx))
    expect(text).not.toContain('month on month')
    // And the panel's date is printed in ONE format, in one place (High 7a).
    expect(text).not.toContain('2026-09-03')
  })

  it('offers the one click down without choosing a kind for the reader', () => {
    // CHANGED BY THE FIX PASS (design review Medium 12, code review I9). The
    // control hard-coded `c.kinds[0]?.kind`, so a link sitting under three rows
    // silently filtered Voice to whichever kind sorted first — and this test
    // pinned that rather than catching it. A control under N rows either
    // belongs on each row or belongs to none of them.
    const markup = render(overviewCategory.render(overviewFixture(), 'app', ctx))
    expect(markup).toContain('more · one click down →')
    expect(markup).not.toContain('/dashboard/voice?type=')
  })

  it('names the change cell a kind has no comparison for', () => {
    // Design review Medium 11: "Complaints" had a BLANK cell between two
    // siblings that carried values — the one absence on this page that did not
    // say what it was. A null verdict is no comparison at all, which is not the
    // same statement as "no clear change".
    const text = renderText(overviewCategory.render(overviewFixture(), 'app', ctx))
    expect(text).toContain(`Complaints 19.0% 264 of 1,388 ${KIND_NOT_COMPARED}`)
  })

  it('puts "nothing else moved" in the footer note', () => {
    const markup = render(overviewCategory.render(overviewFixture(), 'app', ctx))
    expect(markup).toContain('font-normal text-muted-foreground">Nothing else moved clearly this month.')
  })
})
