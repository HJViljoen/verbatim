import { describe, it, expect } from 'vitest'

import { CLASSIFIED_TYPES, HOOK_STYLES } from '../pipeline/schemas'
import { baselineStateOf } from '../reading/anomaly'
import { directionRe } from '../test/copy-contract'
import {
  baselineFormingLine,
  baselineStartsWith,
  contributionLine,
  crossedIntoLine,
  coverageLine,
  crossingLine,
  flagFigures,
  isMissingAnomalyRecord,
  newThemesLine,
  NEW_THEME_FLOOR,
  pooledBaseline,
  refsOf,
  postCaption,
  refTargets,
  subjectLead,
  typicalContribution,
  typicalTag,
  windowDays,
  workedLabel,
  type SubjectWeekRow,
  type UnusualFlag,
  type WeekWindow,
} from './week'

const WINDOW: WeekWindow = {
  from: '2026-09-06T04:06:38.483Z',
  to: '2026-09-13T04:06:38.483Z',
  basis: 'reconstructed',
}

describe('the window, as a reader reads it', () => {
  it('names the days the update covered, inclusive at the reader’s end', () => {
    // The window is half-open everywhere it is arithmetic; a run that closed at
    // 04:06 on the 13th covered comments written up to that moment, so "6–12"
    // would lose a day of what was actually read.
    expect(windowDays(WINDOW)).toBe('6 Sep – 13 Sep')
  })

  it('has nothing to say about a run that carries no window', () => {
    expect(windowDays(null)).toBeNull()
  })
})

describe('the contribution line', () => {
  it('reproduces the shape the plan asks for, off the two reads behind it', () => {
    // Össur's newest update, measured read-only on production 2026-09-16: its
    // frozen window carried 205 of September's 449 videos.
    expect(contributionLine('2026-09-01', 205, 449)).toBe(
      'this update’s contribution to September so far: 205 of 449',
    )
    // Sealand's, whose window is thirty days and crosses into August: the part
    // of it that fell in September is 394 of 475.
    expect(contributionLine('2026-09-01', 394, 475)).toBe(
      'this update’s contribution to September so far: 394 of 475',
    )
  })

  it('says so when the window reached back past the month', () => {
    expect(crossingLine('2026-09-01', '2026-08-01')).toContain('also covered days of August')
    expect(crossingLine('2026-09-01', '2026-08-01')).toContain('counts only its September days')
  })

  it('says the crossing alone where no contribution was printed above it', () => {
    // Production today. "The contribution above counts only its September
    // days" under "this update's contribution to it cannot be stated" points a
    // reader at a figure that is not on the page.
    expect(crossedIntoLine('2026-08-01')).toBe('This update also covered days of August.')
    expect(crossedIntoLine('2026-08-01')).not.toContain('contribution')
  })
})

describe('the baseline sentence', () => {
  const forming = baselineStateOf({
    name: 'every audience together',
    weekVideos: 394,
    // Sealand, read-only on production: June 50, July 36, August 407 against a
    // floor of 100 videos — one month of three.
    months: [
      { month: '2026-06-01', videos: 50 },
      { month: '2026-07-01', videos: 36 },
      { month: '2026-08-01', videos: 407 },
    ],
  })

  it('carries the design’s own wording', () => {
    expect(forming.label).toBe('baseline forming — 1 of 3 months')
  })

  it('says WHEN the check can first speak, which "forming" alone does not', () => {
    expect(baselineFormingLine(forming, '2026-09-01')).toBe(
      'baseline forming — 1 of 3 months; the check starts with the November reading.',
    )
    expect(baselineStartsWith(forming, '2026-09-01')).toBe('2026-11-01')
  })

  it('names no month once the baseline is ready', () => {
    const ready = baselineStateOf({
      name: 'every audience together',
      weekVideos: 205,
      // Össur: 232 · 136 · 721, all three over the floor.
      months: [
        { month: '2026-06-01', videos: 232 },
        { month: '2026-07-01', videos: 136 },
        { month: '2026-08-01', videos: 721 },
      ],
    })
    expect(ready.label).toBe('baseline ready')
    expect(baselineStartsWith(ready, '2026-09-01')).toBeNull()
  })

  it('pools every audience together, over the three complete months behind', () => {
    const state = pooledBaseline(
      [
        { month: '2026-06-01', videos: 200 },
        { month: '2026-06-01', videos: 32 },
        { month: '2026-07-01', videos: 136 },
        { month: '2026-08-01', videos: 721 },
        // The month being READ is never its own baseline.
        { month: '2026-09-01', videos: 449 },
      ],
      '2026-09-01',
      205,
    )
    expect(state.monthsClearing).toBe(3)
    expect(state.ready).toBe(true)
    expect(state.denominator).toBe('every audience together')
  })
})

