import { describe, expect, it } from 'vitest'
import { EarlierQuestionsTile, NotAnsweredTile, ReadsTile } from './rail'
import { AskBoxTile, StarterCards } from './ask-box'
import type { StarterQuestion } from '@/lib/agent/starters'
import { agentFixture, refusedFixture } from './fixture'
import { assertCopyContract } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'

// The rail's three tiles and the ask box (Block D wave 2, E-ask).
//
// One static render per tile per state. Both states are real and the second one
// is the one a reviewer sees: a fresh database has the code and no rows, and
// every tile here has to survive it without printing a zero.

const measured = agentFixture()
const refused = refusedFixture()

describe('earlier questions', () => {
  const text = renderText(<EarlierQuestionsTile history={measured.history} />)

  it('keeps the copy contract in both states', () => {
    assertCopyContract(<EarlierQuestionsTile history={measured.history} />)
    assertCopyContract(<EarlierQuestionsTile history={refused.history} />)
    assertCopyContract(<EarlierQuestionsTile history={null} />)
  })

  it('never lists the thread the reader is on, and leaves it out of the meta too', () => {
    // "Earlier questions" listed the OPEN thread as its first row, linking to
    // itself, 300px from the same question rendered at 15px in the answer tile
    // beside it. The rail is a list of where ELSE to go, so the open thread is
    // out of both halves of the tile.
    expect(text).not.toContain('Should our summer campaign lead')
    expect(text).toContain('Is price fading, or just quieter?')
  })

  it('carries its title alone and its link alone (25 Sep rulings, WP3.9)', () => {
    // The "3 of 3" meta and the "earliest 28 Sep" note left the tile: a header
    // is its title and a footer its link.
    expect(text).toContain('Your questions')
    expect(text).not.toContain('3 of 3')
    expect(text).not.toContain('earliest')
    expect(text).toContain('All questions →')
  })

  it('draws the newest three of what is left', () => {
    // With the open thread out, August's fourth row moves into view — the cap
    // is three DRAWN rows, not three rows held.
    expect(text).toContain('Did the recycled-sails claim land')
    expect(text).toContain('What do people complain about with Freitag?')
  })

  it('says "nothing else" rather than "nothing", because one question exists', () => {
    // The refused fixture holds exactly one thread and it is the one being
    // read, so the rows are empty while the workspace has asked a question.
    // "No question has been asked in this workspace yet" would be a lie told
    // beside the question the reader is reading.
    const empty = renderText(<EarlierQuestionsTile history={{ ...measured.history!, rows: [] }} />)
    expect(empty).toContain('Nothing else has been asked')
  })

  it('carries no per-row figure, because nothing stores one', () => {
    // The artboard writes "smell 41 videos · zips 71" under each row.
    // `agent_messages.result` holds a count per grounded point and nothing that
    // summarises a thread, so a figure here would be re-derived from a stored
    // answer's prose — the re-derivation the reading layer exists to stop.
    expect(text).toContain('answered 13 Sep')
    expect(text).not.toMatch(/answered 13 Sep · \d/)
  })

  it('flags only the thread whose plan claim crossed', () => {
    expect(text).toContain('1 claim crossed')
    expect(text.split('1 claim crossed').length - 1).toBe(1)
  })

  it('leaves the earliest date off the footer, which holds its link alone', () => {
    // The 25 Sep rulings (WP3.9): a footer is links only.
    expect(text).not.toContain('earliest 20 Aug')
  })

  it('draws no footer at all where there is no list', () => {
    // `Tile` renders the footer row if EITHER half is present, and the note
    // was gated only on `earliest` — so the refused state drew a hairline and
    // a lone right-aligned "earliest 28 Sep" with the left half empty, under a
    // body already saying nothing else has been asked. Both halves are facts
    // about a list; neither prints without one.
    const empty = renderText(<EarlierQuestionsTile history={refused.history} />)
    expect(empty).toContain('Nothing else has been asked')
    expect(empty).not.toContain('earliest')
    expect(empty).not.toContain('All questions')
  })

  it('says so when it could not be read, and never draws an empty list', () => {
    expect(renderText(<EarlierQuestionsTile history={null} />)).toContain('could not be read')
  })

  it('marks a model-written thread title as the model’s words', () => {
    // `ask_extract_title` is a PROSE_POLICY slot whose policy is `digits`, so
    // the exemption from rule (c) is one the policy table actually grants.
    expect(render(<EarlierQuestionsTile history={measured.history} />)).toContain('data-slot="ask_extract_title"')
  })
})

