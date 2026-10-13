import { describe, expect, it } from 'vitest'

import { assertCopyContract, copyNodes } from '@/lib/test/copy-contract'
import { markupText, render } from '@/lib/test/render'
import { bansBroken } from '@/components/pages/moves/fixture'

/** The bans, less the panel's notch: a rotated square with a 1px edge on two
 *  sides (the kit's `InPlacePanel`), not a left stripe. */
const bans = (markup: string) => bansBroken(markup.replace(/<span[^>]*data-notch=""[^>]*><\/span>/g, ''))
import { MOVES_WRITE_REFUSED } from '@/lib/moves-access'
import {
  movesFixture, movesMemberFixture, movesOpenFixture, movesQuietFixture, movesRecordFixture, statementsV2, DESK, MOVE_CARDS, PLAN,
} from '@/lib/pages/v2/moves-fixture'
import { ADVICE_GONE, ADVICE_NONE, ADVICE_PANEL_ID, RECORD_PANEL_ID, monthLabelOn } from '@/lib/pages/v2/moves'
import { readingMonthLabel } from '@/lib/reading/month-label'
import { MovesV2Page, MOVES_FIRST_RUN } from './index'
import { panelPlacement } from '@/components/v2'
import { AdviceSection, adviceLayout, OPEN_MORE_WAITING, whyParagraphs } from './advice'
import { SAY_FIRST } from './say'
import { TrackThisSubject } from '@/components/subjects/track-this'
import { MovesSection, lineGeometry } from './moves'
import { WhatYouSay } from './say'
import { PlanCard } from './plan'
import { ConclusionsSection } from './conclusions'

// Your moves, Design v2 (T7): every block over its fixture, against the copy
// contract (lib/test/copy-contract.ts) and the design bans, and the rules the
// v2 page adds: no quote at level 1, the panel in place under its card, and
// the four writes drawn only for a reader who may make them.

const page = (data = movesFixture(), statements = statementsV2()) => render(<MovesV2Page data={data} statements={statements} />)

/** A commenter's words: the quote renderer's node, which is never a client's
 *  own (a statement, a claim, a move's title are `quote` nodes of their own
 *  but are not drawn by `QuoteBlock`). */
const commentQuotes = (markup: string) => (markup.match(/font-serif[^"]*italic|italic[^"]*font-serif/g) ?? []).length

describe('every block keeps the copy contract and the bans', () => {
  const cases: [string, () => string][] = [
    ['the page', () => page()],
    ['the page, advice open', () => page(movesOpenFixture())],
    ['the page, the record open', () => page(movesRecordFixture())],
    ['the page, quiet', () => page(movesQuietFixture(), null as never)],
    ['the page, a member', () => page(movesMemberFixture())],
    ['advice', () => render(<AdviceSection data={movesOpenFixture()} />)],
    ['moves', () => render(<MovesSection data={movesFixture()} />)],
    ['what you say', () => render(<WhatYouSay data={statementsV2()} />)],
    ['the plan', () => render(<PlanCard plan={PLAN} />)],
    ['conclusions and the record', () => render(<ConclusionsSection data={movesRecordFixture()} />)],
  ]
  it.each(cases)('%s', (_name, draw) => {
    const markup = draw()
    assertCopyContract(markup)
    expect(bans(markup)).toEqual([])
  })
})

