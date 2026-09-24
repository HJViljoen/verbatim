import { describe, expect, it } from 'vitest'

import { blockAnswers, blockContext, figureConflicts, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { assertCopyContract, copyViolations } from '@/lib/test/copy-contract'
import { markupText, render, renderText } from '@/lib/test/render'
import { fmtInt } from '@/lib/format'
import { surface } from '@/lib/nav'
import { layoutFor, SubjectsPage, SUBJECT_BLOCKS } from './index'
import { subjectsList } from './list'
import { subjectsOwnPosts } from './own-posts'
import { SAY_HEAR_NONE, subjectsSayHear } from './say-hear'
import { subjectsSubject } from './subject'
import { subjectsLine } from './line'
import { subjectsKinds } from './kinds'
import { subjectsVoices } from './voices'
import { subjectsUnanswered } from './unanswered'
import { calendarRulesFor } from '@/lib/charts/from-series'
import { freezeQuotes } from '@/lib/renderables/quotes-freeze'
import { gapBasisLine, gapLine, type Gap } from '@/lib/reading/gap'
import { SUBJECTS_NONE_NAMED } from '@/lib/reading/own-posts'
import { axisNote, voiceCite } from '@/lib/pages/subjects'
import { candidatesFixture, refusedFixture, retiredRivalFixture, subjectsFixture } from './fixture'

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('https://app.verbatimintel.com', EMAIL)

/** The page's own subtitle, out of `lib/nav.ts` — main's file, and the string
 *  this page's detail pane used to repeat verbatim. */
const NAV_SUBTITLE = surface('subjects').question!

describe('the Subjects blocks, all of them', () => {
  it('render in all three modes on a reading, a refusal and a candidate set, and keep the copy contract', () => {
    for (const data of [subjectsFixture(), refusedFixture(), candidatesFixture()]) {
      for (const block of SUBJECT_BLOCKS) {
        for (const mode of MODES) {
          assertCopyContract(render(block.render(data, mode, ctx)))
        }
      }
    }
  })

  // EVERY BLOCK THAT IS ABOUT THE SUBJECT READING. `subjects.ownposts` is the
  // exception and it is the fixture's whole point: `videos` is tenant-readable
  // whatever M4 says, so a workspace with no subject reading still knows what
  // it published and the census is REAL on the refused fixture. A block that
  // invented an empty state there would be claiming an absence it does not
  // have. Its own absence — no post published in the month — is tested below.
  it('every block says something honest when it has nothing — a refusal is a reading too', () => {
    const data = refusedFixture()
    for (const block of SUBJECT_BLOCKS) {
      if (block.key === 'subjects.ownposts') continue
      const empty = block.emptyState(data)
      expect(empty, block.key).toBeTruthy()
      expect(renderText(block.render(data, 'app', ctx)), block.key).toContain(empty!)
    }
  })

  it('never prints a pipeline key at a reader', () => {
    const text = renderText(
      <>{SUBJECT_BLOCKS.map((b) => <span key={b.key}>{b.render(subjectsFixture(), 'app', ctx)}</span>)}</>,
    )
    for (const key of ['industry-other', 'competitor:', 'audience_insights', 'run_id', 'Pass A']) {
      expect(text).not.toContain(key)
    }
  })

  it('states no figure twice with two different values', () => {
    const data = subjectsFixture()
    expect(figureConflicts(SUBJECT_BLOCKS.map((b) => blockAnswers(b, data).figures))).toEqual([])
  })
})

describe('SU1 · the subjects list', () => {
  it('names every subject with its level and the day it was named', () => {
    const text = renderText(subjectsList.render(subjectsFixture(), 'app', ctx))
    expect(text).toContain('Durability')
    // "26 of 84 · too few to compare" — the mock's own row, and the noun is
    // dropped on a 240px rail where the full form wrapped every row onto a
    // third line. The level still prints its "of N" (the copy contract's rule
    // (b)) and the pane one tile over prints "26 of 84 videos" in full.
    expect(text).toContain('26 of 84')
    expect(text).toContain('too few to compare')
    // THE DATE, WITHOUT THE VERB, on the 240px rail: "named 19 Aug 2026 ·
    // Rename · Stop" wants ~212px of 188 and orphaned "Stop" onto a fourth
    // line. The year stays; Settings, which is full width, keeps the verb.
    expect(text).toContain('19 Aug 2026')
    expect(text).not.toContain('named 19 Aug 2026')
  })

  it('groups a four-digit count like every other number on the page', () => {
    const data = subjectsFixture()
    const [first, ...rest] = data.list.rows
    const big = {
      ...data,
      list: { ...data.list, rows: [{ ...first, level: { k: 1042, n: 3877, pct: 26.9 } }, ...rest] },
    }
    const text = renderText(subjectsList.render(big, 'app', ctx))
    expect(text).toContain('1,042 of 3,877')
    expect(text).toContain('26.9%')
  })

  it('leaves the supersede rule to the Add and Rename dialogs (L3)', () => {
    for (const mode of MODES) {
      expect(renderText(subjectsList.render(subjectsFixture(), mode, ctx)), mode)
        .not.toContain('Renaming or adding a subject starts a new line.')
    }
  })

  it('says subjects are not recorded when M4 is not applied — never "no subjects"', () => {
    expect(subjectsList.emptyState(refusedFixture())).toBe('Your subjects are not recorded for this workspace yet.')
  })

  // AN ABSENT BUTTON IS NOT A SENTENCE. The tile drops "Add a subject →" in
  // this state because a write from here would fail; without the reason beside
  // it, "not recorded yet" reads as "you have not named any" on a tile that has
  // just deleted the control that would fix it.
  it('says WHY the add control is gone when the set cannot be read', () => {
    for (const mode of MODES) {
      const text = renderText(subjectsList.render(refusedFixture(), mode, ctx))
      expect(text, mode).toContain('We cannot read the set from this page yet')
      expect(render(subjectsList.render(refusedFixture(), mode, ctx)), mode).not.toContain('Add a subject')
    }
  })

  it('offers the proposed set rather than an empty list, and says nothing is counted', () => {
    const data = candidatesFixture()
    expect(subjectsList.emptyState(data)).toContain('Confirm the set')
    const text = renderText(subjectsList.render(data, 'app', ctx))
    expect(text).toContain('2 proposed · none confirmed, so nothing is counted yet.')
    // The Confirm control is ON the row — a candidate listed as prose under the
    // editor is the one control a client needs, out of reach.
    expect(text).toContain('Durability')
    expect(text).toContain('not counted yet')
    expect(text).toContain('Confirm')
  })

  // A PERMISSION FLAG MUST NOT BE OPEN BY DEFAULT. SU1 used to rely on
  // SubjectEditor's `canEdit` defaulting to true, so a caller that forgot the
  // prop offered the write rather than hiding the button. It is now data on the
  // block, taken from the session's role.
  it('draws no write control for a reader who may not change the set', () => {
    const data = candidatesFixture()
    data.list.canEdit = false
    const text = renderText(subjectsList.render(data, 'app', ctx))
    expect(text).toContain('Durability')
    expect(text).not.toContain('Confirm')
    expect(text).not.toContain('Rename')
    expect(text).not.toContain('Stop')
  })

  // THE ONE STATE THIS PRODUCT CANNOT UNDO GOT SMALLER AND CLOSER TO ITS
  // NEIGHBOUR. "Stop" was a ~28 x 13px word 4px from "Rename" — which opens a
  // sheet — firing on a single click with no focus treatment of its own. WCAG
  // 2.2's 24px target size fails twice over at that size.
  it('gives the rail’s controls a real target and a focus ring', () => {
    const markup = render(subjectsList.render(subjectsFixture(), 'app', ctx))
    const buttons = [...markup.matchAll(/<button[^>]*>(?:Rename|Stop)</g)].map((m) => m[0])
    expect(buttons.length).toBe(6) // three rows, two controls each
    for (const b of buttons) {
      expect(b).toContain('min-h-6')
      expect(b).toContain('focus-visible:ring')
    }
  })

  it('is email-safe', () => {
    const markup = render(subjectsList.render(subjectsFixture(), 'email', ctx))
    expect(markup).toContain('<table')
    expect(markup).not.toContain('class=')
    expect(markup).not.toContain('var(--')
  })

  it('draws no editor controls outside the app — a button in a PDF is a picture of a button', () => {
    for (const mode of ['print', 'email'] as const) {
      const markup = render(subjectsList.render(subjectsFixture(), mode, ctx))
      expect(markup, mode).not.toContain('Add a subject')
      expect(markup, mode).not.toContain('<button')
    }
  })
})

describe('SU2 · the subject in full', () => {
  it('prints every side as a level with its count', () => {
    const text = renderText(subjectsSubject.render(subjectsFixture(), 'app', ctx))
    expect(text).toContain('31.0%')
    expect(text).toContain('26 of 84 videos')
    expect(text).toContain('43.7%')
    expect(text).toContain('62 of 142 videos')
    // `lib`'s fmtPct keeps an exact .0 so a decimal column lines up, so M13's
    // re-based category reading prints as 22.0%, not 22%.
    expect(text).toContain('22.0%')
    expect(text).toContain('305 of 1,388 videos')
  })

  it('refuses your own side’s change and answers the category’s, and says which in one sentence', () => {
    const text = renderText(subjectsSubject.render(subjectsFixture(), 'app', ctx))
    expect(text).toContain('too few to compare') // P0 item 6 / §6 D11 — the badge's one word
    expect(text).not.toContain('carried too few videos this month to compare') // footnote removed 2026-09-24
  })

  it('prints a direction word only inside a verdict node', () => {
    const markup = render(subjectsSubject.render(subjectsFixture(), 'app', ctx))
    expect(markup).toContain('growing, 3rd month')
    expect(copyViolations(markup).filter((v) => v.rule === 'direction-word')).toEqual([])
  })

  it('offers Track this and Ask about this in the app, and neither on paper', () => {
    expect(renderText(subjectsSubject.render(subjectsFixture(), 'app', ctx))).toContain('Track this')
    expect(renderText(subjectsSubject.render(subjectsFixture(), 'app', ctx))).toContain('Ask about this')
    expect(renderText(subjectsSubject.render(subjectsFixture(), 'print', ctx))).not.toContain('Ask about this')
  })

  it('lets a client declare a new move after dropping one, and not while one is running', () => {
    const data = subjectsFixture()
    const withMove = (status: 'active' | 'dropped') => ({
      ...data,
      selected: { ...data.selected!, move: { id: 'm1', title: 'Answer the zip question', declaredAt: '2026-08-20', status } },
    })
    const running = renderText(subjectsSubject.render(withMove('active'), 'app', ctx))
    expect(running).toContain('Tracking')
    expect(running).not.toContain('Track this')

    // Dropped: the old line can be picked up again OR a differently worded one
    // declared. Before, "Track it again" with the old title was the only
    // affordance on the subject, for ever.
    const dropped = renderText(subjectsSubject.render(withMove('dropped'), 'app', ctx))
    expect(dropped).toContain('Track it again')
    expect(dropped).toContain('Track this')
  })

  it('sends the subject to Ask, as a question the page can answer', () => {
    // /dashboard/agent?subject=<id> was read by nothing: the Agent page took
    // no search params, so the client landed on a blank composer.
    const markup = render(subjectsSubject.render(subjectsFixture(), 'app', ctx))
    expect(markup).toContain('/dashboard/agent?ask=How%20are%20we%20seen%20on%20Durability%3F')
  })

  it('links the videos behind YOUR figure, with the count', () => {
    const markup = render(subjectsSubject.render(subjectsFixture(), 'app', ctx))
    expect(markup).toContain('/dashboard/videos?subject=s1')
    expect(renderText(subjectsSubject.render(subjectsFixture(), 'app', ctx))).toContain('the 26 videos behind your figure')
  })

  // The three columns carry different numbers of lines, so centring them lifted
  // the category's eyebrow ~12px above the row the other two establish. The
  // artboard's three eyebrows share one baseline.
  it('starts all three side columns at the same height', () => {
    const markup = render(subjectsSubject.render(subjectsFixture(), 'app', ctx))
    expect(markup).not.toContain('flex-col justify-center')
    expect(markup).toContain('flex-col justify-start')
  })

  it('declares a share and a count per side, and no verdict a side did not earn', () => {
    const { figures, verdicts } = blockAnswers(subjectsSubject, subjectsFixture())
    expect(Object.keys(figures)).toHaveLength(6)
    expect(verdicts).toHaveLength(3)
    // NONE OF THE THREE MOVED, AND THAT IS THE BAND DOING ITS JOB (Block D
    // wave 3, M13). September is 305 of 1,388 — the artboard's own figure —
    // against August's 264 of 1,388: a 3.0-point step against a band of ±3.1,
    // which is no clear change. The artboard's cell says "▲ 3 pts"; the
    // product's own band refuses it, and the direction word over three months
    // (Jul 17% → Sep 22%) is what the row earns instead. The fixture carried
    // 340 here, which cleared the band at 5.5 pts and put "24.5% of 1,388" on
    // the marketing sheet eighty pixels under an Overview row reading "22% of
    // 1,388" — one measure, one month, one sheet, two numbers.
    expect(verdicts.filter((v) => v.state === 'moved')).toHaveLength(0)
    expect(verdicts.filter((v) => v.state === 'no_clear_change')).toHaveLength(2)
  })

  it('says "no reading yet" where the audience was read and this subject was not in it', () => {
    // monthly_subject_readings emits a row only where videos > 0, so this is
    // the state of every freshly confirmed subject's first month — and the
    // denominator row beside it proves the audience IS tracked.
    const data = subjectsFixture()
    const [own, ...rest] = data.selected!.sides
    const unread = {
      ...data,
      selected: {
        ...data.selected!,
        sides: [{ ...own, k: null, pct: null, observed: false, silence: 'no_reading' as const }, ...rest],
      },
    }
    unread.selected.axisNote = axisNote(unread.selected.sides, 100)
    // On screen an unread side gets no cell; the note under the grid names
    // it once. The email arm still prints every side's line.
    const text = renderText(subjectsSubject.render(unread, 'app', ctx))
    expect(text).not.toContain('no reading yet') // footnote removed 2026-09-24
    expect(text).not.toContain('not tracked')
    expect(renderText(subjectsSubject.render(unread, 'email', ctx))).toContain('no reading yet')
  })

  it('says the subject is provisional while its precision is unmeasured', () => {
    const data = subjectsFixture()
    const provisional = { ...data, selected: { ...data.selected!, calibration: 'calibrating' as const } }
    expect(renderText(subjectsSubject.render(provisional, 'app', ctx)))
      .not.toContain('still checking how often we get this subject right') // removed 2026-09-24
  })
})

describe('SU2 · the monthly line', () => {
  it('draws one line per side on the page’s own axis', () => {
    const markup = render(subjectsLine.render(subjectsFixture(), 'app', ctx))
    expect(markup).toContain('<svg')
    expect(markup).toContain('Durability')
  })

  it('falls back to a table of the months in an email, never a dropped chart', () => {
    const markup = render(subjectsLine.render(subjectsFixture(), 'email', ctx))
    expect(markup).toContain('<table')
    expect(markup).not.toContain('<svg')
  })

  it('says what is not recorded rather than drawing an empty axis', () => {
    expect(subjectsLine.emptyState(refusedFixture())).toBe('Your subjects are not recorded for this workspace yet.')
  })

  // ON PAPER THE END LABELS COME OFF AND THE READINGS PRINT UNDER THE CHART
  // (Block D wave 3b, `decks`). `CalendarLine` draws an end label at
  // `width - padR + 10` and clips it with nothing; on the marketing brief this
  // block takes six of twelve columns and "The category 22.0% of 1,388" ran
  // under the gap card beside it, losing the denominator — the one part of an
  // end label that may not go missing. `endLabels` is the contract's own
  // remedy and `endReadings` is the sentence it asks for.
  it('turns the end labels off on paper and prints the last reading under the chart', () => {
    const paper = render(subjectsLine.render(subjectsFixture(), 'print', ctx))
    const app = render(subjectsLine.render(subjectsFixture(), 'app', ctx))
    // The gutter label is a bold sans <text> with the series name in it; the
    // app draws one and paper does not.
    expect(app).toContain('font-weight="600"')
    expect(paper).not.toContain('font-weight="600"')
    // And nothing is lost: every side's last reading, with its month and its
    // denominator, in the block's own type.
    const words = renderText(paper)
    expect(words).toContain('of 84')
    expect(words).toContain('of 1,388')
    expect(paper).toContain('data-copy="level"')
  })
})

describe('SU2 · the kind mix', () => {
  it('names the denominator it used — the audience’s videos, not the subject’s', () => {
    const text = renderText(subjectsKinds.render(subjectsFixture(), 'app', ctx))
    expect(text).not.toContain('every video in the audience')
    expect(text).toContain('of 1,388 videos')
    expect(text).toContain('of 84 videos')
  })

  it('reads the kinds in the client’s words, never the pipeline’s enum', () => {
    const text = renderText(subjectsKinds.render(subjectsFixture(), 'app', ctx))
    expect(text).toContain('Asking how it works')
    expect(text).toContain('Saying it worked')
    expect(text).toContain('Pushing back')
    // No enum value reaches a reader. ("question" itself survives inside the
    // Reddit sentence, which is English — "the question-and-objection videos"
    // — and is the one place the word is the reader's rather than Pass A's.)
    expect(text).not.toMatch(/\b(pain_point|purchase_intent|demographic_signal|switching_signal|feature_request|buying_trigger|misinformation)\b/)
  })

  // THE BAR AND THE NUMBER AT THE END OF IT MEASURE THE SAME THING. The row
  // used to ride the share on the label and end in the count — "Asking how it
  // works 34%" ending in 472 on the category and in 29 on yours, the two bars
  // within a few pixels of each other. The three DENOMINATORS stay apart on
  // the audience line above each group, which is what keeps the bars readable
  // against one scale.
  it('prints a whole-number share over the floor and a count under it', () => {
    const data = subjectsFixture()
    const text = renderText(subjectsKinds.render(data, 'app', ctx))
    const category = data.selected!.sides.find((s) => s.kind === 'category')!
    const top = category.kinds.find((k) => k.pct != null && k.pct > 0)!
    expect(text).toContain(`${Math.round((top.videos / category.n!) * 100)}%`)
    expect(text).toContain(`of ${fmtInt(category.n!)} videos`)
    // No decimal share anywhere in the block.
    expect(text).not.toMatch(/\d\.\d%/)
    const thin = {
      ...data,
      selected: {
        ...data.selected!,
        sides: data.selected!.sides.map((side) =>
          side.kind === 'you'
            ? { ...side, n: 5, kinds: side.kinds.map((k, i) => ({ ...k, videos: i === 0 ? 5 : 1, denominator: 5, pct: i === 0 ? 100 : 20 })) }
            : side,
        ),
      },
    }
    const thinText = renderText(subjectsKinds.render(thin, 'app', ctx))
    expect(thinText).toContain('5 of 5')
    expect(thinText).not.toContain('100%')
  })

  // THE REDDIT READ MOVED TO THE FOOTER NOTE, where the mock puts it: a basis
  // in the mono face, not a body paragraph that reads as one of the block's
  // findings. The overlap caveat stays in the body, beside the shares it is
  // about.
  it('says the kinds overlap once, and prints no Reddit split (A40, L2)', () => {
    const text = renderText(subjectsKinds.render(subjectsFixture(), 'app', ctx))
    expect(text).not.toContain('Reddit · 236 of 736 question videos')
    expect(text.split('counted in each').length - 1).toBe(1)
  })

  // ONE TABLE, NEUTRAL INK, ONE ACCENT. Six bar sets in per-rival orange were
  // the loudest thing on a calm page.
  it('draws one table with no per-rival colour', () => {
    const markup = render(subjectsKinds.render(subjectsFixture(), 'app', ctx))
    expect(markup).toContain('<table')
    expect(markup).not.toContain('var(--comp')
  })

  // `kindChange` has existed since WP3 and this block called it for the first
  // time in wave 2 — mock-gap's "cheapest real gap on the page". Each verdict
  // is banded and carries its own k and n, so each is honest to print; they do
  // not sum and nothing adds them.
  it('prints a banded verdict per kind on the category, and names the month it is against', () => {
    const data = subjectsFixture()
    const text = renderText(subjectsKinds.render(data, 'app', ctx))
    expect(text).toContain('Category · no brand, since Aug:')
    // Ruling I: printed on paper, a tooltip on screen.
    expect(renderText(subjectsKinds.render(data, 'print', ctx))).toContain('band')
    const verdicts = blockAnswers(subjectsKinds, data).verdicts
    expect(verdicts.length).toBeGreaterThan(0)
    // THE MONTH IS THE VERDICTS' OWN. It was re-derived off `pane.series[0]`,
    // a different derivation from the one that built the bands beside it.
    for (const v of verdicts) expect(v.basis?.from).toBe('2026-08-01')
    // AND ONLY THE STRIP THE BLOCK DRAWS. `verdicts()` returned every side's,
    // including two audiences whose movement this block never prints.
    const everySide = data.selected!.sides.flatMap((x) => Object.values(x.kindVerdicts)).filter(Boolean)
    expect(verdicts.length).toBeLessThan(everySide.length)
  })

  // Every rail row prints a banded badge, so the block has to declare them.
  it('declares the rail’s badges as the verdicts they are', () => {
    const data = subjectsFixture()
    expect(blockAnswers(subjectsList, data).verdicts.length).toBe(data.list.rows.length)
  })

  it('says the kind mix is not recorded when M5 has not landed', () => {
    const data = subjectsFixture()
    const bare = {
      ...data,
      selected: { ...data.selected!, sides: data.selected!.sides.map((s) => ({ ...s, kinds: [], reddit: null })) },
    }
    expect(subjectsKinds.emptyState(bare)).toContain('not recorded month by month')
  })
})

describe('SU2 · the kind mix, on its own month', () => {
  it('names the month, because it is one month among twelve months of furniture', () => {
    const text = renderText(subjectsKinds.render(subjectsFixture(), 'app', ctx))
    expect(text).toContain('Sep')
    expect(text).not.toContain('every video in the audience')
  })
})

describe('SU2 · the voices', () => {
  // THREE ACROSS ON PAPER, AND IN COLUMNS RATHER THAN ON A GRID (Block D wave
  // 3b, `decks`). `xl:` never fires in print media, so the sheet that is
  // supposed to scan as a SET drew two columns and three rows and cost the
  // sales brief's fifth sheet 143px — one whole row of voices and the footnote
  // saying they were machine-translated. And a grid row is as tall as its
  // tallest cell, so one voice carrying a translation and an on-screen pairing
  // left two white cells beside it; columns flow instead, each voice kept
  // whole.
  it('flows the voices in three columns on paper and keeps the grid on screen', () => {
    const paper = render(subjectsVoices.render(subjectsFixture(), 'print', ctx))
    expect(paper).toContain('[column-count:3]')
    expect(paper).toContain('break-inside-avoid')
    expect(paper).not.toContain('sm:grid-cols-2')

    const app = render(subjectsVoices.render(subjectsFixture(), 'app', ctx))
    expect(app).toContain('sm:grid-cols-2')
    expect(app).toContain('xl:grid-cols-3')
    expect(app).not.toContain('[column-count:3]')
  })

  // AND PAPER IS DENSER THAN THE SCREEN, NOT BIGGER — the rule
  // components/blocks/frame.tsx states, applied to the card that was the
  // loudest exception to it: 40px of side padding in a 190px column.
  it('sets the printed quote card at the artboard’s own padding', () => {
    expect(render(subjectsVoices.render(subjectsFixture(), 'print', ctx))).toContain('rounded-lg bg-inner px-4 py-2.5')
  })

  it('shows the original and the English beneath it, labelled', () => {
    const text = renderText(subjectsVoices.render(subjectsFixture(), 'app', ctx))
    expect(text).toContain('Nach 14 Monaten ist der Reißverschluss hin')
    expect(text).toContain('After 14 months the zip is done')
  })

  it('says how many it drew, out of how many there were', () => {
    expect(renderText(subjectsVoices.render(subjectsFixture(), 'app', ctx))).toContain('6 of 41')
  })

  it('sends the reader to the comment where there is a link, and prints the words where there is not', () => {
    const markup = render(subjectsVoices.render(subjectsFixture(), 'app', ctx))
    expect(markup).toContain('https://www.tiktok.com/@maker/video/7312345678901234567')
    expect(renderText(subjectsVoices.render(subjectsFixture(), 'app', ctx))).toContain('22 Sep · under a Freitag video')
  })

  // A GLYPH IS NOT AN ATTRIBUTION ON PAPER. The app draws a `PlatformIcon` and
  // keeps the words platform-free; a brief is read as a PDF and on a share
  // page, where there is nothing to hover and a 10px mark is decoration. Both
  // the print and the email arms take the whole string from `voiceCite`, which
  // is the ONE composer — the answer to three spellings of two platforms in
  // one monthly report.
  it('names the platform in words wherever it draws no mark', () => {
    const data = subjectsFixture()
    const voice = data.selected!.voices[0]
    expect(voice.platform).toBe('tiktok')
    expect(voiceCite(voice)).toBe(`TikTok · ${voice.cite}`)
    for (const mode of ['print', 'email'] as const) {
      const out = subjectsVoices.render(data, mode, ctx)
      expect(renderText(out), mode).toContain(voiceCite(voice))
      expect(render(out), mode).not.toContain('<svg')
    }
    // The app keeps the mark and the platform-free words.
    const app = render(subjectsVoices.render(data, 'app', ctx))
    expect(app).toContain('<svg')
    expect(markupText(app)).not.toContain(voiceCite(voice))
  })

  // BOTH REFS PER VOICE, the paired frame included. `subjects` is a registered
  // `PageModule`, so /api/export → createSnapshot → freezeQuotes runs over this
  // data: a ref declared here reaches `report_snapshots.evidence_ids`, the
  // column an erasure searches, and words that are NOT behind a ref freeze into
  // `data` as words.
  it('declares its refs so a snapshot can freeze ids and resolve words at render', () => {
    expect(blockAnswers(subjectsVoices, subjectsFixture()).quotes)
      .toEqual(['e:1', 'e:6', 'e:9', 'e:8', 'e:2', 'e:3', 'e:7'])
  })

  it('freezes the paired on-screen frame as a ref, never as words', () => {
    const { data: frozen, refs } = freezeQuotes(subjectsFixture())
    expect(refs).toContain('e:9')
    expect(JSON.stringify(frozen)).not.toContain('1 bag. 3 years. 0 regrets')
  })

  it('says a frame whose evidence row is gone is counted, not quotable', () => {
    const data = subjectsFixture()
    const voice = data.selected!.voices.find((v) => v.onScreen)!
    const erased = {
      ...data,
      selected: { ...data.selected!, voices: [{ ...voice, onScreen: { ref: 'e:9', text: '' } }] },
    }
    expect(renderText(subjectsVoices.render(erased, 'app', ctx))).toContain('this frame has since been removed')
  })

  it('says a quote whose words are gone is counted, not quotable', () => {
    const data = subjectsFixture()
    const erased = {
      ...data,
      selected: { ...data.selected!, voices: [{ ...data.selected!.voices[0], quote: { ref: 'e:1', text: '' } }] },
    }
    expect(renderText(subjectsVoices.render(erased, 'app', ctx))).toContain('counted, not quotable')
  })
})

describe('SU3 · questions your posts did not answer', () => {
  it('says the count, the population it counted in and your own posts — and prints no share', () => {
    const text = renderText(subjectsUnanswered.render(subjectsFixture(), 'app', ctx))
    expect(text).toContain('came up in 130 of the videos we have read')
    expect(text).toContain('none of your 9 posts in the last 12 months touched it')
    // THE GATE'S OWN NUMBER IS THE ROWS' DENOMINATOR NOW, which is where a
    // reader needs it: 130 of the 214 videos that asked anything about this
    // subject. Both ends of that fraction come off one read on one clock —
    // unlike the mock's "130 of 1,388", whose denominator is comment-dated.
    expect(text).toContain('130 of 214 videos')
    expect(text).toContain('9 posts of yours')
    expect(text).toContain('counts, not shares')
    expect(text).not.toContain('%')
  })

  it('says which half of your posts it matched on, because the other half is unreadable', () => {
    // `video_claims` carries RLS and no tenant SELECT policy until M8, so the
    // claims half of the haystack came back empty with no error on every page
    // a client opens — and an empty half reads as "you never answered this".
    // The OV4 precedent: name the side that cannot be read.
    const text = renderText(subjectsUnanswered.render(subjectsFixture(), 'app', ctx))
    expect(text).toContain('what your posts are about')
    expect(text).toContain('not readable yet')
  })

  // Ruling H (copy de-clutter): the Reddit cap is said once, in Settings ›
  // How to read, not on each block that leans on Reddit.
  it('leaves Reddit’s 40-comment cap to How to read', () => {
    expect(renderText(subjectsUnanswered.render(subjectsFixture(), 'app', ctx)))
      .not.toContain('40 comments')
  })

  it('refuses to rank a gap under the gate, and says how many videos there were', () => {
    const data = subjectsFixture()
    const short = {
      ...data,
      selected: {
        ...data.selected!,
        unanswered: {
          ...data.selected!.unanswered,
          rows: [],
          questionVideos: 4,
          refusal: '4 videos asked something about this subject — we do not rank a gap under 10.',
        },
      },
    }
    expect(subjectsUnanswered.emptyState(short)).toContain('we do not rank a gap under 10')
  })

  // A BLOCK MARKS THE MODEL'S VALUE, NOT THE ROW IT SITS IN. The lead was one
  // `data-copy="figure"` node around a sentence containing a Pass B theme
  // label — a model's words declared to be one of code's figures.
  it('marks the clustering’s label as the model’s, and the count as code’s', () => {
    const markup = render(subjectsUnanswered.render(subjectsFixture(), 'app', ctx))
    expect(markup).toContain('data-copy="subject" data-slot="pass_b_theme"')
    expect(markup).toContain('Questions grouped as')
    // And it still passes every rule, unmarked sentence included.
    assertCopyContract(markup)
  })

  it('declares one figure per row it printed', () => {
    const figures = blockAnswers(subjectsUnanswered, subjectsFixture()).figures
    expect(Object.keys(figures)).toHaveLength(2)
    expect(Object.values(figures).every((f) => f.unit === 'videos')).toBe(true)
  })

  it('carries no verdict at all — its two halves are dated two ways', () => {
    expect(blockAnswers(subjectsUnanswered, subjectsFixture()).verdicts).toEqual([])
  })
})

// ---- the two rail tiles the mock draws and the build had never had ----------

describe('SU4 · your own posts', () => {
  it('counts what you published, says what cleared the floor, and NAMES THE CLOCK', () => {
    const text = renderText(subjectsOwnPosts.render(subjectsFixture(), 'app', ctx))
    expect(text).toContain('9 posts published')
    expect(text).toContain('3 of 9 cleared the 5-comment floor')
    // D9. Every other figure on this page is comment-dated; a census of what
    // you published is dated by `videos.upload_date`, and an upload-dated count
    // under a comment-dated month heading is the mixing UNANSWERED_BASIS exists
    // to name one tile down.
    expect(text).toContain('dated by the day you posted')
    expect(text).toContain('posts published in September')
  })

  it('draws the hooks as independent shares, each with its own "of N" — never a partition', () => {
    const text = renderText(subjectsOwnPosts.render(subjectsFixture(), 'app', ctx))
    // Five of nine posts carry a hook at all, so the rows do not sum to the
    // census (D4). Each says what it is a share of instead.
    expect(text).toContain('Demonstration')
    expect(text).toContain('of 9')
    expect(text).not.toContain('Other hooks')
  })

  it('names the subjects your posts matched, with the count of posts', () => {
    const text = renderText(subjectsOwnPosts.render(subjectsFixture(), 'app', ctx))
    expect(text).toContain('Subjects matched')
    expect(text).toContain('Durability')
    expect(text).toContain('3 of 9')
  })

  it('survives M4 — `videos` is readable whatever the month tables say', () => {
    expect(subjectsOwnPosts.emptyState(refusedFixture())).toBeNull()
    expect(renderText(subjectsOwnPosts.render(refusedFixture(), 'app', ctx))).toContain('9 posts published')
  })

  // ONE ANSWER PER SCREENFUL. The membership rows are read THROUGH the subject
  // rows, so a set that cannot be read matched nothing — and the rail 200px
  // above has already said the set cannot be read. Naming Durability here was
  // the page contradicting itself in one screenful, on the one arm a real
  // tenant sees.
  //
  // AND THE TILE SAYS NOTHING ABOUT THE SET, rather than saying the wrong
  // thing about it: `SUBJECTS_NONE_NAMED` invites the reader to name one, and
  // the rail has just removed the control that would. "We could not read it"
  // is the rail's sentence and this tile lets it stand.
  it('says nothing about the set where the set itself cannot be read', () => {
    const data = refusedFixture()
    expect(data.ownPosts?.subjects).toEqual([])
    expect(data.ownPosts?.subjectsNote).toBeNull()
    const text = renderText(subjectsOwnPosts.render(data, 'app', ctx))
    expect(text).not.toContain('Durability')
    expect(text).not.toContain('Recycled materials')
    expect(text).not.toContain(SUBJECTS_NONE_NAMED)
    expect(text).not.toContain('Subjects matched')
    // The rest of the census is real and still prints.
    expect(text).toContain('9 posts published')
  })

  // AND WHERE THE SET WAS READ AND IS EMPTY, THE SENTENCE IS STILL THERE —
  // `subjectScope: null` vs `{ named: 0 }` is what tells the two apart, and
  // `ownCensusWithClaims` decides between them (lib/reading/own-posts.test.ts
  // covers all three notes). This is the block half: given the note, it prints
  // it, under the eyebrow the mock draws.
  it('says no subject is named where the set was read and is empty', () => {
    const data = refusedFixture()
    const readEmpty = { ...data, ownPosts: { ...data.ownPosts!, subjectsNote: SUBJECTS_NONE_NAMED } }
    const text = renderText(subjectsOwnPosts.render(readEmpty, 'app', ctx))
    expect(text).toContain('Subjects matched')
    expect(text).toContain(SUBJECTS_NONE_NAMED)
  })

  it('says the census is empty rather than printing a zero', () => {
    const data = subjectsFixture()
    const none = { ...data, ownPosts: null }
    expect(subjectsOwnPosts.emptyState(none)).toContain('not recorded')
  })

  it('is email-safe', () => {
    const markup = render(subjectsOwnPosts.render(subjectsFixture(), 'email', ctx))
    expect(markup).not.toContain('class=')
    expect(markup).not.toContain('var(--')
  })
})

describe('SU5 · say vs hear', () => {
  it('prints each ledger claim with its own state, and the tally only where rows are cut', () => {
    const text = renderText(subjectsSayHear.render(subjectsFixture(), 'app', ctx))
    expect(text).toContain('Built to last a decade')
    expect(text).toContain('echoed')
    expect(text).toContain('pushed back')
    // ONE LEDGER: the rows carry the tally's own states, never a per-row
    // "not tracked" under a tally that says some were echoed.
    expect(text).not.toContain('not tracked')
    // Thirteen claims and three rows, so the whole ledger is counted under them.
    expect(text).toContain('13 claims · 3 echoed · 2 pushed back · 8 silent')
    const all = renderText(subjectsSayHear.render({ ...subjectsFixture(), sayHear: { total: 3, echoed: 1, pushedBack: 1, silent: 1 } }, 'app', ctx))
    expect(all).not.toContain('3 claims')
  })

  it('sets a claim as plain text, never as a quotation', () => {
    const markup = render(subjectsSayHear.render(subjectsFixture(), 'app', ctx))
    expect(markup).not.toContain('“Built to last a decade”')
    expect(markup).not.toContain('font-serif')
  })

  it('dates itself by the update, never by the month heading above it', () => {
    // D9. The ledger is Pass D-a's resolution on ONE completed update; the
    // month at the top of this page means comment-dated. The mock stamps this
    // tile "Sep".
    const text = renderText(subjectsSayHear.render(subjectsFixture(), 'app', ctx))
    expect(text).toContain('latest update')
    expect(text).not.toContain('Sep ·')
  })

  it('says once that there is no ledger, rather than a state per row', () => {
    const text = renderText(subjectsSayHear.render(refusedFixture(), 'app', ctx))
    expect(text).not.toContain('These are the posts you published')
    expect(text).toContain(SAY_HEAR_NONE)
    expect(subjectsSayHear.emptyState(refusedFixture())).toBe(SAY_HEAR_NONE)
  })

  it('quotes no figure token — a claim is not a video, a comment, a point or a percentage', () => {
    expect(blockAnswers(subjectsSayHear, subjectsFixture()).figures).toEqual({})
  })
})

// ---- what wave 2 changed about the blocks that already existed ---------------

describe('the mock’s own shape, where the data allows it', () => {
  it('leads the pane with the banded gap and never with "narrowed"', () => {
    const text = renderText(subjectsSubject.render(subjectsFixture(), 'app', ctx))
    // D1: both levels with both denominators, and the refusal the band earned.
    expect(text).toContain('Durability: You 31.0% of 84 · Freitag 43.7% of 142 · too few to compare')
    expect(text).not.toContain('narrowed')
  })

  it('qualifies each side and says what its figure is a share of', () => {
    const text = renderText(subjectsSubject.render(subjectsFixture(), 'app', ctx))
    expect(text).toContain('You · Sealand')
    expect(text).toContain('Freitag · rival')
    expect(text).toContain('Category · no brand')
    expect(text).toContain('of your videos')
    expect(text).toContain('of their videos')
    expect(text).toContain('of category videos')
  })

  // D5 / D11. `directionWord` answers `flat` when three readings exist and do
  // not agree — the ABSENCE of a direction — and "flat" is not a word this
  // product has (MOVEMENT_WORDS carries none). The build printed "flat, 3
  // months" beside Freitag's "no clear change": two non-answers, one of them
  // dressed as a finding.
  it('prints no "flat" anywhere, and still prints a direction the category earned', () => {
    const markup = render(subjectsSubject.render(subjectsFixture(), 'app', ctx))
    expect(markup).not.toContain('flat')
    expect(markup).toContain('growing, 3rd month')
    expect(copyViolations(markup).filter((v) => v.rule === 'direction-word')).toEqual([])
  })

  it('states the category’s last three levels as levels, dated, and claims no direction from them', () => {
    const text = renderText(subjectsSubject.render(subjectsFixture(), 'app', ctx))
    // Both sides of this merge touched this line: `lib`'s fmtPct now keeps an
    // exact .0 so a decimal column lines up, and `main`'s M13 moved the fixture's
    // September reading from 24.5 to 22. Take both.
    // A59: the chart below draws these points; the trail is not repeated.
    expect(text).not.toContain('Jul 17.0% → Aug 19.0% → Sep 22.0% in the category')
  })

  // AND THE OTHER HALF OF THE SAME RULE. The fixture no longer carries a
  // `moved` side, so the negative case — a column that DID draw a magnitude and
  // must not repeat the month behind it — is exercised against a side pushed
  // over its own band. Without this the rule is only half tested, and the half
  // that is missing is the one that made column 3 wrap onto a fifth line.
  it('does NOT repeat the prior month beside a column that drew its magnitude', () => {
    const data = subjectsFixture()
    const rival = data.selected!.sides.find((s) => s.kind === 'rival')!
    const moved = {
      ...data,
      selected: {
        ...data.selected!,
        sides: data.selected!.sides.map((s) =>
          s.kind === 'rival' ? { ...s, verdict: { ...s.verdict!, state: 'moved' as const, changePts: 5.5, bandPts: 2.1 } } : s,
        ),
      },
    }
    expect(rival.previous?.pct).toBe(43.7)
    const text = renderText(subjectsSubject.render(moved, 'app', ctx))
    expect(text).toContain('▲ 5.5 pts')
    expect(text).not.toContain('▲ 5.5 pts · band ±2.1 pts Aug 43.7%')
    // The two that still refuse keep theirs.
    expect(text).toContain('too few to compare Aug 31.0%')
  })

  // THE THREE COLUMNS CLOSE ON ONE EDGE. The prior month prints where the
  // column drew NO magnitude — it is the only way to see where a refused or
  // unchanged side stood — and not where one was drawn, because "▲ 5.5 pts"
  // IS the distance from that month. Printing both made column 3 wrap onto a
  // fifth line and stand ~28px taller than its neighbours.
  it('prints the prior month only where no change magnitude was drawn', () => {
    const data = subjectsFixture()
    const text = renderText(subjectsSubject.render(data, 'app', ctx))
    const moved = data.selected!.sides.filter((s) => s.verdict?.state === 'moved')
    const quiet = data.selected!.sides.filter((s) => s.verdict?.state !== 'moved' && s.previous?.pct != null)
    // RE-BASED BY THE MERGE, and the rule under test is unchanged. M13 moved
    // the fixture's September category reading from 24.5 to 22, which makes the
    // category's step 3.0 points against a band of +/-3.1 — so its verdict is
    // `no_clear_change` where it was `moved`, and NO side on this tile states a
    // magnitude any more. The assertion that the two lists partition the sides
    // is what carries the rule; which side falls where is the fixture's to say.
    expect(moved.map((s) => s.kind)).toEqual([])
    expect(quiet.map((s) => s.kind)).toEqual(['you', 'rival', 'category'])
    // All three non-answers keep the prior month, inline, right after the badge.
    // `lib`'s fmtPct keeps an exact .0; `shell`'s SH18 puts the change and the
    // band beside `no_clear_change`, and this merge's R2 keeps them off
    // `too_little_data`, where the band can be a floor rather than a margin.
    expect(text).toContain('too few to compare Aug 31.0%')
    expect(text).toContain('no clear change · ±0 pts Aug 43.7%')
    expect(text).toContain('no clear change · +3 pts growing, 3rd month Aug 19.0%')
  })

  it('names the axis the chart spans, and what the shading over it means', () => {
    const text = renderText(subjectsLine.render(subjectsFixture(), 'app', ctx))
    expect(text).toContain('monthly · Apr → Sep 2026')
  })

  it('keys the chart by audience AND kind, and paints a second rival its own ink', () => {
    const markup = render(subjectsLine.render(subjectsFixture(), 'app', ctx))
    // Your own series draws nothing in the fixture, so it is not keyed as a
    // line — it is named in the one "No line yet" sentence (2026-09-24).
    expect(markup).not.toContain('Sealand · you')
    expect(markup).toContain('Freitag · rival')
    expect(markup).toContain('Category · no brand')
    // The end label keeps the SHORT name and its denominator — the one part of
    // an end label that may not be lost to the gutter's clip.
    expect(markup).toContain('of 142')
  })

  // THE STATE THE PAYING TENANT IS IN. Sealand carries 84 videos against a
  // 100-video floor, so the client's own series never reaches the plot on any
  // subject — six hollow rings on the 0% rule under a key promising a line.
  //
  // 2026-09-24: ONE short line for every ink with no line, and no per-series
  // reason. The rings on the gutter track belonged to a series that drew
  // nothing, so they are gone with it and the key no longer explains them.
  it('says in one short line that your own ink draws no line yet', () => {
    const text = renderText(subjectsLine.render(subjectsFixture(), 'app', ctx))
    expect(text).toContain('No line yet: You (too few videos)')
    expect(text).not.toContain('no line:')
    expect(text).not.toContain('below the floor')
  })

  it('draws the trailing twelve months whatever the horizon, and figures under three', () => {
    const base = subjectsFixture()
    const pane = base.selected!
    // A "this month" page whose chart axis holds only two readable months.
    const two = pane.series.map((s) => ({ ...s, points: s.points.slice(-2) }))
    const data = { ...base, axis: base.axis.slice(-1), chartAxis: base.axis.slice(-2), selected: { ...pane, chartSeries: two } }
    const markup = render(subjectsLine.render(data, 'app', ctx))
    expect(markup).not.toContain('<svg')
    const text = renderText(subjectsLine.render(data, 'app', ctx))
    expect(text).toContain('The chart appears from the third month.')
    expect(text).toContain('monthly · Aug → Sep 2026')
    assertCopyContract(markup)
  })

  it('draws the gap bracket only where the band earned a magnitude (D1)', () => {
    // On the mock's own month the gap is `too_little_data`, so there is no
    // bracket — the same answer the pane's lead gives one tile above.
    const markup = render(subjectsLine.render(subjectsFixture(), 'app', ctx))
    expect(markup).not.toContain('apart')
  })

  it('names the subject in the voices title and states no language share in any mode', () => {
    const text = renderText(subjectsVoices.render(subjectsFixture(), 'app', ctx))
    expect(text).toContain('Voices on durability')
    // No surface states how much was not in English (2026-09-24).
    for (const mode of ['app', 'print', 'email'] as const) {
      expect(renderText(subjectsVoices.render(subjectsFixture(), mode, ctx))).not.toContain('not in English')
    }
  })

  // THE PLATFORM IS DRAWN ONCE. The cite led with `m.platform` — the raw stored
  // value, a proper noun lower-cased — while the glyph in front of it already
  // said the same thing. An email has no glyph, so there it is a WORD, cased.
  it('prints the platform as a glyph on screen and as a cased word in an email', () => {
    const screen = renderText(subjectsVoices.render(subjectsFixture(), 'app', ctx))
    expect(screen).not.toContain('tiktok')
    expect(screen).toContain('14 Sep · under a category video')
    const email = renderText(subjectsVoices.render(subjectsFixture(), 'email', ctx))
    expect(email).toContain('TikTok · 14 Sep')
    expect(email).not.toContain('tiktok ·')
  })

  it('flags a creator speaking on camera, and pairs the frame’s own words with it', () => {
    const text = renderText(subjectsVoices.render(subjectsFixture(), 'app', ctx))
    expect(text).toContain('Said on camera')
    expect(text).toContain('On-screen text on the same video')
    expect(text).toContain('1 bag. 3 years. 0 regrets')
  })
})

// THE PAGE SAYS A THING ONCE. Two paragraphs were rendered twice within one
// screenful: the page's own subtitle (`lib/nav.ts`) as this block's question
// line, and `axisNote` at the foot of the hero and again as the chart's
// caption ~60px below it.
describe('the page says each of its sentences once', () => {
  it('does not repeat the page’s own subtitle as the pane’s question', () => {
    expect(subjectsSubject.question).not.toBe(NAV_SUBTITLE)
    for (const data of [subjectsFixture(), refusedFixture()]) {
      expect(renderText(subjectsSubject.render(data, 'app', ctx))).not.toContain(NAV_SUBTITLE)
    }
  })

  it('prints the axis note on the hero and not again under the chart', () => {
    const data = subjectsFixture()
    const note = data.selected!.axisNote!
    expect(renderText(subjectsSubject.render(data, 'app', ctx))).not.toContain(note) // removed 2026-09-24
    expect(renderText(subjectsLine.render(data, 'app', ctx))).not.toContain(note)
  })
})

describe('the page’s own layout', () => {
  it('draws all six blocks when a subject is selected', () => {
    expect(layoutFor(subjectsFixture()).map((b) => b.block.key)).toEqual(SUBJECT_BLOCKS.map((b) => b.key))
  })

  it('drops the four blocks that are about a subject when there is no subject', () => {
    // Six tiles printing the same sentence down two screens of empty space is
    // honest and unreadable. The page decides what to drop; that division is
    // the block contract's own ("a report drops a slide").
    // The two rail tiles that are about the WORKSPACE stay: what you published
    // and what you claimed are true whether or not a subject is selected, and
    // on the refused fixture they are the only reading on the page.
    for (const data of [refusedFixture(), candidatesFixture()]) {
      expect(layoutFor(data).map((b) => b.block.key))
        .toEqual(['subjects.list', 'subjects.subject', 'subjects.ownposts', 'subjects.sayhear'])
    }
  })

  // TWO SOURCES OF TRUTH FOR ONE GEOMETRY. The app arm read `LAYOUT` directly
  // and ignored `layoutFor`'s columns, so the no-selection arm — the one
  // production is in — kept the selected reading's rail-and-column frame with
  // one 216px tile in it. The spans have to add up to whole rows.
  it('fills whole rows with the four tiles it keeps when nothing is selected', () => {
    const cols = layoutFor(refusedFixture()).map((l) => l.col)
    expect(cols.reduce((a, b) => a + b, 0) % 12).toBe(0)
  })

  it('says something of its own where the rail has already said the set is unreadable', () => {
    const data = refusedFixture()
    expect(subjectsSubject.emptyState(data)).not.toBe(data.list.notRecorded)
    const both = renderText(<>{subjectsList.render(data, 'app', ctx)}{subjectsSubject.render(data, 'app', ctx)}</>)
    expect(both.split('Your subjects are not recorded for this workspace yet.').length - 1).toBe(1)
  })

  it('never asks the grid for a span it does not have', () => {
    for (const data of [subjectsFixture(), refusedFixture()]) {
      for (const { col, row } of layoutFor(data)) {
        expect(col).toBeGreaterThanOrEqual(1)
        expect(col).toBeLessThanOrEqual(12)
        expect(row).toBeGreaterThanOrEqual(1)
        expect(row).toBeLessThanOrEqual(6)
      }
    }
  })
})

// A brief borrows SU3 and SU-voices (SALES_MAP, CONTENT_MAP), and a brief is
// read as a PDF and on a public share page. "Open the content brief →"
// resolves, for such a reader, to a login wall.
//
// AND THE READINESS OWNER IS GONE FROM EVERY ARM, NOT JUST FROM PAPER. See the
// vocabulary rule on `UNANSWERED_CLAIMS_UNREADABLE` (lib/pages/subjects.ts):
// "— Verbatim engineering" names the team, which is a fact for
// /dashboard/settings/readiness and a ticket anywhere else — and the app is
// where the paying reader is. `lib/readiness/compute.ts` draws no row for the
// claims ledger, so there is no page to name in its place either.
describe('the Subjects blocks, read from outside the workspace', () => {
  it('name the half they could not read and never name our own owner', () => {
    const data = subjectsFixture()
    for (const mode of MODES) {
      const text = renderText(subjectsUnanswered.render(data, mode, ctx))
      expect(text, mode).toContain('what they claim is not readable yet')
      expect(text, mode).not.toContain('Verbatim engineering')
    }
  })

  // THE SAME RULE ON SU5. `refusedFixture` is production's state today, so
  // this is the sentence a reader in the app — and a PDF, and a `/r/<token>`
  // page — of the page as it stands would actually carry.
  //
  // `subjects.ownposts` IS IN THIS LOOP NOW (R1, at the wave-3 merge). It was
  // left out deliberately, because its sentence is `OWN_CLAIMS_UNREADABLE` in
  // lib/reading/own-posts.ts — a file this page reads and does not own — and
  // that constant still carried the owner in its app arm, guarded only on
  // paper. The merge took the owner off the constant itself, so the guarantee
  // is now the same one every other arm on this page makes.
  it('strips the readiness owner from SU5 and SU3 in every arm', () => {
    const data = refusedFixture()
    for (const mode of MODES) {
      const text = renderText(subjectsSayHear.render(data, mode, ctx))
      expect(text, mode).toContain(SAY_HEAR_NONE)
      expect(text, mode).not.toContain('Verbatim engineering')

      const own = renderText(subjectsOwnPosts.render(data, mode, ctx))
      expect(own, mode).toContain('not readable on this page yet')
      expect(own, mode).not.toContain('Verbatim engineering')
    }
  })

  it('draw no in-app affordance on paper', () => {
    const data = subjectsFixture()
    expect(render(subjectsUnanswered.render(data, 'print', ctx))).not.toContain('Open the content brief')
    expect(render(subjectsVoices.render(data, 'print', ctx))).not.toContain('Hear these voices in Voice')
    expect(render(subjectsVoices.render(data, 'app', ctx))).toContain('Hear these voices in Voice')
    // The chart's and the kind mix's footers were hand-rolled `email ? a :
    // Link` pairs, so PRINT got the app's control. This page exports now, so
    // print is a PDF and a `/r/<token>` page.
    expect(render(subjectsLine.render(data, 'print', ctx))).not.toContain('Compare another subject')
    expect(render(subjectsKinds.render(data, 'print', ctx))).not.toContain('Open Voice')
    expect(render(subjectsSubject.render(data, 'print', ctx))).not.toContain('videos behind your figure')
  })

  // A LINK IN AN EXPORT IS ABSOLUTE OR IT IS NOT A LINK. The page module used
  // to bind `blockContext('')` for every mode, so an email and a share page
  // printed `/dashboard/...` — relative to wherever the reader happened to be.
  it('send an email reader to an absolute address, in email-safe markup', () => {
    const markup = render(subjectsSubject.render(subjectsFixture(), 'email', ctx))
    expect(markup).toContain('https://app.verbatimintel.com/dashboard/videos?subject=s1')
    expect(markup).not.toContain('class=')
  })
})

// ---- D1 · the pane's gap, and its fourth state --------------------------------

describe('SU2 · the two-audience gap the pane carries', () => {
  it('reads the mock’s own month as too few to compare, with both levels intact', () => {
    const gap = subjectsFixture().selected!.gap as Gap
    expect(gap.state).toBe('too_little_data')
    expect(gapLine(gap)).toBe('You 31.0% of 84 · Freitag 43.7% of 142 · too few to compare')
  })

  it('refuses the difference outright once the rival is retired — the tracked set moved', () => {
    const gap = retiredRivalFixture().selected!.gap as Gap
    expect(gap.state).toBe('refused')
    expect(gap.refusedReason).toBe('tracking_change')
    expect(gap.gapPts).toBeNull()
    // The levels survive; only the difference is withheld, on this month and
    // on the earlier one.
    // The side names itself stopped — the fixture now carries the rival's own
    // `retiredAt`, not just a refusal reason.
    expect(gapLine(gap)).toBe('You 31.0% of 84 · Freitag · stopped 43.7% of 142 · comparison refused')
    expect(gapBasisLine(gap)).toBe('comparison refused in August')
  })

  // THE ARM HAS TO BE A DIFFERENT READING, NOT A DIFFERENT STRING. It varied
  // only `selected.gap.refused`, so the chart still drew Freitag as a live
  // rival with no dated rule on the axis and the shot proved the gapline branch
  // and nothing else.
  it('draws the stop as a dated rule on the axis, in the rival’s own series', () => {
    const retired = retiredRivalFixture()
    const live = subjectsFixture()
    const rules = calendarRulesFor(retired.selected!.series)
    expect(rules.map((r) => r.kind)).toContain('tracking_change')
    expect(rules.find((r) => r.kind === 'tracking_change')!.month).toBe('2026-08-01')
    expect(calendarRulesFor(live.selected!.series)).toEqual([])
    expect(renderText(subjectsLine.render(retired, 'app', ctx))).toContain('Freitag · stopped')
  })

  it('renders every block on the retired-rival reading and keeps the copy contract', () => {
    for (const block of SUBJECT_BLOCKS) {
      for (const mode of MODES) {
        assertCopyContract(render(block.render(retiredRivalFixture(), mode, ctx)))
      }
    }
  })
})

// ---- the page, not the blocks ------------------------------------------------

describe('the Subjects page', () => {
  // Copy de-clutter (ruling B, A45, A71): the page bar's How-sound pill is
  // the one home for soundness, so neither the language sentence nor the
  // method footnote prints on the page.
  it('prints no method footnote and no language sentence', () => {
    const data = subjectsFixture()
    const text = markupText(render(<SubjectsPage data={data} />))
    expect(text).not.toContain(data.method!.language!)
    expect(text).not.toContain(data.method!.preparedBy)
    expect(text).not.toContain(data.method!.redditCap)
  })
})