describe('what an answer reads (WP3.9)', () => {
  it('keeps the copy contract in both states', () => {
    assertCopyContract(<ReadsTile reads={measured.reads} />)
    assertCopyContract(<ReadsTile reads={refused.reads} />)
  })

  it('prints the market, its brands and the client’s own posts, as the preview does', () => {
    const text = renderText(<ReadsTile reads={measured.reads} />)
    expect(text).toContain('Your market, not only your own posts.')
    expect(text).toMatch(/Your market\s*655/)
    expect(text).toContain('videos in September so far; 626 in the category, where themes are grouped')
    expect(text).toContain('of those 655, filed under a brand; read when a question names one')
    expect(text).toContain('with a reading in September so far, marked as yours and never counted as the market')
    expect(text).toContain('August, and September so far')
    expect(text).toContain('October against November, from the 6 Dec update')
  })

  it('links to where the method is said, and carries no meta', () => {
    const text = renderText(<ReadsTile reads={measured.reads} />)
    expect(text).toContain('What we read, and how →')
    expect(render(<ReadsTile reads={measured.reads} />)).toContain('/dashboard/settings/how-to-read')
  })

  it('prints no zero for a count nobody read', () => {
    const text = renderText(<ReadsTile reads={refused.reads} />)
    expect(text).toContain('not read for this month yet')
    expect(text).not.toMatch(/Your market\s*0/)
  })
})

describe('not answered this month', () => {
  it('keeps the copy contract in both states', () => {
    assertCopyContract(<NotAnsweredTile notAnswered={measured.notAnswered} />)
    assertCopyContract(<NotAnsweredTile notAnswered={refused.notAnswered} />)
    assertCopyContract(<NotAnsweredTile notAnswered={null} />)
  })

  it('prints the reader’s own question and the reason in the reader’s words', () => {
    const text = renderText(<NotAnsweredTile notAnswered={measured.notAnswered} />)
    expect(text).toContain('Anything compared against Poler?')
    expect(text).toContain('nothing in the conversation we read speaks to this')
    expect(text).toContain('this asks about your own numbers, which we do not read')
  })

  it('prints the budget with its own denominator', () => {
    expect(renderText(<NotAnsweredTile notAnswered={measured.notAnswered} />)).toContain('3 of 40 questions asked this month')
  })

  it('states the month’s budget once, not twice', () => {
    // The budget line already says "1 of 40 questions asked this month. Every
    // one was answered from the conversation"; an empty state above it said the
    // same thing again, in the state a fresh workspace is in.
    const text = renderText(<NotAnsweredTile notAnswered={refused.notAnswered} />)
    expect(text).toContain('Every one was answered from the conversation')
    expect(text.match(/answered from the conversation/g)).toHaveLength(1)
  })

  it('carries no meta beside its title (25 Sep rulings, WP3.9)', () => {
    expect(renderText(<NotAnsweredTile notAnswered={measured.notAnswered} />)).not.toContain('2 of 3 asked')
    expect(renderText(<NotAnsweredTile notAnswered={refused.notAnswered} />)).not.toContain('0 of 1 asked')
  })

  it('points at what we track', () => {
    expect(renderText(<NotAnsweredTile notAnswered={measured.notAnswered} />)).toContain('What we track →')
  })
})

