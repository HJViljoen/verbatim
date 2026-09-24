import { describe, expect, it } from 'vitest'

import { blockAnswers, blockContext, type RenderMode } from '@/lib/blocks/types'
import { CLIENT_AUDIENCE, INDUSTRY_AUDIENCE } from '@/lib/rivals'
import { fmtPct } from '@/lib/format'
import { proseFigures } from '@/lib/prose/figures'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { markupText, render } from '@/lib/test/render'
import { REDDIT_CAP_LINE } from '@/lib/reading/method'
import { BRIEF_UNIT, DELIVERY_SCOPE, LABEL_RULE, LEAD_MIN_RATED, PLAYBOOK_EMPTY, PLAYBOOK_GONE, RECORD_GONE } from '@/lib/pages/content-brief'
import { CONTENT_BRIEF_BLOCKS, contentMake, contentPlaybook, contentRecord } from './index'
import { ARGUMENT_CHARS, bound, GROUNDING_BASIS, shownRows, TITLE_CHARS, toMake } from './make'
import { cellFigure, engagementAxis, engagementOrder, unreadNotes } from './playbook'
import {
  contentBriefFixture,
  emptyContentBriefFixture,
  emptyLedger,
  ledgerWithDismissal,
  longContentLedger,
  refusedContentBriefFixture,
  thinContentBriefFixture,
  unclassifiedContentBriefFixture,
} from './fixture'

// The render tier for the content brief's three blocks (Block D wave 2,
// E-content). One static render per block per mode per state, asserted against
// the copy contract — what the block PRINTS, which is the level the honesty
// rules are written at.

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('https://app.verbatimintel.com', EMAIL)
const STATES = [
  contentBriefFixture(),
  thinContentBriefFixture(),
  refusedContentBriefFixture(),
  unclassifiedContentBriefFixture(),
  emptyContentBriefFixture(),
]
const LEDGERS = [ledgerWithDismissal(), emptyLedger()]

describe('the content brief’s own blocks', () => {
  it('keeps the copy contract in every mode and every state', () => {
    for (const block of CONTENT_BRIEF_BLOCKS) {
      for (const data of STATES) {
        for (const mode of MODES) assertCopyContract(render(block.render(data, mode, ctx)))
      }
    }
    for (const data of LEDGERS) {
      for (const mode of MODES) assertCopyContract(render(contentMake.render(data, mode, ctx)))
    }
  })

  // THE THIN ARM SUPPRESSES ITS OWN HEADING TOO (design review 4). The empty
  // branch of all three blocks omitted the `header={mode !== 'print'}` the
  // filled branch passes, so on a printed sheet — whose <h1> is already the
  // block's title and whose serif framing is already its question — the
  // refused, empty and unclassified arms printed the title three times and the
  // question twice before saying the one sentence they had.
  it('prints no heading of its own on a printed sheet, filled or thin', () => {
    // On the <h2> and not on the words: `RECORD_GONE` opens with the block's
    // own title as a sentence ("The record behind this brief could not be
    // read."), which is the one sentence the arm is there to say.
    for (const block of CONTENT_BRIEF_BLOCKS) {
      for (const data of STATES) {
        expect(render(block.render(data, 'print', ctx))).not.toContain('<h2')
      }
      // And the app arm still draws it, because there is no slide above it.
      expect(render(block.render(contentBriefFixture(), 'app', ctx))).toContain('<h2')
    }
    for (const data of LEDGERS) {
      expect(render(contentMake.render(data, 'print', ctx))).not.toMatch(/<h2[^>]*>What to make/)
    }
  })

  it('is email-safe: tables, no classes, no CSS variables', () => {
    for (const block of CONTENT_BRIEF_BLOCKS) {
      const markup = render(block.render(contentBriefFixture(), 'email', ctx))
      expect(markup).toContain('<table')
      expect(markup).not.toContain('class=')
      expect(markup).not.toContain('var(--')
    }
    const make = render(contentMake.render(ledgerWithDismissal(), 'email', ctx))
    expect(make).toContain('<table')
    expect(make).not.toContain('class=')
    expect(make).not.toContain('var(--')
  })

  it('prints no direction word of its own — the stored nodes cut out first', () => {
    // Of its OWN. A recommendation's title is Pass D-b's imperative and is
    // rendered `stored` under that slot's policy; what this asserts is that
    // nothing CODE writes on these slides claims a direction. D5: the mock's
    // "growing, 3rd month" and "outperformed" are exactly what may not appear.
    const sweep = (markup: string) =>
      markupText(markup.replace(/<([a-z0-9]+)[^>]*data-copy="(stored|quote)"[^>]*>[\s\S]*?<\/\1>/g, ' '))
    for (const block of CONTENT_BRIEF_BLOCKS) {
      for (const data of STATES) {
        expect(sweep(render(block.render(data, 'app', ctx)))).not.toMatch(
          /\b(growing|fading|rising|climbing|slipping|gaining|outperform\w*|flat)\b/i,
        )
      }
    }
    for (const data of LEDGERS) {
      expect(sweep(render(contentMake.render(data, 'app', ctx)))).not.toMatch(
        /\b(growing|fading|rising|climbing|slipping|gaining|outperform\w*|flat)\b/i,
      )
    }
  })
})

