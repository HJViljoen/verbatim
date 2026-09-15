import { describe, expect, it } from 'vitest'

import {
  answeredBy,
  axisNote,
  buildSides,
  matchWords,
  originLine,
  railNote,
  recordWindow,
  selectSubject,
  setLine,
  sideFigures,
  unansweredLead,
  voiceFrom,
  voicesAcross,
  UNANSWERED_BASIS,
  VOICES_SHOWN,
  type SubjectPane,
  type SubjectSide,
} from './subjects'
import { buildSeries, type DenominatorPoint, type NumeratorPoint } from '../reading/series'
import { CLIENT_AUDIENCE, INDUSTRY_AUDIENCE } from '../rivals'
import type { Subject } from '../subjects/types'

// The pure half of the Subjects page (Phase 1 WP12).

describe('setLine', () => {
  it('counts the confirmed set and names the ones still waiting', () => {
    expect(setLine(6, 0)).toBe('6 named')
    expect(setLine(6, 2)).toBe('6 named · 2 waiting to be confirmed')
  })

  it('says nothing is counted when nothing is confirmed — never "0 named"', () => {
    // A proposed subject exists and measures nothing (lib/subjects/moves.ts).
    // "0 named" beside six visible candidates reads as a bug.
    expect(setLine(0, 6)).toBe('6 proposed · none confirmed, so nothing is counted yet.')
    expect(setLine(0, 0)).toBe('No subject named yet.')
  })
})

describe('originLine', () => {
  it('says where each subject came from, in the client’s words', () => {
    expect(originLine('own_claims')).toBe('you said this in your own posts')
    expect(originLine('category_theme')).toBe('the category raised it in the videos we read')
    expect(originLine('client')).toBe('you named it')
  })
})

describe('railNote', () => {
  it('tells the method’s silence apart from the record’s', () => {
    expect(railNote('calibrating', true)).toBe('still checking how often we get this right')
    expect(railNote('ready', false)).toBe('no reading yet')
    expect(railNote('ready', true)).toBeNull()
  })

  it('puts the measurement’s silence first — a calibrating subject shows no share even when it has one', () => {
    expect(railNote('calibrating', true)).not.toBe('no reading yet')
  })
})

describe('selectSubject', () => {
  const rail = [{ id: 'a' }, { id: 'b' }]
  it('takes the one asked for', () => expect(selectSubject(rail, 'b')).toBe('b'))
  it('falls back to the first, never to nothing, when the URL names a stranger', () => {
    expect(selectSubject(rail, 'zzz')).toBe('a')
    expect(selectSubject(rail, undefined)).toBe('a')
  })
  it('selects nothing when there is nothing to select', () => {
    expect(selectSubject([], 'a')).toBeNull()
  })
})

describe('voicesAcross', () => {
  it('draws one from each audience in turn so a loud side cannot fill the list', () => {
    const picked = voicesAcross([
      { audience: 'client', items: ['you-1', 'you-2'] },
      { audience: 'industry-other', items: ['cat-1', 'cat-2', 'cat-3', 'cat-4', 'cat-5', 'cat-6', 'cat-7'] },
    ])
    expect(picked).toEqual(['you-1', 'cat-1', 'you-2', 'cat-2', 'cat-3'])
  })

  it('caps any one audience at three of the six', () => {
    const picked = voicesAcross([{ audience: 'industry-other', items: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }])
    expect(picked).toEqual(['a', 'b', 'c'])
  })

  it('never returns more than the total, whatever the pools hold', () => {
    const pools = ['p1', 'p2', 'p3', 'p4'].map((audience) => ({ audience, items: ['1', '2', '3'] }))
    expect(voicesAcross(pools).length).toBe(VOICES_SHOWN)
  })
})

describe('voiceFrom', () => {
  it('never prints an audience key', () => {
    expect(voiceFrom(CLIENT_AUDIENCE)).toBe('under a post of yours')
    expect(voiceFrom(INDUSTRY_AUDIENCE)).toBe('under a category video')
    expect(voiceFrom('competitor:Freitag')).toBe('under a Freitag video')
    expect(voiceFrom('competitor:Freitag')).not.toContain('competitor:')
  })
})

