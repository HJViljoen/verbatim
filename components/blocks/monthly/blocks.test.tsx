import { describe, expect, it } from 'vitest'
import { blockAnswers, blockContext, figureConflicts, mergeFigures, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { fullDate } from '@/lib/format'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { fmtInt, fmtPct } from '@/lib/format'
import { sentFigureRows } from '@/lib/reports/sent-figures'
import { MONTHLY_BLOCK_KEYS, MONTHLY_MOVES_UNLOCK } from '@/lib/reports/monthly'
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
  // rows a side, on a sent artefact.
  it('marks the trail as the levels it is, in every mode', () => {
    for (const mode of MODES) {
      const markup = render(block.render(monthlyFixture(), mode, ctx))
      expect(markup).toMatch(/data-copy="level"[^>]*>\s*Apr 3\.1% of 1,204/)
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

  // OV5's own unlock is "Scoring, and the pre-filled monthly card, are not built
  // yet. They will land on Market." — build status about an unshipped feature,
  // and a page name, in an email to a client's staff. The artefact answers the
  // question a reader actually has (why is there no score?) and says nothing
  // about what is built.
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

  it('still print the rows, the promise and the figures the page declares', () => {
    const data = monthlyFixture()
    const text = renderText(MONTHLY_BLOCKS['monthly.moves'].render(data, 'email', ctx))
    expect(text).toContain(MONTHLY_MOVES_UNLOCK)
    expect(text).toContain(data.overview.moves.masthead)
    for (const row of data.overview.moves.rows) expect(text).toContain(row.line)
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
