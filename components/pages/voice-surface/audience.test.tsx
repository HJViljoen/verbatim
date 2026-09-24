import { describe, expect, it } from 'vitest'

import { blockContext, blockAnswers, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { copyViolations } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { voiceAudience } from './audience'
import { refusedVoiceFixture, voiceFixture } from './fixture'

// VO1 · the audience, the platform and the kind (Phase 1 WP13).

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('', EMAIL, {})

const draw = (data = voiceFixture(), mode: RenderMode = 'app') => renderText(voiceAudience.render(data, mode, ctx))

describe('voiceAudience', () => {
  it('agrees with itself: the selected pill and the row it selects carry one count', () => {
    // The refused fixture overrode the audience's counts and left the options
    // as the category month's, so the pill read "Category 1,388" beside a row
    // reading "388 videos in this audience".
    const text = draw(refusedVoiceFixture())
    expect(text).toContain('Category 388')
    expect(text).not.toContain('1,388')
  })

  it('says "too thin to compare" in words, not only on a tooltip', () => {
    // The mark is the pill's weight, which is the mock's; the words were on
    // `title` alone, which reaches neither a keyboard nor a touch screen — so
    // for a thin audience nobody has selected, the fact that decides what the
    // page below may claim was mouse-only.
    const markup = render(voiceAudience.render(voiceFixture(), 'app', ctx))
    expect(markup).toContain('<span class="sr-only"> · too thin to compare</span>')
  })

  it('states the population once, and keeps its question off the bar', () => {
    // The right-hand basis column exists because each row is a share of a
    // different denominator — and two of them were not: the platform mix
    // divides the same population the audience row names, and every kind pill
    // carries its own "of N" inside it. The identical string printed three
    // times down one bar is how a reader learns to stop reading the column.
    // The selected pill carries the count; no right-hand note repeats it.
    const text = draw()
    expect(text).not.toContain('videos in this audience')
    // The question stays the block's declared contract — the print and email
    // spines read it — and off the artboard's 105px filter bar.
    expect(voiceAudience.question).toContain('Whose conversation is this')
    expect(text).not.toContain('Whose conversation is this')
  })

  it('renders in all three modes and keeps the copy contract', () => {
    for (const data of [voiceFixture(), refusedVoiceFixture()]) {
      for (const mode of MODES) {
        expect(copyViolations(voiceAudience.render(data, mode, ctx)), `${data.brand} · ${mode}`).toEqual([])
      }
    }
  })

  it('shows a thin audience WITH its count and marks it — never hides it', () => {
    // PORTED (wave 2): the pill wears the SWITCH's short label and marks thin
    // by weight, the way the artboard does; the words "too thin to compare"
    // move to the pill's title and to the row's note, where they are about the
    // audience actually being read.
    const text = draw()
    expect(text).toContain('Yours 3')
    expect(render(voiceAudience.render(voiceFixture(), 'app', ctx))).toContain('title="too thin to compare"')
  })

  it('says so in words when the audience being READ is the thin one', () => {
    const data = voiceFixture()
    const thin = { ...data, audience: { ...data.audience, thin: true, videos: 27 } }
    expect(draw(thin)).toContain('too thin to compare')
    expect(draw(thin)).not.toContain('27 videos in this audience')
  })

  it('keeps the audience its PROSE name in an email, where there is no switch', () => {
    // `audiencePillLabel` shortens a control's words, not the product's: the
    // email arm is a list of sentences and keeps "Your own brand".
    expect(draw(voiceFixture(), 'email')).toContain('Your own brand 3')
  })

  it('offers no audience it cannot read: not observed, or no longer tracked', () => {
    const text = draw()
    expect(text).not.toContain('not observed')
    expect(text).not.toContain('tracked to')
    expect(text).not.toMatch(/Poler/)
  })

  it('offers no "All" audience, because no row holds one', () => {
    // The mock opens the switch with "All". Every figure under this bar is
    // keyed by audience, and an "All" would be a SUM of denominators — the one
    // arithmetic AGENTS.md forbids. A pill that selects nothing readable is a
    // control that does not work, which this block does not print.
    const text = draw()
    expect(text).not.toMatch(/Audience\s+All\b/)
  })

  it('prints the platform mix largest first, with its share, and omits what the month did not carry', () => {
    const text = draw()
    // Over the floor, a whole-number share and nothing else.
    expect(text).toContain('TikTok 38%')
    expect(text).toContain('Reddit 12%')
    expect(text).not.toContain('38.0%')
    expect(text.indexOf('TikTok')).toBeLessThan(text.indexOf('Reddit'))
  })

  it('prints the kind ladder with each share against the one denominator', () => {
    const text = draw()
    expect(text).toMatch(/Asking how it works .*34%/)
    expect(text).not.toContain('34.0%')
    expect(text).not.toContain('472 of 1,388')
    // Under the floor, the count alone.
    const data = voiceFixture()
    const small = { ...data, audience: { ...data.audience, videos: 8, kinds: data.audience.kinds.map((k) => ({ ...k, videos: 2, denominator: 8, pct: 25 })) } }
    expect(draw(small)).toContain('2 of 8')
    expect(draw(small)).not.toContain('25%')
    // D4: the mock's bare "questions 34%" beside five others reads as a
    // partition, and the kinds do not partition anything — so every pill
    // carries its own count, INSIDE the pill. That is what makes the row's own
    // repeat of the population unnecessary.
    expect(text).not.toContain('share of 1,388 videos in this audience · Sep 2026')
  })

  it('says what is not recorded instead of a kind ladder when M5 is unapplied', () => {
    const text = draw(refusedVoiceFixture())
    expect(text).toContain('not recorded month by month for this workspace yet')
    expect(text).not.toContain('Asking how it works')
  })

  it('prints the platform mix as a reading, with no control claiming to narrow the page', () => {
    // The platform pills narrowed `audience.videos` and nothing else: Sealand
    // ?platform=tiktok read "146 videos · 9,397 comments" above rows reading
    // "48 of 437". A control that does not work is not printed (WP9).
    const text = draw()
    expect(text).toContain('TikTok')
    expect(text).toContain('Where it was said')
    expect(text).not.toContain('platform=')
  })

  it('prints no tenant-wide replies line and no Reddit clause inside an audience block', () => {
    const text = draw()
    expect(text).not.toContain('replies to another comment')
    expect(text).not.toContain('Reddit carried')
  })

  it('declares the audience denominator and the leading kinds as figures', () => {
    const answers = blockAnswers(voiceAudience, voiceFixture())
    expect(answers.figures.audience_videos).toMatchObject({ value: 1388, unit: 'videos' })
    expect(Object.keys(answers.figures).filter((k) => k.startsWith('kind_'))).toHaveLength(3)
    expect(answers.figures.replies_share.value).toBe(21)
  })

  it('hands its kind verdicts up rather than making a reviewer read the markup', () => {
    expect(blockAnswers(voiceAudience, voiceFixture()).verdicts).toHaveLength(1)
    expect(blockAnswers(voiceAudience, refusedVoiceFixture()).verdicts).toEqual([])
  })

  it('is not empty while the month has a denominator, even with every other half refused', () => {
    expect(voiceAudience.emptyState(refusedVoiceFixture())).toBeNull()
  })

  it('has one honest sentence when nothing at all was read', () => {
    const data = voiceFixture()
    const bare = { ...data, audience: { ...data.audience, videos: null, kinds: [], replies: null } }
    expect(voiceAudience.emptyState(bare)).toBe('Nothing has been read into this month for any audience yet.')
  })

  it('keeps its key, which is a stored contract', () => {
    expect(voiceAudience.key).toBe('voice.audience')
  })

  it('drops the filter bar\u2019s label column when the bar stops being a row', () => {
    // `w-[104px] flex-none` was unconditional under a parent that only flips to
    // a row at `xl:`. Below 1280 three of the four labels wrapped mid-phrase
    // ("WHERE IT WAS / SAID") inside a 104px box in a stacked column — four
    // wasted lines, no overflow, nothing to catch it.
    const markup = render(voiceAudience.render(voiceFixture(), 'app', ctx))
    expect(markup).toContain('xl:w-[104px]')
    // and never the unprefixed one: `xl:w-[104px]` is the fix, `w-[104px]`
    // preceded by a space or a quote is the defect.
    expect(markup).not.toMatch(/["\s]w-\[104px\]/)
  })

  it('does not dress the kind readings as controls', () => {
    // They wore the audience pills' exact chrome — same height, radius, ring
    // token, size and weight, in the same bar — and were not focusable and did
    // nothing. A keyboard user tabbing the bar found the top row focusable and
    // the next row silently not. The block's own header deleted the kind FILTER
    // on the rule that this product does not print controls that do not work;
    // the same rule takes the appearance of one.
    const markup = render(voiceAudience.render(voiceFixture(), 'app', ctx))
    const pills = markup.match(/rounded-full/g) ?? []
    // Four audience pills and nothing else on this bar.
    expect(pills).toHaveLength(voiceFixture().audience.options.filter((o) => o.selected || (o.observed && (o.videos ?? 0) > 0 && o.retiredAt == null)).length)
    expect(markup).toContain('Asking how it works')
    expect(markup).toContain('34%')
  })
})
