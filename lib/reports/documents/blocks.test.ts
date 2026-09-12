import { describe, expect, it } from 'vitest'
import {
  BRIEF_ANCHORS_MAX,
  CONTENT_BRIEF,
  CUSTOM_BRIEF,
  CUSTOM_KEY,
  DOCUMENT_BLOCKS,
  DOCUMENT_STARTERS,
  DOCUMENT_TEMPLATES,
  LEADERSHIP_BRIEF,
  MARKET_BRIEF,
  PAGE_FIELDS,
  PAGE_TITLE,
  SALES_BRIEF,
  blockKeysFor,
  briefAnchors,
  composeAnchors,
  composeSkeleton,
  documentTemplate,
  promptVersion,
  resolveTemplate,
  skeletonOrder,
} from './templates'
import { DEFAULT_DOCUMENT_SETTINGS, DOCUMENT_BLOCK_KEYS, documentSettings, type DocumentSettings } from './types'
import { applyDocumentSettingsPatch, documentSettingsPatch, CUSTOM_ONLY_FIELDS } from '../validate'
import { DOCUMENT_BRIEF_MAX } from '../../config'

const settings = (patch: Partial<DocumentSettings> = {}): DocumentSettings => ({ ...DEFAULT_DOCUMENT_SETTINGS, ...patch })

describe('the topic blocks', () => {
  it('is a question set plus the pages that answer it, never part of a page', () => {
    for (const key of DOCUMENT_BLOCK_KEYS) {
      const b = DOCUMENT_BLOCKS[key]
      expect(b.key, key).toBe(key)
      expect(b.title, key).toBeTruthy()
      expect(b.description, key).toBeTruthy()
      expect(b.anchors.length, key).toBeGreaterThan(0)
      expect(b.skeleton.length, key).toBeGreaterThan(0)
      // Whole pages the product already prints: no block invents a page kind
      // and no block prints the opening or the closing.
      for (const p of b.skeleton) {
        expect(PAGE_TITLE[p.kind], `${key}/${p.kind}`).toBeTruthy()
        expect(PAGE_FIELDS[p.kind].length, `${key}/${p.kind}`).toBeGreaterThan(0)
        expect(['in_short', 'finding', 'method'], `${key}/${p.kind}`).not.toContain(p.kind)
      }
    }
  })

  it('is cut from the four templates: every anchor is one of theirs, by identity', () => {
    const theirs = new Set(DOCUMENT_TEMPLATES.flatMap((t) => t.anchors))
    for (const key of DOCUMENT_BLOCK_KEYS) {
      for (const a of DOCUMENT_BLOCKS[key].anchors) expect(theirs.has(a), `${key}/${a.id}`).toBe(true)
    }
    expect(DOCUMENT_BLOCKS.competitive_analysis.anchors).toEqual(SALES_BRIEF.anchors.filter((a) => a.perCompetitor))
    expect(DOCUMENT_BLOCKS.content_performance.anchors.map((a) => a.id)).toEqual(['unanswered', 'watch', 'more'])
    expect(DOCUMENT_BLOCKS.market_movement.anchors.map((a) => a.id)).toEqual(['shifting', 'switch', 'doubt'])
  })

  it('writes no dashes between clauses in the copy the picker shows', () => {
    for (const key of DOCUMENT_BLOCK_KEYS) {
      expect(`${DOCUMENT_BLOCKS[key].title} ${DOCUMENT_BLOCKS[key].description}`, key).not.toMatch(/[—–]/)
    }
  })
})

describe('the custom brief', () => {
  it('opens and closes like every other brief and declares nothing in between', () => {
    expect(skeletonOrder(CUSTOM_BRIEF)).toEqual(['in_short', 'finding', 'method'])
    expect(CUSTOM_BRIEF.anchors).toEqual([])
    expect(promptVersion(CUSTOM_BRIEF)).toBe('custom_v1')
  })

  it('is offered beside the four without joining them', () => {
    expect(DOCUMENT_TEMPLATES.map((t) => t.key)).toEqual(['sales_brief', 'leadership_brief', 'market_brief', 'content_brief'])
    expect(DOCUMENT_STARTERS.map((t) => t.key)).toEqual([...DOCUMENT_TEMPLATES.map((t) => t.key), CUSTOM_KEY])
    expect(documentTemplate(CUSTOM_KEY)).toBe(CUSTOM_BRIEF)
    expect(documentTemplate('sales_brief')).toBe(SALES_BRIEF)
  })
})

