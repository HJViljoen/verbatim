import { describe, expect, it } from 'vitest'

import { assertCopyContract, copyNodes } from '@/lib/test/copy-contract'
import { markupText, render, renderText } from '@/lib/test/render'
import { bansBroken } from '@/components/pages/moves/fixture'
import {
  adviceFailedFixture, adviceFixture, adviceThinFixture, adviceWithMoveFixture, moveFixture, moveHeldFixture, moveThinFixture, recordFixture, recordQuietFixture,
} from '@/lib/pages/v2/moves-levels-fixture'
import { ADVICE_MISSING, BACK_TO_MOVES, NO_THIRD_CONVERSATION, NO_OTHER_COMMENT, SAID_HELD, SAME_IDEA_NOTE } from '@/lib/pages/v2/moves-levels'
import { RECORD_SAME_IDEA_HEAD } from './record-page'
import { MovesAdvicePage, MovesMissing, MovesMovePage, MovesRecordPage } from './levels'

// YOUR MOVES' LEVEL PAGES, AS THEY PRINT (levels as pages, 17 Oct; the G6
// boards): a piece of advice (the hub), a dated move (the evidence) and the
// advice record (the index), each over its fixture, against the copy
// contract and the bans, and the rules the boards add: each level names
// itself (its tile and label), the decision controls are an owner's or an
// admin's, a conversation or a subject opens on Market, and no week chip
// (decision 7).

/** The bans, less three things that are not what they ban: the strip's
 *  hairline between its figures (Market's own `Fig`, a divider between
 *  cells, not a stripe); the "Watch the video ↗" arrow (Market's card, the
 *  board's); and the model's and the commenters' own words, which are not
 *  our process talk (Össur's real argument says "coverage and financing"). */
const bans = (markup: string) => bansBroken(markup
  .replace(/<div data-fig=""[^>]*>/g, '<div data-fig="">')
  .replace(/↗/g, '')
  .replace(/<(p|h2|span|blockquote)\b[^>]*data-copy="(?:stored|quote|subject)"[^>]*>[^<]*<\/\1>/g, ''))

const advicePage = (page = adviceFixture(), open = false) => render(<MovesAdvicePage page={page} switcherOpen={open} />)
const movePage = (page = moveFixture(), open = false) => render(<MovesMovePage page={page} switcherOpen={open} />)
const recordPage = (page = recordFixture()) => render(<MovesRecordPage page={page} />)

describe('every level page keeps the copy contract and the bans', () => {
  const cases: [string, () => string][] = [
    ['advice', () => advicePage()],
    ['advice, its switcher open', () => advicePage(adviceFixture(), true)],
    ['advice, thin (a member)', () => advicePage(adviceThinFixture())],
    ['advice, thin, its switcher open from the record', () => advicePage(adviceThinFixture(), true)],
    ['advice, a move made on it', () => advicePage(adviceWithMoveFixture())],
    ['advice, every read failed', () => advicePage(adviceFailedFixture())],
    ['a move', () => movePage()],
    ['a move, its switcher open', () => movePage(moveFixture(), true)],
    ['a move, its subject not measured yet', () => movePage(moveHeldFixture())],
    ['a move, thin (a member)', () => movePage(moveThinFixture())],
    ['the record', () => recordPage()],
    ['the record, every piece', () => recordPage(recordFixture(true))],
    ['the record, quiet', () => recordPage(recordQuietFixture())],
    ['an address that names nothing', () => render(<MovesMissing line={ADVICE_MISSING} />)],
  ]
  it.each(cases)('%s', (_name, draw) => {
    const markup = draw()
    assertCopyContract(markup)
    expect(bans(markup)).toEqual([])
    // No en dash in client copy, and no week chip on Your moves (decision 7).
    expect(markupText(markup)).not.toMatch(/–/)
    expect(markupText(markup)).not.toContain('Unusual this week')
  })
})

