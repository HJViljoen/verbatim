import { describe, expect, it } from 'vitest'
import { AnswerTile } from './answer'
import { agentFixture, followUpFixture, refusedFixture } from './fixture'
import { assertCopyContract, copyViolations } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { MOVEMENT_WORDS } from '@/components/delta-badge'
import { citationWhere, saidHeading } from '@/lib/agent/types'
import { PREVALENCE_LABEL } from '@/lib/calibration'
import { scrubThreadAnswer } from '@/lib/agent/measure'

// The answer tile's render tier (Block D wave 2, E-ask).
//
// One static render per state, asserted against what the block PRINTS. The
// two states are the fixture's two and they are both real: a workspace whose
// months are seeded, and a fresh database where `measure` is null — which is
// what a reviewer actually sees, and what every new field has to survive.

const measured = agentFixture()
const refused = refusedFixture()

const tile = (d: ReturnType<typeof agentFixture>, i = 0) => (
  <AnswerTile
    turn={d.turns[i]}
    turnIndex={i}
    measure={d.measure}
    citations={d.citations}
    basis={d.basis}
    composer={<p>Check a plan</p>}
  />
)

describe('the answer keeps the copy contract', () => {
  it('prints no digit the model typed, every level with its "of N", and no unearned direction word', () => {
    assertCopyContract(tile(measured))
  })

  it('keeps it with no measurement at all', () => {
    // The state a fresh database is in. Nothing here may become a zero: the
    // levels are absent because there is no reading, not because nothing moved.
    assertCopyContract(tile(refused))
  })

  it('marks a commenter’s own words as theirs', () => {
    // Rule (c) is about what the PRODUCT claims. 41% of stored quotes are
    // non-ASCII and one of Össur's says "double"; the marker is what keeps the
    // sweep off a speaker's sentence.
    expect(render(tile(measured))).toContain('data-copy="quote"')
  })
})

describe('the measurement half', () => {
  const text = renderText(tile(measured))

  it('prints no word outside the surface’s own legend', () => {
    // AGENTS.md: a new reading surface draws its vocabulary from
    // THIRTEEN_WORDS + READER_FLAGS and prints nothing outside it. The
    // prevalence ladder is legacy — its glossary entries are defined over
    // run-indexed CONVERSATIONS while this chip's denominator is a
    // comment-dated month's VIDEOS, so the word a reader would click "How to
    // read this page" about was the one word the legend could not explain.
    for (const word of Object.values(PREVALENCE_LABEL)) {
      expect(text).not.toContain(word)
    }
  })

  it('prints the level with its own denominator, never a bare count', () => {
    // 130 of 1,388 — the month table's k and n, not
    // `GroundedPoint.conversationCount`, which has no denominator at all.
    expect(text).toContain('130 of 1,388 videos')
    expect(text).not.toContain('130 conversations')
  })

  it('prints the month before as its own counted pair', () => {
    expect(text).toContain('the month before: 99 of 1,455 videos in August')
  })

  it('prints the change and the band together', () => {
    // D2: a Verdict carries both or neither. The badge prints points only in
    // the `moved` state.
    expect(text).toMatch(/▲ 2\.6 pts · band ±2 pts/)
  })

  it('prints the direction word only where three readings earned one', () => {
    // Ask is the one reader whose flag is true, and the word still has to be
    // earned — `directionWord` over three consecutive months in one regime.
    expect(text).toContain('growing over 3 readings')
    // Finding 2's months are flat, so it earns the non-answer and no word.
    expect(text).toContain(MOVEMENT_WORDS.no_clear_change)
    expect(text).not.toContain('fading over 3 readings')
  })

  it('states the client’s own thin side rather than comparing it', () => {
    expect(text).toContain('In your own audience: 26 of 84 videos')
    expect(text).toContain(MOVEMENT_WORDS.too_little_data)
  })

  it('prints every plotted month with its own denominator', () => {
    // The shared CalendarLine labels the baseline and one midline, so in a
    // 104px box the only labelled gridline sits BELOW the data: the axis says
    // 0% and 5% and the line ends at 9.4%. Changing the axis is a change to
    // `components/charts/*`, which all six surfaces draw through. The trail is
    // the months themselves, in order.
    //
    // EACH WITH ITS "of N". It printed "Jul 5.1% → Aug 6.8% → Sep 9.4%" —
    // three levels and no denominator between them — inside one
    // `data-copy="figure"` node, so rule (b) never inspected it. The chart's
    // end label carries a denominator for the newest month alone.
    expect(text).toContain('Jul 5.1% (71 of 1,400) → Aug 6.8% (99 of 1,455) → Sep 9.4% (130 of 1,388)')
  })

  it('marks each month of the trail as the level it is', () => {
    // A `figure` is a number code computed; these are levels, and rule (b)
    // only reads a node it has been told is one. A month that could not be
    // read prints a dash and stays a `figure`, because it states no level.
    const markup = render(tile(measured))
    expect(markup).toContain('<span data-copy="level" class="whitespace-nowrap">Jul 5.1% (71 of 1,400)</span>')
    expect(copyViolations(tile(measured))).toEqual([])
  })

  it('names what the figures are figures OF, rather than dropping a bare label', () => {
    // The theme name printed as an orphaned 11px line under the own-side
    // sentence. It is introduced now, and it is still the model's words with
    // its slot named.
    expect(text).toContain('measured on Will it survive a wet commute')
    expect(render(tile(measured))).toContain('data-slot="pass_b_theme"')
  })

  it('keeps the own-thin caveat under its finding and out of the judgement', () => {
    // `measure.caveats` carries one own-thin sentence per finding and every one
    // was already printed beside the counted pair it qualifies. Four lines
    // where the artboard has one, and a caveat moved away from its figure.
    expect(text).toContain('Interpretation, not counted.')
    expect(text).not.toContain('Your own side of Will it survive a wet commute')
  })

  it('names what a provenance link opens, by platform', () => {
    // The artboard says "the video →" and "the thread →". Branching on
    // `commentLevel` alone made a TikTok video and a Reddit thread read
    // identically, which is the one thing a provenance link has to say.
    expect(text).toContain('the video →')
    expect(text).toContain('the thread →')
  })

  it('draws one line, and never a rival’s', () => {
    // Retrieval drops every rival voice before an answer is written, so a rival
    // series behind a claim about this client's own audience does not exist to
    // be drawn. The mock draws Freitag here; this is the deviation.
    const markup = render(tile(measured))
    expect(markup).toContain('<svg')
    expect(markup).not.toContain('Freitag')
  })
})