describe('new themes, and the floor that makes them readable', () => {
  it('names what cleared the floor, and how many it was chosen from', () => {
    // Production, 2026-09-16: Össur's newest update first heard 303 themes and
    // exactly 2 of them carry ten videos in September.
    expect(newThemesLine(303, 2)).toBe(
      '2 of the 303 themes first heard in this update carried 10 videos or more this month.',
    )
  })

  it('prints the number it is NOT showing, and why, when none clears', () => {
    // Sealand: 592 first heard, none at ten videos. "No new themes" would be
    // false and "592 new themes" would be the clustering's churn as a finding.
    const line = newThemesLine(592, 0)
    expect(line).toContain('592 themes were heard for the first time')
    expect(line).toContain('none carried 10 videos this month')
    expect(line).toContain('the same conversation under a new label')
  })

  it('says the plain thing when nothing was new at all', () => {
    expect(newThemesLine(0, 0)).toBe('Nothing was heard for the first time in this update.')
  })

  it('keeps its floor where the loader’s does', () => {
    expect(NEW_THEME_FLOOR).toBe(10)
  })
})

describe('the typical tag', () => {
  it('reads where a number sits and never which way it is going', () => {
    expect(typicalTag(31, 22)).toBe('above typical')
    expect(typicalTag(24, 23)).toBe('about typical')
    expect(typicalTag(8, 22)).toBe('below typical')
  })

  it('refuses to compare with nothing', () => {
    expect(typicalTag(null, 22)).toBeNull()
    expect(typicalTag(31, null)).toBeNull()
    expect(typicalTag(31, 0)).toBeNull()
  })
})

describe('what an update typically puts into a subject', () => {
  it('scales the subject’s month size by this update’s share of the month', () => {
    // Össur: 96 client videos in September so far, 14 of them from this update.
    // A subject holding 31 of the month would ordinarily take 31 × 14/96 ≈ 4.5
    // of this update; it took 8, which is above.
    expect(typicalContribution({ monthVideos: 31, monthOf: 96, updateVideos: 14 })).toBeCloseTo(4.52, 2)
    expect(typicalTag(8, typicalContribution({ monthVideos: 31, monthOf: 96, updateVideos: 14 }))).toBe('above typical')
    expect(typicalTag(1, typicalContribution({ monthVideos: 19, monthOf: 96, updateVideos: 14 }))).toBe('below typical')
  })

  it('refuses rather than inventing one', () => {
    // NO WINDOW READ, NO TYPICAL. A subject compared against a denominator
    // nobody read is a tag with nothing behind it.
    expect(typicalContribution({ monthVideos: 31, monthOf: 96, updateVideos: null })).toBeNull()
    expect(typicalContribution({ monthVideos: 31, monthOf: 0, updateVideos: 14 })).toBeNull()
  })
})

describe('the subjects lead', () => {
  const row = (label: string, tag: string | null): SubjectWeekRow => ({
    id: label, label, monthVideos: 20, monthOf: 96, addedVideos: 5, typical: tag ? 4 : null, tag, verdict: null,
  })

  it('counts the rows that ran above typical, k of n, and names them', () => {
    const lead = subjectLead([row('Comfort', 'above typical'), row('Price', 'above typical'), row('Durability', 'below typical')], '2026-09-01')
    expect(lead).toBe('2 of your 3 subjects ran above typical in this update — Comfort and Price each took a larger share of it than they hold of September so far.')
  })

  it('reads as one subject when one ran above', () => {
    const lead = subjectLead([row('Comfort', 'above typical'), row('Price', 'about typical')], '2026-09-01')
    expect(lead).toBe('1 of your 2 subjects ran above typical in this update — Comfort took a larger share of it than it holds of September so far.')
  })

  it('says none rather than leaving the sentence out', () => {
    const lead = subjectLead([row('Comfort', 'about typical'), row('Price', 'below typical')], '2026-09-01')
    expect(lead).toContain('None of your 2 subjects ran above typical')
  })

  it('keeps an uncompared subject OUT of the denominator and says so', () => {
    // A subject the window read cannot answer for has not been compared;
    // folding it into "of 3" would count a silence as a comparison that came
    // back "not above".
    const lead = subjectLead([row('Comfort', 'above typical'), row('Price', 'about typical'), row('Durability', null)], '2026-09-01')
    expect(lead).toContain('1 of the 2 of your 3 subjects this update could be read against')
  })

  it('is null where nothing could be compared at all', () => {
    expect(subjectLead([row('Comfort', null)], '2026-09-01')).toBeNull()
    expect(subjectLead([], '2026-09-01')).toBeNull()
  })

  it('names at most three and counts the rest', () => {
    const rows = ['A', 'B', 'C', 'D', 'E'].map((l) => row(l, 'above typical'))
    expect(subjectLead(rows, '2026-09-01')).toContain('A, B and C and 2 more')
  })

  it('speaks no direction word', () => {
    const lead = subjectLead([row('Comfort', 'above typical'), row('Price', 'below typical')], '2026-09-01')!
    expect(directionRe().test(lead)).toBe(false)
  })
})

