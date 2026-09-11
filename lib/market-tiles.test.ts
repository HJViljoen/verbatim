import { describe, it, expect } from 'vitest'
import {
  insightTiers, confirmedCompetitiveIds, recEvidenceTier, orderAgenda, openAgendaId, priorityDot, distinctVideos,
  claimVerdict, claimCounts, claimCountsLine, ledgerRows, truncateWords, quadrantBullets, tierCounts, newsRingChip,
  labelsBySlug, themeChips,
} from './market-tiles'

const mi = (id: string, score: number | null, themes: number, comp = 0) => ({
  id, confidence_score: score,
  evidence: { supporting_theme_ids: Array.from({ length: themes }, (_, i) => `${id}-t${i}`), supporting_competitive_insight_ids: Array.from({ length: comp }, (_, i) => `${id}-c${i}`) },
})

describe('insight tiers + competitive ground', () => {
  it('tiers by lib/curation: score + source count', () => {
    const tiers = insightTiers([mi('a', 9, 3), mi('b', 8, 1), mi('c', 6, 0), mi('d', 2, 5), mi('e', null, 2)])
    expect(tiers.get('a')).toBe('confirmed')
    expect(tiers.get('b')).toBe('early_signal') // strong score, one source
    expect(tiers.get('c')).toBe('early_signal')
    expect(tiers.get('d')).toBe('archive')
    expect(tiers.get('e')).toBe('archive')
  })
  it('counts themes and competitive refs as sources', () => {
    expect(insightTiers([mi('a', 7, 1, 1)]).get('a')).toBe('confirmed')
  })
  it('confirmed competitive = high impact clearing the source floor', () => {
    const ids = confirmedCompetitiveIds([
      { id: 'x', impact_level: 'high', evidence: { supporting_theme_ids: ['1', '2'] } },
      { id: 'y', impact_level: 'high', evidence: { supporting_theme_ids: ['1'] } },
      { id: 'z', impact_level: 'medium', evidence: { supporting_theme_ids: ['1', '2', '3'] } },
      { id: 'w', impact_level: 'high', evidence: null },
    ])
    expect([...ids]).toEqual(['x'])
  })
})

describe('agenda ordering', () => {
  const tiers = insightTiers([mi('conf', 9, 3), mi('early', 8, 1), mi('arch', 2, 1)])
  const comp = new Set(['compX'])
  const rec = (id: string, priority: string | null, ground: string[]) => ({ id, priority, based_on: { insight_ids: ground } })

  it('rec evidence tier = best ground behind it', () => {
    expect(recEvidenceTier(rec('r', 'low', ['arch', 'conf']), tiers, comp)).toBe('confirmed')
    expect(recEvidenceTier(rec('r', 'low', ['compX']), tiers, comp)).toBe('confirmed')
    expect(recEvidenceTier(rec('r', 'low', ['arch', 'early']), tiers, comp)).toBe('early_signal')
    expect(recEvidenceTier(rec('r', 'high', ['arch']), tiers, comp)).toBe('archive')
    expect(recEvidenceTier(rec('r', 'high', []), tiers, comp)).toBe('archive')
    expect(recEvidenceTier({ id: 'r', priority: null, based_on: null }, tiers, comp)).toBe('archive')
  })

  it('gate-passed first, then priority, then grounding count', () => {
    const out = orderAgenda([
      rec('lowConf', 'low', ['conf']),
      rec('highArch', 'high', ['arch']),
      rec('medConf2', 'medium', ['conf', 'compX']),
      rec('medConf1', 'medium', ['conf']),
      rec('highEarly', 'high', ['early']),
    ], tiers, comp)
    expect(out.map((a) => a.rec.id)).toEqual(['medConf2', 'medConf1', 'lowConf', 'highEarly', 'highArch'])
    expect(out[0].tier).toBe('confirmed')
    expect(out[3].tier).toBe('early_signal')
    expect(out[4].tier).toBe('archive')
  })

  it('handles an empty list', () => {
    expect(orderAgenda([], tiers, comp)).toEqual([])
  })

  it('one agenda row is open: ?rec when shown, else the top row', () => {
    const shown = orderAgenda([rec('a', 'high', ['conf']), rec('b', 'low', ['conf'])], tiers, comp)
    expect(openAgendaId(shown, undefined)).toBe('a')
    expect(openAgendaId(shown, 'b')).toBe('b')
    expect(openAgendaId(shown, 'not-shown')).toBe('a')
    expect(openAgendaId([], 'a')).toBeNull()
  })

  it('priority dots: high amber, medium grey, low/unknown hairline', () => {
    expect(priorityDot('high')).toBe('var(--warning)')
    expect(priorityDot('medium')).toBe('var(--cat)')
    expect(priorityDot('low')).toBe('var(--input)')
    expect(priorityDot(null)).toBe('var(--input)')
  })

  it('distinctVideos counts conversations, not insights', () => {
    const byInsight = new Map<string, string | null>([['a', 'v1'], ['b', 'v1'], ['c', 'v2'], ['d', null]])
    expect(distinctVideos(['a', 'b', 'c', 'd', 'missing'], byInsight)).toBe(2)
    expect(distinctVideos([], byInsight)).toBe(0)
  })
})