describe('a piece of advice, the hub (G6-Moves-Advice)', () => {
  const html = advicePage()
  const text = markupText(html)

  it('the path, then the title block naming the level: the signpost on yellow, "Advice", the title, the meta, the two decisions at its right', () => {
    expect(renderText(<MovesAdvicePage page={adviceFixture()} />)).toMatch(/^Your moves \/ Set up a reimbursement help desk for powered knees Your moves Advice Set up a reimbursement help desk for powered knees Customer experience · first suggested 27 Jul · 63 videos it rests on, all time Accept and date it as a move Not for us/)
    expect(html).toContain('data-level-bar="advice"')
    expect(html).toMatch(/data-level-tile="advice" class="[^"]*bg-accent text-orange-text/)
    expect(html).toContain('data-advice-decision=""')
    expect(html).toContain('href="/dashboard/moves"')
  })

  it('the header card leads with the argument\'s first sentence, and the four figures sit inside it', () => {
    expect(html).toMatch(/<h2 id="hub-head" data-copy="stored" data-slot="pass_d_b_recommendation"[^>]*>People refused cover for a powered knee say they would choose the brand that helps them through the paperwork\.<\/h2>/)
    for (const words of ['63 videos it rests on all time, in 5 conversations', '9 updates in a row have raised it since 27 Jul', 'Would move Insurance refusals for powered knees 19 of 839 market videos in September September, the last full month', 'Not decided yet first suggested 27 Jul no move dated on it']) {
      expect(text, words).toContain(words)
    }
    expect(html.match(/data-fig=""/g)).toHaveLength(4)
  })

  it('"Why" holds the rest of the argument; "What it rests on" its conclusions and the rival\'s finding, which opens in Voices', () => {
    expect(text).toContain('Why Insurance refusals have come up in the conversation every month since July.')
    expect(text).not.toMatch(/Why People refused/)
    expect(text).toContain('Two conclusions about your market and one finding about a rival. The finding opens in Voices.')
  })

  it('the conversations behind it: the three biggest as cards, the rest as a list, each opening on Market\'s month view', () => {
    expect(html.match(/data-advice-conv=""/g)).toHaveLength(3)
    expect(text).toContain('Its 63 videos sit in 5 conversations · the three biggest, then the rest · each opens in Market')
    expect(text).toContain('29 of its 63 videos 19 of 839 market videos in September The one it would move Open in Market →')
    expect(text).toContain('2 more conversations Fewest of its videos.')
    expect(text).toContain('A video can sit in more than one conversation, so these add up to more than its 63 videos.')
    expect(html).toContain('href="/dashboard/market/conversations/d1000000-0000-4000-8000-000000000001?period=month&amp;month=2026-09"')
  })

  it('the numbers: the line a move on it is read on, then who raises it, who it is about, what people did and where, each of its videos', () => {
    expect(text).toContain('Insurance refusals for powered knees · share of market videos')
    expect(text).toContain('July 9 of 455')
    expect(text).toContain('September is the last full month. A move dated on this advice is read on this line, from two months before it.')
    for (const words of ['Who raises it · of its 63 videos Long-time users upgrading 31 of 63', 'Who it’s about · of its 63 videos', 'What people did · of its 63 videos Complained about something 41', 'Where · of its 63 videos TikTok 34']) {
      expect(text, words).toContain(words)
    }
  })

  it('three comments, each labelled with its conversation, which opens on Market', () => {
    expect(text).toContain('In their words · 3 comments, each from its conversation')
    expect(html.match(/data-advice-quote=""/g)).toHaveLength(3)
    expect(copyNodes(html).filter((n) => n.kind === 'quote').length).toBeGreaterThanOrEqual(3)
  })

  it('its history: every update that raised it, and the moves made on it, with the invitation for an owner', () => {
    expect(text).toContain('How long we have been saying it · 9 updates')
    expect(text).toContain('First suggested 27 Jul. Nobody has decided on it yet.')
    expect(text).toContain('None yet. Accept it and date the change you make, and the move gets its own page, read month by month on Insurance refusals for powered knees.')
    expect(html).toContain('href="/dashboard/moves/advice"')
    const withMove = advicePage(adviceWithMoveFixture())
    expect(withMove).toContain('data-move-on-it=""')
    expect(withMove).toContain(`href="/dashboard/moves/${'m-clinic'}"`)
  })
})

describe('the advice switcher (G6-Moves-Advice-Switcher, decision 2)', () => {
  it('the advice waiting, strongest first, each with its priority in words; under a hairline, the record', () => {
    const t = markupText(advicePage(adviceFixture(), true))
    expect(t).toContain('Advice waiting for a decision Set up a reimbursement help desk for powered knees High priority Lead liner messaging with how long they last Medium priority Look at a liner built for heat and sweat Medium priority The advice record, all 23 every piece, and what you decided')
  })

  it('a piece opened from the record shows above a hairline, ticked', () => {
    const html = advicePage(adviceThinFixture(), true)
    const menu = html.slice(html.indexOf('>', html.indexOf('role="menu"')) + 1)
    expect(markupText(menu)).toMatch(/^Advice waiting for a decision Create an Össur Access Navigator/)
    expect(menu.match(/role="separator"/g)).toHaveLength(2)
    expect(menu).toMatch(/aria-checked="true"[^>]*>[\s\S]*?Create an Össur Access Navigator/)
  })
})

