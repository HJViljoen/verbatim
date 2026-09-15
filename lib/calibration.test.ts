import { describe, it, expect } from 'vitest'
import { SHARE_BAND } from './report-bands'
import { DIRECTION_WORDS, READER_FLAGS, THIRTEEN_WORDS, directionHits, evidenceOf, glossaryRule, quotedSpans } from './calibration'

describe('evidenceOf — every number carries its denominator (Tier 1)', () => {
  it('renders the shape this module promised and never shipped', () => {
    expect(evidenceOf(21, 36)).toBe('21 of 36 conversations')
  })

  it('takes a noun, because not everything is a conversation', () => {
    expect(evidenceOf(3, 120, 'mentions')).toBe('3 of 120 mentions')
  })

  it('omits a denominator rather than inventing one', () => {
    expect(evidenceOf(5, null)).toBe('5 conversations')
    expect(evidenceOf(5, 0)).toBe('5 conversations')
    expect(evidenceOf(5, undefined)).toBe('5 conversations')
  })

  it('refuses a denominator smaller than the count instead of printing nonsense', () => {
    // "7 of 3" would be worse than no denominator at all.
    expect(evidenceOf(7, 3)).toBe('7 conversations')
  })

  it('groups thousands so a big corpus stays readable', () => {
    expect(evidenceOf(1204, 18440)).toBe('1,204 of 18,440 conversations')
  })
})

describe('the thirteen words', () => {
  it('are all in the glossary, in the design’s order', () => {
    expect([...THIRTEEN_WORDS]).toEqual([
      'update', 'month', 'week', 'video', 'audience', 'subject', 'theme', 'kind',
      'rival', 'move', 'level', 'change', 'direction',
    ])
    for (const key of THIRTEEN_WORDS) expect(glossaryRule(key).length).toBeGreaterThan(20)
  })

  it('carry the two flags beside them, and a flag is never a direction', () => {
    expect([...READER_FLAGS]).toEqual(['new', 'gone_quiet'])
    expect(glossaryRule('gone_quiet')).toContain('a flag, not a direction')
  })

  it('define the unit by the month a comment was written in', () => {
    // The unit the whole reading rests on: a video belongs to a month because
    // someone commented under it that month, so it can belong to two.
    expect(glossaryRule('video')).toContain('written under it that month')
  })

  it('leave the legacy noun month-free, because the figures behind it are not', () => {
    // `conversations` is the tooltip on dominant / widespread and on the
    // Dashboard's video total — all computed per RUN over the cumulative
    // corpus. A month-scoped definition there describes a figure nothing
    // computes month by month.
    expect(glossaryRule('conversations')).not.toContain('that month')
    expect(glossaryRule('dominant')).not.toContain('month')
  })

  it('state the band’s real floors, because copy claims must match code', () => {
    expect(glossaryRule('change')).toContain('100 videos a side')
    expect(glossaryRule('change')).toContain('10 of the object’s own')
    expect(SHARE_BAND.minN).toBe(100)
    expect(SHARE_BAND.minK).toBe(10)
  })

  it('say a direction is earned over three readings, which is what the code does', () => {
    expect(glossaryRule('direction')).toContain('three consecutive monthly readings')
  })
})

