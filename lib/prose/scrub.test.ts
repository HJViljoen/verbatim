import { describe, expect, it } from 'vitest'

import type { Verdict } from '../reading/verdicts'
import type { FigureTable } from '../reports/types'

import {
  INTERPRETATION_SLOTS,
  PROSE_POLICY,
  PROSE_SLOTS,
  allowTokens,
  dropDigitSentences,
  dropUnverdictedDirection,
  isInterpretation,
  replaceOutsideQuotes,
  scrubProse,
} from './scrub'

const figures: FigureTable = {
  videos: { label: 'conversations analysed', value: '374', kind: 'count' },
  share_pct: { label: 'share of the tracked conversation', value: '11%', kind: 'pct' },
}

const verdict = (label: string, direction: Verdict['direction']): Verdict => ({
  objectKind: 'theme',
  objectId: 'reg-1',
  objectLabel: label,
  audience: 'client',
  window: { kind: 'month', from: '2026-09-01', to: '2026-10-01' },
  value: { k: 3, n: 28 },
  changePts: null,
  bandPts: null,
  state: 'moved',
  direction,
  flags: [],
})

describe('dropDigitSentences — one implementation of the rule that was written three times', () => {
  it('keeps a sentence that names its figure by key', () => {
    const out = dropDigitSentences('It rests on [[videos]] conversations.', figures)
    expect(out.text).toBe('It rests on [[videos]] conversations.')
    expect(out.dropped).toBe(0)
    expect(out.leaked).toBe(false)
  })

  it('drops the whole sentence when the model typed a number of its own', () => {
    const out = dropDigitSentences('Ottobock drew 82 videos. The fit came up often.', figures)
    expect(out.text).toBe('The fit came up often.')
    expect(out.droppedDigits).toBe(1)
    expect(out.leaked).toBe(true)
  })

  it('drops a sentence citing a key the table does not hold', () => {
    const out = dropDigitSentences('Share reached [[share_of_voice_pct]] this month.', figures)
    expect(out.text).toBe('')
    expect(out.dropped).toBe(1)
  })

  // Probe from the research: without an allow-list the cover's scrubber deletes
  // every sentence that names a product with a digit in its name. The writer's
  // allow-list was the only one that had ever heard of 3R78; now it is shared.
  it('lets a digit-bearing product NAME through when the run carries it', () => {
    const raw = 'People ask the price of the 3R78 before purchase.'
    expect(dropDigitSentences(raw, figures).text).toBe('')
    const allow = allowTokens(['The 3R78 pneumatic knee and the C-Leg 4'])
    expect(dropDigitSentences(raw, figures, { allow }).text).toBe(raw)
  })

  // Probe from the research, and a live defect: the magnitude strip deletes
  // `vast` from inside "dat staat vast" because `vast` is an English magnitude
  // adjective and a Dutch verb particle.
  it('never reaches inside a quotation', () => {
    const raw = 'A Dutch buyer put it as "dat staat vast", which is the strongest form of agreement in that market.'
    const out = dropDigitSentences(raw, figures)
    expect(out.text).toBe(raw)
    expect(out.leaked).toBe(false)
  })

  it('still strips a magnitude word outside the quotation', () => {
    const out = dropDigitSentences('Many buyers said "dat staat vast".', figures)
    expect(out.text).toBe('buyers said "dat staat vast".')
    expect(out.leaked).toBe(true)
  })

  it('still refuses a number inside a quotation, because a figure is ours either way', () => {
    const out = dropDigitSentences('One owner wrote "only 1.1% of us are served".', figures)
    expect(out.text).toBe('')
    expect(out.droppedDigits).toBe(1)
  })

  it('drops a sentence with nothing left in it after the strip', () => {
    expect(dropDigitSentences('[[videos]].', figures).dropped).toBe(1)
  })
})