describe('composeSkeleton', () => {
  it('with no blocks is the template it was given, unchanged', () => {
    for (const t of DOCUMENT_TEMPLATES) expect(composeSkeleton(t, settings()), t.key).toBe(t.skeleton)
    expect(composeSkeleton(CUSTOM_BRIEF, settings())).toBe(CUSTOM_BRIEF.skeleton)
    expect(composeSkeleton(CUSTOM_BRIEF, settings({ blocks: [] }))).toBe(CUSTOM_BRIEF.skeleton)
  })

  it('puts the blocks between the opening and the closing, in the chosen order', () => {
    const s = settings({ blocks: ['consumer_profiles', 'competitive_analysis'] })
    expect(composeSkeleton(CUSTOM_BRIEF, s).map((p) => p.kind)).toEqual(['in_short', 'finding', 'personas', 'competitor', 'method'])
    const other = settings({ blocks: ['competitive_analysis', 'consumer_profiles'] })
    expect(composeSkeleton(CUSTOM_BRIEF, other).map((p) => p.kind)).toEqual(['in_short', 'finding', 'competitor', 'personas', 'method'])
  })

  it('carries a block page\'s repeat with it', () => {
    const pages = composeSkeleton(CUSTOM_BRIEF, settings({ blocks: ['competitive_analysis'] }))
    expect(pages.find((p) => p.kind === 'competitor')?.repeat).toBe('competitors')
  })

  it('adds every page of a two page block', () => {
    const kinds = composeSkeleton(CUSTOM_BRIEF, settings({ blocks: ['market_movement', 'content_performance'] })).map((p) => p.kind)
    expect(kinds).toEqual(['in_short', 'finding', 'standing', 'say_hear', 'asked', 'language', 'method'])
  })

  it('never adds a page the template already prints', () => {
    // The sales brief prints competitor and personas pages of its own.
    const s = settings({ blocks: ['competitive_analysis', 'consumer_profiles'] })
    expect(composeSkeleton(SALES_BRIEF, s)).toBe(SALES_BRIEF.skeleton)
    const kinds = composeSkeleton(SALES_BRIEF, settings({ blocks: ['competitive_analysis', 'market_movement'] })).map((p) => p.kind)
    expect(kinds).toEqual(['in_short', 'finding', 'competitor', 'personas', 'language', 'standing', 'say_hear', 'method'])
  })

  it('takes the template\'s own default blocks when the report names none', () => {
    const withDefault = { ...CUSTOM_BRIEF, blocks: ['consumer_profiles' as const] }
    expect(composeSkeleton(withDefault, settings()).map((p) => p.kind)).toEqual(['in_short', 'finding', 'personas', 'method'])
    // The report's own selection wins over the template's default.
    expect(composeSkeleton(withDefault, settings({ blocks: ['competitive_analysis'] })).map((p) => p.kind))
      .toEqual(['in_short', 'finding', 'competitor', 'method'])
    expect(blockKeysFor(withDefault, settings())).toEqual(['consumer_profiles'])
  })

  it('a duplicate block is included once, and rejected before it is stored', () => {
    const s = { ...DEFAULT_DOCUMENT_SETTINGS, blocks: ['competitive_analysis', 'competitive_analysis'] } as DocumentSettings
    expect(composeSkeleton(CUSTOM_BRIEF, s).map((p) => p.kind)).toEqual(['in_short', 'finding', 'competitor', 'method'])
    expect(documentSettingsPatch.safeParse({ blocks: ['competitive_analysis', 'competitive_analysis'] }).success).toBe(false)
    expect(documentSettings({ blocks: ['competitive_analysis', 'competitive_analysis', 'nope'] as never }).blocks).toEqual(['competitive_analysis'])
  })
})