describe('say vs hear ledger', () => {
  it('maps the audience reading to a verdict word + tone', () => {
    expect(claimVerdict('echoes')).toEqual({ label: 'Echoed', tone: 'positive' })
    expect(claimVerdict('contradicts')).toEqual({ label: 'Pushed back', tone: 'clay' })
    expect(claimVerdict('silent')).toEqual({ label: 'Not talked about', tone: 'sand' })
    expect(claimVerdict('anything-else').label).toBe('Not talked about')
  })
  it('counts and phrases the meta line', () => {
    const c = claimCounts([{ audience: 'echoes' }, { audience: 'silent' }, { audience: 'contradicts' }, { audience: 'silent' }])
    expect(c).toEqual({ total: 4, echoed: 1, pushedBack: 1, silent: 2 })
    expect(claimCountsLine(c)).toBe('4 claims · 1 echoed · 1 pushed back · 2 silent')
    expect(claimCountsLine(claimCounts([{ audience: 'echoes' }]))).toBe('1 claim · 1 echoed · 0 pushed back · 0 silent')
  })
  it('shows voiced verdicts first, silence last, stable within, capped', () => {
    const rows = ledgerRows([
      { audience: 'silent', k: 1 }, { audience: 'echoes', k: 2 }, { audience: 'contradicts', k: 3 },
      { audience: 'echoes', k: 4 }, { audience: 'silent', k: 5 }, { audience: 'contradicts', k: 6 },
    ])
    expect(rows.map((r) => r.k)).toEqual([3, 6, 2, 4])
    expect(ledgerRows([{ audience: 'silent', k: 1 }], 4).map((r) => r.k)).toEqual([1])
  })
})

describe('short read quadrants', () => {
  it('truncates at a word boundary with an ellipsis, trailing punctuation dropped', () => {
    expect(truncateWords('short one', 20)).toBe('short one')
    expect(truncateWords('A legible path through price, coverage and appeals.', 30)).toBe('A legible path through price…')
    expect(truncateWords('  spaced   out   words  ', 100)).toBe('spaced out words')
  })
  it('falls back to a hard cut for one unbroken word', () => {
    expect(truncateWords('abcdefghijklmnopqrstuvwxyz', 10)).toBe('abcdefghij…')
  })
  it('takes the first n non-empty bullets', () => {
    expect(quadrantBullets(['a', '', '  ', 'b', 'c'], 2)).toEqual(['a', 'b'])
    expect(quadrantBullets(null)).toEqual([])
    expect(quadrantBullets(['x'.repeat(200)], 1, 50)[0].endsWith('…')).toBe(true)
  })
})