describe('the page', () => {
  it('draws the board’s sections in order, the counts in the bar', () => {
    const text = markupText(page())
    const order = ['Your moves', 'Advice to decide on', 'Your moves, and what happened after', 'What you say, and what comes back', 'Your plan, checked against the market', 'What we concluded']
    let at = -1
    for (const words of order) {
      const i = text.indexOf(words, at + 1)
      expect(i, words).toBeGreaterThan(at)
      at = i
    }
    expect(text).toContain('3 pieces of advice waiting · 3 moves dated · 1 plan checked')
    expect(text).toContain('Check a plan')
    expect(text).toContain('Date a move')
  })

  it('says so once when there is no update yet', () => {
    expect(markupText(render(<MovesV2Page data={null} statements={null} />))).toContain(MOVES_FIRST_RUN)
  })

  it('draws no section with nothing to show, and says so for the advice', () => {
    const text = markupText(page(movesQuietFixture(), null as never))
    expect(text).toContain(ADVICE_NONE)
    expect(text).not.toContain('Your moves, and what happened after')
    expect(text).not.toContain('Your plan, checked against the market')
    expect(text).not.toContain('What we concluded')
    expect(text).toContain('The advice record: all 64 pieces of advice')
  })

  it('draws the add form alone for a reader who may add the first statement', () => {
    const text = markupText(page(movesFixture(), statementsV2({ statements: [], canEdit: true })))
    expect(text).toContain('What you say, and what comes back')
    expect(text).toContain(SAY_FIRST)
    expect(text).not.toContain('How it lands')
  })

  it('draws no statements card without rows, and the plan takes the row', () => {
    const markup = page(movesFixture(), statementsV2({ statements: [] }))
    expect(markupText(markup)).not.toContain('What you say, and what comes back')
    expect(markup).toContain('min-[1180px]:col-span-2')
  })

  it('says when a link named advice the page does not hold', () => {
    const base = movesFixture()
    expect(markupText(page({ ...base, advice: { ...base.advice, gone: true } }))).toContain(ADVICE_GONE)
  })
})

describe('no quote at level 1', () => {
  it('a closed page prints no commenter’s words', () => {
    expect(commentQuotes(page())).toBe(0)
    expect(copyNodes(render(<AdviceSection data={movesFixture()} />)).filter((n) => n.kind === 'quote')).toEqual([])
  })

  it('the open panel prints the advice’s one comment, inside the panel', () => {
    const markup = page(movesOpenFixture())
    expect(commentQuotes(markup)).toBe(1)
    const panel = markup.slice(markup.indexOf(`id="${ADVICE_PANEL_ID}"`))
    expect(panel).toContain('Whoever helps me get this approved gets my business.')
  })
})

describe('the advice', () => {
  it('a card carries the priority, the type, the title, its lead and the two counts', () => {
    const text = markupText(render(<AdviceSection data={movesFixture()} />))
    expect(text).toContain('High priority')
    expect(text).toContain('Customer experience')
    expect(text).toContain(DESK.title)
    expect(text).toContain('63 videos it rests on, all time')
    expect(text).toContain('9 updates in a row, since 27 Jul')
    expect(text).toContain('4 updates in a row, since 14 Sep')
    expect(text).toContain('Why →')
  })

  it('the open panel sits under its card, notched at it, with the card ringed', () => {
    const markup = render(<AdviceSection data={movesOpenFixture()} />)
    expect(markup).toContain(`id="${ADVICE_PANEL_ID}"`)
    expect(markup).toContain('data-notch')
    expect(markup).toContain('ring-2 ring-foreground')
    expect(markup).toContain('Close ↑')
    const text = markupText(markup)
    for (const words of ['Why', 'What it rests on', 'How long we have been saying it · 9 updates', 'First suggested 27 Jul. Nobody has decided on it yet.', 'Accept and date it as a move', 'Ask the Agent about this']) {
      expect(text, words).toContain(words)
    }
    expect(text).toContain('286 videos, all time')
    expect(text).toContain('about a rival · Voices')
    expect(text).not.toContain('See the')
  })

  it('places the panel after its card’s row wide, and after its card narrow, its notch at the card', () => {
    const at = (i: number, n: number) => panelPlacement(i, adviceLayout(n))
    expect(at(0, 3).order).toMatchObject({ base: 1, md: 1, w1180: 5, xl: 5 })
    expect(at(0, 3).notch).toMatchObject({ base: 0.5, w1180: 0.1667 })
    expect(at(1, 3)).toMatchObject({ order: { base: 3, w1180: 5 }, notch: { base: 0.5, w1180: 0.5 } })
    expect(at(3, 5)).toMatchObject({ order: { base: 7, w1180: 9 }, notch: { w1180: 0.1667 } })
    expect(at(4, 5).order).toMatchObject({ base: 9, w1180: 9 })
  })

  it('sets the argument two sentences to a paragraph', () => {
    expect(whyParagraphs('One. Two. Three.')).toEqual(['One. Two.', 'Three.'])
    expect(whyParagraphs(null)).toEqual([])
  })
})