describe('matchWords / answeredBy', () => {
  it('folds accents and drops stop words', () => {
    expect(matchWords('Will it survive a wét commute?')).toEqual(['survive', 'wet', 'commute'])
  })

  it('needs two content words in common, not one', () => {
    // One shared word is "bag", and one shared word calls every question about
    // a bag answered — which hides the gap the block exists to show.
    expect(answeredBy('Will it survive a wet commute', ['waterproof bag for the commute'])).toBe(false)
    expect(answeredBy('Will it survive a wet commute', ['our bags survive a wet commute'])).toBe(true)
  })

  it('answers false for an empty label and for nothing of yours', () => {
    expect(answeredBy('', ['anything'])).toBe(false)
    expect(answeredBy('zips failing after a year', [])).toBe(false)
  })

  it('matches a claim as readily as a topic — both are your posts’ words', () => {
    expect(answeredBy('Zips failing after a year', ['Our zips are guaranteed for ten years'])).toBe(true)
  })

  it('folds a plural so a question you did answer is not printed as a gap', () => {
    // "year" against "years" is the same word to a reader and two words to a
    // matcher, and the row it loses is one you HAVE answered.
    expect(matchWords('ten years')).toEqual(['ten', 'year'])
    expect(matchWords('a glass')).toEqual(['glass'])
  })
})

describe('unansweredLead', () => {
  const row = { id: 'q', label: 'Will it survive a wet commute', videos: 130, reddit: 40, answered: false, href: null }

  it('says "grouped as", never "the category asked" — the label is the clustering\'s summary', () => {
    // Measured on production: a large group of Össur question insights sits
    // under a theme the model called "Praise for prosthetic look". "The
    // category asked ‘Praise for prosthetic look’" is not true of anything.
    expect(unansweredLead([row], 9, 'September')).toContain('Questions grouped as')
  })

  it('says the count and the population, and no share', () => {
    const line = unansweredLead([row], 9, 'September')!
    expect(line).toBe('Questions grouped as “Will it survive a wet commute” came up in 130 of the videos we have read — none of your 9 September posts touched it.')
    expect(line).not.toContain('%')
  })

  it('says you published nothing rather than "none of your 0 posts"', () => {
    expect(unansweredLead([row], 0, 'September')).toContain('you published nothing in September')
  })

  it('has nothing to say when every question is answered', () => {
    expect(unansweredLead([{ ...row, answered: true }], 9, 'September')).toBeNull()
  })

  it('states the basis once, in the block’s own words', () => {
    expect(UNANSWERED_BASIS).toContain('counts, not shares')
  })
})

describe('axisNote', () => {
  const side = (over: Partial<SubjectSide>): SubjectSide => ({
    audience: CLIENT_AUDIENCE, label: 'You', kind: 'you', color: 'var(--you)',
    k: 26, n: 84, pct: 31, observed: true, verdict: null, direction: null,
    previous: null, kinds: [], reddit: null, ...over,
  })

  it('names the lines that carry too few videos to compare, in ONE sentence', () => {
    const note = axisNote([side({}), side({ label: 'Category', kind: 'category', n: 1388, k: 305, audience: INDUSTRY_AUDIENCE })], 100)!
    expect(note).toContain('You carried too few videos this month to compare (84)')
    expect(note).not.toContain('Category carried too few')
    expect(note.split('—').length).toBe(2)
  })

  it('collapses several hollow lines into one clause rather than one each', () => {
    const note = axisNote([side({}), side({ label: 'Freitag', kind: 'rival', n: 42, audience: 'competitor:Freitag' })], 100)!
    expect(note).toContain('You and Freitag carried too few videos')
  })

  it('says "— not tracked" for a side with no row, never a zero', () => {
    const note = axisNote([side({ label: 'Poler', kind: 'rival', observed: false, n: null, k: null, pct: null })], 100)!
    expect(note).toContain('Poler — not tracked.')
  })

  it('is silent when every line carries its n', () => {
    expect(axisNote([side({ n: 1388, k: 305 })], 100)).toBeNull()
  })
})

describe('recordWindow', () => {
  it('stops at today inside a filling month, and at the month’s end once it is past', () => {
    expect(recordWindow('2026-09-01', '2026-09-18T09:00:00.000Z')).toEqual({ kind: 'month', from: '2026-09-01', to: '2026-09-18' })
    expect(recordWindow('2026-08-01', '2026-09-18T09:00:00.000Z')).toEqual({ kind: 'month', from: '2026-08-01', to: '2026-09-01' })
  })
})

// ---- buildSides -----------------------------------------------------------------

const AXIS = ['2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01']

const subject = (over: Partial<Subject> = {}): Subject => ({
  id: 's1', client_id: 'c1', name: 'Durability', description: null, origin: 'category_theme',
  source_ref: null, named_at: '2026-08-19', status: 'active', superseded_by: null,
  embedded_at: null, embed_input_version: null, calibrated_at: null,
  calibration_precision: null, calibration_n: null, calibration_judge_version: null,
  ...over,
})

