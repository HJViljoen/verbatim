import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { OSSUR_CLIENT_ID, SEALAND_CLIENT_ID } from '../config'
import {
  MAKER_WORDS, NOISE_TERMS, SEGMENTS_SQL_BEGIN, SEGMENTS_SQL_END, SEGMENT_RULE_VERSION,
  bareNameOnly, makerHaystack, makerPatternSource, makerWordIn, noiseTerms, segmentOf, segmentReason,
  segmentRulesEnabled, segmentsV1Sql,
} from './rules'

// The examples are the research's own (CQ F19–F23, staging, 24 Sep): the
// videos it hand-labelled and the searches that found them.

describe('the word lists are the research’s, unchanged', () => {
  it('maker words: CQ F23’s list, word for word', () => {
    expect(MAKER_WORDS).toEqual([
      'sew', 'sewing', 'costura', 'crochet', 'knit', 'uncinetto', 'ganchillo', 'tutorial', 'diy',
      'pattern', 'patterns', 'stitch', 'stitching', 'thrift flip', 'refashion', 'crafts', 'crafting',
      'quilting', 'embroidery', 'plarn', 'reciclaje', 'how to make', 'best out of waste', 'daur ulang',
      'kerajinan',
    ])
  })

  it('bare names: the eight the gate keeps 0–4% of (CQ F22)', () => {
    expect(NOISE_TERMS).toEqual(['poler', 'patagonia', 'cotopaxi', 'freitag', 'topo designs', 'sealand gear', '#sealandgear', 'sealandgear'])
    expect(SEGMENT_RULE_VERSION).toBe('segments_v1')
  })

  it('is switched on for Sealand and not for Össur (its non-buyer content is not making, CQ F43)', () => {
    expect(segmentRulesEnabled(SEALAND_CLIENT_ID)).toBe(true)
    expect(segmentRulesEnabled(OSSUR_CLIENT_ID)).toBe(false)
  })
})

describe('the maker rule', () => {
  it('reads caption, hashtags and topics, lowercased', () => {
    expect(makerHaystack({ caption: 'Jeans To Bag', hashtags: ['#Sewing'], topics: ['upcycling'] })).toBe('jeans to bag #sewing upcycling')
    expect(makerHaystack({})).toBe('  ')
  })

  it('matches whole words only, the first one the text names', () => {
    expect(makerWordIn('turning old jeans into a crossbody bag, diy tutorial')).toBe('diy')
    expect(makerWordIn('#diy #upcycled')).toBe('diy')
    expect(makerWordIn('free crochet pattern')).toBe('crochet')
    expect(makerWordIn('three patterns for a tote')).toBe('patterns')
    expect(makerWordIn('how to make a bag from a scarf')).toBe('how to make')
    expect(makerWordIn('best out of waste: plastic bottle bag')).toBe('best out of waste')
    expect(makerWordIn('tas kerajinan daur ulang')).toBe('kerajinan')
    expect(makerWordIn('stitching the lining')).toBe('stitching')
  })

  it('does not match inside a longer word: the research’s regex was word-bounded', () => {
    expect(makerWordIn('#diybag #crochetbag')).toBeNull()
    expect(makerWordIn('knitting a bag')).toBeNull()
    expect(makerWordIn('the sewn seams of my patagonia fishing shirt')).toBeNull()
    expect(makerWordIn('a craft beer and a backpack')).toBeNull()
    expect(makerWordIn('handmade bag for sale')).toBeNull()
  })

  it('states the same word class to both engines, so Postgres and JavaScript agree', () => {
    expect(makerPatternSource()).toMatch(/^\(\^\|\[\^a-z0-9_\]\)\(sew\|sewing\|/)
    expect(() => makerPatternSource(['señor'])).toThrow(/plain lowercase ASCII/)
    // A non-ASCII letter beside a word is a boundary on both sides of the rule.
    expect(makerWordIn('diyé'.replace('é', 'é'))).toBe('diy')
  })
})

describe('the noise rule', () => {
  it('needs EVERY first-found term to be a bare name (poker via poler, Ecuador politics via cotopaxi)', () => {
    expect(bareNameOnly(['poler'])).toBe('poler')
    expect(bareNameOnly(['Cotopaxi ', 'patagonia'])).toBe('cotopaxi')
    expect(bareNameOnly(['sealand gear', '#sealandgear'])).toBe('sealand gear')
    expect(bareNameOnly(['sealand gear', 'travel gear'])).toBeNull()
    expect(bareNameOnly(['cotopaxi backpack'])).toBeNull()
    expect(bareNameOnly([])).toBeNull()
  })

  it('reads the first-found terms where provenance holds any, else source_keywords', () => {
    expect(noiseTerms(['upcycled bag'], ['poler'])).toEqual(['upcycled bag'])
    expect(noiseTerms([], ['poler'])).toEqual(['poler'])
    expect(noiseTerms(null, null)).toEqual([])
  })
})

describe('segmentReason', () => {
  it('names the maker word first, then a bare name, else the market', () => {
    expect(segmentReason({ caption: 'Jeans to bag sewing tutorial', sourceKeywords: ['upcycled bag'] })).toBe('maker_regex:sewing')
    // Maker is decided first: CQ F25 counted names among videos the maker rule had not flagged.
    expect(segmentReason({ caption: 'crochet a tote', sourceKeywords: ['poler'] })).toBe('maker_regex:crochet')
    expect(segmentReason({ caption: 'Navy SEAL podcast', sourceKeywords: ['sealand gear'] })).toBe('bare_name_only:sealand gear')
    expect(segmentReason({ caption: 'Navy SEAL podcast', firstTerms: ['handmade bag'], sourceKeywords: ['sealand gear'] })).toBeNull()
    expect(segmentReason({ caption: 'r/onebag: which daypack for Japan', sourceKeywords: ['r/onebag'] })).toBeNull()
  })

  it('maps a reason to its segment', () => {
    expect(segmentOf({ caption: 'DIY', sourceKeywords: [] })).toBe('maker')
    expect(segmentOf({ caption: 'Friday news', sourceKeywords: ['freitag'] })).toBe('noise')
    expect(segmentOf({ caption: 'Freitag F52 review', sourceKeywords: ['freitag bag'] })).toBe('market')
  })
})

describe('the SQL copy in MF1 is generated from this file', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/20260928090000_market_first_s1.sql', import.meta.url), 'utf8')

  it('holds exactly segmentsV1Sql() between the markers', () => {
    const start = sql.indexOf(SEGMENTS_SQL_BEGIN)
    const end = sql.indexOf(SEGMENTS_SQL_END)
    expect(start, 'the generated block is missing from the migration').toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    expect(sql.slice(start, end + SEGMENTS_SQL_END.length)).toBe(segmentsV1Sql())
  })

  it('carries every maker word and every bare name', () => {
    const block = segmentsV1Sql()
    expect(block).toContain(makerPatternSource())
    for (const t of NOISE_TERMS) expect(block).toContain(`'${t}'`)
  })
})