describe('real data’s edges', () => {
  it('advice with a blank stored title is named by the page, in its own words', () => {
    const base = movesFixture()
    const card = { ...base.advice.cards[0], title: 'A piece of advice with no title', untitled: true }
    const markup = render(<AdviceSection data={{ ...base, advice: { ...base.advice, cards: [card] } }} />)
    expect(markupText(markup)).toContain('A piece of advice with no title')
    expect(copyNodes(markup).some((n) => n.kind === 'stored' && n.text === 'A piece of advice with no title')).toBe(false)
    assertCopyContract(markup)
  })

  it('a conclusion resting on rival findings alone prints no count', () => {
    const base = movesFixture()
    const text = markupText(render(<ConclusionsSection data={{ ...base, conclusions: [{ ...base.conclusions[0], videos: 0 }] }} />))
    expect(text).not.toContain('0 videos')
  })
})

describe('the board’s three cards, and the rest waiting', () => {
  it('a count past the three cards is a link into the record', () => {
    const base = movesFixture()
    const markup = page({ ...base, counts: { ...base.counts, waiting: 5 }, advice: { ...base.advice, more: 2 } })
    const text = markupText(markup)
    expect(text).toContain('5 pieces of advice waiting')
    expect(text).toContain('2 more waiting →')
    expect(markup).toContain('href="/dashboard/moves?advice=all#advice-record"')
    expect(page()).not.toContain('more waiting')
  })

  it('a piece waiting past the three opens under the grid and says so', () => {
    const base = movesOpenFixture()
    const text = markupText(page({ ...base, advice: { ...base.advice, more: 1, open: { ...base.advice.open!, index: null, waiting: true } } }))
    expect(text).toContain(OPEN_MORE_WAITING)
  })

  it('the open quote carries where and when it was written', () => {
    expect(markupText(page(movesOpenFixture()))).toContain('YouTube · 5 Oct')
  })
})

describe('Track this on the legacy subject pane: tracking and the status are an owner’s or an admin’s', () => {
  const move = { id: 'm-1', title: 'Price page', declaredAt: '2026-09-02', status: 'active' as const }
  it('an owner or an admin sees Mark done and Drop it', () => {
    const text = markupText(render(<TrackThisSubject subjectId="s-1" subjectName="Cost" move={move} canDecide />))
    expect(text).toContain('Mark done')
    expect(text).toContain('Drop it')
  })
  it('a member sees the move and no control', () => {
    const text = markupText(render(<TrackThisSubject subjectId="s-1" subjectName="Cost" move={move} canDecide={false} />))
    expect(text).toContain('Price page')
    expect(text).not.toContain('Mark done')
    expect(text).not.toContain('Drop it')
    expect(markupText(render(<TrackThisSubject subjectId="s-1" subjectName="Cost" move={{ ...move, status: 'dropped' }} canDecide={false} />))).not.toContain('Track it again')
  })
  // Decision 6b (13 Oct): "Track this" is an owner's or an admin's too.
  it('an owner or an admin is offered Track this on a subject with no move', () => {
    expect(markupText(render(<TrackThisSubject subjectId="s-1" subjectName="Cost" canDecide />))).toContain('Track this')
    expect(markupText(render(<TrackThisSubject subjectId="s-1" subjectName="Cost" move={{ ...move, status: 'dropped' }} canDecide />))).toContain('Track this')
  })
  it('a member is offered no Track this: nothing on a subject with no move, the dropped move alone otherwise', () => {
    expect(render(<TrackThisSubject subjectId="s-1" subjectName="Cost" canDecide={false} />)).toBe('')
    const dropped = markupText(render(<TrackThisSubject subjectId="s-1" subjectName="Cost" move={{ ...move, status: 'dropped' }} canDecide={false} />))
    expect(dropped).toContain('Price page')
    expect(dropped).not.toContain('Track this')
  })
})