describe('the ask box', () => {
  const box = (d: ReturnType<typeof agentFixture>) => (
    <AskBoxTile basis={d.basis} plan={d.planChip} composer={<p>the control</p>} />
  )

  it('keeps the copy contract in both states', () => {
    assertCopyContract(box(measured))
    assertCopyContract(box(refused))
  })

  it('asks the market’s question (WP3.9)', () => {
    const text = renderText(box(measured))
    expect(text).toContain('Ask your market')
    expect(text).toContain('What does your market say about this?')
    expect(text).not.toContain('monthly readings searchable')
  })

  it('offers the window, 90 days or all time, and the month’s budget', () => {
    const text = renderText(
      <AskBoxTile
        basis={measured.basis}
        plan={null}
        window={{ current: 'days90', href: { days90: '/dashboard/agent', all: '/dashboard/agent?window=all' }, reachesBack: '2020' }}
        asked={{ asked: 3, cap: 40 }}
      />,
    )
    expect(text).toContain('Last 90 days')
    expect(text).toContain('All time')
    expect(text).toContain('comments reach back to 2020')
    expect(text).toContain('3 of 40 questions asked this month')
  })

  it('shows the plan a reader already checked, with how its claims read now', () => {
    // The chip is Ask's first sight of a feature that has shipped since August:
    // `plan_checks` was written, re-checked against every update, and no
    // surface ever told a reader they had one.
    const text = renderText(box(measured))
    expect(text).toContain('Summer 2026/27 campaign brief.pdf')
    expect(text).toContain('uploaded 20 Aug · 9 claims')
    expect(text).toContain('6 supported')
    expect(text).toContain('1 contradicted')
    expect(text).toContain('2 untested')
  })

  it('draws no chip for a verdict no claim earned', () => {
    // All three rendered unconditionally, so a plan whose claims all held drew
    // a red-tinted "0 contradicted" beside a grey "0 untested" — a negative
    // tint firing where nothing is wrong. Absent rather than zero, which is
    // what `NotAnsweredTile` and `askDraws` do six files from here.
    const clean = box(agentFixture({
      planChip: { ...measured.planChip!, summary: { supported: 9, contradicted: 0, untested: 0 } },
    }))
    const text = renderText(clean)
    expect(text).toContain('9 supported')
    expect(text).not.toContain('0 contradicted')
    expect(text).not.toContain('0 untested')
  })

  it('draws no footnote where no plan has been checked (25 Sep rulings)', () => {
    expect(renderText(box(refused))).not.toContain('No plan has been checked yet')
  })
})

describe('the starter questions (WP3.9)', () => {
  // Sealand's front page, September (lib/agent/starters.test.ts builds these
  // off the market fixture; the rows here are its output).
  const starters: StarterQuestion[] = [
    { question: 'What makes people ready to buy?', rows: [{ kind: 'theme', label: 'Ready to buy handmade bags', k: 69, tags: ['about a third makers'] }] },
    { question: 'What does my market say about Looks & style?', rows: [{ kind: 'subject', label: 'Looks & style, a subject', k: 104, tags: ['provisional', 'over a third makers'] }] },
  ]

  it('keeps the copy contract, and marks a theme label as the model’s words', () => {
    assertCopyContract(<StarterCards starters={starters} source="written from Your market · September so far" />)
    expect(render(<StarterCards starters={starters} source={null} />)).toContain('data-slot="pass_b_theme"')
  })

  it('prints each card’s question, its rows with their videos, and where they came from', () => {
    const text = renderText(<StarterCards starters={starters} source="written from Your market · September so far" />)
    expect(text).toContain('Start from what your market talked about')
    expect(text).toContain('written from Your market · September so far')
    expect(text).toMatch(/Ready to buy handmade bags\s*69 videos/)
    expect(text).toContain('about a third makers')
    expect(text).toContain('provisional · over a third makers')
  })

  it('sends the reader to the box with the question in it, and asks nothing', () => {
    expect(render(<StarterCards starters={starters} source={null} />)).toContain('/dashboard/agent?ask=What%20makes%20people%20ready%20to%20buy%3F')
  })

  it('draws nothing where the front page has nothing', () => {
    expect(render(<StarterCards starters={[]} source={null} />)).toBe('')
  })
})
