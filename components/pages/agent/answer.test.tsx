import { describe, expect, it } from 'vitest'
import { AnswerTile } from './answer'
import { agentFixture, followUpFixture, refusedFixture } from './fixture'
import { assertCopyContract, copyViolations } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { MOVEMENT_WORDS } from '@/components/delta-badge'
import { saidHeading } from '@/lib/agent/types'
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

  it('prints no quotes register: "What people said" is the evidence (Heinrich, 1 Oct)', () => {
    const text = renderText(tile(measured))
    expect(text).not.toContain('In their words')
    expect(text).not.toContain('Three winters on the bike')
    expect(render(tile(measured))).not.toContain('data-copy="quote"')
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
    // On screen the band is the badge's hover (copy de-clutter ruling I);
    // print keeps it inline.
    expect(text).toMatch(/▲ 2\.6 pts/)
    // The band in the tooltip, in plain words, never "this measurement".
    expect(render(tile(measured))).toMatch(/title="more than the usual month-to-month swing of \d+(\.\d+)? points"/)
    expect(render(tile(measured))).not.toContain('measurement')
  })

  it('prints the direction word only where three months earned one', () => {
    // Ask is the one reader whose flag is true, and the word still has to be
    // earned — `directionWord` over three consecutive months in one regime.
    expect(text).toContain('growing over 3 months')
    // Finding 2's months are flat, so it earns the non-answer and no word.
    expect(text).toContain(MOVEMENT_WORDS.no_clear_change)
    expect(text).not.toContain('fading over 3')
  })

  it('states the base once, against the market, and each level alone (round 2)', () => {
    // The fixture hands the measurement no market count, so the line names
    // no number for the brands; `answer-copy.test.tsx` holds the counted one.
    expect(text).toContain('Counted out of the 1,388 September videos about your category in general, not counting the videos about brands you track.')
    expect(text.split('Counted out of').length - 1).toBe(1)
    expect(text).toContain('130 of 1,388 videos')
    expect(text).not.toContain('in the category')
  })

  it('highlights no phrase: the level is set in weight, never on a tint', () => {
    const markup = render(tile(measured))
    expect(markup).not.toMatch(/data-copy="level"[^>]*class="[^"]*\bbg-/)
  })

  it('prints the client’s own side only where it says something (§0a.2)', () => {
    // 26 of 84 is under the floor: "too few to compare" is all it said.
    expect(text).not.toContain('In your own audience')
    expect(text).not.toContain(MOVEMENT_WORDS.too_little_data)
    const clear = agentFixture({
      measure: { ...measured.measure!, findings: measured.measure!.findings.map((f) => ({ ...f, own: { value: { k: 52, n: 160 }, thin: false } })) },
    })
    const shown = renderText(tile(clear))
    expect(shown).toContain('In your own audience: 52 of 160 videos')
    expect(shown).not.toContain(MOVEMENT_WORDS.too_little_data)
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

  it('says what a point covers in one short line, the model’s words with their slot', () => {
    // It said "measured on", our word for our method (§0a).
    expect(text).toContain('Covers: Will it survive a wet commute')
    expect(text).not.toContain('measured on')
    expect(render(tile(measured))).toContain('data-slot="pass_b_theme"')
  })

  it('keeps the own-thin caveat under its finding, and no method note under the judgement', () => {
    expect(text).not.toContain('Interpretation, not counted.')
    expect(text).not.toContain('Your own side of Will it survive a wet commute')
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

  it('prints no level and no line about there being none (§0a)', () => {
    expect(text).not.toContain('no month reading')
    expect(text).not.toContain('0 of 0')
  })

  it('still prints the answer, the finding and what I’d do', () => {
    expect(text).toContain('Durability')
    expect(text).toContain('The wet-commute question is the one nobody answers on camera.')
    expect(text).toContain('this one is inference')
  })
})

describe('the registers', () => {
  it('heads the evidence by whose audience spoke', () => {
    expect(renderText(tile(measured))).toContain(saidHeading(measured.turns[0].answer!.grounded))
  })

  it('marks the whole of "What I’d do" as inference, with its trace to the findings below', () => {
    // The build marked an uncited point and left a well-cited judgement
    // unmarked, so the register that is our opinion read as a finding.
    const text = renderText(tile(measured))
    expect(text).toContain('What I’d do')
    expect(text).toContain('this one is inference')
    expect(text).toContain('Based on finding 1 below.')
  })

  it('puts "What I’d do" under the answer and above the evidence (Heinrich, 1 Oct)', () => {
    const text = renderText(tile(measured))
    const answer = text.indexOf('Durability')
    const doing = text.indexOf('What I’d do')
    const said = text.indexOf(saidHeading(measured.turns[0].answer!.grounded))
    expect(answer).toBeGreaterThan(-1)
    expect(doing).toBeGreaterThan(answer)
    expect(said).toBeGreaterThan(doing)
  })

  it('names no update the answer was given against (§0a.1)', () => {
    expect(renderText(tile(measured))).not.toMatch(/update of|Answered against/)
  })
})

describe('the tile’s chrome', () => {
  it('wears its title alone and its link alone (25 Sep rulings, WP3.9)', () => {
    const text = renderText(tile(measured))
    expect(text).toContain('The answer')
    // The date is the "You asked" line's; no meta repeats it beside the title.
    expect(text).toContain('You asked · 28 Sep')
    expect(text).not.toContain('answered 28 Sep')
    expect(text).toContain('Open the 130 videos behind this')
    // The population and the month are on the finding the link opens, never a
    // note beside the link.
    const markup = render(tile(measured))
    expect(markup.slice(markup.indexOf('Open the'))).not.toContain('the category · September')
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

  it('prints no footer at all where the turn measured nothing', () => {
    // A turn whose points rest on no theme the months carry: absent, not zero,
    // and never the neighbouring turn's figure.
    const unmeasured = (
      <AnswerTile
        turn={thread.turns[1]}
        turnIndex={9}
        measure={thread.measure}
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
      />,
    )
    expect(violations.map((v) => v.rule)).toContain('direction-word')
    expect(violations.map((v) => v.text).join(' ')).toMatch(/growing/)
  })
})

// ── What the question named, read on the market (WP3.9, S7) ─────────────────

import { AboutReadings } from './answer'
import { objectReading } from '@/lib/agent/movement'
import { pairOn } from '@/lib/reading/pairs'
import { sealandJudge } from '@/lib/test/sealand-pairs'
import { assertCopyContract as assertAboutContract } from '@/lib/test/copy-contract'

describe('"Ask about this" on a subject: its own figure and trail', () => {
  // Looks & style: 38 of 351 in August (research §1), 104 of 626 in September
  // (prod, 24 Sep), category figures standing in for the market's. Read on
  // 2 Oct, when the Aug→Sep pair is refused: we changed our searches in
  // September. HYPOTHETICAL calibration `ready`, to show the verdict path.
  const judge = pairOn(sealandJudge('2026-10-02T06:00:00.000Z'))
  const points = [{ month: '2026-08-01', k: 38, n: 351 }, { month: '2026-09-01', k: 104, n: 626 }]
  const ready = objectReading({ object: { kind: 'subject', id: 's1', label: 'Looks & style', calibration: 'ready' }, points }, '2026-09-01', judge, '2026-10-02T06:00:00.000Z')
  const provisional = objectReading({ object: { kind: 'subject', id: 's2', label: 'Waterproofing', calibration: 'provisional' }, points: [{ month: '2026-09-01', k: 33, n: 626 }] }, '2026-09-01', judge, '2026-10-02T06:00:00.000Z')
  const brand = objectReading({ object: { kind: 'brand', id: 'b1', label: 'Cotopaxi' }, points: [], notRead: true }, '2026-09-01', judge, '2026-10-02T06:00:00.000Z')

  it('prints the level with its "of N" and nothing of the refused month before, never "moved"', () => {
    const text = renderText(<AboutReadings readings={[ready]} />)
    expect(text).toContain('Looks & style')
    expect(text).toContain('104 of 626 videos')
    expect(text).toContain('in your market · September')
    // T0a (the one condition): the pair is refused, so no trail across it
    // ("Aug 11% of 351 · Sep 17% of 626" was the comparison itself) and no
    // sentence saying why.
    expect(text).not.toContain('Aug')
    expect(text).not.toContain('of 351')
    expect(text).not.toContain('Not read as a change')
    expect(text).not.toMatch(/\bmoved\b/)
  })

  // T0a (AK-5; ruling U6): a provisional subject's level rests on its
  // unverified matching; it is named with no figure and no word.
  it('names a provisional subject, and one nothing has counted, by name alone (§0a)', () => {
    const text = renderText(<AboutReadings readings={[provisional, brand]} />)
    expect(text).toContain('Waterproofing')
    expect(text).not.toContain('provisional')
    expect(text).not.toContain('33 of 626')
    expect(text).toContain('Cotopaxi')
    expect(text).not.toContain('not read yet')
  })

  // Community & purpose on staging: named 24 Sep at 12:41, after the update
  // that wrote September (lib/subjects/read-in.ts). Subjects prints "no
  // reading yet" in its word's place; Ask printed "0 of 654 videos".
  // HYPOTHETICAL `ready` (a provisional subject is its name alone, T0a).
  const unread = objectReading(
    { object: { kind: 'subject', id: 's3', label: 'Community & purpose', calibration: 'ready' }, points: [{ month: '2026-09-01', k: null, n: 654 }], filling: new Set(['2026-09-01']), nextUpdate: '2026-10-04T06:00:00.000Z' },
    '2026-09-01', judge, '2026-10-02T06:00:00.000Z',
  )

  it('a subject the month was not counted for is its name, never "no reading yet" and never "0 of 654"', () => {
    const text = renderText(<AboutReadings readings={[unread]} />)
    expect(text).toContain('Community & purpose')
    expect(text).not.toContain('no reading yet')
    expect(text).not.toContain('provisional')
    expect(text).not.toMatch(/\b0 of 654\b/)
  })

  it('shows at most the last three months read, and never a month with no reading', () => {
    // HYPOTHETICAL: `ready`, and every pair read the same way, so the trail
    // is not cut at a refused step (T0a) and its three-month cap shows.
    const joined = (prevMonth: string, month: string) => ({ prevMonth, month, mode: 'comparable' as const, reasons: [], row: null, checkWith: null })
    const long = objectReading({
      object: { kind: 'subject', id: 's1', label: 'Looks & style', calibration: 'ready' },
      // Staging's pooled market, June to September (June and July under
      // 100 videos print counts).
      points: [{ month: '2026-06-01', k: 5, n: 50 }, { month: '2026-07-01', k: 4, n: 36 }, { month: '2026-08-01', k: 38, n: 377 }, { month: '2026-09-01', k: 103, n: 654 }],
    }, '2026-09-01', joined, '2026-10-02T06:00:00.000Z')
    const text = renderText(<AboutReadings readings={[long]} />)
    expect(text).toContain('Jul 4 of 36 · Aug 10% of 377 · Sep 16% of 654')
    expect(text).not.toContain('Jun')
  })

  it('keeps the copy contract', () => {
    assertAboutContract(<AboutReadings readings={[ready, provisional, brand, unread]} />)
  })
})

// Walkthrough item 4: "perception is mixed…" over findings measured at "0 of
// 360 videos", with "Open the 0 videos behind this" under them.
describe('an answer with too little behind it', () => {
  it('never offers the videos behind a finding that has none', () => {
    const d = agentFixture()
    const zero = { ...d.measure!, findings: d.measure!.findings.map((f) => ({ ...f, value: { ...f.value, k: 0 } })) }
    const text = renderText(
      <AnswerTile turn={d.turns[0]} turnIndex={0} measure={zero} />,
    )
    expect(text).not.toMatch(/Open the 0 videos/)
  })

  it('prints the product’s sentence in place of the lead, and no findings', () => {
    const d = agentFixture()
    const answer = d.turns[0].answer!
    const thin = { ...d.turns[0], answer: { ...answer, answer: '', grounded: [], judgement: [], fallback: 'There is too little in your market about this to answer it.' } }
    const text = renderText(<AnswerTile turn={thin} turnIndex={0} measure={null} />)
    expect(text).toContain('There is too little in your market about this to answer it.')
    expect(text).not.toContain('Open the')
    expect(text).not.toContain('What I’d take from that')
    expect(copyViolations(<AnswerTile turn={thin} turnIndex={0} measure={null} />)).toEqual([])
  })
})