describe('directionHits — the scrubber’s match list, calibrated on production prose', () => {
  it('is one list, and it is not the magnitude list', () => {
    // growing and increasing are the only two members of both (measured).
    const magnitude = ['very', 'huge', 'strong', 'most', 'many', 'vast', 'widespread']
    expect(DIRECTION_WORDS.filter((w) => magnitude.includes(w))).toEqual([])
    expect(DIRECTION_WORDS).toContain('growing')
    expect(DIRECTION_WORDS).toContain('increasing')
  })

  it('catches the four sentences the first list failed open on', () => {
    // Each returned [] before the families were listed whole, and each was kept
    // whole by scrubProse and reached the reader under the word Interpretation.
    expect(directionHits('Objections have grown this month.')).toContain('grown')
    expect(directionHits('Durability has dropped away.')).toContain('dropped')
    expect(directionHits('Praise improved across the category.')).toContain('improved')
    expect(directionHits('Interest spiked after the launch.')).toContain('spiked')
  })

  it('lists every family whole — the hole the first pass left', () => {
    // A family with one inflection missing is a family the rule fails open on.
    const families = [
      ['grow', 'growing', 'grew', 'grown', 'grows'],
      ['drop', 'dropping', 'dropped', 'drops'],
      ['improve', 'improving', 'improved', 'improves'],
      ['worsen', 'worsening', 'worsened', 'worsens'],
      ['jump', 'jumping', 'jumped', 'jumps'],
      ['spike', 'spiking', 'spiked', 'spikes'],
      ['slip', 'slipping', 'slipped', 'slips'],
      ['trend', 'trending', 'trended', 'trends'],
    ]
    for (const family of families) {
      for (const word of family) expect(DIRECTION_WORDS).toContain(word)
    }
  })

  it('keeps the two bare stems that collide with honest copy out', () => {
    // "comments that fall outside the window" is the product's own sentence.
    expect(DIRECTION_WORDS).not.toContain('fall')
    expect(DIRECTION_WORDS).not.toContain('rise')
  })

  it('finds the product’s own three', () => {
    expect(directionHits('Durability is growing and comfort is fading.')).toEqual(['growing', 'fading'])
    expect(directionHits('The share has been flat since June.')).toEqual(['flat'])
  })

  it('finds the words a model reaches for instead — the ones MAGNITUDE_WORDS misses', () => {
    for (const probe of ['Attention to the rival has been rising for three months.',
      'Interest is trending toward the rival.',
      'Momentum moved toward the rival this month.',
      'Price talk is declining.',
      'The category is gaining on you.',
      'Talk about fit held steady.']) {
      expect(directionHits(probe).length).toBeGreaterThan(0)
    }
  })

  // Class 1 (measured): 2 of 51 stored executive-brief beats contain "up", and
  // both are verb particles. A bare `up` in the list deletes correct prose.
  it('does not read a verb particle as a measurement', () => {
    expect(directionHits('unless Össur shows up with clearer education')).toEqual([])
    expect(directionHits('category discovery is happening outside Össur unless it shows up earlier')).toEqual([])
    expect(directionHits('Buyers bring up the socket before the price.')).toEqual([])
  })

  it('does read up and down inside a movement frame', () => {
    expect(directionHits('Positive sentiment moved up since the previous update.')).toEqual(['up'])
    expect(directionHits('The rival’s share is down from August.')).toEqual(['down'])
    expect(directionHits('The category ran up 4 points.')).toEqual(['up'])
  })

  // Class 2 (measured): 49 of 8,192 theme descriptions carry a direction word
  // that describes the SUBJECT. Those are held off by the policy table, not by
  // the word list — but the flag-shaped `new` is common enough to frame here.
  it('does not read the ordinary adjective "new" as the flag', () => {
    expect(directionHits('People ask about the new socket before the price.')).toEqual([])
    expect(directionHits('Riders new to the category ask the same question.')).toEqual([])
    expect(directionHits('This theme is new this month.')).toEqual(['new'])
  })

  // Class 3 (measured, and live): the magnitude strip deletes `vast` from
  // inside the Dutch "dat staat vast" because it reaches inside a quotation.
  it('never reaches inside a quotation', () => {
    expect(directionHits('A Dutch buyer put it as "dat staat vast", which is the strongest form of agreement.')).toEqual([])
    expect(directionHits('One owner wrote: “my socket keeps rising off the stump”.')).toEqual([])
    // The claim outside the quote still counts.
    expect(directionHits('Attention is fading, and one owner wrote “it keeps rising”.')).toEqual(['fading'])
  })

  // A POSSESSIVE AND A CONTRACTION ARE NOT A QUOTATION. Measured on the shipped
  // code before this was fixed: every one of these returned [] and shipped with
  // leaked:false, because `'s … it'` read as a quoted span.
  it('does not read a possessive and a contraction as a quotation', () => {
    expect(directionHits("The theme's share is growing, and it's clear buyers care.")).toEqual(['growing'])
    expect(directionHits("Durability's profile is fading, but it's early.")).toEqual(['fading'])
    expect(quotedSpans("The brand's many buyers said it's fine.")).toEqual([])
  })

  it('still reads a straight single quote that stands on its own as one', () => {
    expect(quotedSpans("A buyer put it as 'dat staat vast' and moved on.")).toEqual([[18, 34]])
    expect(directionHits("A buyer put it as 'the socket keeps rising' and moved on.")).toEqual([])
  })

  it('returns spans in order and never overlapping, so a word strip can walk them', () => {
    const spans = quotedSpans(`He said "it is 'fine' either way" and left.`)
    expect(spans).toEqual([[8, 33]])
  })

  it('reports each word once, in the order it was found', () => {
    expect(directionHits('Growing, growing, and then fading.')).toEqual(['growing', 'fading'])
  })

  it('is empty for prose that makes no directional claim', () => {
    expect(directionHits('People ask the price of the 3R78 before purchase.')).toEqual([])
    expect(directionHits('')).toEqual([])
  })
})
