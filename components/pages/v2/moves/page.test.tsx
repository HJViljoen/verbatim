import { describe, expect, it } from 'vitest'

import { assertCopyContract, copyNodes } from '@/lib/test/copy-contract'
import { markupText, render } from '@/lib/test/render'
import { bansBroken } from '@/components/pages/moves/fixture'

/** The bans, less the panel's notch: a rotated square with a 1px edge on two
 *  sides (the kit's `InPlacePanel`), not a left stripe. */
const bans = (markup: string) => bansBroken(markup.replace(/<span[^>]*data-notch=""[^>]*><\/span>/g, ''))
import { MOVES_WRITE_REFUSED } from '@/lib/moves-access'
import { PLAN_EMPTY } from '@/lib/ask/plan-cards'
import { FAILED_EXPLAINED } from '@/lib/subjects/calibration-state'
import {
  movesFixture, movesMemberFixture, movesOpenFixture, movesQuietFixture, movesRecordFixture, movesThinFixture, movesThinOpenFixture, statementsV2, DESK, MOVE_CARDS, PLAN,
} from '@/lib/pages/v2/moves-fixture'
import {
  ADVICE_GONE, ADVICE_NONE, ADVICE_PANEL_ID, ADVICE_REST, MOVES_UNREAD_TITLE, NEXT_MOVE, NO_CONCLUSIONS, NO_MOVE_YET, NO_QUOTE, RECORD_PANEL_ID, WOULD_MOVE_NOTHING, monthLabelOn,
} from '@/lib/pages/v2/moves'
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
    ['the page, thin (a tenant)', () => page(movesThinFixture(), null as never)],
    ['the page, thin, advice open with no comment', () => page(movesThinOpenFixture(), null as never)],
    ['the page, thin, a member', () => page({ ...movesThinFixture(), canDecide: false }, null as never)],
    ['the plan, none checked', () => render(<PlanCard plan={null} />)],
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

  // The parity pass (13 Oct): the board's layout is fixed. With nothing to
  // show, every section keeps its card and says so inside it.
  it('keeps every section’s card with nothing to show, each saying so inside it', () => {
    const markup = page(movesQuietFixture(), null as never)
    const text = markupText(markup)
    const order = ['Advice to decide on', ADVICE_NONE, 'Your moves, and what happened after', NO_MOVE_YET.title, 'Your plan, checked against the market', PLAN_EMPTY, 'What we concluded', NO_CONCLUSIONS]
    let at = -1
    for (const words of order) {
      const i = text.indexOf(words, at + 1)
      expect(i, words).toBeGreaterThan(at)
      at = i
    }
    expect(text).toContain('The advice record: all 64 pieces of advice')
    // The record's card and the move's card take the whole row.
    expect(markup).toContain('min-[1180px]:col-span-3')
    expect(markup).toMatch(/data-move-slot=""[^>]*min-\[1180px\]:col-span-2/)
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

  // Ruling U6: the fixture's Fit & comfort is provisional, so its move says
  // "not measured yet"; "being re-described" is a failed subject's alone.
  it('a subject whose check is open draws no line and says it is not measured yet', () => {
    const text = markupText(render(<MovesSection data={movesFixture()} />))
    expect(text).toContain('This subject is not measured yet: its line is drawn once its check has passed.')
    expect(text).not.toContain('being re-described')
  })

  // 14 Oct: a tracked subject is never hidden. A move on a subject being
  // re-described keeps its card and says the one reason every surface
  // prints for it, with no line and no figure.
  it('a subject being re-described keeps its move card, with FAILED_EXPLAINED and no line', () => {
    const base = movesFixture()
    const card = { ...base.moves.cards[0], points: [], compare: null, unread: 'not_ready' as const, pending: null }
    const data = { ...base, moves: { ...base.moves, cards: [card] } }
    const markup = render(<MovesSection data={data} />)
    expect(markupText(markup)).toContain(FAILED_EXPLAINED)
    // The chart keeps its axis (the parity pass) with no month drawn on it.
    const drawn = markup.slice(markup.indexOf('<article id="move-'), markup.indexOf('</article>'))
    expect(drawn).toContain('no month drawn yet')
    expect(drawn).not.toMatch(/<circle|data-copy="(figure|level|verdict)"/)
    assertCopyContract(<MovesSection data={data} />)
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

// THE PARITY PASS (13 Oct): the board's shape in the thin real states. Össur
// and Sealand today: one update has raised each piece, one move dated after
// the reading month with one month read, no plan checked (Sealand), the
// statements held from the tenant.
describe('the board’s shape on thin data', () => {
  it('the three advice cards each carry "Would move", the month’s level beside its month', () => {
    const text = markupText(page(movesThinFixture(), null as never))
    expect(text).toContain('Would move: Cost and affordability frustration · 19 of 521 videos in September, the last full month')
    expect(text).toContain(`Would move: ${WOULD_MOVE_NOTHING}`)
  })

  it('a card from a dump before "Would move" draws no line for it', () => {
    expect(markupText(render(<AdviceSection data={movesFixture()} />))).not.toContain('Would move')
  })

  it('a move with one month read keeps the board’s chart: its axis, the move, the month it has, and why the rest are empty', () => {
    const markup = render(<MovesSection data={movesThinFixture()} />)
    const text = markupText(markup)
    expect(markup).toContain('your move')
    expect(text).toMatch(/Aug.*4%.*Sep.*Oct/)
    expect(text).toContain('August is left off the line: what we track changed inside this window. October reads once the month has been read.')
    // The empty slots' names are muted at full strength, never faded.
    expect(markup).not.toMatch(/fill-muted-foreground[^"]*opacity-50/)
    expect(text).toContain('Share of market videos: 4% (19 of 521) in September, before the move.')
  })

  it('a move with no line at all still draws its axis', () => {
    const socket = MOVE_CARDS.find((c) => c.unread === 'not_measured')!
    const markup = render(<MovesSection data={movesFixture({ moves: { cards: [socket], recorded: true } })} />)
    expect(markup).toContain('<svg')
    expect(markupText(markup)).toMatch(/Jun.*Jul.*Aug.*Sep/)
  })

  it('one move takes the next move’s card beside it, two across as the board; two moves take none', () => {
    const one = markupText(render(<MovesSection data={movesThinFixture()} />))
    expect(one).toContain(NEXT_MOVE.title)
    expect(one).toContain(NEXT_MOVE.line)
    expect(one).toContain('Date a move')
    const two = movesFixture({ moves: { cards: MOVE_CARDS.slice(0, 2), recorded: true } })
    expect(markupText(render(<MovesSection data={two} />))).not.toContain(NEXT_MOVE.title)
    // A member is offered no Date a move there either.
    expect(markupText(render(<MovesSection data={{ ...movesThinFixture(), canDecide: false }} />))).not.toContain('Date a move')
  })

  it('no plan checked keeps the plan card beside the statements, empty and calm', () => {
    const markup = page(movesThinFixture(), statementsV2())
    const text = markupText(markup)
    expect(text).toContain('What you say, and what comes back')
    expect(text).toContain('Your plan, checked against the market')
    // One line for the one gap, the Agent's own words, and no second line.
    expect(text).toContain(PLAN_EMPTY)
    expect(text).toContain('Check a plan →')
    expect(text).not.toContain('claims supported')
    expect(text).not.toContain('no claims read yet')
    // Beside the statements, the plan is half the row; for a tenant (no
    // statements, AGENTS.md), the whole row.
    expect(markup).not.toMatch(/data-plan-empty=""[^>]*col-span-2/)
    expect(page(movesThinFixture(), null as never)).toMatch(/data-plan-empty=""[^>]*col-span-2/)
  })

  it('fewer than three pieces waiting: the advice record’s card fills the row', () => {
    const base = movesThinFixture()
    const data = { ...base, advice: { ...base.advice, cards: base.advice.cards.slice(0, 1), more: 0 } }
    const markup = render(<AdviceSection data={data} />)
    const text = markupText(markup)
    expect(text).toContain(ADVICE_REST.title)
    expect(text).toContain('65 pieces of advice so far')
    expect(text).toContain('2 of 65 decided on')
    expect(markup).toContain('min-[1180px]:col-span-2')
    assertCopyContract(markup)
    // The panel opened from the one card sits after the row the record's card
    // shares with it, its notch at the card.
    expect(panelPlacement(0, adviceLayout(1))).toMatchObject({ order: { base: 1, w1180: 3 }, notch: { w1180: 0.1667 } })
  })

  it('the open panel keeps "In their words" with no comment, and the history keeps the board’s nine dots', () => {
    const markup = page(movesThinOpenFixture(), null as never)
    const panel = markup.slice(markup.indexOf(`id="${ADVICE_PANEL_ID}"`))
    expect(markupText(panel)).toContain('In their words')
    expect(markupText(panel)).toContain(NO_QUOTE)
    const history = panel.slice(panel.indexOf('aria-label="The updates that raised it"'), panel.indexOf('</ol>'))
    expect(history.match(/rounded-full/g)).toHaveLength(9)
    expect(markupText(history).match(/\d+ \w{3}/g)).toEqual(['12 Oct'])
  })

  it('a conclusion’s advice stays at the row’s end, however many pieces', () => {
    const markup = render(<ConclusionsSection data={movesThinFixture()} />)
    expect(markup.match(/sm:grid-cols-\[minmax\(0,1fr\)_auto_minmax\(0,auto\)\]/g)).toHaveLength(4)
  })
})

// THE FRESH CHECK (13 Oct): a failed read is said as one, never as an
// absence; the history row never runs its dates together; the next move's
// card shares its neighbour's axis and invites dating only where it may.
describe('a failed read says so, once, in its own place', () => {
  const failed = (f: NonNullable<ReturnType<typeof movesThinFixture>['failed']>) => {
    const base = movesThinFixture()
    // A failed aims read leaves the field absent.
    const cards = f.aims ? base.advice.cards.map(({ aim: _aim, ...c }) => c) : base.advice.cards
    return { ...base, advice: { ...base.advice, cards }, failed: f }
  }

  it('the advice cards: "Would move: could not be read just now", never "no conversation"', () => {
    const text = markupText(page(failed({ aims: true }), null as never))
    expect(text.match(/Would move: could not be read just now/g)).toHaveLength(3)
    expect(text).not.toContain(WOULD_MOVE_NOTHING)
  })

  it('the conclusions: one line, never "drew no conclusions"', () => {
    const data = { ...failed({ conclusions: true }), conclusions: [] }
    const text = markupText(render(<ConclusionsSection data={data} />))
    expect(text).toContain('The conclusions could not be read just now.')
    expect(text).not.toContain(NO_CONCLUSIONS)
  })

  it('the plan: one line beside the bar’s count, never "none checked"', () => {
    const data = { ...failed({ plan: true }), counts: { waiting: 4, dated: 1, plans: 2 } }
    const text = markupText(page(data, null as never))
    expect(text).toContain('2 plans checked')
    expect(text).toContain('Your plan could not be read just now.')
    expect(text).not.toContain(PLAN_EMPTY)
    expect(text).not.toContain('Check a plan →')
  })

  it('the moves: one card saying so, never "no move dated yet"', () => {
    const data = { ...failed({ moves: true }), moves: { cards: [], recorded: true } }
    const text = markupText(render(<MovesSection data={data} />))
    expect(text).toContain(MOVES_UNREAD_TITLE)
    expect(text).toContain('Your moves could not be read just now.')
    expect(text).not.toContain(NO_MOVE_YET.title)
    expect(text).not.toContain(NEXT_MOVE.line)
  })

  it('every failed state keeps the copy contract', () => {
    for (const f of [{ aims: true }, { plan: true }, { conclusions: true }, { moves: true }] as const) {
      assertCopyContract(page(failed(f), null as never))
    }
  })
})

describe('the history row on a phone and in the narrow column', () => {
  /** The open panel's history over `n` updates in a row, of the latest nine. */
  const history = (n: number) => {
    const days = ['2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12']
    const dates = days.slice(-n)
    const recent = Array.from({ length: 9 }, (_, i) => i >= 9 - n)
    const base = movesThinOpenFixture()
    const card = { ...base.advice.open!.card, history: { dates, streak: n, since: dates[0], recent } }
    const markup = page({ ...base, advice: { ...base.advice, open: { ...base.advice.open!, card } } }, null as never)
    const panel = markup.slice(markup.indexOf(`id="${ADVICE_PANEL_ID}"`))
    return panel.slice(panel.indexOf('aria-label="The updates that raised it"'), panel.indexOf('</ol>'))
  }
  const labels = (row: string) => [...row.matchAll(/<span class="([^"]*)">(\d+ \w{3})<\/span>/g)].map((m) => ({ date: m[2], spaced: m[1].includes('max-sm:hidden min-[1180px]:max-[1319.98px]:hidden') }))

  it.each([2, 4, 8])('%s dates: the nine dots, the newest dated always, every other one where the column is narrow', (n) => {
    const row = history(n)
    expect(row.match(/size-2\.5 rounded-full/g)).toHaveLength(9)
    const ls = labels(row)
    expect(ls).toHaveLength(n)
    expect(ls.at(-1)).toMatchObject({ date: '12 Oct', spaced: false })
    // Never two neighbours both printed where the column is narrow: at most
    // five of the nine, every other one counted back from the newest.
    const always = ls.filter((l) => !l.spaced)
    expect(always.length).toBeLessThanOrEqual(5)
    expect(always).toHaveLength(Math.ceil(n / 2))
  })

  it('a date older than the latest nine updates draws every date as a list, five to a phone’s row', () => {
    const base = movesThinOpenFixture()
    const dates = ['2026-06-01', '2026-10-05', '2026-10-12']
    const card = { ...base.advice.open!.card, history: { dates, streak: 2, since: '2026-10-05', recent: [false, false, false, false, false, false, false, true, true] } }
    const markup = page({ ...base, advice: { ...base.advice, open: { ...base.advice.open!, card } } }, null as never)
    const panel = markup.slice(markup.indexOf(`id="${ADVICE_PANEL_ID}"`))
    const row = panel.slice(panel.indexOf('aria-label="The updates that raised it"'), panel.indexOf('</ol>'))
    expect(markupText(row).match(/\d+ \w{3}/g)).toEqual(['1 Jun', '5 Oct', '12 Oct'])
    expect(panel).toContain('--cn:3')
  })
})

describe('the next move’s card', () => {
  it('shares its neighbour’s axis: the same months', () => {
    const text = markupText(render(<MovesSection data={movesThinFixture()} />))
    // Aug, Sep, Oct on the move's chart, and again on the empty card's.
    expect(text.match(/Aug/g)?.length).toBeGreaterThanOrEqual(2)
    expect(text.match(/Oct/g)?.length).toBeGreaterThanOrEqual(2)
    expect(text).not.toMatch(/\bJul\b/)
  })

  it('invites dating only where the reader may date one, and moves are recorded', () => {
    const owner = markupText(render(<MovesSection data={movesThinFixture()} />))
    expect(owner).toContain(NEXT_MOVE.line)
    for (const data of [{ ...movesThinFixture(), canDecide: false }, { ...movesThinFixture(), moves: { cards: movesThinFixture().moves.cards, recorded: false } }]) {
      const text = markupText(render(<MovesSection data={data} />))
      expect(text).toContain(NEXT_MOVE.title)
      expect(text).not.toContain(NEXT_MOVE.line)
      expect(text).not.toContain('Date a move')
    }
  })
})