describe('content.playbook — the mock’s page 3', () => {
  const data = contentBriefFixture()
  const markup = render(contentPlaybook.render(data, 'print', ctx))
  const text = markupText(markup)

  it('names the clock every figure on it keeps (D9)', () => {
    expect(text).toContain('videos published in September')
  })

  // ONE NOUN FOR ONE OBJECT (design review 6). The legend said "757 posts"
  // and the footer said "687 of The category's 757 … videos" on one sheet.
  it('counts videos on every side of the legend, never posts', () => {
    // "A Reddit post" stays: a Reddit thread is not a video, and that clause
    // is about the platform object rather than about a count of the corpus.
    expect(text.replace('A Reddit post carries', '')).not.toMatch(/\bposts?\b/)
    expect(text).toMatch(/The category, [\d,]+ videos/)
    expect(text).toMatch(/Össur, [\d,]+ videos/)
  })

  // A LINE THE ARTBOARD DOES NOT HAVE, PRINTED TWICE (design review 7). The
  // suppressed heading re-emitted its meta as a stray "September" under a slide
  // header that already reads "Content brief · September 2026", and the footer
  // note repeated the basis clause the footer sentence already ends with.
  it('names its clock once on a slide that already stamps the month', () => {
    expect(text.match(/videos published in September/g)?.length ?? 0).toBeLessThanOrEqual(3)
    expect(markup).not.toContain('text-right font-mono text-[11px] text-muted-foreground')
    // In app mode the block draws its own heading row, and the meta belongs to
    // it: the flag is about a slide, not about the value.
    expect(markupText(render(contentPlaybook.render(data, 'app', ctx)))).toContain('September')
  })

  it('prints a denominator in every cell it draws (D10)', () => {
    // FigureCell stamps `level` only where an "of N" was handed to it, and the
    // copy contract fails a level without one — so the assertion that matters
    // is that there ARE levels here and the contract passed above.
    expect(markup.match(/data-copy="level"/g)?.length ?? 0).toBeGreaterThan(6)
  })

  // A TABLE THAT SAYS IT IS ONE (design review 9). The matrix is a CSS grid of
  // spans, so a row read by a screen reader or extracted as text was "Story
  // 40.8% of 687 28 of 84 21.8% of 124" with the column names nowhere near it.
  // The layout is unchanged — `display: contents` keeps every cell a direct
  // grid child — and the semantics are now the numbers card's.
  it('carries table semantics over the artboard’s grid', () => {
    expect(markup).toContain('role="table"')
    expect(markup).toContain('aria-label="What gets made, videos published in September"')
    expect(markup).toContain('aria-label="How they open, videos published in September"')
    expect(markup.match(/role="columnheader"/g)?.length ?? 0).toBe(8)
    // Two tables, four rows and three rows, plus a header row each.
    expect(markup.match(/role="row"/g)?.length ?? 0).toBe(9)
    expect(markup).toContain('role="rowheader"')
    expect(markup.match(/role="cell"/g)?.length ?? 0).toBe(21)
  })

  it('states the classified n against the published one, per side', () => {
    // MERGE, BLOCK D WAVE 2: `coverageLine` now names WHICH key the coverage
    // is of (E-competitive) — "…published in September, for their format." —
    // because the format and hook tables do not share a denominator and a
    // sentence that does not say is read as covering both. The half this test
    // is about is unchanged.
    expect(text).toMatch(/Read from [\d,]+ of .+ videos published in September(, for their (format|hook))?\./)
  })

  // ONE ROW, ONE UNIT PER SIDE (design review 4, code review 3). The cutoff was
  // `n >= 100` per CELL, so the two columns a reader compares printed "28 of 84"
  // beside "21.8% of 124" whenever their denominators straddled a hundred.
  it('prints the category as a share and the named sides as counts, whatever their size', () => {
    const sides = data.playbook.playbook!.formats.sides
    const you = sides.find((s) => s.audience === CLIENT_AUDIENCE)!
    const rival = sides.find((s) => s.audience !== CLIENT_AUDIENCE && s.audience !== INDUSTRY_AUDIENCE)!
    // The fixture is the case that produced the mixed row: one named side under
    // a hundred classified videos and one over it.
    expect(Math.min(you.of, rival.of)).toBeLessThan(100)
    expect(Math.max(you.of, rival.of)).toBeGreaterThanOrEqual(100)
    const key = data.playbook.playbook!.formats.keys[0].key
    const category = sides.find((s) => s.audience === INDUSTRY_AUDIENCE)!
    expect(cellFigure(category, category.byKey[key]).value).toMatch(/%$/)
    expect(cellFigure(you, you.byKey[key]).value).not.toMatch(/%/)
    expect(cellFigure(rival, rival.byKey[key]).value).not.toMatch(/%/)
    // And every cell still carries its own denominator (D10).
    for (const s of sides) expect(cellFigure(s, s.byKey[key]).of).toMatch(/^of [\d,]+$/)
  })

  it('says why Reddit is in no engagement row, in the one sentence that says it', () => {
    expect(text).toContain('carries no engagement rate')
  })

  it('draws no remainder row and no partition (D4)', () => {
    expect(text).not.toContain('Other kinds')
    // Every side's rows are shares of that side's own classified n, so two
    // sides' cells never share a denominator.
    const sides = data.playbook.playbook!.formats.sides
    expect(new Set(sides.map((s) => s.of)).size).toBeGreaterThan(1)
  })

  // ONE FORMATTER (code review 5). `${median}%` was hand-written in three places
  // in a file that imports `fmtPct` for the matrix cells.
  it('prints every percentage through the product’s one formatter', () => {
    for (const r of engagementOrder(data.playbook.playbook!.engagement, LEAD_MIN_RATED).slice(0, 3)) {
      expect(text).toContain(fmtPct(r.engagement.median ?? 0))
    }
    // A median of a whole number prints as "3%", never as "3.0%" — the
    // formatter's own rule, and the reason to have exactly one.
    expect(fmtPct(3)).toBe('3.0%')
  })

  // THE TAKEAWAY MAY NOT REST ON FOUR VIDEOS (design review 5). The slide's one
  // bulleted sentence read "Review ran at 3.7% against Story at 3.4% — measured
  // over 4 and 206", a 0.3-point gap between n=4 and n=206 printed as the
  // conclusion of the page.
  it('rests its takeaway, its top row and its published figure on a comparable n', () => {
    const p = data.playbook.playbook!
    const thin = p.engagement.find((r) => r.engagement.n < LEAD_MIN_RATED)
    expect(thin).toBeTruthy()
    // The thin row exists, is still readable in the reading, and leads nothing.
    expect(p.formats.conclusion).not.toContain(thin!.label)
    expect(engagementOrder(p.engagement, LEAD_MIN_RATED)[0].engagement.n).toBeGreaterThanOrEqual(LEAD_MIN_RATED)
    const figures = blockAnswers(contentPlaybook, data).figures
    expect(figures.content_best_format_videos?.value ?? 0).toBeGreaterThanOrEqual(LEAD_MIN_RATED)
  })

  // A BAR IS READ FROM ZERO (design review 14). Scaled to the best row, three
  // medians of 3.7 · 3.4 · 3.1 drew 100% · 92% · 84%.
  it('draws the engagement bars against a round axis above the best rate', () => {
    const rows = engagementOrder(data.playbook.playbook!.engagement, LEAD_MIN_RATED).slice(0, 3)
    const axis = engagementAxis(rows)
    expect(axis).toBeGreaterThan(rows[0].engagement.median ?? 0)
    expect(Number.isInteger(axis)).toBe(true)
    // The best row is drawn short of the bar's full width, because the axis is
    // above it: `3.4 of 4` is 85%, not 100%.
    const width = `width:${((rows[0].engagement.median ?? 0) / axis) * 100}%`
    expect(markup).toContain(width)
    expect(width).not.toContain('width:100%')
    expect(engagementAxis([])).toBe(1)
  })

  it('publishes its figures by token, prefixed so nothing collides', () => {
    const answers = blockAnswers(contentPlaybook, data)
    expect(Object.keys(answers.figures).every((k) => k.startsWith('content_'))).toBe(true)
    expect(answers.verdicts).toEqual([])
  })

  // THE THREE ABSENCES, ON THE PAGE (design review 1, code review 1). The
  // block used to print one sentence for all three, and the one it printed was
  // a claim about what the category published.
  it('says the formats could not be read when the read threw', () => {
    const data = emptyContentBriefFixture()
    expect(blockAnswers(contentPlaybook, data).empty).toBe(PLAYBOOK_GONE)
    const text = markupText(render(contentPlaybook.render(data, 'print', ctx)))
    expect(text).toContain(PLAYBOOK_GONE)
    expect(text).not.toContain(PLAYBOOK_EMPTY)
  })

  it('says nothing published has been read where the read found nothing', () => {
    const data = refusedContentBriefFixture()
    expect(blockAnswers(contentPlaybook, data).empty).toBe(PLAYBOOK_EMPTY)
    expect(markupText(render(contentPlaybook.render(data, 'print', ctx)))).toContain(PLAYBOOK_EMPTY)
  })

  it('counts the published videos where none of them is classified yet', () => {
    const data = unclassifiedContentBriefFixture()
    const empty = blockAnswers(contentPlaybook, data).empty ?? ''
    expect(empty).toContain('none of them has been classified yet')
    expect(markupText(render(contentPlaybook.render(data, 'print', ctx)))).toContain(empty)
  })
})