describe('with no reading behind it', () => {
  const text = renderText(tile(refused))

  it('says so rather than printing a level of nothing', () => {
    expect(text).toContain('no month reading stands behind this one')
    expect(text).not.toContain('0 of 0')
  })

  it('still prints the answer, the quotes and the judgement', () => {
    expect(text).toContain('Durability')
    expect(text).toContain('Three winters on the bike')
    expect(text).toContain('this one is inference')
  })
})

describe('the registers', () => {
  it('heads the evidence by whose audience spoke', () => {
    expect(renderText(tile(measured))).toContain(saidHeading(measured.turns[0].answer!.grounded))
  })

  it('marks the whole judgement as inference, not only the points that cite nothing', () => {
    // The build marked an uncited point and left a well-cited judgement
    // unmarked, so the register that is our opinion read as a finding.
    const text = renderText(tile(measured))
    expect(text).toContain('this one is inference')
    expect(text).toContain('Reasoning from finding 1 above.')
    expect(text).toContain('Interpretation, not counted.')
  })

  it('dates every quoted voice and links to it', () => {
    const text = renderText(tile(measured))
    expect(text).toContain(citationWhere(measured.citations[0]))
    expect(render(tile(measured))).toContain(measured.citations[0].href!)
  })

  it('says what the answer was answered against', () => {
    expect(renderText(tile(measured))).toContain('Answered against the update of 27 Sep')
  })
})

describe('the tile’s chrome', () => {
  it('wears the artboard’s eyebrow, meta and footer rail', () => {
    const text = renderText(tile(measured))
    expect(text).toContain('The answer')
    expect(text).toContain('answered 28 Sep')
    expect(text).toContain('You asked · 28 Sep')
    expect(text).toContain('Open the 130 videos behind this')
    // The footer note names the population and the month every figure above is
    // a figure of — the basis travelling with the figure (D15).
    expect(text).toContain('the category · September')
  })

  it('gives the follow-up control its own rail above the footer', () => {
    // The control is a SLOT (see `AnswerTile.composer`): the route mounts the
    // client component, this block owns where it sits. The stand-in proves the
    // slot renders inside the tile and above the footer rail.
    const markup = render(tile(measured))
    expect(markup).toContain('Check a plan')
    expect(markup.indexOf('Check a plan')).toBeLessThan(markup.indexOf('Open the'))
  })

  it('reports no contract violation for either state', () => {
    expect(copyViolations(tile(measured))).toEqual([])
    expect(copyViolations(tile(refused))).toEqual([])
  })
})