function fixtureSides(over: { thin?: boolean; rivalRows?: boolean } = {}): SubjectSide[] {
  const denominators: DenominatorPoint[] = []
  const per = new Map<string, number>()
  const add = (month: string, audience: string, videos: number) => {
    denominators.push({ month, audience, videos, comments: videos * 8, status: 'frozen', origin: 'live', read_at: `${month}T00:00:00Z`, run_id: 'r1' })
    per.set(`${month}|${audience}`, videos)
  }
  for (const m of AXIS) {
    add(m, CLIENT_AUDIENCE, 84)
    add(m, INDUSTRY_AUDIENCE, 1388)
    if (over.rivalRows !== false) add(m, 'competitor:Freitag', 142)
  }

  // The category climbs three months running; your own side sits flat under the
  // floor, which is the real shape on both tenants.
  const catK: Record<string, number> = { '2026-06-01': 180, '2026-07-01': 236, '2026-08-01': 264, '2026-09-01': 340 }
  const readings = (audience: string, k: (m: string) => number): NumeratorPoint[] =>
    AXIS.map((m) => ({ month: m, audience, videos: k(m), comments: k(m) * 3, run_id: 'r1' }))

  const seriesFor = (subjectId: string, audience: string) => {
    const k =
      audience === INDUSTRY_AUDIENCE ? (m: string) => catK[m]
        : audience === CLIENT_AUDIENCE ? () => 26
          : () => 62
    return buildSeries({ axis: AXIS, audience, denominators, readings: readings(audience, k), objectId: subjectId })
  }

  return buildSides({
    subject: subject(),
    rivals: over.rivalRows === false ? [] : [{ name: 'Freitag', retiredAt: null }],
    leadRival: over.rivalRows === false ? null : { name: 'Freitag', retiredAt: null },
    month: '2026-09-01',
    prevMonth: '2026-08-01',
    axis: AXIS,
    perAudience: per,
    kindRows: null,
    seriesFor,
    thin: over.thin ?? false,
  })
}

describe('buildSides', () => {
  it('reads you, each rival and the category as three sides of one subject', () => {
    const sides = fixtureSides()
    expect(sides.map((s) => s.kind)).toEqual(['you', 'rival', 'category'])
    expect(sides[0]).toMatchObject({ k: 26, n: 84, pct: 31 })
    expect(sides[1]).toMatchObject({ k: 62, n: 142, pct: 43.7 })
    expect(sides[2]).toMatchObject({ k: 340, n: 1388, pct: 24.5 })
  })

  it('refuses your own side’s change and answers the category’s — the n decides, not the page', () => {
    const [you, , category] = fixtureSides()
    expect(you.verdict?.state).toBe('too_little_data')
    expect(category.verdict?.state).toBe('moved')
  })

  it('earns a direction word only from three consecutive readings in one regime', () => {
    const [you, , category] = fixtureSides()
    expect(category.direction).toBe('growing')
    // Your side clears no floor in any month, so no run of readings exists.
    expect(you.direction).toBeNull()
  })

  it('suppresses every band and every direction word on a thin month', () => {
    for (const s of fixtureSides({ thin: true })) {
      expect(s.verdict).toBeNull()
      expect(s.direction).toBeNull()
    }
  })

  it('keeps the level on a side whose change is refused — the level is real', () => {
    const [you] = fixtureSides()
    expect(you.pct).toBe(31)
    expect(you.observed).toBe(true)
  })

  it('carries the previous month as a level, never as a change', () => {
    const [, , category] = fixtureSides()
    expect(category.previous).toEqual({ month: '2026-08-01', pct: 19 })
  })

  it('reads a subject across a clustering boundary — its months are judged, not clustered', () => {
    // `regime: 'n/a'` on every point: two subject months under the same judge
    // are comparable whatever the clustering did between them.
    const [, , category] = fixtureSides()
    expect(category.verdict?.flags ?? []).not.toContain('clustering_changed')
    expect(category.verdict?.flags ?? []).not.toContain('clustering_unknown')
  })

  it('draws no rival side at all when none is tracked', () => {
    expect(fixtureSides({ rivalRows: false }).map((s) => s.kind)).toEqual(['you', 'category'])
  })
})

describe('sideFigures', () => {
  it('declares a share and a count per observed side, and nothing for an absent one', () => {
    const sides = fixtureSides()
    const pane = { name: 'Durability', sides } as unknown as SubjectPane
    const figures = sideFigures(pane)
    expect(Object.keys(figures).sort()).toEqual([
      'subject_category_industry_other_share', 'subject_category_industry_other_videos',
      'subject_rival_competitor_freitag_share', 'subject_rival_competitor_freitag_videos',
      'subject_you_client_share', 'subject_you_client_videos',
    ])
    expect(figures.subject_you_client_videos).toEqual({ value: 26, unit: 'videos', label: 'Durability, You\'s videos this month' })
  })

  it('declares nothing at all without a selected subject', () => {
    expect(sideFigures(null)).toEqual({})
  })
})