describe('the thin real state, as a member sees it (G6-Moves-Advice-Thin)', () => {
  const html = advicePage(adviceThinFixture())
  const text = markupText(html)
  it('no decision controls and no invitation; every component keeps its frame and says its gap in one line', () => {
    expect(html).not.toContain('data-advice-decision')
    expect(text).not.toContain('Accept and date it as a move')
    expect(text).toContain('1 update has raised it first raised 12 Oct')
    expect(text).toContain(NO_THIRD_CONVERSATION)
    expect(text).toContain('July no reading August no reading')
    expect(text).toContain('July and August have no reading. September is the last full month. A move dated on this advice is read on this line.')
    expect(text).toContain(`In their words · 1 comment Price and location questions “How can i get a leg like urs?” TikTok · 2 Oct ${NO_OTHER_COMMENT}`)
    expect(text).toContain('Moves made on it None yet.')
    expect(text).not.toContain('Accept it and date')
    expect(text).toContain('The advice record, all 65 →')
  })

  it('every read that failed says so in its own place', () => {
    const t = markupText(advicePage(adviceFailedFixture()))
    for (const words of ['The conversations behind it could not be read just now.', 'Its line could not be read just now.', 'Its numbers could not be read just now.', 'Its comments could not be read just now.', 'Its moves could not be read just now.']) expect(t, words).toContain(words)
  })
})

describe('a dated move, the evidence (G6-Moves-Move)', () => {
  const html = movePage()
  const text = markupText(html)

  it('the title block: the flag on the neutral, "Move on {it}" linking to Market (decision 4), its meta, its status and controls at the right', () => {
    expect(renderText(<MovesMovePage page={moveFixture()} />)).toMatch(/^Your moves \/ Running & Mobility Clinic campaign Your moves Move on Community & encouragement Running & Mobility Clinic campaign Dated 14 Sep · read July to September, the last full month · 112 videos on Community & encouragement since 14 Sep Active Mark done Stop it/)
    expect(html).toMatch(/data-level-tile="move" class="[^"]*bg-track/)
    expect(html).toMatch(/Move on <a [^>]*href="\/dashboard\/market\/subjects\/b1000000-0000-4000-8000-000000000001\?period=month&amp;month=2026-09"/)
  })

  it('a flat header: the one comparison and its verdict beside its line, then the no-cause line; no card and no figure tiles', () => {
    expect(text).toContain('Share of market videos on Community & encouragement went from 11% in August, the month before, to 14% in September, the last full month and the month of the move. No clear change +3 pts · band ±3.6 pts We show what the conversation did after a move. We never claim the move caused it.')
    expect(text).toContain('Month by month · share of market videos')
    expect(text).toContain('July 61 of 610')
    expect(html).not.toContain('data-fig=""')
  })

  it('what people said after it: five videos, most comments first, each opening its own list; "Show more videos" lists every one', () => {
    expect(text).toContain('What people said after it 112 videos since 14 Sep, most comments about it first')
    expect(html.match(/data-video-card=""/g)).toHaveLength(5)
    expect(html).toContain('href="/dashboard/moves/m-clinic?video=e1000000-0000-4000-8000-000000000001#video-e1000000-0000-4000-8000-000000000001"')
    expect(html).toContain('href="/dashboard/moves/m-clinic?videos=all#what-people-said"')
    expect(text).toContain('Spanish · machine translation My son ran for the first time with his prosthesis. Thank you.')
  })

  it('the facts beside it, each of its videos since the day; its other moves, and the next move for an owner', () => {
    expect(text).toContain('What it is on Community & encouragement A subject you track · 98 of 700 market videos in September, the last full month Open it in Market →')
    expect(text).toContain('Who it’s about · of 112 since 14 Sep')
    expect(text).toContain('Who’s saying it · of 112 Active and athletic 44 of 112')
    expect(text).toContain('Your other moves All your moves → Price transparency page')
    expect(html).toContain('data-next-move=""')
  })

  it('a member sees the status and no control, and no invitation', () => {
    const member = markupText(movePage(moveFixture({ canDecide: false, invite: false })))
    expect(member).toContain('Active')
    expect(member).not.toContain('Mark done')
    expect(member).not.toContain('Stop it')
    expect(member).not.toContain('Your next move')
  })

  it('the thin real move (a member): its month before it alone, said once; no count of nothing; the siblings keep a frame', () => {
    const html = movePage(moveThinFixture())
    const t = markupText(html)
    expect(t).toMatch(/Share of market videos on Cost and affordability frustration ?: 4% in September, before the move\./)
    expect(t.match(/October reads once the month has been read/g)).toHaveLength(1)
    expect(t).not.toMatch(/\b0 videos\b/)
    expect(html).toContain('data-no-other-move=""')
    // Its only dated move: the crumb is plain text, no chevron opening on itself.
    expect(html).not.toContain('data-crumb-chevron')
    expect(t).not.toContain('Mark done')
  })

  it('U6: a move on a subject whose check is open prints no line, no figure and nothing it said, and says why once', () => {
    const t = markupText(movePage(moveHeldFixture()))
    expect(t).toContain('This subject is not measured yet: its line is drawn once its check has passed.')
    expect(t.split(SAID_HELD)).toHaveLength(2)
    expect(t).toContain('A subject you track · not measured yet')
    expect(movePage(moveHeldFixture())).not.toContain('data-video-card')
  })
})

