import { describe, expect, it } from 'vitest'
import { DrawsTile, EarlierQuestionsTile, NotAnsweredTile } from './rail'
import { AskBoxTile, readingsMeta } from './ask-box'
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

  it('never lists the thread the reader is on, and still counts it', () => {
    // "Earlier questions" listed the OPEN thread as its first row, linking to
    // itself, 300px from the same question rendered at 15px in the answer tile
    // beside it. It is excluded from the rows and kept in the month count: the
    // reader did ask it, and the rail is a list of where else to go.
    expect(text).not.toContain('Should our summer campaign lead')
    expect(text).toContain('3 this month')
    expect(text).toContain('Is price fading, or just quieter?')
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

  it('dates its footer by the earliest question it holds', () => {
    // D14: earliest EVIDENCE, never a start date.
    expect(text).toContain('earliest 20 Aug')
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

describe('what an answer draws on', () => {
  const tile = (d: ReturnType<typeof agentFixture>) => (
    <DrawsTile draws={d.draws} recordHref={d.record!.href} asAt={d.basis.lastEmbeddedAt ? '15 Sep' : null} />
  )

  it('keeps the copy contract in both states', () => {
    assertCopyContract(tile(measured))
    assertCopyContract(tile(refused))
  })

  it('names the months behind the readings count', () => {
    const text = renderText(tile(measured))
    expect(text).toContain('3 monthly · Jul, Aug, Sep')
    expect(text).toContain('2,872 of 2,872 findings')
    expect(text).toContain('as at 15 Sep')
  })

  it('opens the record, which is where the rows it does not print live', () => {
    // Four rows, not the mock's five: updates-this-month, videos, languages and
    // tracking changes need `loadRecordInputs`' eight tenant-wide reads on every
    // page load. `hasRecord` admits Ask so the drawer can be opened from here.
    const markup = render(tile(measured))
    expect(markup).toContain('detail=record')
    expect(renderText(tile(measured))).toContain('The record →')
    // Stated ONCE, in the Updates row whose term names it — not again as a
    // footer note that is present on one route and absent on the other.
    const text = renderText(tile(measured))
    expect(text).toContain('23 delivered')
    expect(text).not.toContain('23 updates delivered')
  })

  it('says what is not recorded rather than printing a zero', () => {
    const text = renderText(tile(refused))
    expect(text).toContain('not recorded for this workspace yet')
    expect(text).not.toContain('0 monthly')
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

  it('names what its meta counts, and prints no bare zero', () => {
    expect(renderText(<NotAnsweredTile notAnswered={measured.notAnswered} />)).toContain('2 of 3 asked')
    // Nothing declined: the slot is empty rather than carrying a "0" over an
    // empty state.
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

  it('moves the readings count into the tile’s meta', () => {
    expect(renderText(box(measured))).toContain('3 monthly readings searchable')
    expect(readingsMeta({ ...measured.basis, monthlyReadings: 1 })).toBe('1 monthly reading searchable')
    expect(readingsMeta({ ...measured.basis, monthlyReadings: 0 })).toBe('no month yet carries enough videos')
    expect(readingsMeta({ ...measured.basis, monthlyReadings: null })).toBe('monthly readings not recorded here')
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

  it('says what checking a plan does, rather than drawing a blank rail', () => {
    expect(renderText(box(refused))).toContain('No plan has been checked yet')
  })
})
