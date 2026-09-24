import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  answeredBy,
  axisNote,
  endReadings,
  buildSides,
  gapSideOf,
  matchWords,
  originLine,
  paneGap,
  periodPhrase,
  railNote,
  selectSubject,
  setLine,
  subjectNotes,
  sideFigures,
  sideWhose,
  unansweredLead,
  unansweredLeadText,
  unansweredMeta,
  voiceFrom,
  voicesAcross,
  voicesMeta,
  UNANSWERED_BASIS,
  VOICES_SHOWN,
  type StoredKindRow,
  type SubjectPane,
  type SubjectSide,
} from './subjects'
import { buildSeries, type DenominatorPoint, type MonthPoint, type MonthSeries, type NumeratorPoint } from '../reading/series'
import { CLIENT_AUDIENCE, INDUSTRY_AUDIENCE, rivalKey } from '../rivals'
import { gapLine, type GapSide } from '../reading/gap'
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
    expect(railNote('calibrating', true)).toBe('provisional')
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

describe('voicesMeta', () => {
  it('prints the denominator it actually counted', () => {
    expect(voicesMeta(6, 41, false)).toContain('6 of 41')
  })

  it('says "a sample" rather than a denominator nobody counted', () => {
    // The pool is capped (VOICES_POOL_INSIGHTS / _CITATIONS) because six
    // quotes are not worth tens of thousands of evidence rows. Past the cap
    // "6 of 400" would be a number about the cap, not about the subject.
    const meta = voicesMeta(6, 400, true)
    expect(meta).toContain('a sample')
    expect(meta).not.toContain('of 400')
  })
})