describe('dropUnverdictedDirection — the rule that did not exist', () => {
  it('drops a direction claim nothing earned', () => {
    const out = dropUnverdictedDirection('Durability is growing. People ask about the fit.')
    expect(out.text).toBe('People ask about the fit.')
    expect(out.droppedDirection).toBe(1)
    expect(out.leaked).toBe(true)
  })

  it('keeps one whose object earned a direction over three readings', () => {
    const raw = 'Durability is growing across the category.'
    expect(dropUnverdictedDirection(raw, [verdict('durability', 'growing')]).text).toBe(raw)
  })

  // A verdict is not a licence. `moved` answers "did it move?"; only three
  // consecutive readings under one grouping say which way (lib/reading/verdicts.ts).
  it('does not let a verdict without a direction license the word', () => {
    expect(dropUnverdictedDirection('Durability is growing.', [verdict('durability', null)]).text).toBe('')
  })

  it('drops a direction claim that names no object at all', () => {
    expect(dropUnverdictedDirection('Attention is fading.', [verdict('durability', 'fading')]).text).toBe('')
  })

  it('is a sentence drop, never a word delete — the magnitude strip’s failure mode', () => {
    // "The durability conversation is, and the comfort one is fading." is what
    // a word-delete leaves on the page. A drop degrades honestly.
    const out = dropUnverdictedDirection('The durability conversation is growing, and the comfort one is fading.')
    expect(out.text).toBe('')
    expect(out.text).not.toContain('conversation is,')
  })

  // One earned label used to licence every direction word beside it, so this
  // sentence shipped an unearned claim about fit on durability's verdict.
  it('does not let one earned object license a second object’s direction', () => {
    const out = dropUnverdictedDirection('Durability is growing and fit is fading.', [verdict('durability', 'growing')])
    expect(out.text).toBe('')
    expect(out.droppedDirection).toBe(1)
  })

  // WHY `agent_answer` IS IN THE POLICY TABLE AND STILL DRIVES NOTHING (see the
  // docblock). Calibration class 2 on a conversational slot: in an analyst's
  // prose about what people SAID, the direction words are the subject. All
  // three sentences below are verbatim from production's stored agent answers,
  // and the word that condemns each is a noun, a comparative adjective and a
  // product category — `falls`, `stronger`, `lower`. Replayed over all 101
  // stored strings the rule drops 11 of 135 sentences and empties 8 answers,
  // none of which carries a movement claim; pinned here so the cost of wiring
  // that slot is a failing expectation rather than an argument.
  it('cannot tell a subject word from a reading, which is what holds a conversational slot off', () => {
    for (const raw of [
      'Instability is part of both daily life and athletic participation, with falls and balance challenges showing up as real parts of living with a prosthesis.',
      'On awareness, the stronger signal is not that people are unaware prostheses exist, but that they lack practical guidance on where to go.',
      'The primary target should be people choosing a first or replacement lower-limb prosthesis.',
    ]) {
      expect(dropUnverdictedDirection(raw, []).text).toBe('')
    }
  })

  it('keeps a sentence where every directional clause names its own earned object', () => {
    const raw = 'Durability is growing and fit is fading.'
    const verdicts = [verdict('durability', 'growing'), verdict('fit', 'fading')]
    expect(dropUnverdictedDirection(raw, verdicts).text).toBe(raw)
  })

  it('does not split on a bare comma, which brackets an apposition as often as a clause', () => {
    const raw = 'Durability, the theme buyers keep returning to, is growing.'
    expect(dropUnverdictedDirection(raw, [verdict('durability', 'growing')]).text).toBe(raw)
  })

  it('keeps a licensed claim beside a clause that makes no directional one', () => {
    const raw = 'Durability is growing, and buyers ask about the fit.'
    expect(dropUnverdictedDirection(raw, [verdict('durability', 'growing')]).text).toBe(raw)
  })

  // Probe from the research: 49 of 8,192 theme descriptions use a direction
  // word about the SUBJECT. The word list cannot tell those apart, so the slot
  // policy does — and this is the sentence that proves the policy matters.
  it('would drop a descriptive label, which is why a theme’s own words are never direction-scrubbed', () => {
    const descriptive = 'Fans are frustrated by fielding errors that change momentum.'
    expect(dropUnverdictedDirection(descriptive).dropped).toBe(1)
    expect(scrubProse('pass_b_theme', descriptive).text).toBe(descriptive)
  })
})

describe('replaceOutsideQuotes', () => {
  it('replaces outside a quotation and leaves the inside alone', () => {
    expect(replaceOutsideQuotes('most people said "most of us"', /\bmost\b/gi, 'X')).toBe('X people said "most of us"')
  })
  it('is an ordinary replace when there is no quotation', () => {
    expect(replaceOutsideQuotes('most people', /\bmost\b/gi, 'X')).toBe('X people')
  })
})

