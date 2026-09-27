import { isValidElement } from 'react'
import { describe, expect, it } from 'vitest'
import { blockAnswers, blockContext, figureConflicts, type RenderMode } from '@/lib/blocks/types'
import { EMAIL } from '@/lib/email/theme'
import { BlockFrame } from '@/components/blocks/frame'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { markupText, render, renderText } from '@/lib/test/render'
import { WEEKLY_BLOCK_KEYS, WEEKLY_RETIRED_KEYS, isMonthScopedFigure } from '@/lib/reports/weekly'
import { WEEKLY_BLOCKS, weeklyBlocksFor } from './index'
import { octoberUpdateFixture, ossurWeeklyFixture, weeklyFixture } from './fixture'
import { weeklyWeek } from './week'
import { weeklyCameIn } from './came-in'
import { weeklySubjects } from './subjects'
import { weeklyThemes } from './themes'
import { weeklyContent } from './content'
import { weeklyChange, changeDays } from './change'
import { forSales } from './sales'
import { weekCameIn } from '@/components/pages/week/came-in'
import { weekReply } from '@/components/pages/week/reply'
import { weekSales } from '@/components/pages/week/sales'
import { weekHeard } from '@/components/pages/week/heard'
import { marketWeekFixture } from '@/components/pages/week/fixture'

const MODES: RenderMode[] = ['app', 'print', 'email']
const ctx = blockContext('https://app.verbatimintel.com', EMAIL)
const STATES = [weeklyFixture(), octoberUpdateFixture(), ossurWeeklyFixture()]
/** `renderText` puts a space at every element edge; a reader sees none before
 *  a comma, a colon or a closing mark. */
