import { describe, expect, it } from 'vitest'

import { blockAnswers, blockContext, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { copyViolations } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { voiceTheme } from './theme'
import { refusedVoiceFixture, voiceFixture } from './fixture'

// VO3 · a theme in full (Phase 1 WP13).

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('', EMAIL, { audience: 'industry-other' })

const draw = (data = voiceFixture(), mode: RenderMode = 'app') => renderText(voiceTheme.render(data, mode, ctx))

describe('voiceTheme', () => {
  // "0 OF THE VOICES" WAS BOTH DEFECTS AT ONCE: not English on the zero path,
  // and a count with a definite article and no denominator on every other.
  // Rendered on production: Össur "0 of the voices", Sealand "6 of the voices".
  it('names the voices against the n behind the theme, and says "Voices" when there are none', () => {
    expect(draw()).toContain('6 of 182 voices')
    expect(draw()).not.toContain('of the voices')

    const none = voiceFixture()
    none.theme.quotes = []
    none.theme.quoteCites = []
    none.theme.quoteOnScreen = []
    expect(draw(none)).toContain('Voices')
    expect(draw(none)).toContain('No comment behind this theme can be quoted.')
    expect(draw(none)).not.toContain('0 of 182 voices')
    expect(draw(none)).not.toContain('voices No comment')

    // No theme row for this registry entry: the count stands on its own rather
    // than inventing a denominator.
    const unknown = voiceFixture()
    unknown.theme.quotesOf = null
    expect(draw(unknown)).toContain('6 voices')
  })

  it('renders in all three modes and keeps the copy contract', () => {
    for (const data of [voiceFixture(), refusedVoiceFixture()]) {
      for (const mode of MODES) {
        expect(copyViolations(voiceTheme.render(data, mode, ctx)), `${data.brand} · ${mode}`).toEqual([])
      }
    }
  })

  it('prints the share with the count it rests on, never a bare percentage', () => {
    const text = draw()
    expect(text).toContain('9.4%')
    expect(text).toContain('130 of 1,388 this month')
  })

  it('prints the calibrated level only with its denominator', () => {
    expect(draw()).toContain('Widespread · 130 of 1,388 videos')
  })

  it('says when it was first heard and how many of the drawn months carried it', () => {
    expect(draw()).toContain('first heard July 2026 · seen in 3 of 3 months drawn')
  })

  it('answers "first heard" off the record even when that month is not drawn', () => {
    // The horizon pill moves the axis; it does not move the month a theme was
    // first said in. Off the drawn months this line read September, July,
    // March and June 2026 for one Össur theme the record carries from
    // November 2022.
    const base = voiceFixture()
    const text = draw({ ...base, theme: { ...base.theme, firstHeard: '2022-11-01', firstHeardOnAxis: false } })
    expect(text).toContain('first heard November 2022, before the months drawn here')
    expect(text).not.toContain('first read here')
  })

  it('heads the tone line as the AUDIENCE’s, because that is whose it is', () => {
    expect(draw()).toContain('Tone · the category, all judged videos')
  })

  it('draws all four moods, because `moodShares` returns four', () => {
    // The fixture listed three and left `mixed` out, so the fourth segment and
    // the two-row legend four segments produce at this width had never been
    // rendered — although production returns four on every judged month.
    const text = draw()
    for (const label of ['Warm', 'Both ways', 'Matter-of-fact', 'Cold']) expect(text, label).toContain(label)
  })

  it('says what is not recorded instead of a tone line when M5 is unapplied', () => {
    const text = draw(refusedVoiceFixture())
    expect(text).toContain('not recorded month by month for this workspace yet')
    expect(text).not.toContain('of 1,112 judged')
  })

  it('carries the original quote and its translation, labelled', () => {
    const text = draw()
    expect(text).toContain('Nach 14 Monaten ist der Reißverschluss hin')
    expect(text).toContain('After 14 months the zip is done')
  })

  it('prints the spoken line with its provenance, from a video no quote came out of', () => {
    const text = draw()
    expect(text).toContain('Said on camera')
    expect(text).toContain('It kept a laptop dry through a whole winter of commuting.')
    expect(text).toContain('YouTube · 9 Sep · a category video')
    // SAID ONCE, the transcript half (lib/pages/voice-surface.ts). Quote 2 is
    // cited "a category video, transcript" — an extract of the 11 Sep video's
    // transcript — so this line may not be the head of that same transcript,
    // printed ninety pixels away in a second transcription.
    expect(text).not.toContain('One bag, three years, no regrets.')
  })

  it('cites a quote by platform, date and where — not by which column it came out of', () => {
    // PORTED (wave 2): `insight_evidence` holds the words and
    // `audience_insights.source_video_id` holds the video, so the cite can be
    // the artboard's. The folded phrase survives for a quote whose video did
    // not resolve, which is a real state — a superseded insight row.
    const text = draw()
    expect(text).toContain('TikTok · 14 Sep · under a category video')
    expect(text).toContain('TikTok · 11 Sep · a category video, transcript')
    expect(text).toContain('in the comments')
  })

  it('nests a video\u2019s on-screen text under the quote taken FROM that video', () => {
    const text = draw()
    expect(text).toContain('On-screen text on the same video: 1 bag. 3 years. 0 regrets')
    // Said ONCE: the loose block-level "On screen" line would read as a second
    // piece of evidence for the same words.
    expect(text).not.toContain('On screen “1 bag')
  })

  it('sets the voices across three columns and fills both rows of them', () => {
    expect(render(voiceTheme.render(voiceFixture(), 'app', ctx))).toContain('xl:grid-cols-3')
    // `THEME_QUOTES` is six and the artboard draws two rows of three. With
    // three in the fixture the second row — its gutter, its baseline against
    // the cite block, the height the tile comes out at — was in no screenshot.
    expect(voiceFixture().theme.quotes).toHaveLength(6)
    const text = draw()
    expect(text).toContain('Instagram · 5 Sep · under a Cotopaxi post')
    expect(text).toContain('On-screen text on the same video: Zip test: 400 cycles, no failure')
  })

  it('draws the on-camera count as a figure carrying its own basis (D15)', () => {
    const text = draw()
    expect(text).toContain('17 said it on camera')
    expect(text).toContain('of the 120 quotes behind this theme, counted over the whole update, not this month')
    // Once, not twice: the sentence form is for the arm where the numbers are
    // absent.
    expect(text.split('said on camera rather than typed')).toHaveLength(1)
  })

  it('prints the month the share moved from, and rules the bar there against a NAMED axis', () => {
    const text = draw()
    expect(text).toContain('130 of 1,388 this month · Aug 6.8% of 1,200')
    expect(text).toContain('rule at Aug 6.8% · Sep 9.4%')
    // The artboard draws 9.4% at 62.7% of the bar and never says against what.
    expect(text).toContain('share of the category videos, axis to 15%')
  })

  it('captions the monthly line with each month\u2019s own reading AND its own n', () => {
    // The bare form — "Aug 6.8%" — is the one deviation 6 of this port refuses
    // on the mover rows and on the big figure: the three months have three
    // denominators, which is the whole reason the change between two of them
    // is banded. The chart's hover `<title>` is not an answer; it is mouse-only
    // and absent from print and from the PDF.
    expect(draw()).toContain('share of the category videos · Jul 5.9% of 1,200 · Aug 6.8% of 1,200 · Sep 9.4% of 1,388, still filling')
  })

  it('prints the theme\u2019s name twice, the way the artboard does — not four times', () => {
    // Heading, chart legend, chart end label, caption: one string rendered
    // four times, and the legend prints the SERIES label, which is the one
    // shortened to thirty characters. The refused state showed
    // "Admiration for personal resil…" twice with the full name two lines
    // above. The legend is off; the one word it carried besides the name —
    // "still filling" — is in the caption.
    const markup = render(voiceTheme.render(refusedVoiceFixture(), 'app', ctx))
    // Minus the hover `<title>`s, which are a mouse-only tooltip and print
    // nowhere — the reason I2 moved the denominators into the caption.
    const visible = markup.replace(/<title[^>]*>[\s\S]*?<\/title>/g, '')
    expect(visible.split('Admiration for personal resil…')).toHaveLength(2)
    expect(renderText(voiceTheme.render(refusedVoiceFixture(), 'app', ctx))).toContain('still filling')
  })

  it('shortens only the CHART\u2019s copy of a long name, never the block\u2019s', () => {
    // `CalendarLine` draws the series name outside the plot area, in the 180
    // units padR reserves; past about thirty characters at this column's width
    // it runs out of the tile, which is what Össur's theme did on production.
    // The name itself is the heading two lines above.
    const long = refusedVoiceFixture()
    const text = draw(long)
    expect(text).toContain('Admiration for personal resilience')
    expect(text).toContain('Admiration for personal resil…')
  })

  it('says nothing about speech when no video carries any', () => {
    const text = draw(refusedVoiceFixture())
    expect(text).not.toContain('Said on camera')
    expect(text).toContain('No video behind this theme carries readable speech')
  })

  it('counts the withheld evidence, refuses to quote it, and says so at zero too', () => {
    expect(draw()).toContain('Who these commenters are — counted, not quoted')
    expect(draw()).toContain('4 comments describe who these commenters are and are counted rather than quoted.')
    // PORTED (wave 2): the line printed only when there was something to
    // count, so at zero a reader could not tell "nothing was withheld" from
    // "we do not do this".
    const none = voiceFixture()
    expect(draw({ ...none, theme: { ...none.theme, withheld: 0 } }))
      .toContain('Nothing behind this theme describes who the commenters are.')
  })

  it('links to the conclusion rather than rebuilding Market’s list here (decision Q)', () => {
    const text = draw()
    expect(text).toContain('What we concluded from this →')
    // The mock draws four conclusions at the foot of Voice. Two lists of
    // conclusions is two lists; MK1 owns it.
    expect(text).not.toContain('What we concluded this month')
  })

  it('offers Track this as a primary button, Ask about this beside it, and the videos in the footer', () => {
    const text = draw()
    const markup = render(voiceTheme.render(voiceFixture(), 'app', ctx))
    expect(text).toContain('Track this')
    expect(text).toContain('Ask about this')
    expect(text).toContain('The 130 videos behind this →')
    // The artboard's green primary. The green does four jobs in this product
    // and the page's primary action is one of them.
    expect(markup).toContain('bg-primary')
  })

  it('gives the search a visible focus indicator, and room for its own placeholder', () => {
    // The port restyled the input into a pill and put `outline-none` on it
    // with nothing back: a `<form>` receives no `:focus`, so a keyboard user
    // tabbing to the page's one text control saw nothing at all. And at
    // `max-w-[300px]` the inline label ate half the box — the placeholder
    // rendered as "search every theme evei" at 1440.
    const markup = render(voiceTheme.render(voiceFixture(), 'app', ctx))
    expect(markup).toContain('focus-within:ring-2')
    expect(markup).not.toContain('xl:max-w-[300px]')
  })

  it('carries the reader’s whole selection into the search', () => {
    const markup = renderText(voiceTheme.render(voiceFixture(), 'app', ctx))
    expect(markup).toContain('Have we seen this before?')
  })

  it('says the register matched nothing rather than showing an empty list', () => {
    const base = voiceFixture()
    const text = draw({ ...base, theme: { ...base.theme, search: { q: 'zzz', rows: [], total: 0 } } })
    expect(text).toContain('Nothing in the register matches “zzz”')
  })

  it('dates a register row by the record, never by the run that opened the entry', () => {
    const base = voiceFixture()
    const text = draw({
      ...base,
      theme: {
        ...base.theme,
        search: { q: 'zip', total: 1, rows: [{ id: 'z', label: 'Zips failing after a year', firstHeard: '2022-07-01', updates: 4, active: false, href: '/dashboard/voice?theme=z' }] },
      },
    })
    // `theme_registry.first_seen_at` read 2026-09 for every Sealand theme on
    // production, including ones the month tables carry from 2022 — a period
    // dated by the run, printed two lines under a chart that says otherwise.
    expect(text).toContain('Zips failing after a year first heard Jul 2022 · 4 updates have carried it')
    expect(text).not.toContain('2022-07')
  })

  it('says how many the register matched, not how many rows it drew', () => {
    // "prosthetic" matches 272 Össur register entries; the list shows twelve.
    const base = voiceFixture()
    const text = draw({
      ...base,
      theme: {
        ...base.theme,
        search: { q: 'zip', total: 272, rows: [{ id: 'z', label: 'Zips failing after a year', firstHeard: '2022-07-01', updates: 4, active: false, href: '/dashboard/voice?theme=z' }] },
      },
    })
    expect(text).toContain('Showing 1 of 272 matches')
  })

  it('says a theme is not read in this audience rather than leaving the date blank', () => {
    const base = voiceFixture()
    const text = draw({
      ...base,
      theme: {
        ...base.theme,
        search: { q: 'zip', total: 1, rows: [{ id: 'z', label: 'Zips failing after a year', firstHeard: null, updates: 4, active: false, href: '/dashboard/voice?theme=z' }] },
      },
    })
    expect(text).toContain('not read in the category · 4 updates have carried it')
  })

  it('declares its share, its count and the cold share as figures', () => {
    const table = blockAnswers(voiceTheme, voiceFixture()).figures
    expect(table.theme_share.value).toBe(9.4)
    expect(table.theme_videos).toMatchObject({ value: 130, unit: 'videos' })
    expect(table.theme_tone_negative.value).toBe(18.1)
  })

  it('hands its quotes up as refs, so a snapshot freezes ids and not words', () => {
    expect(blockAnswers(voiceTheme, voiceFixture()).quotes).toEqual(['e:1', 'e:2', 'e:3', 'e:4', 'e:5', 'e:6'])
  })

  it('says which of the two silences it is when nothing can be opened', () => {
    const base = voiceFixture()
    const none = {
      ...base,
      theme: { ...base.theme, state: 'none' as const, notes: ['No theme in this audience carried enough of this month to be opened.'] },
    }
    expect(voiceTheme.emptyState(none)).toBe('No theme in this audience carried enough of this month to be opened.')
    // The search still renders, because "have we seen this before?" is a
    // question about the whole register and not about this month.
    expect(draw(none)).toContain('Have we seen this before?')
  })

  it('keeps its key, which is a stored contract', () => {
    expect(voiceTheme.key).toBe('voice.theme')
  })
})