describe('content.playbook — a side nobody read', () => {
  // A COLUMN NEVER READ PRINTS A SENTENCE RATHER THAN A ZERO, and it used to
  // print a HEADED column of blanks with the sentence under both tables
  // (design review 11).
  const thin = thinContentBriefFixture()
  const markup = render(contentPlaybook.render(thin, 'print', ctx))
  const text = markupText(markup)

  it('says it once, and heads no column it cannot fill', () => {
    const note = unreadNotes(thin.playbook.playbook!)[0]
    expect(note).toContain('published nothing we read')
    expect(text.split(note).length - 1).toBe(1)
    // The side is still named — in the legend, with what it published — and it
    // is not a column head over four empty rows.
    expect(text).toContain('Össur, 0 videos')
    expect(markup.match(/role="columnheader"/g)?.length ?? 0).toBe(4)
    // A SWATCH IS THE KEY TO A SERIES THAT IS DRAWN (design review 12). The
    // unread side kept a filled green dot for a column the table does not
    // draw; it now carries a hollow ring and says the column is not there.
    expect(text).toContain('Össur, 0 videos · no column drawn')
    expect(markup).toContain('rounded-full border border-current')
    // And a column no longer stretches to every pixel a dropped one freed.
    expect(markup).toContain('minmax(0, 280px)')
    expect(markup).not.toContain('minmax(0, 1fr)')
  })
})