describe('a follow-up prints its own turn’s figure', () => {
  // THE DEFECT THIS PINS. `AnswerMeasure.findings` is the whole thread's, in
  // turn order, so `findings[0]` is turn 0's first grounded point on every
  // turn — and the footer read it directly. A follow-up resting only on
  // "Recycled materials" (k = 194) printed "Open the 130 videos behind this",
  // which is the wet-commute finding's k from the answer above it.
  const thread = followUpFixture()
  const followUp = (
    <AnswerTile
      turn={thread.turns[1]}
      turnIndex={1}
      measure={thread.measure}
      citations={thread.citations}
      basis={thread.basis}
    />
  )

  it('resolves the footer from the turn’s own grounded ids', () => {
    const text = renderText(followUp)
    expect(text).toContain('Open the 194 videos behind this')
    expect(text).not.toContain('Open the 130 videos behind this')
  })

  it('wears the follow-up eyebrow and keeps the contract', () => {
    expect(renderText(followUp)).toContain('The follow-up')
    expect(copyViolations(followUp)).toEqual([])
  })

  it('prints AS3 where it changes and not under every turn', () => {
    // A thread answered inside one week carries one `updateAt` on every turn,
    // so the same two-line mono paragraph printed under each answer — five
    // times on a five-turn thread. The line says WHICH update an answer rests
    // on, so it belongs where that stops being true.
    const same = renderText(
      <AnswerTile
        turn={thread.turns[1]} turnIndex={1} measure={thread.measure}
        citations={thread.citations} basis={thread.basis}
        prevUpdateAt={thread.turns[0].updateAt}
      />,
    )
    expect(same).not.toContain('Answered against the update of')

    // The first turn always states it, and so does a turn answered against a
    // different update from the one before it.
    expect(renderText(followUp)).toContain('Answered against the update of')
    const moved = renderText(
      <AnswerTile
        turn={thread.turns[1]} turnIndex={1} measure={thread.measure}
        citations={thread.citations} basis={thread.basis}
        prevUpdateAt="2026-08-01T00:00:00.000Z"
      />,
    )
    expect(moved).toContain('Answered against the update of')
  })

  it('prints no footer at all where the turn measured nothing', () => {
    // A turn whose points rest on no theme the months carry: absent, not zero,
    // and never the neighbouring turn's figure.
    const unmeasured = (
      <AnswerTile
        turn={thread.turns[1]}
        turnIndex={9}
        measure={thread.measure}
        citations={thread.citations}
        basis={thread.basis}
      />
    )
    expect(renderText(unmeasured)).not.toContain('Open the')
  })
})

describe('THE SEAM: the scrubber licenses a direction word the contract refuses', () => {
  // NOT A PASSING TEST DRESSED AS A NOTE — this asserts the collision, so the
  // day either side is settled it fails loudly and whoever settled it finds
  // this case.
  //
  // `dropUnverdictedDirection` (lib/prose/scrub.ts) deliberately KEEPS a model
  // sentence whose direction word sits in a clause naming an object whose
  // verdict earned one. That is the whole point of `agent.movement` being the
  // one true reader flag. The copy contract's rule (c) then refuses a direction
  // word anywhere outside a `data-copy="verdict"` node, whoever wrote it — and
  // an answer's prose has to be a `prose` node, because that is what runs rule
  // (a) against a digit the model typed.
  //
  // So a real answer reading "Will it survive a wet commute is growing" passes
  // the scrubber and fails the block's render test. The fixture above avoids it
  // by carrying no direction word at all, which is honest about what the page
  // prints and proves nothing about the one sentence class where the two rules
  // collide. This case is that class.
  //
  // NEITHER FILE IS THIS PACKAGE'S TO SETTLE: the contract is P0's and the
  // policy table is `competitive`'s. Two options — a licensed-prose kind in the
  // contract, or `PROSE_POLICY.agent_answer` dropping every direction sentence
  // and leaving the word to the surface. The second is the better one: the
  // surface's verdict node carries the band and both sides' k and n, and the
  // model's sentence carries neither.
  const LICENSED = 'Will it survive a wet commute is growing, and no tracked brand answers it on camera.'
  const base = agentFixture()

  it('the scrubber keeps the sentence (it names an object whose verdict earned the word)', () => {
    const turn0 = base.turns[0]
    const scrubbed = scrubThreadAnswer(
      { answer: turn0.answer!.answer, grounded: [{ ...turn0.answer!.grounded[0], text: LICENSED }] },
      base.measure!,
      { keyOf: () => '0:G1' },
    )
    expect(scrubbed.grounded[0].text).toBe(LICENSED)
    expect(scrubbed.scrub.droppedDirection).toBe(0)
  })

  it('and the copy contract refuses it on the rendered block', () => {
    const leaky = agentFixture({
      turns: [
        {
          ...base.turns[0],
          answer: {
            ...base.turns[0].answer!,
            grounded: base.turns[0].answer!.grounded.map((g, i) => (i === 0 ? { ...g, text: LICENSED } : g)),
          },
        },
      ],
    })
    const violations = copyViolations(
      <AnswerTile
        turn={leaky.turns[0]}
        turnIndex={0}
        measure={leaky.measure}
        citations={leaky.citations}
        basis={leaky.basis}
      />,
    )
    expect(violations.map((v) => v.rule)).toContain('direction-word')
    expect(violations.map((v) => v.text).join(' ')).toMatch(/growing/)
  })
})