describe('tier counts + news chips', () => {
  it('counts tiers for the header chips', () => {
    expect(tierCounts(insightTiers([mi('a', 9, 3), mi('b', 8, 1), mi('c', 1, 0)]))).toEqual({ confirmed: 1, early: 1, archive: 1 })
    expect(tierCounts(new Map())).toEqual({ confirmed: 0, early: 0, archive: 0 })
  })
  it('ring → entity chip', () => {
    expect(newsRingChip(0)).toEqual({ label: 'Your brand', tone: 'positive' })
    expect(newsRingChip(1)).toEqual({ label: 'Competitor', tone: 'clay' })
    expect(newsRingChip(2)).toEqual({ label: 'Category', tone: 'sand' })
  })
})

describe('grounding chips', () => {
  const themes = [
    { label: 'Comfort in daily wear', member_themes: ['comfort_fit', 'all_day_comfort'], evidence_count: 12, rank_score: 4 },
    { label: 'Durability in the field', member_themes: ['strap_wear'], evidence_count: 9, rank_score: 3 },
    // Same slug in a second theme — a slug can be cited from more than one
    // bucket; the chip must read as the card that leads Voice.
    { label: 'Sizing confusion', member_themes: ['comfort_fit'], evidence_count: 4, rank_score: 9 },
    { label: '  ', member_themes: ['blank_label'], evidence_count: 40, rank_score: 9 },
  ]

  it('labels a slug with the theme Voice leads with, not the strongest', () => {
    // The keys Voice orders by are evidence_count then rank_score — NOT
    // strength_score, which is what this used to sort on. On the live corpora
    // the two disagreed for 30 of Össur's 123 multi-theme slugs and 25 of
    // Sealand's 84, and every one of those chips named a card other than the
    // one the chip opened.
    const m = labelsBySlug([
      { label: 'Heard by more people', member_themes: ['s'], evidence_count: 20, rank_score: 1 },
      { label: 'Ranked higher, heard less', member_themes: ['s'], evidence_count: 5, rank_score: 99 },
    ])
    expect(m.get('s')).toBe('Heard by more people')
    const tied = labelsBySlug([
      { label: 'Bravo', member_themes: ['s'], evidence_count: 7, rank_score: 2 },
      { label: 'Alpha', member_themes: ['s'], evidence_count: 7, rank_score: 2 },
    ])
    expect(tied.get('s')).toBe('Alpha') // label asc is the last tie-break
  })

  it('labels a slug with the theme that holds it', () => {
    const m = labelsBySlug(themes)
    expect(m.get('comfort_fit')).toBe('Comfort in daily wear')
    expect(m.get('all_day_comfort')).toBe('Comfort in daily wear')
    expect(m.get('strap_wear')).toBe('Durability in the field')
    expect(m.has('blank_label')).toBe(false) // an empty label is not a label
  })

  it('carries the slug for the deep link and the label for the reader', () => {
    const chips = themeChips(['strap_wear'], labelsBySlug(themes))
    expect(chips).toEqual([{ slug: 'strap_wear', label: 'Durability in the field' }])
  })

  it('leaves the label null when this update has no theme for the slug', () => {
    expect(themeChips(['orphan_slug'], labelsBySlug(themes))).toEqual([{ slug: 'orphan_slug', label: null }])
  })

  it('dedupes on what the reader sees, not on the slug', () => {
    const chips = themeChips(['comfort_fit', 'all_day_comfort', 'strap_wear'], labelsBySlug(themes))
    expect(chips.map((c) => c.label)).toEqual(['Comfort in daily wear', 'Durability in the field'])
  })

  it('caps the row', () => {
    const m = labelsBySlug([])
    expect(themeChips(['a', 'b', 'c', 'd', 'e'], m)).toHaveLength(4)
    expect(themeChips(['a', 'b', 'c'], m, 2)).toHaveLength(2)
  })
})