describe('content.record — the mock’s page 5', () => {
  const data = contentBriefFixture()
  const text = markupText(render(contentRecord.render(data, 'print', ctx)))

  it('names the unit every share on the brief is a share of', () => {
    expect(text).toContain(BRIEF_UNIT)
  })

  it('says a format and a hook label were not worded by a model', () => {
    expect(text).toContain(LABEL_RULE)
  })

  it('carries the Reddit cap, which no brief has ever printed', () => {
    expect(text).toContain(REDDIT_CAP_LINE)
    // AND IT TRAVELS WITH THE CARD (design review 10): it is the caveat that
    // belongs to the numbers, and the email arm printed it nowhere at all.
    expect(markupText(render(contentRecord.render(data, 'email', ctx)))).toContain(REDDIT_CAP_LINE)
  })

  // THE CARD ENDED AT 59% OF THE SHEET (design review 10). The two rows the
  // artboard has and this card did not — Period and Conversations — are the two
  // that say what the sheet's two delivery records are each counted over.
  it('carries the window it read and the comments it read in it', () => {
    // THE WINDOW ROW STATES THE WINDOW AND NOTHING ELSE. It carried "· 3
    // updates" beside these dates while the prose 300px above states the same
    // three updates over the DELIVERY span (1 Sep to 13 Sep) — two ranges for
    // one set of updates, the labelled one being the one that is not the
    // delivery span.
    expect(text).toContain('Read over')
    expect(text).toContain('1 Sep 2026 → 18 Sep 2026')
    expect(text).not.toContain('1 Sep 2026 → 18 Sep 2026 · 3 updates')
    expect(text).not.toContain('Period')
    expect(text).toMatch(/Comments\s*[\d,]+ read in this reading/)
    // "Comments", never "Conversations": AGENTS.md keeps that word on the
    // legacy pages that still compute it, and a new reading surface draws from
    // THIRTEEN_WORDS.
    expect(text).not.toMatch(/conversations/i)
    // And the count lives in the prose, beside the dates it is counted over.
    expect(text).toContain('3 updates delivered')
  })

  it('carries the delivery record and the reading counter, verbatim', () => {
    expect(text).toContain('4 updates since 6 Sep 2026 \u00b7 longest gap 7 days \u00b7 last on 27 Sep 2026')
    expect(text).toContain('your 3rd monthly reading · the quarter view needs 6')
  })

  // TWO DELIVERY RECORDS ON ONE SHEET, AND ONLY ONE OF THEM NAMED ITS SCOPE
  // (design review 3). The prose's first sentence is window-scoped ("3 updates
  // delivered, 1 Sep to 13 Sep 2026, longest gap 7 days.") and the mono tail is
  // all-time ("4 updates since 6 Sep 2026 · … · last on 27 Sep 2026"); both end
  // "longest gap 7 days", so they read as one statistic stated twice.
  it('names the scope of the all-time delivery record it prints', () => {
    expect(text).toContain(`${DELIVERY_SCOPE} \u00b7 4 updates since 6 Sep 2026`)
    // And the window-scoped sentence is still the record's own, unrewritten.
    expect(text).toContain('3 updates delivered, 1 Sep to 13 Sep 2026')
  })

  it('states the language share on its own basis, never as a fact about comments (D15)', () => {
    expect(text).toContain('of what was said on camera was not in English')
  })

  it('promises no future date and claims no start date (D14)', () => {
    expect(text).not.toMatch(/next update lands/i)
    expect(text).not.toMatch(/tracking since/i)
  })

  it('falls back to the sentences it can stand behind on a fresh database', () => {
    const refused = markupText(render(contentRecord.render(refusedContentBriefFixture(), 'print', ctx)))
    expect(refused).toContain('The month-by-month reading has not been recorded for this workspace yet.')
    expect(refused).toContain(BRIEF_UNIT)
    expect(refused).not.toContain('monthly reading · the quarter view')
  })

  // A BLOCK DOES NOT READ ITS OWN PROSE, AND WHAT IT PUBLISHES PRINTS THE SAME
  // (code review 4). The instrument figure was recovered by regex from a
  // rendered sentence and declared a count, so the token substituted into brief
  // prose read "2" while the card beside it read "2.37".
  it('publishes only figures that print exactly what the slide prints', () => {
    const answers = blockAnswers(contentRecord, data)
    const printed = proseFigures(answers.figures)
    expect(Object.keys(printed).length).toBeGreaterThan(0)
    for (const [key, figure] of Object.entries(printed)) {
      expect(key.startsWith('content_')).toBe(true)
      expect(text).toContain(figure.value)
    }
    // The rate is carried on the slide and drawn on the card; it is not a
    // citable token, because none of the four measured units prints it.
    expect(data.record.themesPerVideo).not.toBeNull()
    expect(text).toContain(String(data.record.themesPerVideo))
    expect(Object.keys(answers.figures)).not.toContain('content_themes_per_video')
  })

  it('has one honest line when the record could not be read at all', () => {
    expect(blockAnswers(contentRecord, emptyContentBriefFixture()).empty).toBe(RECORD_GONE)
  })
})