describe('briefAnchors', () => {
  it('turns the operator\'s own instruction into the researcher\'s question', () => {
    const [q, ...rest] = briefAnchors('Review how the conversation about comfort and fit moved this month, for the marketing lead')
    expect(rest).toEqual([])
    expect(q.id).toBe('brief1')
    expect(q.text).toContain('Review how the conversation about comfort and fit moved this month, for the marketing lead.')
    expect(q.text).toContain('What does the conversation show about that')
  })

  it('asks one question per sentence, three at most, and nothing at all without a brief', () => {
    expect(briefAnchors('')).toEqual([])
    expect(briefAnchors(null)).toEqual([])
    expect(briefAnchors('   ')).toEqual([])
    const many = briefAnchors('Cover the athlete campaign. Say what landed. Say what did not. And a fourth sentence here.')
    expect(many).toHaveLength(BRIEF_ANCHORS_MAX)
    expect(many.map((a) => a.id)).toEqual(['brief1', 'brief2', 'brief3'])
    expect(many[1].text).toContain('Say what landed.')
  })
})

describe('composeAnchors', () => {
  it('with no brief and no block is the template\'s own anchors, unchanged', () => {
    for (const t of DOCUMENT_TEMPLATES) expect(composeAnchors(t, settings()), t.key).toBe(t.anchors)
  })

  it('asks the brief first, then the blocks, once each', () => {
    const s = settings({ brief: 'Review how comfort moved this month.', blocks: ['competitive_analysis', 'consumer_profiles'] })
    expect(composeAnchors(CUSTOM_BRIEF, s).map((a) => a.id)).toEqual(['brief1', 'competitor', 'owners', 'trigger'])
  })

  it('never asks a question the template already asks', () => {
    // The sales brief owns 'competitor', 'owners' and 'trigger' already.
    const s = settings({ blocks: ['competitive_analysis', 'consumer_profiles'] })
    expect(composeAnchors(SALES_BRIEF, s).map((a) => a.id)).toEqual(SALES_BRIEF.anchors.map((a) => a.id))
  })

  it('takes the caller\'s brief questions when it is given them', () => {
    const s = settings({ brief: 'ignored because the caller asked its own' })
    const ids = composeAnchors(CUSTOM_BRIEF, s, [{ id: 'brief1', text: 'A question the caller wrote.' }]).map((a) => a.id)
    expect(ids).toEqual(['brief1'])
  })
})

describe('resolveTemplate', () => {
  it('leaves the four templates exactly as they are', () => {
    for (const t of DOCUMENT_TEMPLATES) expect(resolveTemplate(t, settings()), t.key).toBe(t)
  })

  it('writes a custom brief in the role the operator picked, keeping its own key', () => {
    const t = resolveTemplate(CUSTOM_BRIEF, settings({ role: 'market_brief', brief: 'Review the athlete campaign.', blocks: ['competitive_analysis'] }))
    expect(t.key).toBe(CUSTOM_KEY)
    expect(promptVersion(t)).toBe('custom_v1')
    expect(t.role).toBe(MARKET_BRIEF.role)
    expect(t.lens).toBe(MARKET_BRIEF.lens)
    expect(t.audience).toBe(MARKET_BRIEF.audience)
    expect(t.readerNoun).toBe(MARKET_BRIEF.readerNoun)
    expect(t.findingsMax).toBe(MARKET_BRIEF.findingsMax)
    expect(skeletonOrder(t)).toEqual(['in_short', 'finding', 'competitor', 'method'])
    expect(t.anchors.map((a) => a.id)).toEqual(['brief1', 'competitor'])
  })

  it('defaults to the leadership role when the operator picked none', () => {
    const t = resolveTemplate(CUSTOM_BRIEF, settings())
    expect(t.role).toBe(LEADERSHIP_BRIEF.role)
    expect(t.lens.short).toBe('for the business')
    expect(skeletonOrder(t)).toEqual(['in_short', 'finding', 'method'])
  })

  it('gives a blocked custom brief the same page kinds the templates print', () => {
    const t = resolveTemplate(CUSTOM_BRIEF, settings({ role: 'content_brief', blocks: [...DOCUMENT_BLOCK_KEYS] }))
    expect(skeletonOrder(t)).toEqual(['in_short', 'finding', 'competitor', 'personas', 'asked', 'language', 'standing', 'say_hear', 'method'])
    for (const p of t.skeleton) expect(PAGE_FIELDS[p.kind].length, p.kind).toBeGreaterThan(0)
    expect(t.readerNoun).toBe(CONTENT_BRIEF.readerNoun)
  })
})