describe('the advice record, an index (G6-Moves-Record)', () => {
  const html = recordPage()
  const text = markupText(html)
  it('"Your moves / The advice record" with no chevron; the check-list on the neutral; its meta', () => {
    expect(renderText(<MovesRecordPage page={recordFixture()} />)).toMatch(/^Your moves \/ The advice record Your moves Every piece of advice, and what you decided The advice record 23 pieces of advice since 20 Jul · you have decided on 4 · 3 waiting for a decision/)
    expect(html).not.toContain('data-crumb-chevron')
    expect(html).toMatch(/data-level-tile="record" class="[^"]*bg-track/)
  })

  it('three list cards, every piece once, each opening its page; six no longer raised, then "Show the other 10"', () => {
    expect(html.match(/data-record-group="/g)).toHaveLength(3)
    expect(text).toContain('Waiting for a decision 3')
    expect(text).toContain('Decided 4 Answer liner questions in the comments within a day Customer experience · first suggested 7 Sep · 3 updates Accepted since 28 Sep')
    expect(text).toContain('Not for us since 7 Sep')
    expect(text).toContain('No longer raised 16')
    expect(html.match(/data-record-row=""/g)).toHaveLength(13)
    expect(html).toContain('href="/dashboard/moves/advice?all=1#no-longer-raised"')
    expect(text).toContain('Show the other 10')
    expect(html).toContain('href="/dashboard/moves/advice/a1000000-0000-4000-8000-000000000001"')
    const all = recordPage(recordFixture(true))
    expect(all.match(/data-record-row=""/g)).toHaveLength(23)
    expect(markupText(all)).not.toContain('Show the other')
  })

  // The fresh check: a piece the short list folded used to be a row under
  // "Waiting for a decision" and in its count, which read 4 over "3 waiting
  // for a decision". It is named under the rows now, counted in neither.
  it('the waiting heading counts its rows, the meta\'s count; a folded piece is named under them, not counted', () => {
    const base = recordFixture()
    const folded = { ...base.groups[0].rows[1], lineageId: 'f-folded', title: 'Say how long a liner lasts in every liner post', note: SAME_IDEA_NOTE }
    const page = { ...base, groups: [{ ...base.groups[0], also: [folded] }, ...base.groups.slice(1)] }
    const m = recordPage(page)
    const at = (k: string) => m.lastIndexOf('<section', m.indexOf(`data-record-group="${k}"`))
    const waiting = m.slice(at('waiting'), at('decided'))
    expect(waiting.match(/data-record-row=""/g)).toHaveLength(3)
    expect(markupText(waiting)).toMatch(/^Waiting for a decision 3 /)
    expect(markupText(m)).toContain('3 waiting for a decision')
    expect(markupText(waiting)).toContain(`${RECORD_SAME_IDEA_HEAD} Say how long a liner lasts in every liner post`)
    expect(waiting).toContain('href="/dashboard/moves/advice/f-folded"')
    assertCopyContract(<MovesRecordPage page={page} />)
  })

  it('a group with no row keeps its card and says so', () => {
    expect(markupText(recordPage(recordQuietFixture()))).toContain('Waiting for a decision 0 Nothing is waiting for a decision. Decided 0 Nothing has been decided on yet.')
  })
})

describe('an address that names nothing', () => {
  it('one calm line and the way back, never a 404', () => {
    const t = markupText(render(<MovesMissing line={ADVICE_MISSING} />))
    expect(t).toContain(ADVICE_MISSING)
    expect(t).toContain(`${BACK_TO_MOVES} →`)
  })
})