describe('content.make — the mock’s page 2', () => {
  const data = ledgerWithDismissal()
  const markup = render(contentMake.render(data, 'print', ctx))
  const text = markupText(markup)

  it('draws the things to make, numbered, and the one to stop', () => {
    expect(text).toContain('01')
    expect(text).toContain('02')
    expect(text).toContain('03')
    expect(text).toContain('What not to make')
    expect(text).toContain('Lead with price comparisons against Ottobock')
  })

  // THE STOP CARD'S HEADLINE IS CODE'S, NOT THE ADVICE'S (design review 3).
  // The card printed the stored title at the card-title size, negated only by a
  // mono eyebrow, so a scan of the four-column row read it as a fourth thing to
  // make. The words cannot be rewritten — they are the model's, stored — so the
  // negation is structural: the biggest type on the card is "What not to make",
  // and the advice sits under a label saying what it is.
  it('heads the stop card with the negation and not with the advice', () => {
    const head = markup.indexOf('What not to make')
    const advice = markup.indexOf('Lead with price comparisons against Ottobock')
    expect(head).toBeGreaterThan(-1)
    expect(advice).toBeGreaterThan(head)
    // The stored advice is no longer the card's `<h3>`; the code-written
    // headline is.
    expect(markup).toMatch(/<h3[^>]*>What not to make<\/h3>/)
    expect(markup).not.toMatch(/<h3[^>]*>Lead with price comparisons/)
    // And the chip beside the eyebrow still says what was decided.
    expect(text).toContain('Stop')
    expect(text).toContain('Dismissed')
  })

  // AND THE NEGATION IS NOT PAINTED IN RED (design review 9). MASTER.md lists
  // Negative as "data only"; a card border, a mono label and a 17px/600
  // headline are chrome, and the headline measured 4.49:1 on the tile.
  it('spends no alarm colour on chrome — the words carry the negation', () => {
    expect(markup).not.toContain('text-negative')
    expect(markup).not.toContain('border-negative')
    // The status chip keeps its tint: it is a datum, and the word on it is
    // `text-foreground` at over 10:1.
    expect(markup).toContain('bg-negative/15 text-foreground')
  })

  // WORK ALREADY DONE IS NOT A THING TO MAKE (design review 2, code review 2).
  // The ledger is oldest-first and `acted_on` reads "Done", so the three oldest
  // rows won regardless of status and a client read two finished items as their
  // top two instructions.
  it('leads with what is still open, never with what is already done', () => {
    const shown = toMake(data.advice.rows)
    expect(shown.length).toBeGreaterThan(0)
    for (const r of shown) expect(r.status).not.toBe('acted_on')
    for (const r of shown) expect(r.status).not.toBe('dismissed')
    // And the ledger it was taken from does carry Done rows, so the filter is
    // being exercised rather than passing on an absence.
    expect(data.advice.rows.some((r) => r.status === 'acted_on')).toBe(true)
    expect(shown.map((r) => r.title)).not.toContain('Lead with repairability, not recycling, in the next campaign')
  })

  it('marks the model’s own words as stored, naming the call that wrote them', () => {
    expect(markup).toContain('data-copy="stored"')
    expect(markup).toContain('data-slot="pass_d_b_recommendation"')
  })

  it('prints a reading with both sides and the band beside the word', () => {
    expect(markup).toContain('data-copy="verdict"')
    expect(text).toMatch(/\d+ of \d+ videos in .* against \d+ of \d+ in /)
  })

  it('draws no sparkline and no trail — two month readings are not a series (D3)', () => {
    expect(markup).not.toContain('<svg')
  })

  it('walks the ledger once for the rows it draws', () => {
    // `verdicts()` and `quotes()` each re-ran `toMake` and called `toStop`
    // twice inside themselves (code review 12).
    const rows = shownRows(data)
    expect(rows.length).toBe(toMake(data.advice.rows).length + 1)
    expect(rows[rows.length - 1].status).toBe('dismissed')
  })

  it('hands its verdicts and its quote refs back for freezing', () => {
    const answers = blockAnswers(contentMake, data)
    expect(answers.quotes).toContain('e:ev-9')
    expect(answers.verdicts.length).toBeGreaterThan(0)
    for (const v of answers.verdicts) expect(v.value.n).toBeGreaterThan(0)
  })

  // A FIXED TITLE MAY NOT CLAIM A COUNT (design review 15). "Three things to
  // make, and one to stop" printed unchanged over two rows, over none, and over
  // "Advice lands with your next update."
  it('claims no count in its title, and counts what it drew in its meta', () => {
    expect(contentMake.title).not.toMatch(/\b(one|two|three|four|1|2|3|4)\b/i)
    const app = markupText(render(contentMake.render(data, 'app', ctx)))
    expect(app).toContain(`${toMake(data.advice.rows).length} to make · 1 to stop`)
    // The empty arm prints the same title over a sentence about nothing, and
    // that is now a true sentence.
    const none = markupText(render(contentMake.render(emptyLedger(), 'app', ctx)))
    expect(none).toContain(contentMake.title)
    expect(none).toContain('Advice lands with your next update.')
  })

  // THE COUNT REACHES A PRINTED SHEET (design review 8). `header={mode !==
  // 'print'}` drops the meta with the header row and DocumentCover prints only
  // "{stamp} · {pages} pages", so "3 to make · 1 to stop" was computed and
  // printed nowhere on the PDF while a comment in the file said otherwise.
  it('prints its counts on the printed sheet, where the header row is gone', () => {
    expect(text).toContain(`${toMake(data.advice.rows).length} to make · 1 to stop`)
    // The ledger total is not in the note: it wrapped the footer to a second
    // line, and `ct.advice` two slides on is a table of exactly that.
    expect(text).not.toContain('64 in the ledger')
    expect(markupText(render(contentMake.render(data, 'app', ctx)))).toContain('64 in the ledger')
    // Still once: the app arm's header carries it and its note stays the month.
    const app = markupText(render(contentMake.render(data, 'app', ctx)))
    expect(app.match(/to make · 1 to stop/g)?.length ?? 0).toBe(1)
  })

  it('says advice lands with the next update when the ledger is empty', () => {
    expect(blockAnswers(contentMake, emptyLedger()).empty).toBe('Advice lands with your next update.')
  })

  // NOTHING A CLIENT CAN READ TODAY IS CUT, AND NO CUT IS EVER MID-WORD
  // (design review 1). The CSS clamps ended four of the model's arguments and
  // a refusal sentence mid-word — "…we do not compare until 2 have been read.
  // Sep 20…", two characters into a year — with the text recoverable nowhere
  // in the document and a comment in the file asserting the opposite.
  it('cuts nothing on the shipped reading, and never inside a word', () => {
    expect(markup).not.toContain('line-clamp')
    expect(text).not.toContain('\u2026')
    for (const r of shownRows(data)) {
      expect(bound(r.title, TITLE_CHARS)).toBe(r.title)
      if (r.why) expect(bound(r.why, ARGUMENT_CHARS)).toBe(r.why)
      // A commenter's own words and the refusal sentence are printed whole
      // whatever their length: both appear on this page or nowhere.
      if (r.quote?.text) expect(text).toContain(r.quote.text)
      expect(text).toContain(r.afterwards.line)
    }
  })

  it('bounds a long model string between words, never inside one', () => {
    // The stress fixture is where a bound actually fires.
    const long = markupText(render(contentMake.render(longContentLedger(), 'print', ctx)))
    expect(long).toContain('\u2026')
    // Every ellipsis follows a whole word — never a digit, never a hyphen or a
    // comma left hanging off the cut.
    for (const m of long.matchAll(/(.)\u2026/g)) expect(m[1]).toMatch(/[\p{L}\p{N}]/u)
    // And a quote is still whole, however long it is.
    for (const r of shownRows(longContentLedger())) {
      if (r.quote?.text) expect(long).toContain(r.quote.text)
    }
    // The helper itself: at the budget, untouched; past it, a word boundary.
    expect(bound('one two three', 13)).toBe('one two three')
    // The cut that used to land two characters into a year now lands after
            // "read", and the sentence's own full stop goes with it rather than
            // printing ".…".
    expect(bound('compare until 2 have been read. Sep 2026 itself', 34)).toBe('compare until 2 have been read\u2026')
    // A single word longer than the budget is still not cut mid-glyph-run
    // silently — it is cut, and the ellipsis says so.
    expect(bound('antidisestablishmentarianism', 10)).toBe('antidisest\u2026')
  })

  // THE APP ARM BELOW `md` (design review, the finding of that name). `md:grid-cols-4` put four cards
  // in 768px — 161px of box against 198px of content — and a full-sentence
  // `footerNote`, which BlockFrame makes `shrink-0` on purpose, forced the
  // whole block to 653px at a 375px viewport.
  it('ladders its columns from sm and lg, and keeps its basis in the slot that wraps', () => {
    const app = render(contentMake.render(data, 'app', ctx))
    expect(app).toContain('sm:grid-cols-2')
    expect(app).toContain('lg:grid-cols-4')
    expect(app).not.toContain('md:grid-cols-4')
    // The basis sentence is in `footer` (min-w-0), not in the mono note.
    expect(app).toMatch(/font-mono text-\[11px\] font-normal text-muted-foreground">September</)
    expect(markupText(app)).toContain(GROUNDING_BASIS)
  })

  it('claims nothing about whether a comment was answered (D6)', () => {
    expect(text).not.toMatch(/ignored/i)
    expect(text).not.toMatch(/answered last week/i)
  })
})