describe('documentSettings, with a brief and blocks', () => {
  it('keeps a brief, its blocks and its role, and leaves the four templates\' settings alone', () => {
    expect(documentSettings({ brief: '  Review the campaign.  ', blocks: ['consumer_profiles'], role: 'sales_brief' })).toEqual({
      ...DEFAULT_DOCUMENT_SETTINGS, brief: 'Review the campaign.', blocks: ['consumer_profiles'], role: 'sales_brief',
    })
    expect(documentSettings(null)).toEqual(DEFAULT_DOCUMENT_SETTINGS)
    expect(documentSettings({ brief: '   ', blocks: [], role: 'nope' as never })).toEqual(DEFAULT_DOCUMENT_SETTINGS)
  })

  it('cuts a brief at the cap rather than storing an essay', () => {
    const long = 'a'.repeat(DOCUMENT_BRIEF_MAX + 500)
    expect(documentSettings({ brief: long }).brief).toHaveLength(DOCUMENT_BRIEF_MAX)
    expect(documentSettingsPatch.safeParse({ brief: long }).success).toBe(false)
    expect(documentSettingsPatch.safeParse({ brief: 'Review the campaign.', blocks: ['consumer_profiles'], role: 'sales_brief' }).success).toBe(true)
    expect(documentSettingsPatch.safeParse({ blocks: ['not_a_block'] }).success).toBe(false)
    expect(documentSettingsPatch.safeParse({ role: 'custom' }).success).toBe(false)
  })
})

describe('applyDocumentSettingsPatch', () => {
  const patch = { brief: 'Review the athlete campaign.', blocks: ['consumer_profiles'], role: 'market_brief' as const, findings: 3 as const }

  it('keeps a custom brief\'s own three, and files it under the role that writes it', () => {
    const out = applyDocumentSettingsPatch({ templateKey: CUSTOM_KEY, current: DEFAULT_DOCUMENT_SETTINGS, patch })
    expect(out.ignored).toEqual([])
    expect(out.settings).toEqual({ ...DEFAULT_DOCUMENT_SETTINGS, findings: 3, brief: 'Review the athlete campaign.', blocks: ['consumer_profiles'], role: 'market_brief' })
    expect(out.audience).toBe('marketing')
    expect(applyDocumentSettingsPatch({ templateKey: CUSTOM_KEY, current: null, patch: {} }).audience).toBe('leadership')
  })

  it('strips them on a fixed template and says which, while saving the rest', () => {
    const out = applyDocumentSettingsPatch({ templateKey: 'sales_brief', current: DEFAULT_DOCUMENT_SETTINGS, patch })
    expect(out.ignored).toEqual([...CUSTOM_ONLY_FIELDS])
    expect(out.settings).toEqual({ ...DEFAULT_DOCUMENT_SETTINGS, findings: 3 })
    expect(out.audience).toBeNull()
  })

  it('drops what an older row stored on a fixed template', () => {
    const out = applyDocumentSettingsPatch({
      templateKey: 'market_brief',
      current: { ...DEFAULT_DOCUMENT_SETTINGS, brief: 'stored before the guard', blocks: ['market_movement'], role: 'sales_brief' },
      patch: {},
    })
    expect(out.settings).toEqual(DEFAULT_DOCUMENT_SETTINGS)
    expect(out.ignored).toEqual([])
    // And the template it composes to is its own, untouched.
    expect(resolveTemplate(SALES_BRIEF, out.settings)).toBe(SALES_BRIEF)
  })
})