describe('the policy table — every prose slot is listed with its policy', () => {
  // Sixteen model calls write client-facing prose and five of them ran any
  // scrubber. "Extended to every prose slot" is only checkable if the slots
  // are written down; a new call adds itself here or it does not ship.
  const EXPECTED: Record<string, string> = {
    pass_a_audience_insight: 'digits',
    pass_b_theme: 'none',
    pass_c_finding: 'digits',
    pass_d_a_insight: 'digits',
    pass_d_a_consumer_summary: 'digits',
    pass_d_a_brief: 'both',
    pass_d_a_say_vs_hear: 'digits',
    pass_d_b_recommendation: 'digits',
    pass_e_persona: 'digits',
    step_2c_event_explanation: 'digits',
    agent_answer: 'both',
    agent_interpret: 'none',
    ask_extract_title: 'digits',
    ask_verdict: 'digits',
    ask_judge: 'digits',
    report_cover: 'both',
    document_write: 'digits',
    interpretation_monthly: 'both',
    interpretation_quarterly: 'both',
    interpretation_anomaly: 'both',
  }

  it('is total: every slot has a policy and every policy has a slot', () => {
    expect(Object.keys(PROSE_POLICY).sort()).toEqual([...PROSE_SLOTS].sort())
    for (const slot of PROSE_SLOTS) expect(PROSE_POLICY[slot]).toBe(EXPECTED[slot])
  })

  it('names three interpretation slots, and only those three may argue', () => {
    expect([...INTERPRETATION_SLOTS]).toEqual(['interpretation_monthly', 'interpretation_quarterly', 'interpretation_anomaly'])
    for (const slot of PROSE_SLOTS) {
      expect(isInterpretation(slot)).toBe(EXPECTED[slot] === 'both' && slot.startsWith('interpretation_'))
    }
  })

  it('gives every interpretation slot both rules — they are the slots handed verdicts', () => {
    for (const slot of INTERPRETATION_SLOTS) expect(PROSE_POLICY[slot]).toBe('both')
  })

  it('exempts only the theme slot and the agent’s own planning call', () => {
    expect(PROSE_SLOTS.filter((s) => PROSE_POLICY[s] === 'none')).toEqual(['pass_b_theme', 'agent_interpret'])
  })
})

describe('scrubProse', () => {
  it('runs the digit rule only where the policy says digits', () => {
    const raw = 'Ottobock drew 82 videos. Durability is growing.'
    expect(scrubProse('pass_c_finding', raw, { figures }).text).toBe('Durability is growing.')
  })

  it('runs both rules on an interpretation slot, digits first', () => {
    const out = scrubProse('interpretation_monthly', 'Ottobock drew 82 videos. Durability is growing.', { figures })
    expect(out.text).toBe('')
    expect(out.droppedDigits).toBe(1)
    expect(out.droppedDirection).toBe(1)
    expect(out.dropped).toBe(2)
  })

  it('keeps an interpretation sentence built from a verdict that earned its word', () => {
    const raw = 'Durability is growing, and it now runs at [[share_pct]] of the category.'
    const out = scrubProse('interpretation_monthly', raw, { figures, verdicts: [verdict('durability', 'growing')] })
    expect(out.text).toBe(raw)
    expect(out.dropped).toBe(0)
  })

  it('leaves a theme’s own words alone', () => {
    const raw = 'Practical skills like growing food come up alongside repair.'
    expect(scrubProse('pass_b_theme', raw).text).toBe(raw)
  })

  // `none` is documented as "handles are stripped and nothing else", and the
  // strip used to live one level up in `slotScrubber` — so a caller reaching
  // scrubProse directly got a documented strip that never ran.
  it('strips handles under every policy, none included', () => {
    expect(scrubProse('pass_b_theme', 'Fit and price [T4] lead.').text).toBe('Fit and price lead.')
    expect(scrubProse('pass_c_finding', 'Fit and price (T4, T12) lead.', { figures }).text).toBe('Fit and price lead.')
  })

  it('answers an empty string with an empty result rather than a dropped sentence', () => {
    expect(scrubProse('report_cover', '   ')).toEqual({ text: '', dropped: 0, droppedDigits: 0, droppedDirection: 0, flaggedDirection: 0, leaked: false })
  })

  // A `digits` slot keeps the sentence AND reports it. Before this the prompt
  // banned the word, nothing enforced the ban, and nothing counted a breach —
  // so the only evidence a prompt had started claiming movement was a reader
  // finding it. The number goes into the call's ai_call_log response.
  it('counts an unearned direction on a digits slot instead of deleting it', () => {
    const out = scrubProse('pass_d_b_recommendation', 'Durability is growing. Buyers ask about fit.', { figures })
    expect(out.text).toBe('Durability is growing. Buyers ask about fit.')
    expect(out.droppedDirection).toBe(0)
    expect(out.flaggedDirection).toBe(1)
    expect(out.leaked).toBe(false)
  })

  it('does not count one an earned verdict licenses', () => {
    const out = scrubProse('pass_d_b_recommendation', 'Durability is growing.', { figures, verdicts: [verdict('durability', 'growing')] })
    expect(out.flaggedDirection).toBe(0)
  })

  it('counts nothing on a slot whose words are the model\u2019s by right', () => {
    expect(scrubProse('pass_b_theme', 'Practical skills like growing food come up.').flaggedDirection).toBe(0)
  })
})