describe('the transcript cite reads the fact, not the sentence (m10)', () => {
  // `creator video, transcript · yours` used to be decided by
  // `from.startsWith('under a post of yours')` — a match on the string
  // `voiceFrom` had returned three lines earlier. Both cites turn on the same
  // boolean, so the loader reads that boolean twice instead of reading one of
  // its own sentences back. A re-wording of voiceFrom would have dropped the
  // suffix silently: the cite still says "creator video, transcript" and just
  // stops saying whose.
  const source = readFileSync(new URL('./subjects.ts', import.meta.url), 'utf8')

  it('does not recover the fact by matching voiceFrom’s copy', () => {
    expect(source).not.toContain("from.startsWith('under a post of yours')")
  })

  it('builds the suffix from the ownPost boolean the loader already has', () => {
    expect(source).toMatch(/creator video, transcript\$\{ownPost && audienceOf\(c\) === CLIENT_AUDIENCE/)
  })
})

describe('voiceFrom — the client audience is two different places', () => {
  it('says "a post of yours" ONLY for a video the tenant published', () => {
    // source='owned'. The 20 Sealand posts a September run reads.
    expect(voiceFrom(CLIENT_AUDIENCE, { ownPost: true })).toBe('under a post of yours')
  })

  it('says the video NAMES you when a stranger published it', () => {
    // All 21 of Sealand's client-audience insights on the preview branch sit
    // on third-party accounts (tunl.to, honest_money_pod, …) that the content
    // tagger flagged on a brand keyword. They were cited as the tenant's own.
    expect(voiceFrom(CLIENT_AUDIENCE, { ownPost: false })).toBe('in a video that names you')
    expect(voiceFrom(CLIENT_AUDIENCE)).toBe('in a video that names you')
  })

  it('never claims a post for a tenant it cannot place', () => {
    // Absent is not "probably theirs" — the default may not overclaim.
    expect(voiceFrom(CLIENT_AUDIENCE)).not.toContain('yours')
  })

  it('leaves the rival and category words exactly as they were', () => {
    for (const opts of [{}, { ownPost: true }, { ownPost: false }]) {
      expect(voiceFrom(INDUSTRY_AUDIENCE, opts)).toBe('under a category video')
      expect(voiceFrom('competitor:Freitag', opts)).toBe('under a Freitag video')
    }
  })
})

describe('voiceFrom', () => {
  it('never prints an audience key', () => {
    expect(voiceFrom(CLIENT_AUDIENCE, { ownPost: true })).toBe('under a post of yours')
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

  it('never calls a one-word label answered — two words means two, not "as many as there are"', () => {
    // The old rule was hits >= min(2, want.length), so "Durability" was
    // answered by any post sharing that one word. A one-word label is where a
    // single shared word is the weakest evidence there is; the row stays in
    // the list, where a reader can see it and disagree.
    expect(answeredBy('Durability', ['durability of our bags'])).toBe(false)
    expect(answeredBy('Durability and repairs', ['durability of our repairs'])).toBe(true)
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
  const row = { id: 'q', label: 'Will it survive a wet commute', videos: 130, reddit: 40, answered: false }

  it('says "grouped as", never "the category asked" — the label is the clustering\'s summary', () => {
    // Measured on production: a large group of Össur question insights sits
    // under a theme the model called "Praise for prosthetic look". "The
    // category asked ‘Praise for prosthetic look’" is not true of anything.
    expect(unansweredLeadText(unansweredLead([row], 9, 'in Sep'))).toContain('Questions grouped as')
  })

  it('says the count and the period, and no share', () => {
    // ONE OF THESE WORDS IS A MODEL'S. `unansweredLead` returns the parts so
    // the block can mark Pass B's label as the model value it is;
    // `unansweredLeadText` is the same sentence for a caller with no markup.
    const line = unansweredLeadText(unansweredLead([row], 9, 'in Sep'))!
    expect(line).toBe('Questions grouped as “Will it survive a wet commute” came up in 130 of the videos we have read: none of your 9 posts in Sep touched it.')
    expect(line).not.toContain('%')
  })

  it('labels the posts with the period they were counted in, never with one month', () => {
    // The count is over the WHOLE horizon; "none of your 900 September posts"
    // was the sentence on Last 12 months, beside a meta line that said "in
    // this window" about the same number.
    expect(unansweredLeadText(unansweredLead([row], 900, 'in the last 12 months')))
      .toContain('none of your 900 posts in the last 12 months touched it')
  })

  it('says you published nothing rather than "none of your 0 posts"', () => {
    expect(unansweredLeadText(unansweredLead([row], 0, 'in Sep'))).toContain('you published nothing in Sep')
  })

  it('has nothing to say when every question is answered', () => {
    expect(unansweredLead([{ ...row, answered: true }], 9, 'in Sep')).toBeNull()
  })

  it('puts the gate’s own number on the meta line rather than computing and dropping it', () => {
    expect(unansweredMeta(214, 9)).toBe('214 videos asked about this subject · 9 posts of yours')
    expect(unansweredMeta(1, 1)).toBe('1 video asked about this subject · 1 post of yours')
  })

  it('states the basis once, in the block’s own words', () => {
    expect(UNANSWERED_BASIS).toContain('counts, not shares')
  })
})

describe('subjectNotes', () => {
  const clustering = {
    kind: 'clustering_changed' as const,
    text: 'We did not record how themes were grouped for Apr 2021 to Sep 2026, so those months are not strictly comparable with the ones after them.',
    months: ['2021-04-01'],
  }
  const filling = { kind: 'still_filling' as const, text: 'Still filling: this month is still taking comments.' }

  it('drops the theme-clustering caveat a subject\u2019s own arithmetic refuses', () => {
    // buildSides puts `regime: 'n/a'` on every point because a subject's
    // membership is a judge's answer, not a clustering artefact. The page
    // cannot refuse the caveat in its numbers and print it in its prose.
    expect(subjectNotes([clustering, filling])).toEqual([filling])
  })

  it('says nothing at all when no subject is drawn', () => {
    expect(subjectNotes(null)).toEqual([])
    expect(subjectNotes(undefined)).toEqual([])
  })
})

describe('periodPhrase', () => {
  it('words each horizon as the control does, and never as a month it is not', () => {
    // The product's own month token, the one the metas and the mock use.
    expect(periodPhrase('this_month', '2026-09-01')).toBe('in Sep')
    expect(periodPhrase('last_3', '2026-09-01')).toBe('in the last 3 months')
    expect(periodPhrase('last_12', '2026-09-01')).toBe('in the last 12 months')
    expect(periodPhrase('since_start', '2026-09-01')).toBe('since we started')
  })
})

describe('axisNote', () => {
  const side = (over: Partial<SubjectSide>): SubjectSide => ({
    audience: CLIENT_AUDIENCE, label: 'You', kind: 'you', color: 'var(--you)',
    k: 26, n: 84, pct: 31, observed: true, silence: null, verdict: null, direction: null,
    previous: null, kinds: [], kindVerdicts: {}, reddit: null, ...over,
  })

  it('names the lines that carry too few videos to compare, in ONE sentence', () => {
    const note = axisNote([side({}), side({ label: 'Category', kind: 'category', n: 1388, k: 305, audience: INDUSTRY_AUDIENCE })], 100)!
    expect(note).toContain('You carried too few videos this month to compare (84)')
    expect(note).not.toContain('Category carried too few')
    expect(note).not.toContain('drawn hollow')
  })

  it('collapses several hollow lines into one clause rather than one each', () => {
    const note = axisNote([side({}), side({ label: 'Freitag', kind: 'rival', n: 42, audience: 'competitor:Freitag' })], 100)!
    expect(note).toContain('You and Freitag carried too few videos')
  })

  it('says "— not tracked" for an audience with no row, never a zero', () => {
    const note = axisNote([side({ label: 'Poler', kind: 'rival', observed: false, silence: 'not_tracked', n: null, k: null, pct: null })], 100)!
    expect(note).toContain('Poler: not tracked.')
  })

  it('tells "no reading yet" apart from "not tracked" — the audience was read, this subject was not in it', () => {
    // monthly_subject_readings emits a row only where videos > 0, so a freshly
    // confirmed subject with no members in a month has no row while its
    // audience's denominator row is right there. "— not tracked" about the
    // client's own audience is false, and the rail one tile away says so.
    const note = axisNote([
      side({ observed: false, silence: 'no_reading', n: 84, k: null, pct: null }),
      side({ label: 'Poler', kind: 'rival', observed: false, silence: 'not_tracked', n: null, k: null, pct: null }),
    ], 100)!
    expect(note).toContain('You: no reading yet on this subject.')
    expect(note).toContain('Poler: not tracked.')
  })

  it('is silent when every line carries its n', () => {
    expect(axisNote([side({ n: 1388, k: 305 })], 100)).toBeNull()
  })

  // A LINE THAT BEGINS HALFWAY IS NOT A LINE THAT FELL TO ZERO.
  describe('the line that starts late', () => {
    const MONTHS = ['2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01']
    const line = (audience: string, label: string, from: string): MonthSeries => ({
      audience,
      names: [audience],
      objectId: 's1',
      objectLabel: label,
      points: MONTHS.map((month) => ({
        month,
        state: (month < from ? 'hollow' : 'frozen') as MonthPoint['state'],
        videos: month < from ? null : 1388,
        comments: null,
        k: month < from ? null : 300,
        pct: month < from ? null : 21,
        labels: [],
        runId: null,
        readAt: null,
      } as unknown as MonthPoint)),
      notes: [],
      firstReadable: from,
      substrate: 'seeded' as const,
    })

    it('names the line that starts after its neighbours', () => {
      const note = axisNote(
        [side({ n: 1388, k: 305 }), side({ label: 'Patagonia', kind: 'rival', audience: 'competitor:Patagonia', n: 1388, k: 300 })],
        100,
        [line(CLIENT_AUDIENCE, 'You', '2026-06-01'), line('competitor:Patagonia', 'Patagonia', '2026-08-01')],
      )!
      expect(note).toContain('Patagonia is read from August')
      expect(note).not.toContain('You is read from')
    })

    // THE HOLE THE RELATIVE YARDSTICK LEFT. Comparing the lines against each
    // other names nothing when they ALL begin after the axis does — which is
    // the state a whole tenant is in for its first months, and exactly when a
    // short line most reads as a collapse.
    it('names every line where they all start after the axis does', () => {
      const note = axisNote(
        [side({ n: 1388, k: 305 }), side({ label: 'Patagonia', kind: 'rival', audience: 'competitor:Patagonia', n: 1388, k: 300 })],
        100,
        [line(CLIENT_AUDIENCE, 'You', '2026-08-01'), line('competitor:Patagonia', 'Patagonia', '2026-08-01')],
      )!
      expect(note).toContain('You is read from August')
      expect(note).toContain('Patagonia is read from August')
    })

    it('says nothing where every line runs the whole axis', () => {
      expect(axisNote(
        [side({ n: 1388, k: 305 })],
        100,
        [line(CLIENT_AUDIENCE, 'You', '2026-06-01')],
      )).toBeNull()
    })
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

function fixtureSides(over: { thin?: boolean; rivalRows?: boolean; kindRows?: StoredKindRow[] | null } = {}): SubjectSide[] {
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
    kindRows: over.kindRows ?? null,
    seriesFor,
    thin: over.thin ?? false,
  })
}

/** Two months of kinds for one audience, so a kind's share can be compared.
 *  The category is the only side whose n clears the band's floor, which is the
 *  real shape on both tenants. */
const kindRowsFor = (audience: string, sep: Record<string, number>, aug: Record<string, number>): StoredKindRow[] => [
  ...Object.entries(sep).map(([kind, videos]) => ({ month: '2026-09-01', audience, kind, videos, comments: 0, platform_mix: null })),
  ...Object.entries(aug).map(([kind, videos]) => ({ month: '2026-08-01', audience, kind, videos, comments: 0, platform_mix: null })),
]

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

  it('bands every kind it draws, one verdict per kind, with no remainder', () => {
    const kindRows = kindRowsFor(INDUSTRY_AUDIENCE, { question: 480, praise: 380, objection: 260 }, { question: 380, praise: 390, objection: 255 })
    const [, , category] = fixtureSides({ kindRows })
    expect(category.kinds.map((k) => k.kind).sort()).toEqual(['objection', 'praise', 'question'])
    expect(Object.keys(category.kindVerdicts).sort()).toEqual(['objection', 'praise', 'question'])
    // 34.6% of 1,388 against 27.4% of 1,388 clears the band; the other two sit
    // inside it. Each is its own share of one denominator — nothing sums them
    // and there is no "other kinds" row for the remainder.
    expect(category.kindVerdicts.question?.state).toBe('moved')
    expect(category.kindVerdicts.praise?.state).toBe('no_clear_change')
    expect(category.kindVerdicts.question?.value).toEqual({ k: 480, n: 1388 })
    expect(category.kindVerdicts.question?.baseline).toEqual({ k: 380, n: 1388 })
  })

  it('never says a kind moved on a side whose own n cannot carry a band', () => {
    const kindRows = kindRowsFor(CLIENT_AUDIENCE, { question: 30, praise: 20 }, { question: 12, praise: 21 })
    const [you] = fixtureSides({ kindRows })
    expect(you.kindVerdicts.question?.state).toBe('too_little_data')
  })

  it('carries no kind caveat about a grouping a kind does not have', () => {
    const kindRows = kindRowsFor(INDUSTRY_AUDIENCE, { question: 480 }, { question: 380 })
    const [, , category] = fixtureSides({ kindRows })
    const flags = category.kindVerdicts.question?.flags ?? []
    expect(flags).not.toContain('clustering_unknown')
    expect(flags).not.toContain('clustering_changed')
  })

  it('suppresses every kind verdict on a thin month too', () => {
    const kindRows = kindRowsFor(INDUSTRY_AUDIENCE, { question: 480 }, { question: 380 })
    const [, , category] = fixtureSides({ kindRows, thin: true })
    expect(category.kindVerdicts.question).toBeNull()
  })

  it('draws no verdict for a kind the previous month never carried', () => {
    const kindRows = kindRowsFor(INDUSTRY_AUDIENCE, { question: 480, praise: 380 }, { question: 380 })
    const [, , category] = fixtureSides({ kindRows })
    expect(category.kindVerdicts.praise).toBeNull()
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
    // A FigureTable label is read by a person and by the cover prompt, so it
    // says "your", never "You's".
    expect(figures.subject_you_client_videos).toEqual({ value: 26, unit: 'videos', label: 'Durability, your videos this month' })
    expect(figures.subject_rival_competitor_freitag_share.label).toBe('Durability, Freitag\u2019s share this month')
  })

  it('never writes a possessive nobody would say', () => {
    expect(sideWhose({ kind: 'you', label: 'You' })).toBe('your')
    expect(sideWhose({ kind: 'rival', label: 'Freitag' })).toBe('Freitag\u2019s')
    expect(sideWhose({ kind: 'rival', label: 'Adidas' })).toBe('Adidas\u2019')
  })

  it('declares nothing at all without a selected subject', () => {
    expect(sideFigures(null)).toEqual({})
  })
})

describe('railNote, on a subject nobody has confirmed', () => {
  it('says what is missing is the CONSENT, not the data', () => {
    expect(railNote('calibrating', false, 'proposed'))
      .toBe('not counted yet: confirm it and counting starts with the next update')
    // and it outranks both other silences: nothing has ever looked at it.
    expect(railNote('ready', true, 'proposed')).toContain('not counted yet')
  })
})

// ---- D1 · the pane's two-audience gap -----------------------------------------

describe('paneGap', () => {
  const you = (over: Partial<SubjectSide> = {}): SubjectSide =>
    ({
      audience: CLIENT_AUDIENCE, label: 'You', kind: 'you', color: 'var(--you)',
      k: 26, n: 84, pct: 31, observed: true, silence: null, verdict: null,
      direction: null, previous: null, kinds: [], reddit: null, ...over,
    }) as SubjectSide
  const rival = (over: Partial<SubjectSide> = {}): SubjectSide =>
    you({ audience: rivalKey('Freitag'), label: 'Freitag', kind: 'rival', k: 62, n: 142, pct: 43.7, ...over })

  const args = (over: Partial<Parameters<typeof paneGap>[0]> = {}) => ({
    subject: { id: 's1', name: 'Durability' },
    a: gapSideOf(you()),
    b: gapSideOf(rival()),
    basis: null,
    month: '2026-09-01',
    prevMonth: '2026-08-01',
    thin: false,
    ...over,
  })

  it('takes both sides at the share the PANE prints, so the gap cannot contradict the two stats', () => {
    const gap = paneGap(args())!
    expect(gap.a.pct).toBe(31)
    expect(gap.b.pct).toBe(43.7)
    expect(gap.a.value).toEqual({ k: 26, n: 84 })
  })

  it('refuses the difference on the mock’s own month — 84 videos is under the floor', () => {
    expect(paneGap(args())!.state).toBe('too_little_data')
  })

  it('clears once both sides carry a quarter’s worth of videos', () => {
    const gap = paneGap(args({
      a: gapSideOf(you({ k: 78, n: 252 })),
      b: gapSideOf(rival({ k: 186, n: 426 })),
    }))!
    expect(gap.state).toBe('apart')
    expect(gapLine(gap)).toContain('12.7 points apart')
  })

  it('refuses the gap outright where the rival has been retired — the tracked set moved', () => {
    const gap = paneGap(args({
      a: gapSideOf(you({ k: 78, n: 252 })),
      b: gapSideOf(rival({ k: 186, n: 426, label: 'Freitag — stopped' })),
      refused: 'tracking_change',
    }))!
    expect(gap.state).toBe('refused')
    expect(gap.refusedReason).toBe('tracking_change')
    expect(gap.gapPts).toBeNull()
    // the levels survive; only the difference is withheld
    expect(gapLine(gap)).toContain('of 252')
    expect(gapLine(gap)).toContain('comparison refused')
  })

  it('prints the earlier gap as its own dated reading, never as "narrowed"', () => {
    const basisSide = (audience: string, label: string, k: number, n: number, pct: number): GapSide =>
      ({ audience, label, value: { k, n }, pct, observed: true })
    const gap = paneGap(args({
      a: gapSideOf(you({ k: 78, n: 252 })),
      b: gapSideOf(rival({ k: 186, n: 426 })),
      basis: {
        a: basisSide(CLIENT_AUDIENCE, 'You', 60, 273, 22),
        b: basisSide(rivalKey('Freitag'), 'Freitag', 175, 427, 41),
      },
    }))!
    expect(gap.basis?.window.from).toBe('2026-08-01')
    expect(gap.basis?.gapPts).toBe(-19)
    expect(gap.direction).toBeNull()
  })

  it('draws no gap without a rival, and none in a thin month', () => {
    expect(paneGap(args({ b: null }))).toBeNull()
    expect(paneGap(args({ thin: true }))).toBeNull()
  })

  it('says "not tracked" rather than nothing where the rival audience was never read', () => {
    const gap = paneGap(args({ b: gapSideOf(rival({ k: null, n: null, pct: null, observed: false })) }))!
    expect(gap.state).toBe('too_little_data')
    expect(gapLine(gap)).toContain('Freitag · not tracked')
  })
})

// ── endReadings (Block D wave 3b, `decks`) ──────────────────────────────────
//
// The sentence that stands in for the chart's end labels where a column is too
// narrow for them. `CalendarLine` draws an end label at `width - padR + 10`
// and clips it with nothing, so on the marketing brief — six of twelve columns
// — "The category 22.0% of 1,388" ran under the gap card beside it and lost
// its denominator, which is the one part of an end label that may not go
// missing. The block turns the labels off on its print arm and prints this.
describe('endReadings', () => {
  const MONTHS = ['2026-07-01', '2026-08-01', '2026-09-01']
  const side = (over: Partial<SubjectSide>): SubjectSide => ({
    audience: CLIENT_AUDIENCE, label: 'You', kind: 'you', color: 'var(--you)',
    k: 26, n: 84, pct: 31, observed: true, silence: null, verdict: null, direction: null,
    previous: null, kinds: [], kindVerdicts: {}, reddit: null, ...over,
  })
  const line = (audience: string, pcts: (number | null)[], videos: (number | null)[]): MonthSeries => ({
    audience,
    names: [audience],
    objectId: 's1',
    objectLabel: 'Durability',
    points: MONTHS.map((month, i) => ({
      month, state: 'frozen', videos: videos[i], comments: null, k: null, pct: pcts[i], labels: [],
    } as unknown as MonthPoint)),
    notes: [],
    firstReadable: MONTHS[0],
    substrate: 'months',
  } as unknown as MonthSeries)

  it('names each line, the month it ends on, its share and the denominator', () => {
    const out = endReadings(
      [side({}), side({ audience: INDUSTRY_AUDIENCE, label: 'The category', kind: 'category' })],
      [line(CLIENT_AUDIENCE, [29, 30, 31], [82, 83, 84]), line(INDUSTRY_AUDIENCE, [19, 20, 22], [1290, 1340, 1388])],
    )
    expect(out).toBe('You Sep 31.0% of 84 · The category Sep 22.0% of 1,388')
  })

  // THE SERIES' OWN LAST READING, NOT THIS MONTH'S LEVEL. `SubjectSide.pct` is
  // September; a side whose newest reading is August would be dated September
  // by a sentence built from the side, and the end label it replaces carries
  // the month the line actually ends on.
  it('dates a line by the last month it has a reading in, not by the newest month on the axis', () => {
    const out = endReadings([side({})], [line(CLIENT_AUDIENCE, [29, 30, null], [82, 83, null])])
    expect(out).toBe('You Aug 30.0% of 83')
  })

  it('skips a side with no series and a series with no reading at all', () => {
    expect(endReadings([side({})], [])).toBeNull()
    expect(endReadings([side({})], [line(CLIENT_AUDIENCE, [null, null, null], [null, null, null])])).toBeNull()
  })
})