describe('a rival post’s caption, standing in for the title it has no column for', () => {
  it('collapses whitespace and keeps a short caption whole', () => {
    expect(postCaption('  Cutting the tarp:\n how one bag  becomes another ')).toBe('Cutting the tarp: how one bag becomes another')
  })

  it('cuts on a word and marks the cut', () => {
    const long = 'Every single bag we make is cut from a different truck tarpaulin, which is why no two of them have ever matched'
    const cut = postCaption(long, 40)
    expect(cut.length).toBeLessThanOrEqual(41)
    expect(cut.endsWith('…')).toBe(true)
    expect(cut).not.toContain('  ')
    expect(long).toContain(cut.slice(0, -1))
  })

  it('is an empty string where the post carries no caption — never an invented one', () => {
    expect(postCaption(null)).toBe('')
    expect(postCaption('   ')).toBe('')
  })
})

describe('the coverage line', () => {
  it('says who, which update, what it covered and how much', () => {
    expect(coverageLine({
      brand: 'Össur',
      update: '2026-09-13T06:26:49.308Z',
      previous: '2026-09-06T12:41:40.114Z',
      window: WINDOW,
      platformMix: { youtube: 120, tiktok: 50, instagram: 30, reddit: 5 },
      videos: 205,
      comments: 5134,
    })).toBe(
      'Prepared for Össur with Verbatim · update of 13 Sep · previous 6 Sep · 6 Sep – 13 Sep · ' +
      'YouTube 120 · TikTok 50 · Instagram 30 · Reddit 5 · 205 videos · 5,134 comments',
    )
  })

  it('says there was no previous update rather than leaving a gap', () => {
    const line = coverageLine({
      brand: 'Sealand', update: '2026-09-10T07:02:10.201Z', previous: null,
      window: null, platformMix: {}, videos: null, comments: null,
    })
    expect(line).toBe('Prepared for Sealand with Verbatim · update of 10 Sep · no previous update')
  })
})

describe('a flag’s figures', () => {
  const flag: UnusualFlag = {
    objectKind: 'kind',
    objectId: 'objection',
    label: 'Objections',
    denominator: 'every audience together',
    week: { k: 28, n: 205 },
    baseline: { k: 38, n: 1089 },
    baselineMonths: ['2026-06-01', '2026-07-01', '2026-08-01'],
    baselineFilling: ['2026-08-01'],
    baselineRegime: 'one',
    changePts: 10.2,
    bandPts: 4.9,
    sentences: [],
    explanationModel: null,
    quotes: [],
    rank: 1,
  }

  it('declares every number the block prints, with its unit', () => {
    const figures = flagFigures(flag, 1)
    expect(Object.keys(figures).sort()).toEqual([
      'flag_1_band', 'flag_1_baseline_of', 'flag_1_baseline_share', 'flag_1_baseline_videos',
      'flag_1_change', 'flag_1_week_of', 'flag_1_week_share', 'flag_1_week_videos',
    ])
    expect(figures.flag_1_week_videos).toEqual({ value: 28, unit: 'videos', label: 'Objections — videos this update' })
    expect(figures.flag_1_change.unit).toBe('pts')
  })

  it('names the two share keys the explainer’s own table offers', () => {
    // `anomaly-check.ts anomalyFigures` hands the model `flag_N_week_share`
    // and `flag_N_baseline_share`; a sentence citing a key this table lacks is
    // dropped whole at render, and those are the two the paragraph is most
    // likely to cite, because the shares are what the flag IS.
    const figures = flagFigures(flag, 1)
    expect(figures.flag_1_week_share.value).toBe(13.7)
    expect(figures.flag_1_week_share.unit).toBe('pct')
    expect(figures.flag_1_baseline_share.value).toBe(3.5)
  })

  it('rounds the points to the one decimal the page prints', () => {
    expect(flagFigures({ ...flag, changePts: 10.23456, bandPts: 4.8712 }, 2).flag_2_change.value).toBe(10.2)
    expect(flagFigures({ ...flag, changePts: 10.23456, bandPts: 4.8712 }, 2).flag_2_band.value).toBe(4.9)
  })
})

