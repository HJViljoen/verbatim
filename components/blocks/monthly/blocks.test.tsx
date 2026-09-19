import { describe, expect, it } from 'vitest'
import { blockAnswers, blockContext, figureConflicts, mergeFigures, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { fullDate } from '@/lib/format'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { markupText, render, renderText } from '@/lib/test/render'
import { fmtInt, fmtPct } from '@/lib/format'
import { sentFigureRows } from '@/lib/reports/sent-figures'
import { MONTHLY_BLOCK_KEYS, MONTHLY_MOVES_UNLOCK } from '@/lib/reports/monthly'
import { MOVEMENT_WORDS } from '@/components/delta-badge'
import { freezeSentence, REFUSAL_WHY } from '@/lib/reading/record'
import { overviewRecord } from '@/components/pages/overview/record'
import { gapLine, type Gap } from '@/lib/reading/gap'
import { OWN_POSTS_UNREADABLE_OUTSIDE } from '@/lib/pages/overview'
import { MOVERS_UNREAD_NOTE } from '@/lib/pages/monthly'
import { ALL_MONTHLY_BLOCKS, MONTHLY_BLOCKS, monthlyBlocksFor } from './index'
import { formingMonthlyFixture, monthlyFixture, refusedMonthlyFixture } from './fixture'

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('https://app.verbatimintel.com', EMAIL)
const STATES = [monthlyFixture(), refusedMonthlyFixture(), formingMonthlyFixture()]

describe('the eight blocks', () => {
  it('render in all three modes on every state and keep the copy contract', () => {
    for (const data of STATES) {
      for (const block of ALL_MONTHLY_BLOCKS) {
        for (const mode of MODES) {
          assertCopyContract(render(block.render(data, mode, ctx)))
        }
      }
    }
  })

  it('is one block per stored key, in the design’s order', () => {
    expect(ALL_MONTHLY_BLOCKS.map((b) => b.key)).toEqual([...MONTHLY_BLOCK_KEYS])
    for (const key of MONTHLY_BLOCK_KEYS) expect(MONTHLY_BLOCKS[key].key).toBe(key)
  })

  it('drops a key this build no longer knows rather than breaking the artefact', () => {
    expect(monthlyBlocksFor(['monthly.month', 'monthly.gone', 'monthly.sound']).map((b) => b.key))
      .toEqual(['monthly.month', 'monthly.sound'])
    expect(monthlyBlocksFor(['nothing.at.all'])).toEqual([])
  })

  it('prints no [[token]] in any mode on any state', () => {
    for (const data of STATES) {
      for (const block of ALL_MONTHLY_BLOCKS) {
        for (const mode of MODES) expect(render(block.render(data, mode, ctx))).not.toContain('[[')
      }
    }
  })

  it('renders email-safe markup: no classes, no CSS variables, no flex, no grid', () => {
    for (const data of STATES) {
      for (const block of ALL_MONTHLY_BLOCKS) {
        const markup = render(block.render(data, 'email', ctx))
        expect(markup).not.toContain('class=')
        expect(markup).not.toContain('var(--')
        expect(markup).not.toMatch(/display:\s*(flex|grid)/)
      }
    }
  })

  it('links out absolutely in every mode, so a link works outside the app', () => {
    for (const data of STATES) {
      for (const block of ALL_MONTHLY_BLOCKS) {
        for (const mode of MODES) {
          const markup = render(block.render(data, mode, ctx))
          for (const href of markup.match(/href="([^"]+)"/g) ?? []) {
            expect(href).toMatch(/href="https?:\/\//)
          }
        }
      }
    }
  })

  it('keeps every section on every state — the artefact has one shape', () => {
    for (const data of STATES) {
      for (const block of ALL_MONTHLY_BLOCKS) {
        expect(render(block.render(data, 'email', ctx)).length).toBeGreaterThan(0)
      }
    }
  })

  it('does not print one number twice, two ways', () => {
    for (const data of STATES) {
      const tables = ALL_MONTHLY_BLOCKS.map((b) => blockAnswers(b, data).figures)
      expect(figureConflicts(tables)).toEqual([])
    }
  })
})

describe('MR1 · the month', () => {
  const block = MONTHLY_BLOCKS['monthly.month']

  it('states the month’s sentence with its figures substituted', () => {
    const text = renderText(block.render(monthlyFixture(), 'app', ctx))
    expect(text).toContain('9.4%')
    expect(text).toContain('130')
    expect(text).toContain('1,388')
  })

  it('does not print the interpretation or the advice — both belong at the end', () => {
    const text = renderText(block.render(monthlyFixture(), 'app', ctx))
    expect(text).not.toContain('Interpretation')
    expect(text).not.toContain('Lead with repairability')
  })

  it('carries last month’s confirming line', () => {
    expect(renderText(block.render(monthlyFixture(), 'app', ctx)))
      .toContain('August has closed at 7.1%')
  })

  it('says nothing about last month where nothing was ever sent about it', () => {
    expect(renderText(block.render(formingMonthlyFixture(), 'app', ctx))).not.toContain('has closed at')
  })

  it('shows the voices with the count they were drawn from', () => {
    const text = renderText(block.render(monthlyFixture(), 'app', ctx))
    expect(text).toContain('2 of 37 voices')
    expect(text).toContain('Three winters on the bike')
  })

  // The sentence names a week ("in the week of 13 Sep") on an artefact whose
  // every other number is a whole calendar month.
  it('heads the unusual line by the period the line is about', () => {
    const text = renderText(block.render(monthlyFixture(), 'app', ctx))
    expect(text).toContain('One unusual week:')
    expect(text).not.toContain('Unusual this month')
  })

  it('declares the month’s own size, which is what a sent figure is usually about', () => {
    const figures = blockAnswers(block, monthlyFixture()).figures
    expect(figures.month_videos).toMatchObject({ value: 2359, unit: 'videos' })
  })

  // `?? 0` wrote "0 videos read into this month" into a frozen snapshot and
  // into a record that is never rewritten. A month nobody counted is not a
  // month of zero.
  it('declares no size at all where the month’s was not recorded', () => {
    const bare = monthlyFixture()
    bare.overview.bar.videos = null
    expect(blockAnswers(block, bare).figures.month_videos).toBeUndefined()
  })

  it('says so rather than printing an empty block when there is nothing yet', () => {
    const bare = formingMonthlyFixture()
    bare.overview.bar.videos = null
    expect(block.emptyState(bare)).toBe('There is nothing to report on this month yet.')
  })
})

describe('MR3 · what moved', () => {
  const block = MONTHLY_BLOCKS['monthly.movers']

  it('heads itself with no direction word — the rows carry theirs', () => {
    expect(block.title).toBe('What moved this month')
    const text = renderText(block.render(monthlyFixture(), 'app', ctx))
    expect(text).toContain('Cleared their band · a larger share than last month')
    expect(text).toContain('Cleared their band · a smaller share than last month')
    // AND THE ONE WORD THAT DIFFERS IS THE DARK ONE (the fix pass, review
    // finding [Medium]): at 10.5px caps over two lines, two headings of the
    // same shape whose distinguishing word arrives fifth read as two copies of
    // one heading.
    const app = render(block.render(monthlyFixture(), 'app', ctx))
    expect(app).toContain('<span class="text-foreground">larger</span>')
    expect(app).toContain('<span class="text-foreground">smaller</span>')
    const email = render(block.render(monthlyFixture(), 'email', ctx))
    expect(email).toContain(`<span style="color:${EMAIL.ink}">larger</span>`)
  })

  it('writes every row’s line out in words, so an email with no images loses nothing', () => {
    const text = renderText(block.render(monthlyFixture(), 'email', ctx))
    expect(text).toContain('Apr 3.1% of 1,204 → May 4% of 1,260 → Jun 5.1% of 1,311 → Jul 6.8% of 1,349 → Aug 9.4% of 1,388 → Sep 9.4% of 1,388')
  })

  it('names a month with no reading rather than closing the gap', () => {
    expect(renderText(block.render(monthlyFixture(), 'email', ctx))).toContain('Apr — → May 1.8% of 1,260')
  })

  // THE TRAIL IS SIX LEVELS AND IT CARRIED NO MARKER, so rule (b) — which is
  // checked on marked nodes alone — never saw six bare percentages a row, ten
  // rows a side, on a sent artefact. The marker is on the LINE and not on each
  // point: rule (b) reads a level node's whole text, and "Jul —" alone is a
  // month with no reading rather than a level missing its evidence.
  it('marks the trail as the levels it is, in every mode', () => {
    for (const mode of MODES) {
      const markup = render(block.render(monthlyFixture(), mode, ctx))
      expect(markup).toMatch(/data-copy="level"[^>]*>(<span[^>]*>)?\s*Apr 3\.1% of 1,204/)
    }
  })

  // AND A POINT IS UNBREAKABLE (the fix pass, review finding [High]/[Minor]).
  // Set as one string in a 254px column the line wrapped to four, and one wrap
  // fell between "9.4% of" and "1,388" — a share on one line and what it is a
  // share of on the next, which is the denominator rule broken by other means.
  // The arrows are where the line may break.
  // AND THE ARROW RIDES WITH THE POINT BEFORE IT (the wave-3 review, finding
  // [Important]). As a bare text node between two unbreakable boxes the
  // separator offered a break on BOTH sides, so at 375 a six-point trail set
  // as eleven lines, five of them a lone "→". The box is the point plus its
  // arrow; the space after it is the only break.
  it('never breaks a point of the trail in half, or an arrow off its point', () => {
    for (const mode of MODES) {
      const markup = render(block.render(monthlyFixture(), mode, ctx))
      for (const point of ['Apr 3.1% of 1,204 →', 'Sep 9.4% of 1,388', 'Apr — →']) {
        expect(markup).toContain(`<span style="white-space:nowrap">${point}</span>`)
      }
      expect(markup).not.toContain('</span> → <span')
    }
  })

  it('draws the line as an SVG on screen and not in the email', () => {
    expect(render(block.render(monthlyFixture(), 'app', ctx))).toContain('<svg')
    expect(render(block.render(monthlyFixture(), 'email', ctx))).not.toContain('<svg')
  })

  it('prints a first-heard theme as a level and never as a change', () => {
    const text = renderText(block.render(monthlyFixture(), 'app', ctx))
    expect(text).toContain('First heard this month')
    expect(text).toContain('Second-hand resale value')
    // THE FLAG IS THE HEADING, SAID ONCE. Every row used to repeat it.
    expect(text.match(/first heard this month/gi) ?? []).toHaveLength(1)
  })

  it('marks "gone quiet" as the verdict it is', () => {
    const markup = render(block.render(monthlyFixture(), 'app', ctx))
    expect(markup).toMatch(/data-copy="verdict"[^>]*>\s*gone quiet/)
  })

  // FOUR ROWS, EIGHT FIGURES — two tokens a row, a share and a count. The
  // test was named for the rows and asserted the figures, and the status note
  // repeated the wrong one of the two.
  it('declares eight figures, not forty — the record takes the rest off verdicts', () => {
    const data = monthlyFixture()
    const answers = blockAnswers(block, data)
    expect(Object.keys(answers.figures).length).toBeLessThanOrEqual(8)
    expect(answers.verdicts.length).toBe(data.movers.growing.length + data.movers.fading.length)
  })

  // A MONTH WITH NO DENOMINATOR HAS NO SHARE, AND A BARE COUNT IS NOT A LEVEL.
  // `pct` is null exactly when the month's denominator is zero, and the row
  // printed "130 videos" inside a data-copy="level" node with no "of N" in it.
  it('keeps the copy contract on a row with no share', () => {
    const data = monthlyFixture()
    const strip = <T extends { pct: number | null }>(r: T): T => ({ ...r, pct: null })
    data.movers = {
      ...data.movers,
      growing: data.movers.growing.map(strip),
      fading: data.movers.fading.map(strip),
      newcomers: data.movers.newcomers.map(strip),
    }
    for (const mode of MODES) assertCopyContract(render(block.render(data, mode, ctx)))
    expect(renderText(block.render(data, 'app', ctx))).toContain('130 videos')
  })

  it('says what it could not read rather than printing an empty list', () => {
    expect(block.emptyState(formingMonthlyFixture()))
      .toBe('Too little conversation this month to say what moved.')
  })

  // THE STATE NO FIXTURE REACHED. Voice unreadable is not an empty section —
  // the block keeps its eight sections and prints the sentence instead — and
  // that sentence said "What grew and faded has not been read for this
  // workspace yet.", two direction words outside a verdict node, in all three
  // modes, for as long as nothing rendered it.
  it('keeps the copy contract when Voice could not be read at all', () => {
    const data = monthlyFixture()
    data.movers = {
      ...data.movers,
      growing: [], fading: [], newcomers: [], goneQuiet: [], notes: [],
      note: MOVERS_UNREAD_NOTE, rereadNote: null,
    }
    for (const mode of MODES) assertCopyContract(render(block.render(data, mode, ctx)))
    expect(renderText(block.render(data, 'email', ctx))).toContain(MOVERS_UNREAD_NOTE)
  })
})

describe('MR6 · one voice per subject', () => {
  const block = MONTHLY_BLOCKS['monthly.voices']

  it('prints one quote per subject, with its subject named', () => {
    const text = renderText(block.render(monthlyFixture(), 'app', ctx))
    expect(text).toContain('Durability')
    expect(text).toContain('Three winters on the bike')
    expect(text).toContain('Recycled materials')
  })

  it('keeps a subject with no voice, and says which silence it is', () => {
    expect(renderText(block.render(monthlyFixture(), 'app', ctx)))
      .toContain('nothing was said about this one this month')
  })

  it('says a withdrawn voice is gone rather than printing empty quotation marks', () => {
    expect(renderText(block.render(monthlyFixture(), 'app', ctx)))
      .toContain('counted, not quotable')
  })

  it('shows the machine translation beside the original', () => {
    const text = renderText(block.render(monthlyFixture(), 'app', ctx))
    expect(text).toContain('Die sak hou vir ewig')
    expect(text).toContain('The bag lasts forever, but the price is a joke')
  })

  it('declares no figure — a quote is not a reading', () => {
    expect(blockAnswers(block, monthlyFixture()).figures).toEqual({})
  })

  it('hands every ref it shows to the freeze', () => {
    expect(blockAnswers(block, monthlyFixture()).quotes).toEqual(['e:1', 'e:2', 'e:3'])
  })

  it('says the subjects are not recorded rather than that nobody spoke', () => {
    expect(block.emptyState(formingMonthlyFixture()))
      .toBe('Your subjects are not recorded for this workspace yet.')
  })
})

describe('MR7 · what to decide', () => {
  const block = MONTHLY_BLOCKS['monthly.decide']

  it('carries the labelled slot and says who wrote it', () => {
    const text = renderText(block.render(monthlyFixture(), 'app', ctx))
    expect(text).toContain('Interpretation')
    expect(text).toContain('We wrote this read ourselves this month.')
  })

  it('carries the standing advice as its metadata, marked as stored model prose', () => {
    const markup = render(block.render(monthlyFixture(), 'app', ctx))
    expect(markup).toContain('data-slot="pass_d_b_recommendation"')
    expect(renderText(block.render(monthlyFixture(), 'app', ctx)))
      .toContain('first raised 3 months ago · you marked it Working on it on 2 Sep')
  })

  it('gives the decision a deadline', () => {
    expect(renderText(block.render(monthlyFixture(), 'app', ctx)))
      .toContain('The next reading of this is 1 Oct 2026.')
  })

  // The frame carried `next reading 1 Oct` and the body says "The next reading
  // of this is 1 Oct 2026." — the same date twice, three lines apart, in both
  // rendered emails.
  it('says the next reading’s date once', () => {
    const text = renderText(block.render(monthlyFixture(), 'app', ctx))
    const date = fullDate(monthlyFixture().decide.nextReading)
    expect(text).toContain(date)
    expect(text.match(new RegExp(date.replace(/ /g, '\\s'), 'g')) ?? []).toHaveLength(1)
    expect(text.match(/\b1 Oct\b/g) ?? []).toHaveLength(1)
  })

  // NOTHING IS ATTACHED AND "block" IS OURS. The line used to read "The brief
  // is attached, one link per block." about a URL in the next clause, eleven
  // lines above a footer saying "The PDF is attached." about something else.
  it('offers the brief by link, says nothing is attached, and says "section"', () => {
    const text = renderText(block.render(monthlyFixture(), 'app', ctx))
    expect(text).toContain('The brief opens from the link below, one link per section.')
    expect(text).not.toContain('attached')
    expect(text).not.toContain('per block')
    expect(text).toContain('Marketing brief')
  })

  it('says when the attached brief pre-dates this reading', () => {
    const data = monthlyFixture()
    data.brief = { ...data.brief!, stale: true }
    expect(renderText(block.render(data, 'app', ctx))).toContain('before this reading')
  })

  // loadBriefLink did not read share_links.password_hash, so a locked link came
  // back public and the artefact told a recipient the brief was attached for a
  // page that will ask them for a password.
  it('says a locked link will ask for a password rather than calling it attached', () => {
    const data = monthlyFixture()
    data.brief = { ...data.brief!, public: false, locked: true }
    const text = renderText(block.render(data, 'app', ctx))
    expect(text).toContain('asks for the password your workspace set on it')
    expect(text).not.toContain('The brief is attached')
  })

  it('says the brief is in the workspace where the link needs an account', () => {
    const data = monthlyFixture()
    data.brief = { ...data.brief!, public: false, href: '/dashboard/reports?view=x' }
    expect(renderText(block.render(data, 'app', ctx))).toContain('The brief is in the workspace.')
  })

  it('declares no figure of its own — the tokens are section 1’s', () => {
    expect(blockAnswers(block, monthlyFixture()).figures).toEqual({})
  })

  it('substitutes the interpretation’s tokens from section 1’s table', () => {
    const data = monthlyFixture()
    data.decide.interpretation = {
      ...data.decide.interpretation,
      sentences: ['It came up in [[t1_videos]] of [[t1_of]] videos.'],
    }
    const text = renderText(block.render(data, 'app', ctx))
    expect(text).toContain('130')
    expect(text).toContain('1,388')
    expect(text).not.toContain('[[')
  })
})

describe('the five sections that are Overview’s', () => {
  it('forward the page’s own answers untouched', () => {
    const data = monthlyFixture()
    for (const key of ['monthly.subjects', 'monthly.rivals', 'monthly.moves', 'monthly.sound'] as const) {
      const answers = blockAnswers(MONTHLY_BLOCKS[key], data)
      expect(answers).toBeTruthy()
    }
    // OV2's figures reach the artefact under OV2's own tokens, so a reader of
    // the record joins the report and the page on one key.
    const subjects = blockAnswers(MONTHLY_BLOCKS['monthly.subjects'], data).figures
    expect(Object.keys(subjects).length).toBeGreaterThan(0)
  })

  // THE RECORD PARAGRAPH IS OVERVIEW'S, AND A TEST SAYS SO (the fix pass,
  // review finding [Minor]). Section 8's header claims the paragraph is
  // Overview's "word for word", and it was a COPY of Overview's composition —
  // the same template string in two files, so the first re-wording on the page
  // would have left the artefact stating one reading two ways, silently. The
  // freeze sentence is one composer now; this asserts the whole paragraph
  // against what the page itself renders.
  it('state the record in Overview’s own words, not in a copy of them', () => {
    const data = monthlyFixture()
    const page = renderText(overviewRecord.render(data.overview, 'email', ctx))
    const artefact = renderText(MONTHLY_BLOCKS['monthly.sound'].render(data, 'email', ctx))
    const freeze = freezeSentence(data.overview.record.freezesOn)
    expect(page).toContain(freeze)
    expect(artefact).toContain(freeze)
    for (const line of data.overview.record.lines) expect(artefact).toContain(line)
  })

  // THE ARTBOARD'S STRUCTURE, NOT ONE JOINED PARAGRAPH (the wave-3 review,
  // finding [Important]). §8 printed `lines.join(' ')` at 11.5 and
  // `footnote.join(' ')` at 11, both wholly muted: twelve facts in one
  // five-line block, then seven lines more, with nothing marking where any of
  // them starts — and the artefact's most important caveat ("this month stops
  // moving on 31 Oct 2026") at the end of it in the smallest type on the page.
  // AND "THE RECORD →" IS IN THE HEAD (the wave-3 review, finding [Minor]).
  // Passed as the frame's footer it rendered bottom-left in a plain underline
  // and §8's head was the only one on the page with nothing on its right; the
  // artboard puts it top-right, opposite the mono eyebrow.
  it('puts §8’s own link in the section head, not in a footer', () => {
    const markup = render(MONTHLY_BLOCKS['monthly.sound'].render(monthlyFixture(), 'email', ctx))
    const head = markup.slice(0, markup.indexOf('What is this reading made of'))
    expect(head).toContain('the record →')
    expect(markup.slice(markup.indexOf('What is this reading made of'))).not.toContain('the record →')
  })

  it('sets the record as one paragraph per fact, each led by its own figure', () => {
    const data = monthlyFixture()
    const record = data.overview.record
    const markup = render(MONTHLY_BLOCKS['monthly.sound'].render(data, 'email', ctx))
    // One paragraph per line, plus the freeze sentence, at the artboard's tier.
    expect((markup.match(/font-size:13\.5px/g) ?? []).length).toBe(record.lines.length + 1)
    expect(markup).not.toContain('font-size:11.5px')
    // The lead is the sentence's own figure, in the ink, and never a rewording:
    // "27% of what was said" leads on the figure alone.
    expect(markup).toContain(`<span style="font-weight:600;color:${EMAIL.ink}">3 updates</span>`)
    expect(markup).toContain(`<span style="font-weight:600;color:${EMAIL.ink}">2,359 videos</span>`)
    expect(markup).toContain(`<span style="font-weight:600;color:${EMAIL.ink}">27%</span>`)
    expect(markup).not.toContain('>27% of<')
    // A sentence that opens on no figure gets no bold lead at all.
    const nothing = record.lines.find((l) => l.startsWith('Nothing about'))!
    expect(markup).toContain(`>${nothing}</div>`)
    // And every word is still the composer's, whole.
    for (const line of [...record.lines, freezeSentence(record.freezesOn)]) {
      expect(markupText(markup)).toContain(line)
    }
  })

  // A Block renders its own heading inside its own frame, so an adapter that
  // renamed one would print the new name on the deck's sheet and the old one
  // three lines under it. The page's heading travels, and the month is said
  // once, in the masthead.
  it('keep the page’s own heading, so the sheet and the table agree', () => {
    expect(MONTHLY_BLOCKS['monthly.rivals'].title).toBe('Rivals')
    expect(MONTHLY_BLOCKS['monthly.subjects'].title).toBe('Your subjects')
    expect(MONTHLY_BLOCKS['monthly.sound'].title).toBe('How sound is this month')
    for (const key of ['monthly.subjects', 'monthly.rivals', 'monthly.moves', 'monthly.sound'] as const) {
      const text = renderText(MONTHLY_BLOCKS[key].render(monthlyFixture(), 'app', ctx))
      expect(text).toContain(MONTHLY_BLOCKS[key].title)
    }
  })

  // OV5's own unlock names a page ("Market") and a control ("Press Track
  // this"), neither of which an email to a client's staff can act on. The
  // artefact answers the question a reader actually has — why is there no
  // comparison on a move dated this month — and says nothing about what is or
  // is not built.
  it('say nothing about what is not built yet, in any mode', () => {
    for (const data of STATES) {
      for (const mode of MODES) {
        const text = renderText(MONTHLY_BLOCKS['monthly.moves'].render(data, mode, ctx))
        expect(text).not.toContain('not built yet')
        expect(text).not.toContain('will land on Market')
        expect(text).not.toContain('Press Track this')
      }
    }
  })

  // THE MOVE'S LINE IS STILL PRINTED WHOLE — it is just printed in the
  // artboard's two type sizes (E-monthly). `moveLine` composes "{title} ·
  // tracked 14 Sep · …", and the email arm sets the name in 15/600 above the
  // rest of it, so the joined text reads "Advanced technology tracked 14 Sep …"
  // with the separator gone. The assertion is the two halves, which is what the
  // reader sees; asserting the raw line back would pin the block to printing
  // the name once, in one size, which is the thing that changed.
  it('still print the rows, the promise and the figures the page declares', () => {
    const data = monthlyFixture()
    const text = renderText(MONTHLY_BLOCKS['monthly.moves'].render(data, 'email', ctx))
    expect(text).toContain(MONTHLY_MOVES_UNLOCK)
    expect(text).toContain(data.overview.moves.masthead)
    // BLOCK D WAVE 2, BOTH INTENTS. Every row prints its TITLE (E-monthly:
    // the name is printed once, in its own size, and the composed line's
    // remainder beside it); and a move with a READING behind it prints the
    // reading instead of its own fallback sentence (E-main,
    // `main.moves.move1.*`), so the composed remainder is asserted only for
    // the moves that have none — which is what `MoveRow.line` was always for.
    const readMoves = new Set(data.overview.moves.readings.map((r) => r.moveId))
    for (const row of data.overview.moves.rows) {
      expect(text).toContain(row.title)
      if (readMoves.has(row.id)) continue
      const rest = row.line.startsWith(`${row.title} · `) ? row.line.slice(row.title.length + 3) : row.line
      expect(text).toContain(rest)
    }
    // AND THE WHOLE-LEDGER TALLY, which nothing on this artefact printed before
    // (mock-gap D12 — never "this quarter").
    expect(text).toContain(data.overview.moves.acted?.line as string)
  })

  it('prints the rivals lead sentence, which wave 1 composed and nothing drew', () => {
    const data = monthlyFixture()
    const text = renderText(MONTHLY_BLOCKS['monthly.rivals'].render(data, 'email', ctx))
    expect(text).toContain(data.overview.rivals.lead as string)
    // D8: a count and the names, never "slipped 2" — a direction word for a
    // movement the row beneath it says did not clear its band.
    expect(text).not.toMatch(/slipped/i)
  })

  it('says in the open why a comparison was refused, where a title cannot be read', () => {
    const data = monthlyFixture()
    const text = renderText(MONTHLY_BLOCKS['monthly.rivals'].render(data, 'email', ctx))
    expect(text).toContain(MOVEMENT_WORDS.refused)
    expect(text).toContain(REFUSAL_WHY.tracking_change)
  })

  it('marks your own row and prints what the rivals said on their own posts', () => {
    const data = monthlyFixture()
    const text = renderText(MONTHLY_BLOCKS['monthly.rivals'].render(data, 'email', ctx))
    expect(text).toContain('Sealand (you)')
    expect(text).toContain('What the tracked rivals said on their own posts')
    // THE OUTSIDE WORDING, AND SAID ONCE (the fix pass, review finding
    // [Minor]). The panel printed one identical sentence per rival — 100%
    // absence said six times on a six-rival workspace — and the sentence it
    // printed ended "· Verbatim engineering", a READINESS OWNER meant for a
    // reader who can open Settings › Readiness. An update list is not that
    // reader, and this branch is the first time the string would leave the app
    // at all.
    expect(text).toContain(OWN_POSTS_UNREADABLE_OUTSIDE)
    expect(text).not.toContain('Verbatim engineering')
    expect(text.split(OWN_POSTS_UNREADABLE_OUTSIDE).length - 1).toBe(1)
  })

  // A RIVAL WITH NOTHING RAISED IS PRINTED, NOT DROPPED (the fix pass, review
  // finding [Minor]). The panel carries no count, so a filtered-out row was a
  // silent disappearance on the artefact that is read unaccompanied; the page
  // prints an explicit "—" for the same row.
  it('says a rival raised nothing rather than dropping it from the panel', () => {
    const data = monthlyFixture()
    const rivals = data.overview.rivals
    const quiet = {
      ...data,
      overview: {
        ...data.overview,
        rivals: {
          ...rivals,
          rows: [
            ...rivals.rows,
            { ...rivals.rows.find((r) => r.role === 'rival')!, audience: 'competitor:Cotopaxi', label: 'Cotopaxi', raisedMost: null },
          ],
        },
      },
    }
    const text = renderText(MONTHLY_BLOCKS['monthly.rivals'].render(quiet, 'email', ctx))
    expect(text).toContain('Cotopaxi — nothing was raised under their content this month.')
  })

  // AND THE VERDICTS ARE A COLUMN TOO (the wave-3 review, finding [Minor]).
  // Right-aligned in an auto-width cell, both the composition AND the x
  // changed row to row — Durability's verdicts began at x ≈ 176 and Price's at
  // x ≈ 327 — so a row with no reading for your own side was indistinguishable
  // from a row that is indented differently. Measured after: both begin at
  // x = 341 at 640, and the column is a percentage, so on a phone it grows
  // rather than painting over the row (scrollWidth 375, unchanged).
  it('keeps every subject’s verdicts in one right-hand column', () => {
    for (const data of STATES) {
      const markup = render(MONTHLY_BLOCKS['monthly.subjects'].render(data, 'email', ctx))
      expect(markup).not.toMatch(/<td align="right"[^>]*vertical-align:baseline/)
      expect((markup.match(/<td width="48%"/g) ?? []).length).toBe(data.overview.subjects.rows.length)
    }
  })

  it('prints both sides of a subject as a column, each with its own "of N"', () => {
    const data = monthlyFixture()
    const text = renderText(MONTHLY_BLOCKS['monthly.subjects'].render(data, 'email', ctx))
    for (const row of data.overview.subjects.rows) {
      expect(text).toContain(`${fmtInt(row.you.k ?? 0)} of ${fmtInt(row.you.n ?? 0)}`)
      expect(text).toContain(`${fmtInt(row.category.k ?? 0)} of ${fmtInt(row.category.n ?? 0)}`)
    }
    // D1: the gap prints as both sides and a band, and the earlier gap as its
    // own dated reading — never "narrowed from 19 in June".
    expect(text).toContain(gapLine(data.overview.subjects.gaps.s1 as Gap))
    expect(text).not.toMatch(/narrowed/i)
  })

  // THE FIX PASS: THE ARTEFACT HAS TO FIT A PHONE (review finding [Critical]).
  // Measured in the repo's own Chromium on all three fixture states, this
  // branch held the document at 593 / 389 / 398 px at every viewport below
  // that — a monthly report that could not be read in the place it is most
  // often opened. Three things set the floor and all three are markup this
  // tier can see: an unbreakable verdict cell in section 2, pixel widths on
  // two rivals columns, and twelve acted segments held on one line. A render
  // test cannot measure a layout, so it pins the three causes; the measurement
  // itself is in the status note.
  it('keeps no unbreakable box wider than a phone', () => {
    for (const data of STATES) {
      const subjects = render(MONTHLY_BLOCKS['monthly.subjects'].render(data, 'email', ctx))
      // No CELL is unbreakable — the sides inside it are, one at a time.
      expect(subjects).not.toMatch(/<td[^>]*white-space:nowrap/)
      const rivals = render(MONTHLY_BLOCKS['monthly.rivals'].render(data, 'email', ctx))
      // Chrome takes a pixel width on an auto-layout cell as that column's
      // minimum, so the figure and verdict columns carry none.
      expect(rivals).not.toMatch(/width:112px|width:124px/)
    }
  })

  // AN EMPTY SECTION SAYS ONE THING (the fix pass, review finding [Nit]).
  // With nothing dated, "Your moves" printed the empty state plus the masthead
  // plus the unlock — three sentences of methodology about scoring moves that
  // do not exist, more policy prose than the populated arm prints content.
  it('prints one honest line where nothing has been dated, not three of policy', () => {
    const forming = formingMonthlyFixture()
    const m = forming.overview.moves
    const text = renderText(MONTHLY_BLOCKS['monthly.moves'].render(forming, 'email', ctx))
    expect(text).toContain('No move has been dated yet')
    expect(text).not.toContain(m.masthead)
    expect(text).not.toContain(MONTHLY_MOVES_UNLOCK)
    // And the populated arm still carries both.
    const full = renderText(MONTHLY_BLOCKS['monthly.moves'].render(monthlyFixture(), 'email', ctx))
    expect(full).toContain(monthlyFixture().overview.moves.masthead)
    expect(full).toContain(MONTHLY_MOVES_UNLOCK)
  })

  // THE APPARATUS IS NOT DECORATION (the fix pass, review finding [High]).
  // `EMAIL.faint` is #9AA0A6: 2.64:1 on white and 2.46:1 on the panels, far
  // under AA, and it was carrying the six-month trails, the method footnote,
  // the side labels on every subject row and the refusal reasons — the part of
  // the artefact that makes the numbers honest, set in the one grey a reader
  // cannot see. This artefact's own nodes are at the muted grey (#6E7378,
  // 4.79:1); the token itself is the artboards' hex and shared by every email
  // surface, so lowering it product-wide is the merge lead's call.
  it('sets the evidence in a grey a reader can actually see', () => {
    const data = monthlyFixture()
    for (const key of ['monthly.movers', 'monthly.subjects', 'monthly.rivals', 'monthly.sound'] as const) {
      const body = render(MONTHLY_BLOCKS[key].render(data, 'email', ctx))
        // The frame's own `meta` cell is a shared primitive and keeps the
        // token; this is about what the block itself prints. (§8's meta holds
        // a NODE — "the record →", which carries its own colour — so the cell
        // is matched to its closing tag and not to its text.)
        .replace(/<td align="right" style="font-family:[^"]*font-size:11px;color:#9AA0A6">[\s\S]*?<\/td>/g, '')
      expect(body).not.toContain(EMAIL.faint)
    }
  })

  // THE METER MAY NOT SAY MORE THAN THE FIGURE BESIDE IT (review finding
  // [Important]). It drew min(of, 12) segments and filled max(1, round(…)), so
  // "1 of 64" — 1.6% — drew as 1 of 12, or 8.3%: a picture five times its own
  // subject, directly beside the number it annotates.
  it('draws the acted meter at the ratio it prints, at both scales', () => {
    const at = (decided: number, of: number) => {
      const data = monthlyFixture()
      const acted = { decided, of, line: data.overview.moves.acted?.line ?? '' }
      return render(MONTHLY_BLOCKS['monthly.moves'].render(
        { ...data, overview: { ...data.overview, moves: { ...data.overview.moves, acted } } },
        'email',
        ctx,
      ))
    }
    // Twelve or fewer: one segment each, `decided` of them filled, nothing
    // rounded — the artboard's own meter at the artboard's own scale.
    const five = at(2, 5)
    expect((five.match(/width:14px/g) ?? []).length).toBe(5)
    expect((five.match(new RegExp(`width:14px[^"]*background:${EMAIL.green}`, 'g')) ?? []).length).toBe(2)
    // Past that, a bar drawn to scale: 1 of 64 is 1.5625% of its track and is
    // allowed to be a sliver, because that is what 1 of 64 looks like.
    const many = at(1, 64)
    expect(many).toContain('width:1.5625%')
    expect(many).not.toMatch(/width:14px/)
    // AND THE TRACK IS FAINT (the wave-3 review, finding [Important]). Drawn
    // on the segment grey, 1 of 64 was a 208px #CDD2D7 bar with a 3px green
    // fill in it: a picture that says "done" beside a figure that says 1.6%.
    // The unfilled remainder of a scale bar is not a countable segment.
    expect(many).not.toContain(EMAIL.neutralSeg)
    expect(many).toContain(`background:${EMAIL.border}`)
  })

  // THE SECTION'S ONE GRAPHIC (review finding [High]). The artboard's rival row
  // is dot · name · BAR · share · verdict; the build drew every part but the
  // bar, so the one section whose argument is that shares can be compared by
  // eye compared them by reading. The bar is the share's own percentage of the
  // track — never normalised to the leading row, which would draw the leader
  // as all of something.
  it('draws each rival’s attention share as a bar at its own width', () => {
    const data = monthlyFixture()
    const markup = render(MONTHLY_BLOCKS['monthly.rivals'].render(data, 'email', ctx))
    let drawn = 0
    for (const row of data.overview.rivals.rows) {
      const pct = row.attention?.pct
      if (pct == null) continue
      drawn += 1
      expect(markup).toContain(`width:${Math.max(2, Math.min(100, pct))}%`)
    }
    expect(drawn).toBeGreaterThan(0)
  })

  // AND EVERY BAR STARTS AT THE SAME X (the wave-3 review, finding
  // [Important]). A row that is its own `<table>` shares no column with the
  // row above it: measured at 640 the three tracks were 81px each and began at
  // x = 157, 210 and 169, and at 375 they were 36, 36 and 12px WIDE. A render
  // test cannot measure a layout, so it pins the two causes — the rows are
  // `<tr>`s of ONE table, and the bar's column is present on every row,
  // including a row with no share to draw in it, because a row that skips a
  // cell takes the column away from every row below it.
  it('draws every rival’s row as a row of one table, so the bars share a baseline', () => {
    for (const data of STATES) {
      const rows = data.overview.rivals.rows
      if (rows.length === 0) continue
      const markup = render(MONTHLY_BLOCKS['monthly.rivals'].render(data, 'email', ctx))
      // The bar's column, once per row — drawn or not.
      expect((markup.match(/width="17%"/g) ?? []).length).toBe(rows.length)
      // One dot cell a row, and the row's rule on its CELLS — it used to be
      // the per-row table's own border, which is what made each row a table.
      expect((markup.match(/<td width="8" style="border-top/g) ?? []).length).toBe(rows.length)
      expect(markup).not.toMatch(/<table[^>]*border-top/)
    }
  })

  it('merge into one figure table with no key printed two ways', () => {
    const data = monthlyFixture()
    const merged = mergeFigures(ALL_MONTHLY_BLOCKS.map((b) => blockAnswers(b, data).figures))
    expect(Object.keys(merged).length).toBeGreaterThan(0)
  })
})

describe('what the artefact printed and what the record keeps', () => {
  // THE ASSERTION NOTHING MADE BEFORE. `sent_figures` is append-only — no
  // UPDATE grant and a BEFORE UPDATE trigger — so a row that disagrees with the
  // sheet it was written from is a permanently wrong statement about a client's
  // month. The two come off one reading in production; a fixture can put them
  // out of step (and did: a mover's verdict carried another row's label and
  // counts), and the render tier is the only place that can catch it.
  const recorded = (data: ReturnType<typeof monthlyFixture>) => {
    const answers = ALL_MONTHLY_BLOCKS.map((b) => blockAnswers(b, data))
    return sentFigureRows({
      month: data.month,
      monthStatus: data.monthStatus,
      artefact: 'monthly',
      verdicts: answers.flatMap((a) => a.verdicts),
      figures: mergeFigures(answers.map((a) => a.figures)),
      figureAudience: 'artefact',
    })
  }

  it('state the same level, the same two sides and the same label per object', () => {
    const data = monthlyFixture()
    const rows = new Map(recorded(data).map((r) => [`${r.objectKind}/${r.objectId}`, r]))
    const printed = renderText(MONTHLY_BLOCKS['monthly.movers'].render(data, 'app', ctx))
    let checked = 0
    for (const m of [...data.movers.growing, ...data.movers.fading]) {
      const row = rows.get(`theme/${m.id}`)
      if (!row) continue
      checked += 1
      expect(row.label).toBe(m.label)
      expect(row.k).toBe(m.k)
      expect(row.n).toBe(m.n)
      expect(row.value).toBe(m.pct)
      // And the sheet printed that level, beside that label, in those words.
      expect(printed).toContain(m.label)
      expect(printed).toContain(`${fmtPct(m.pct as number)} · ${fmtInt(m.k)} of ${fmtInt(m.n)}`)
    }
    expect(checked).toBeGreaterThan(0)
  })

  // The covering rule joins a token to a verdict by the object's NAME, and the
  // fixture's OV1 tokens used to read "share of the month" where the loader
  // writes "<label>'s share of the month" — so the rule the record is built on
  // fired on no fixture anywhere, and one reading of one theme was filed as
  // three statements.
  it('file one reading of one object once, however many blocks printed it', () => {
    const data = monthlyFixture()
    const rows = recorded(data)
    const lead = data.overview.sentence.lead!
    expect(rows.some((r) => r.objectKind === 'theme' && r.objectId === lead.objectId)).toBe(true)
    for (const token of ['t1_share', 't1_videos']) {
      expect(rows.some((r) => r.objectId === token)).toBe(false)
    }
  })

  // A rival is read on two populations in one section: the object and the
  // audience are the same on both and only the measure differs.
  it('keep a rival’s two readings apart, each under its own population', () => {
    const rival = recorded(monthlyFixture()).filter((r) => r.objectKind === 'rival')
    expect(rival.map((r) => r.measure).sort()).toEqual(['comments', 'videos'])
    expect(rival.find((r) => r.measure === 'comments')?.denominator).toBe('the panel’s comments this month')
    expect(rival.find((r) => r.measure === 'videos')?.denominator).toBe('the panel’s videos this month')
  })

  it('never file two rows under one object and one measure', () => {
    for (const data of STATES) {
      const keys = recorded(data).map((r) => `${r.audience}/${r.objectKind}/${r.objectId}/${r.measure}`)
      expect(new Set(keys).size).toBe(keys.length)
    }
  })
})