const flat = (t: string): string => t.replace(/\s+([,.)”:;])/g, '$1').replace(/([(“])\s+/g, '$1')
const email = (block: { render: (d: never, m: RenderMode, c: typeof ctx) => unknown }, data = weeklyFixture()) =>
  flat(markupText(render(block.render(data as never, 'email', ctx) as never)))

describe('the seven sections (market-first WP3.7)', () => {
  it('are the preview’s, in its order, and the retired keys are gone', () => {
    expect([...WEEKLY_BLOCK_KEYS]).toEqual(['weekly.week', 'weekly.came-in', 'weekly.subjects', 'weekly.themes', 'weekly.sales', 'weekly.content', 'weekly.change'])
    for (const key of WEEKLY_RETIRED_KEYS) expect(Object.keys(WEEKLY_BLOCKS)).not.toContain(key)
    expect(weeklyBlocksFor(['weekly.week', 'weekly.coverage', 'weekly.incoming']).map((b) => b.key)).toEqual(['weekly.week'])
  })

  it('render in all three modes on every state and keep the copy contract', () => {
    for (const data of STATES) {
      for (const block of weeklyBlocksFor()) {
        for (const mode of MODES) assertCopyContract(render(block.render(data, mode, ctx)))
      }
    }
  })

  it('carry their title alone in the header and links alone in the footer (25 Sep rulings)', () => {
    for (const data of STATES) {
      for (const block of weeklyBlocksFor()) {
        for (const mode of MODES) {
          const el = block.render(data, mode, ctx)
          expect(isValidElement(el) && el.type === BlockFrame, `${block.key} [${mode}]`).toBe(true)
          const props = (el as { props: { meta?: unknown; footerNote?: unknown } }).props
          expect(props.meta, `${block.key} [${mode}]`).toBeUndefined()
          expect(props.footerNote, `${block.key} [${mode}]`).toBeUndefined()
        }
      }
    }
  })

  it('print no "how sound" and no Phase 1 section, in any mode', () => {
    for (const data of STATES) {
      for (const block of weeklyBlocksFor()) {
        for (const mode of MODES) {
          const text = renderText(block.render(data, mode, ctx))
          expect(text).not.toMatch(/how sound/i)
          expect(text).not.toContain('Unusual this week')
          expect(text).not.toContain('What came in')
        }
      }
    }
  })

  it('never say one number two ways', () => {
    for (const data of STATES) expect(figureConflicts(weeklyBlocksFor().map((b) => b.figures?.(data) ?? {}))).toEqual([])
  })

  it('file the update’s own counts under no month, and the front page’s under the reading month', () => {
    const tokens = weeklyBlocksFor().flatMap((b) => Object.keys(blockAnswers(b, weeklyFixture()).figures))
    expect(tokens.filter((t) => t.startsWith('came_in_')).every((t) => !isMonthScopedFigure(t))).toBe(true)
    expect(tokens.filter((t) => t.startsWith('market_subject_')).every(isMonthScopedFigure)).toBe(true)
    expect(tokens.some((t) => t.startsWith('weekly_subject_') && !isMonthScopedFigure(t))).toBe(true)
  })
})

describe('WR1 · your market this week', () => {
  it('leads with the market’s level, then hands the update’s counts back to it', () => {
    expect(email(weeklyWeek)).toBe('Your market in September so far: 654 videos. The 20 Sep update brought in 436 of them, with 9,471 comments.')
  })

  it('names the update’s own month where it is not the reading month (1 to 15 of a month)', () => {
    expect(email(weeklyWeek, octoberUpdateFixture())).toContain('The 11 Oct update brought 436 videos and 9,471 comments into your market’s October.')
  })

  it('draws no header in an inbox: it sits under the masthead', () => {
    const el = weeklyWeek.render(weeklyFixture(), 'email', ctx) as { props: { header?: boolean } }
    expect(el.props.header).toBe(false)
  })
})

describe('WR1 · with this update', () => {
  it('prints the update’s counts by part of the market, your own posts left out', () => {
    expect(email(weeklyCameIn)).toContain('Part of your market Videos Comments The category 421 9,271 Brands you track 15 200 Your market 436 9,471')
  })

  it('prints This week’s counts for the same update (the done-when)', () => {
    const page = weekCameIn.figures!(marketWeekFixture())
    const weekly = weeklyCameIn.figures!(weeklyFixture())
    for (const key of ['came_in_market_videos', 'came_in_market_comments', 'came_in_category_videos', 'came_in_brands_videos']) {
      expect(weekly[key]?.value, key).toBe(page[key]?.value)
    }
  })
})

describe('WR2 · the market by subject', () => {
  it('prints each subject’s level on the reading month and what this update put in', () => {
    const text = email(weeklySubjects)
    expect(text).toContain('Subject Videos Sep of 626 Aug of 351 With this update')
    expect(text).toContain('Looks & style provisional 104 17% 11% +73')
    expect(text).toContain('Community & purpose provisional · under 10, a count only 8 · 4 ·')
    expect(text).toContain('Not read as a change: we changed our searches in September.')
  })

  it('prints "·", never "+0", where the update’s days miss the reading month', () => {
    const text = email(weeklySubjects, octoberUpdateFixture())
    expect(text).not.toContain('+0')
    expect(text).not.toContain('+73')
  })

  it('says it in one line for a tenant with no subject named', () => {
    expect(email(weeklySubjects, ossurWeeklyFixture())).toContain('No subjects named yet')
  })
})

describe('WR3 · what your market talked about', () => {
  it('lists the top five themes, the makers line, the chip, and the themes new with this update', () => {
    const text = email(weeklyThemes)
    expect(text).toContain('Theme Videos Sep of 626 Aug of 351')
    expect(text).toContain('Makers and DIY, grouped:')
    expect(text).toContain('Not read as a change: we changed our searches in September.')
    expect(text).toContain('New with this update Theme Videos From searches added in Sep Laundry planning for travel 10 8 Preference for secondhand fashion a fifth makers 10 8')
    expect(text).toContain('themes at 10+ on Conversation →')
  })

  it('lists five rows, never the board’s ten', () => {
    const board = weeklyFixture().overview.themes!
    const text = email(weeklyThemes)
    expect(board.rows.length).toBeGreaterThan(5)
    for (const t of board.rows.slice(0, 5)) expect(text).toContain(t.label)
    for (const t of board.rows.slice(5)) expect(text).not.toContain(t.label)
  })

  it('names the same new themes This week names, with the same counts', () => {
    for (const t of weeklyFixture().heard!.rows) {
      expect(renderText(weekHeard.render(marketWeekFixture(), 'app', ctx))).toContain(t.label)
    }
    expect(weeklyThemes.figures!(weeklyFixture())[`heard_t_${weeklyFixture().heard!.rows[0].registryId.replace(/[^a-z0-9]+/gi, '_')}_videos`]?.value).toBe(10)
  })
})

describe('WR4 · for sales and WR5 · worth a reply', () => {
  it('are This week’s sections over the same reading, with the preview’s inbox words', () => {
    expect(email(forSales)).toContain('Objections with this update Videos Price concern 2 Price too high 2 Aesthetic and materials 1 Ai skepticism 1')
    expect(email(forSales)).toContain('About brands you track: complaints came up under 4 videos about Patagonia and 1 about The North Face.')
    expect(email(forSales)).not.toContain('Open the sales brief')
    expect(email(weeklyContent)).toContain('12 comments are worth a reply: 6 buying signals, 3 questions and 3 objections.')
    expect(email(weeklyContent)).toContain('Open all 12 on This week →')
    expect(forSales.figures!(weeklyFixture())).toEqual(weekSales.figures!(marketWeekFixture()))
    expect(weeklyContent.figures!(weeklyFixture())).toEqual(weekReply.figures!(marketWeekFixture()))
  })
})

describe('WR6 · what changed, and what is ours', () => {
  it('prints the front page’s refusal, our changes in the month by day, and the first pair read the same way', () => {
    const text = email(weeklyChange)
    expect(text).toContain('What we changed in September')
    expect(text).toContain('13 Sep 4 search terms added: 182 of September’s 654 videos came from them')
    expect(text).toContain('17 Sep')
    expect(text).toContain('The first comparison read the same way: October against November, from the')
    expect(text).not.toMatch(/how sound/i)
  })

  it('groups a day’s changes on one row, oldest day first, each change with its own reach', () => {
    const days = changeDays(weeklyFixture().changes!, '2026-09-01')
    expect(days.map((d) => d.day)).toEqual([...days.map((d) => d.day)].sort())
    const sep17 = days.find((d) => d.day === '2026-09-17')!
    expect(sep17.parts.map((p) => p.words)).toContain('5 search terms added; 9 exclusions added')
    expect(sep17.parts.find((p) => p.words.startsWith('5 search terms'))!.reach).toBe('33 of September’s 654 videos came from them')
  })

  it('prints no dated list where the change log could not be read, and still the refusal', () => {
    const text = email(weeklyChange, weeklyFixture({ changes: null }))
    expect(text).not.toContain('What we changed in September')
    expect(text).toContain('The first comparison read the same way')
  })
})

// ---- every section, every mode, every state: one case each -------------------

const CASES = STATES.flatMap((data, s) => weeklyBlocksFor().flatMap((block) => MODES.map((mode) => ({ name: `${block.key} [${mode}] state ${s}`, block, mode, data }))))

describe.each(CASES)('$name', ({ block, mode, data }) => {
  it('keeps the copy contract and draws a BlockFrame with no meta and no footer note', () => {
    const el = block.render(data, mode, ctx)
    assertCopyContract(render(el))
    expect(isValidElement(el) && el.type === BlockFrame).toBe(true)
    const props = (el as { props: { meta?: unknown; footerNote?: unknown } }).props
    expect(props.meta).toBeUndefined()
    expect(props.footerNote).toBeUndefined()
  })
})

describe('the weekly’s pure helpers', () => {
  it('addedCell: "+N" for a counted subject, "·" for none', async () => {
    const { addedCell } = await import('./subjects')
    expect(addedCell(weeklyFixture(), 's-looks')).toBe('+73')
    expect(addedCell(weeklyFixture(), 's-repair')).toBe('·')
    expect(addedCell(octoberUpdateFixture(), 's-looks')).toBe('·')
  })

  it('changeDays: every September change on the day it was made, none twice', () => {
    const lines = weeklyFixture().changes!
    const days = changeDays(lines, '2026-09-01')
    expect(days.reduce((n, d) => n + d.parts.length, 0)).toBe(lines.length)
    expect(days.map((d) => d.day)).toEqual(['2026-09-09', '2026-09-13', '2026-09-17', '2026-09-20'])
  })

  it('changeDays: a change that touched nothing in the month carries no reach clause', () => {
    const sep9 = changeDays(weeklyFixture().changes!, '2026-09-01').find((d) => d.day === '2026-09-09')!
    expect(sep9.parts.filter((p) => p.reach == null).length).toBeGreaterThan(0)
    expect(sep9.parts.find((p) => p.words.startsWith('7 search terms out'))!.reach).toBe('159 of September’s 654 videos came from them')
  })

  it('changeDays: the words after a day’s first change start in lower case, and no trailing full stop', () => {
    const sep20 = changeDays(weeklyFixture().changes!, '2026-09-01').find((d) => d.day === '2026-09-20')!
    expect(sep20.parts[0].words).toBe('An update gathered less than usual because a spending cap was reached')
    const sep17 = changeDays(weeklyFixture().changes!, '2026-09-01').find((d) => d.day === '2026-09-17')!
    expect(sep17.parts.slice(1).every((p) => p.words.charAt(0) === p.words.charAt(0).toLowerCase())).toBe(true)
  })

  it('nextWords: the first pair read the same way, and none for a paused tenant', async () => {
    const { nextWords } = await import('./change')
    const block = weeklyFixture().overview.change!
    expect(nextWords(block)).toMatch(/^October against November, from the \d+ \w{3} update, if nothing we search changes\.$/)
    expect(nextWords({ ...block, paused: true })).toBeNull()
    expect(nextWords({ ...block, next: null })).toBeNull()
  })

  it('reachClause: none where the month was not measured', async () => {
    const { reachClause } = await import('./change')
    const line = weeklyFixture().changes!.find((l) => l.words === '4 search terms added')!
    expect(reachClause(line, '2026-09-01')).toBe('182 of September’s 654 videos came from them')
    expect(reachClause(line, '2026-10-01')).toBeNull()
  })
})

describe('WR1 in its other states', () => {
  it('says "in September", never "so far", once the month has ended', () => {
    const d = weeklyFixture()
    const ended = { ...d, overview: { ...d.overview, reading: { ...d.overview.reading, state: 'ended' as const } } }
    expect(email(weeklyWeek, ended)).toBe('Your market in September: 654 videos. The 20 Sep update brought in 436 of them, with 9,471 comments.')
  })

  it('says the level is not counted where the month rows could not be read, and still says what came in', () => {
    const text = email(weeklyWeek, weeklyFixture({ market: null }))
    expect(text).toContain('Your market in September so far is not counted here yet.')
    expect(text).toContain('The 20 Sep update brought 436 videos and 9,471 comments into your market’s September.')
  })

  it('prints the level alone where the update’s counts are not there', () => {
    expect(email(weeklyWeek, weeklyFixture({ cameIn: null }))).toBe('Your market in September so far: 654 videos.')
  })

  it('declares the reading month’s market once, and the update’s counts under their own month', () => {
    const f = weeklyWeek.figures!(octoberUpdateFixture())
    expect(f.weekly_market_videos.label).toContain('September')
    expect(f.came_in_market_videos.label).toContain('October')
  })
})

describe('WR1’s table and WR2 to WR6 when their reads are missing', () => {
  it('the came-in table says it is not counted, and why where the update covered no window', () => {
    expect(weeklyCameIn.emptyState(weeklyFixture({ cameIn: null }))).toBe('What this update brought into your market is not counted here yet.')
    expect(weeklyCameIn.emptyState(weeklyFixture({ window: null }))).toContain('covered no window')
  })

  it('the brands row is absent for a tenant that tracks none', () => {
    const d = weeklyFixture()
    const text = email(weeklyCameIn, { ...d, cameIn: { ...d.cameIn!, brands: null, market: d.cameIn!.category } })
    expect(text).not.toContain('Brands you track')
    expect(text).toContain('Your market 421 9,271')
  })

  it('WR3 prints no "New with this update" after an update that re-grouped the themes', () => {
    const d = weeklyFixture()
    const text = email(weeklyThemes, { ...d, heard: { ...d.heard!, rows: [], seen: 0, regrouped: { update: '2026-09-20T08:33:47.358Z', themes: 468 } } })
    expect(text).not.toContain('New with this update')
    expect(text).toContain('What your market talked about')
  })

  it('WR5 says there is nothing to answer where the queue is empty', () => {
    const d = weeklyFixture()
    expect(email(weeklyContent, { ...d, replies: { ...d.replies, rows: [], counts: [], total: 0 } })).toContain('Nothing in the days this update covered reads as a question')
  })

  it('WR4 says there is nothing to take to a customer where no objection was heard', () => {
    const d = weeklyFixture()
    expect(email(forSales, { ...d, sales: { ...d.sales, objections: [], rivalComplaints: [] } })).toContain('Nothing this update read was an objection')
  })
})