describe('the four writes are drawn for an owner or an admin only', () => {
  it('an owner sees Accept, Not for us, Date a move and the status control', () => {
    const text = markupText(page(movesOpenFixture()))
    expect(text).toContain('Accept')
    expect(text).toContain('Not for us')
    expect(text).toContain('Date a move')
    expect(text).toContain('Mark done')
    expect(text).toContain('Made on')
  })

  it('a member sees none of them, and the one sentence why', () => {
    const base = movesMemberFixture()
    const text = markupText(page({ ...base, advice: { ...base.advice, open: movesOpenFixture().advice.open } }))
    expect(text).not.toMatch(/\bAccept\b/)
    expect(text).not.toContain('Not for us')
    expect(text).not.toContain('Date a move')
    expect(text).not.toContain('Mark done')
    expect(text).not.toContain('Stop it')
    expect(text).toContain(MOVES_WRITE_REFUSED)
  })
})

describe('the moves', () => {
  it('each move: its status, its line from two months before, and its one sentence', () => {
    const markup = render(<MovesSection data={movesFixture()} />)
    const text = markupText(markup)
    expect(text).toContain('Running & Mobility Clinic campaign')
    expect(text).toContain('Dated 14 Sep · on Community & encouragement')
    expect(text).toContain('Active')
    // Jul and Aug before a mid-September move, then September.
    expect(text).toMatch(/Jul.*Aug.*Sep/)
    // Decision 3: on 13 October the latest month read is September, the last
    // full month, and the sentence says so.
    expect(text).toContain('Share of market videos went from 11% (75 of 680) in August, the month before, to 14% (98 of 700) in September, the last full month and the month of the move.')
    expect(text).toContain('your move')
    // The price page: July against September, outside its band.
    expect(text).toContain('in July, the month before, to 21% (150 of 700) in September, the last full month.')
    expect(markup).toMatch(/data-copy="verdict"[^>]*>[\s\S]*?▲/)
  })

  it('a subject being re-described draws no line and says why', () => {
    expect(markupText(render(<MovesSection data={movesFixture()} />))).toContain('This subject is being re-described, so its months are not read yet.')
  })

  it('draws the move’s day inside its month', () => {
    const pts = [
      { month: '2026-07-01', role: 'before' as const, k: 1, n: 10, soFar: false },
      { month: '2026-08-01', role: 'before' as const, k: 1, n: 10, soFar: false },
      { month: '2026-09-01', role: 'move' as const, k: 2, n: 10, soFar: false },
    ]
    const g = lineGeometry(pts, '2026-09-14')
    expect(g.xs).toHaveLength(3)
    expect(g.moveX).not.toBeNull()
    expect(g.moveX!).toBeLessThan(g.xs[2])
    expect(g.moveX!).toBeGreaterThan(g.xs[1])
    expect(g.ys[2]).toBeLessThan(g.ys[0])
  })
})