describe('the labels What worked prints', () => {
  it('calls the trend-riding hook what it opens on, not what it trends', () => {
    // `hook_style = 'trend-riding'` humanises to "Trend riding", and `trend` is
    // a direction word: a live Sealand render failed the copy contract with
    // `[direction-word] "Trend" outside a data-copy="verdict" node (D1)` while
    // the block tests passed on invented hook labels.
    expect(workedLabel('trend-riding')).toBe('Riding what is current')
    expect(workedLabel('before-after')).toBe('Before and after')
    expect(workedLabel('statistic')).toBe('Statistic')
    expect(workedLabel('behind-the-scenes')).toBe('Behind the scenes')
  })

  it('speaks no direction word anywhere in the classifier’s vocabulary', () => {
    // The whole enum, not the three values a fixture happened to carry — the
    // fixture is exactly how this reached production unseen.
    for (const slug of [...HOOK_STYLES, ...CLASSIFIED_TYPES]) {
      expect(directionRe().test(workedLabel(slug)), slug).toBe(false)
    }
  })
})

describe('the anomaly record’s absence', () => {
  it('is told apart from every other failure, by name', () => {
    expect(isMissingAnomalyRecord({ code: 'PGRST205', message: "Could not find the table 'public.anomaly_checks' in the schema cache" })).toBe(true)
    expect(isMissingAnomalyRecord({ code: '42P01', message: 'relation "anomaly_flags" does not exist' })).toBe(true)
    // An RLS refusal, a network failure and a renamed column are NEWS and must
    // not be swallowed as "the migration has not landed".
    expect(isMissingAnomalyRecord({ code: '42501', message: 'permission denied for table anomaly_flags' })).toBe(false)
    expect(isMissingAnomalyRecord(new Error('fetch failed'))).toBe(false)
    expect(isMissingAnomalyRecord(null)).toBe(false)
  })
})

describe('a flag’s quote refs', () => {
  it('reads the shape the column actually holds, in the writer’s own vocabulary', () => {
    // `[{ref, context}]`, and the ref is `c:<comments.id>` — what
    // `lib/pipeline/anomaly-check.ts candidateQuotes` writes. A reader that
    // kept only strings here would print every flag with no evidence under it,
    // silently, the day the migration lands.
    expect(refsOf([{ ref: 'c:abc', context: 'tiktok' }, { ref: 'c:def' }])).toEqual(['c:abc', 'c:def'])
  })

  it('also reads a bare string list, and drops anything else', () => {
    expect(refsOf(['e:abc', 'c:def'])).toEqual(['e:abc', 'c:def'])
    expect(refsOf([{ context: 'tiktok' }, 42, null, undefined])).toEqual([])
    expect(refsOf(null)).toEqual([])
    expect(refsOf('e:abc')).toEqual([])
  })

  it('sends each ref through the door that can resolve it', () => {
    // The check writes comment ids; `insight_evidence.comment_id` is how a
    // comment reaches an evidence row and `.id` is how an evidence ref does.
    // Reading both off `.id` — which a filter on `e:` alone did — matches
    // nothing the writer has ever written.
    expect(refTargets(['c:c1', 'e:e1', 'c:c2'])).toEqual({ evidenceIds: ['e1'], commentIds: ['c1', 'c2'] })
  })

  it('takes a bare id as a comment id rather than dropping it', () => {
    // The column was written bare until 2026-09-16 and a reader of a stored
    // row should not have to care which deploy wrote it.
    expect(refTargets(['9f1c0e64-0000-4000-8000-000000000001'])).toEqual({
      evidenceIds: [],
      commentIds: ['9f1c0e64-0000-4000-8000-000000000001'],
    })
    expect(refTargets([])).toEqual({ evidenceIds: [], commentIds: [] })
  })
})