// Decision 3 (13 Oct): the moves read the reading month, which on days 1 to
// 15 is the month that has just ended; the bar and the latest month say so.
describe('the reading month, labelled where it is not the current one', () => {
  /** The bar's meta line: its counts and, where it is labelled, the month. */
  const head = (data: ReturnType<typeof movesFixture>) => {
    const t = markupText(page(data))
    const at = t.indexOf('pieces of advice waiting') - 2
    return t.slice(at, t.indexOf('Advice to decide on') >= 0 ? t.indexOf('Advice to decide on') : at + 120)
  }

  it('the bar names September, the last full month, beside its counts', () => {
    expect(head(movesFixture())).toContain('3 pieces of advice waiting · 3 moves dated · 1 plan checked · September · the last full month')
  })

  it('the current month prints nothing extra, on the bar or in a sentence', () => {
    const current = movesFixture({ month: '2026-09-01', readingAt: '2026-09-20T08:00:00.000Z', monthLabel: readingMonthLabel('2026-09-01', '2026-09-20T08:00:00.000Z') })
    expect(current.monthLabel).toBeNull()
    const text = markupText(page(current))
    expect(head(current)).toContain('3 pieces of advice waiting · 3 moves dated · 1 plan checked')
    expect(text).not.toMatch(/last full month|earlier month/)
    expect(text).toContain('to 14% (98 of 700) in September, the month of the move.')
  })

  it('a page with no move line names no month on its bar', () => {
    expect(head(movesFixture({ moves: { cards: [], recorded: true } }))).not.toContain('September')
  })

  it('the latest level alone carries the label too, where the pair is refused', () => {
    const price = MOVE_CARDS.find((c) => c.id === 'm-price')!
    const refused = { ...price, compare: price.compare ? { ...price.compare, verdict: { ...price.compare.verdict, state: 'refused' as const } } : null }
    const text = markupText(render(<MovesSection data={movesFixture({ moves: { cards: [refused], recorded: true } })} />))
    expect(text).toContain('in September, the last full month.')
  })

  it('an earlier month on the line is never called the last full one', () => {
    expect(monthLabelOn('2026-08-01', { month: '2026-09-01', label: 'the last full month' })).toBeNull()
    expect(monthLabelOn('2026-09-01', { month: '2026-09-01', label: 'the last full month' })).toBe('the last full month')
    expect(monthLabelOn('2026-09-01', { month: '2026-09-01', label: null })).toBeNull()
  })

  it('keeps the copy contract with the label', () => {
    assertCopyContract(page())
  })
})

describe('what you say, the plan and the conclusions', () => {
  it('statements: the videos, how it lands as a bar, the largest stance as a level', () => {
    const text = markupText(render(<WhatYouSay data={statementsV2()} />))
    expect(text).toContain('“Bionic technology for everyday life”')
    expect(text).toContain('11 of 20 back it up')
    expect(text).toContain('9 of 14 ask about it')
    expect(text).toContain('Nobody raises it')
    expect(text).toContain('not read yet')
    expect(text).toContain('in September')
  })

  it('the plan: supported of all, the three counts, what changed, the lead claims', () => {
    const text = markupText(render(<PlanCard plan={PLAN} />))
    expect(text).toContain('6 of 9 claims supported')
    expect(text).toContain('supported 6')
    expect(text).toContain('contradicted 2')
    expect(text).toContain('untested 1')
    expect(text).toContain('Changed since you uploaded it')
    expect(text).toMatch(/“Our audience is mainly athletes” is now contradicted ?, from untested/)
    expect(text).toContain('at least 44 videos')
    expect(text).toContain('Claim by claim →')
  })

  it('conclusions: the videos behind each, all time, and the advice built on it or none yet', () => {
    const text = markupText(render(<ConclusionsSection data={movesFixture()} />))
    expect(text).toContain('Access, not the device, decides who gets fitted')
    expect(text).toContain('286 videos, all time')
    expect(text).toContain('No advice yet')
    expect(text).toContain('The advice record: all 23 pieces of advice and what you decided →')
  })

  it('the advice record opens in place as a list of every piece and what was decided', () => {
    const markup = render(<ConclusionsSection data={movesRecordFixture()} />)
    expect(markup).toContain(`id="${RECORD_PANEL_ID}"`)
    const text = markupText(markup)
    expect(text).toContain('Run a summer athlete campaign around the Paralympics')
    expect(text).toContain('Dismissed since 2 Aug')
    expect(text).toContain('raised by the latest update')
    expect(text).toContain('you have decided on 4 of 23')
  })
})
