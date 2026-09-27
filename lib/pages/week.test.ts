import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

import { CLASSIFIED_TYPES, HOOK_STYLES } from '../pipeline/schemas'
import { baselineStateOf } from '../reading/anomaly'
import { directionRe } from '../test/copy-contract'
import {
  baselineFormingLine,
  baselineStartsWith,
  audienceContributionLine,
  contributionLine,
  crossedIntoLine,
  coverageLine,
  crossingLine,
  flagFigures,
  isMissingAnomalyRecord,
  newThemesLine,
  NEW_THEME_FLOOR,
  opensClusteringRegime,
  loadNewThemes,
  marketSubjectsOf,
  marketSubjectArrivals,
  clipToMonth,
  pooledSubjectCounts,
  previousThemedRegime,
  regroupedFor,
  regroupedLine,
  pooledBaseline,
  refsOf,
  postCaption,
  refTargets,
  subjectLead,
  subjectsNamedLine,
  typicalContribution,
  typicalTag,
  windowDays,
  workedLabel,
  type SubjectWeekRow,
  type UnusualFlag,
  type WeekWindow,
} from './week'
import {
  comparableBaselineFrom,
  heardAtFloor,
  heardBlockOf,
  marketCameIn,
  monthsAfter,
  replyContextWords,
  updatesInto,
} from './week'
import { ourChangesWithoutGatherFlags as withoutFlags } from '../reading/gather-flags'
import { STAGING_CHANGES } from '../test/week-fixture'

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

  it('names every audience on one line, and says nothing where nothing was read', () => {
    // Design review F11: the restatement is per row and the line is one, so a
    // row is one line and the bars read as a comparable column again.
    const rows = [
      { label: 'Your own brand', contribution: { videos: 14, of: 96 } },
      { label: 'Ottobock', contribution: { videos: 47, of: 118 } },
      { label: 'The category', contribution: null },
    ]
    expect(audienceContributionLine('2026-09-01', rows)).toBe(
      'this update’s contribution to September so far, by audience: Your own brand 14 of 96 · Ottobock 47 of 118',
    )
    // Production today on both tenants: the windowed reading is not installed,
    // so there is no contribution to state and the line is not drawn at all.
    expect(audienceContributionLine('2026-09-01', [{ label: 'Your own brand', contribution: null }])).toBeNull()
    expect(audienceContributionLine('2026-09-01', [])).toBeNull()
  })

  it('says so when the window reached back past the month', () => {
    expect(crossingLine('2026-09-01', '2026-08-01')).toContain('also covered days of August')
    expect(crossingLine('2026-09-01', '2026-08-01')).toBe('This update also covered days of August.')
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
    expect(forming.label).toBe('baseline forming: 1 of 3 months')
  })

  it('says WHEN the check can first speak, which "forming" alone does not', () => {
    expect(baselineFormingLine(forming, '2026-09-01')).toBe(
      'baseline forming: 1 of 3 months; the check starts with the November reading.',
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
    expect(line).not.toContain('the same conversation under a new label')
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
    expect(lead).toBe('2 of your 3 subjects ran above typical in this update: Comfort and Price.')
  })

  it('reads as one subject when one ran above', () => {
    const lead = subjectLead([row('Comfort', 'above typical'), row('Price', 'about typical')], '2026-09-01')
    expect(lead).toBe('1 of your 2 subjects ran above typical in this update: Comfort.')
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

  // DECISION C (WP1.1): the rows are the READY subjects; the others are
  // named without a figure, and still count among the subjects you named.
  it('counts every confirmed subject in "of your N", the withheld ones too', () => {
    // Production, 25 Sep: five ready, three failed.
    const lead = subjectLead([row('Comfort', 'above typical'), row('Price', 'about typical')], '2026-09-01', 5)
    expect(lead).toContain('1 of the 2 of your 5 subjects this update could be read against')
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

describe('when the subjects were named', () => {
  it('names one date where they were named in one sitting', () => {
    expect(subjectsNamedLine([
      '2026-08-19T09:12:00.000Z', '2026-08-19T09:14:00.000Z', '2026-08-19T09:15:00.000Z',
    ])).toBe('3 subjects named 19 Aug')
  })

  it('names the first where they were named on different days', () => {
    // Six subjects named 19 Aug is the mock's line and the common case; a
    // seventh named in September has no single naming date to share, and
    // printing one would date three months of measurement to the wrong day.
    expect(subjectsNamedLine(['2026-08-19T09:12:00.000Z', '2026-09-03T10:00:00.000Z']))
      .toBe('2 subjects, the first named 19 Aug')
  })

  it('reads as one subject when there is one', () => {
    expect(subjectsNamedLine(['2026-08-19T09:12:00.000Z'])).toBe('1 subject named 19 Aug')
  })

  it('is null where nothing carries a naming date', () => {
    expect(subjectsNamedLine([])).toBeNull()
    expect(subjectsNamedLine([null, null])).toBeNull()
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

// ---- market-first WP1.9: the first update of a new clustering regime -------------

describe('the re-grouped rule — a regime-opening update mints, it does not hear', () => {
  // A key in lib/pipeline/clustering.ts's own shape.
  const K1 = 'a=v4;c=0.58'
  const K2 = 'a=v5;c=0.58'

  it('opens a regime when the key differs from the previous themed update’s', () => {
    expect(opensClusteringRegime(K2, { key: K1 })).toBe(true)
    expect(opensClusteringRegime(K1, { key: K1 })).toBe(false)
  })

  it('reads two missing keys as one regime: every update before the key, and a database without the column', () => {
    // Staging's 20 Sep and 15 Sep updates both carry no key.
    expect(opensClusteringRegime(null, { key: null })).toBe(false)
    expect(opensClusteringRegime(undefined, { key: undefined })).toBe(false)
    expect(opensClusteringRegime('', { key: null })).toBe(false)
  })

  it('reads a keyed update after an unkeyed one as a new regime: nothing says it held (plan §4.2 identityNewThisRun)', () => {
    expect(opensClusteringRegime(K1, { key: null })).toBe(true)
    expect(opensClusteringRegime(null, { key: K1 })).toBe(true)
  })

  it('opens nothing on a tenant’s first themed update', () => {
    expect(opensClusteringRegime(K1, null)).toBe(false)
    expect(opensClusteringRegime(null, null)).toBe(false)
  })

  it('says how many identities the update re-grouped, dated by the update', () => {
    // Staging's 20 Sep update minted 468 identities (b67b56de, first_seen).
    const r = { update: '2026-09-20T08:33:47.358Z', themes: 468 }
    expect(regroupedLine(r)).toBe('Re-grouped with the 20 Sep update: 468 themes.')
    expect(regroupedLine({ ...r, themes: 1 })).toBe('Re-grouped with the 20 Sep update: 1 theme.')
    // And the first-heard line gives way to it: nothing is counted as heard.
    expect(newThemesLine(0, 0, NEW_THEME_FLOOR, r)).toBe('Re-grouped with the 20 Sep update: 468 themes.')
    expect(newThemesLine(468, 9, NEW_THEME_FLOOR, null)).toContain('9 of the 468 themes first heard')
  })

  it('carries no em dash and no direction word', () => {
    const line = regroupedLine({ update: '2026-09-20T08:33:47.358Z', themes: 468 })
    expect(line).not.toContain('\u2014')
    expect(line).not.toMatch(directionRe())
  })
})

// ---- the re-grouped decision, and the reads that feed it (WP1.9 review) ----------
//
// No staging render reaches this branch: every staging update so far carries a
// null `clustering_key`, and null equals null. So the decision is tested pure,
// and the two reads behind it against a client that records every call.

describe('regroupedFor — the loader’s decision, pure', () => {
  const K1 = 'a=v4;c=0.58'
  const K2 = 'a=v5;c=0.58'
  const regime = (clusteringKey: string | null) => ({ clusteringKey, date: '2026-09-20T08:33:47.358Z' })

  it('counts every minted identity as re-grouped when the update opened a regime', () => {
    expect(regroupedFor(['r1', 'r2'], regime(K2), { key: K1 })).toEqual({ update: '2026-09-20T08:33:47.358Z', themes: 2 })
  })

  it('keeps the first-heard list under the same regime, on a first update, and with nothing minted', () => {
    expect(regroupedFor(['r1'], regime(K1), { key: K1 })).toBeNull()
    expect(regroupedFor(['r1'], regime(null), { key: null })).toBeNull()
    expect(regroupedFor(['r1'], regime(K2), null)).toBeNull()
    expect(regroupedFor([], regime(K2), { key: K1 })).toBeNull()
  })
})

type Op = [string, unknown[]]

/** A client that records each query's calls and answers from `answer`. */
function recordingClient(answer: (table: string, ops: Op[]) => unknown[]) {
  const calls: { table: string; ops: Op[] }[] = []
  const client = {
    from(table: string) {
      const call = { table, ops: [] as Op[] }
      calls.push(call)
      const chain: Record<string, unknown> = {}
      for (const method of ['select', 'eq', 'neq', 'not', 'lt', 'lte', 'gt', 'in', 'order', 'limit', 'range']) {
        chain[method] = (...args: unknown[]) => {
          call.ops.push([method, args])
          return chain
        }
      }
      chain.maybeSingle = () => {
        call.ops.push(['maybeSingle', []])
        return Promise.resolve({ data: answer(table, call.ops)[0] ?? null, error: null })
      }
      chain.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve({ data: answer(table, call.ops), error: null }).then(resolve, reject)
      return chain
    },
  } as unknown as SupabaseClient
  return { client, calls }
}

describe('loadNewThemes — the reads behind the re-grouped rule (market-first WP1.9)', () => {
  const K1 = 'a=v4;c=0.58'
  const K2 = 'a=v5;c=0.58'
  const CLIENT = 'client-1'
  const NOW = 'run-now'
  const BEFORE = 'run-before'
  const STARTED = '2026-09-20T08:00:00.000Z'
  const MONTH = '2026-09-01'
  const regime = (clusteringKey: string | null) => ({ clusteringKey, startedAt: STARTED, date: '2026-09-20T08:33:47.358Z' })
  // Three stand-in identities; the first two cross the floor this month.
  const FRESH = [
    { registry_id: 'reg-a', label: 'Theme a' },
    { registry_id: 'reg-b', label: 'Theme b' },
    { registry_id: 'reg-c', label: 'Theme c' },
  ]
  const READINGS = [
    { theme_id: 'reg-a', videos: NEW_THEME_FLOOR, month: MONTH, audience: 'industry-other' },
    { theme_id: 'reg-b', videos: NEW_THEME_FLOOR + 1, month: MONTH, audience: 'industry-other' },
    { theme_id: 'reg-c', videos: NEW_THEME_FLOOR - 1, month: MONTH, audience: 'industry-other' },
  ]
  const has = (ops: Op[], method: string, ...args: unknown[]) =>
    ops.some(([m, a]) => m === method && JSON.stringify(a) === JSON.stringify(args))

  const world = (opts: { fresh?: unknown[]; before?: unknown[]; run?: unknown[]; readings?: unknown[] }) =>
    recordingClient((table, ops) => {
      if (table === 'themes') return has(ops, 'eq', 'first_seen', true) ? opts.fresh ?? FRESH : opts.before ?? []
      if (table === 'pipeline_runs') return opts.run ?? []
      if (table === 'month_theme_readings') return opts.readings ?? READINGS
      return []
    })

  it('asks for the newest theme row from another run written before this update started, then that run’s key', async () => {
    const { client, calls } = world({ before: [{ run_id: BEFORE, created_at: '2026-09-15T09:00:00.000Z' }], run: [{ id: BEFORE, clustering_key: K1 }] })
    expect(await previousThemedRegime(client, CLIENT, NOW, STARTED)).toEqual({ key: K1 })
    const [themes, run] = calls
    expect(themes.table).toBe('themes')
    expect(has(themes.ops, 'eq', 'client_id', CLIENT)).toBe(true)
    expect(has(themes.ops, 'neq', 'run_id', NOW)).toBe(true)
    expect(has(themes.ops, 'not', 'run_id', 'is', null)).toBe(true)
    expect(has(themes.ops, 'lt', 'created_at', STARTED)).toBe(true)
    expect(has(themes.ops, 'order', 'created_at', { ascending: false })).toBe(true)
    expect(has(themes.ops, 'limit', 1)).toBe(true)
    expect(run.table).toBe('pipeline_runs')
    expect(has(run.ops, 'eq', 'client_id', CLIENT)).toBe(true)
    expect(has(run.ops, 'eq', 'id', BEFORE)).toBe(true)
  })

  it('answers null with no start to bound by, or no themed update before it', async () => {
    const unbounded = world({})
    expect(await previousThemedRegime(unbounded.client, CLIENT, NOW, null)).toBeNull()
    expect(unbounded.calls).toHaveLength(0)
    const first = world({ before: [] })
    expect(await previousThemedRegime(first.client, CLIENT, NOW, STARTED)).toBeNull()
    expect(first.calls.map((c) => c.table)).toEqual(['themes'])
  })

  it('reads a previous run without the column as a null key', async () => {
    const { client } = world({ before: [{ run_id: BEFORE, created_at: '2026-09-15T09:00:00.000Z' }], run: [{ id: BEFORE }] })
    expect(await previousThemedRegime(client, CLIENT, NOW, STARTED)).toEqual({ key: null })
  })

  it('counts a regime-opening update’s identities as re-grouped and reads no month for them', async () => {
    const { client, calls } = world({ before: [{ run_id: BEFORE, created_at: '2026-09-15T09:00:00.000Z' }], run: [{ id: BEFORE, clustering_key: K1 }] })
    const out = await loadNewThemes(client, CLIENT, NOW, MONTH, regime(K2))
    expect(out).toEqual({ seen: 0, shown: [], regrouped: { update: '2026-09-20T08:33:47.358Z', themes: 3 } })
    expect(calls.map((c) => c.table)).toEqual(['themes', 'themes', 'pipeline_runs'])
    expect(has(calls[0].ops, 'eq', 'run_id', NOW)).toBe(true)
  })

  it('keeps the first-heard list under the same regime', async () => {
    const { client, calls } = world({ before: [{ run_id: BEFORE, created_at: '2026-09-15T09:00:00.000Z' }], run: [{ id: BEFORE, clustering_key: K2 }] })
    const out = await loadNewThemes(client, CLIENT, NOW, MONTH, regime(K2))
    expect(out.regrouped).toBeNull()
    expect(out.seen).toBe(3)
    expect(out.shown.map((t) => t.id)).toEqual(['reg-b', 'reg-a'])
    expect(calls.map((c) => c.table)).toEqual(['themes', 'themes', 'pipeline_runs', 'month_theme_readings'])
  })

  it('reads the month and every month before it, in every audience, in one request', async () => {
    const { client, calls } = world({ before: [{ run_id: BEFORE, created_at: '2026-09-15T09:00:00.000Z' }], run: [{ id: BEFORE, clustering_key: K2 }] })
    await loadNewThemes(client, CLIENT, NOW, MONTH, regime(K2), { audience: 'industry-other' })
    const reads = calls.filter((c) => c.table === 'month_theme_readings')
    expect(reads).toHaveLength(1)
    expect(has(reads[0].ops, 'lte', 'month', MONTH)).toBe(true)
    expect(has(reads[0].ops, 'gt', 'videos', 0)).toBe(true)
    expect(reads[0].ops.some(([m, a]) => m === 'eq' && (a as unknown[])[0] === 'audience')).toBe(false)
  })

  it('leaves out a minted identity an earlier month holds, in any audience (staging: the 20 Sep update gave August rows to four of the six it minted)', async () => {
    const readings = [
      ...READINGS,
      { theme_id: 'reg-b', videos: 3, month: '2026-08-01', audience: 'competitor:cotopaxi' },
      { theme_id: 'reg-a', videos: 4, month: '2026-09-01', audience: 'client' },
    ]
    const { client } = world({ before: [{ run_id: BEFORE, created_at: '2026-09-15T09:00:00.000Z' }], run: [{ id: BEFORE, clustering_key: K2 }], readings })
    const out = await loadNewThemes(client, CLIENT, NOW, MONTH, regime(K2), { audience: 'industry-other' })
    // reg-b held August rows: not first heard. reg-a's client row is this
    // month's, another audience's: not counted on the category, not "before".
    expect(out.seen).toBe(2)
    expect(out.shown).toEqual([{ id: 'reg-a', label: 'Theme a', videos: NEW_THEME_FLOOR }])
    // Every audience's rows count where none is asked.
    const all = world({ before: [{ run_id: BEFORE, created_at: '2026-09-15T09:00:00.000Z' }], run: [{ id: BEFORE, clustering_key: K2 }], readings })
    expect((await loadNewThemes(all.client, CLIENT, NOW, MONTH, regime(K2))).shown).toEqual([{ id: 'reg-a', label: 'Theme a', videos: NEW_THEME_FLOOR + 4 }])
  })

  it('keeps it on a tenant’s first themed update, and reads nothing more when nothing was minted', async () => {
    const first = world({ before: [] })
    expect((await loadNewThemes(first.client, CLIENT, NOW, MONTH, regime(K2))).regrouped).toBeNull()
    const none = world({ fresh: [] })
    expect(await loadNewThemes(none.client, CLIENT, NOW, MONTH, regime(K2))).toEqual({ seen: 0, shown: [], regrouped: null })
    expect(none.calls.map((c) => c.table)).toEqual(['themes'])
  })
})

// ---- market-first WP2.7 · the subjects on the market ---------------------------

describe('marketSubjectsOf (market-first WP2.7)', () => {
  // Staging, Sealand, 26 Sep: September's rows, the 20 Sep update's window rows
  // and the month's denominators (654 in the market).
  const RIVALS = ['competitor:Cotopaxi', 'competitor:Freitag', 'competitor:Patagonia', 'competitor:The North Face']
  const counts = new Map([['2026-09-01', { month: '2026-09-01', videos: 654, comments: 16204, category: 625, rivalFiled: 29 }]])
  const base = {
    subjects: [
      { id: 'looks', name: 'Looks & style', status: 'active' },
      { id: 'repair', name: 'Repair & warranty', status: 'active' },
      { id: 'community', name: 'Community & purpose', status: 'active' },
      { id: 'price', name: 'Price', status: 'active' },
      { id: 'old', name: 'A proposed subject', status: 'proposed' },
    ],
    calibrationOf: new Map([['looks', 'ready' as const], ['repair', 'failed' as const], ['community', 'provisional' as const], ['price', 'provisional' as const]]),
    unread: new Set(['community']),
    unreadWords: 'no reading yet',
    month: '2026-09-01',
    stored: [
      { subject_id: 'looks', audience: 'competitor:Freitag', videos: 1 },
      { subject_id: 'looks', audience: 'industry-other', videos: 102 },
      { subject_id: 'looks', audience: 'client', videos: 2 },
      { subject_id: 'repair', audience: 'industry-other', videos: 33 },
      { subject_id: 'price', audience: 'competitor:Cotopaxi', videos: 1 },
      { subject_id: 'price', audience: 'competitor:Freitag', videos: 1 },
      { subject_id: 'price', audience: 'industry-other', videos: 23 },
    ],
    added: [
      { subject_id: 'looks', audience: 'competitor:Freitag', videos: 1 },
      { subject_id: 'looks', audience: 'industry-other', videos: 72 },
      { subject_id: 'price', audience: 'competitor:Freitag', videos: 1 },
      { subject_id: 'price', audience: 'industry-other', videos: 12 },
      { subject_id: 'community', audience: 'client', videos: 4 },
      { subject_id: 'community', audience: 'industry-other', videos: 3 },
    ],
    counts,
    rivalAudiences: RIVALS,
  }

  it('pools the category and the tracked brands, never the client’s own posts', () => {
    const b = marketSubjectsOf(base)
    const looks = b.rows.find((r) => r.id === 'looks')!
    expect(looks.market).toEqual({ monthSoFar: { k: 103, n: 654, pct: 15.7, verdict: null, observed: true }, thisUpdate: 73 })
    expect(b.market).toEqual({ month: '2026-09-01', n: 654 })
  })

  it('prints a provisional subject’s market figure, marked, and never a verdict', () => {
    const price = marketSubjectsOf(base).rows.find((r) => r.id === 'price')!
    expect(price.calibration).toBe('provisional')
    expect(price.market?.monthSoFar.k).toBe(25)
    expect(price.market?.thisUpdate).toBe(13)
    expect(price.verdict).toBeNull()
    expect(price.market?.monthSoFar.verdict).toBeNull()
  })

  it('withholds a failed subject and one the month was not read for, with their words', () => {
    const b = marketSubjectsOf(base)
    expect(b.rows.map((r) => r.id)).toEqual(['looks', 'price'])
    expect(b.withheld).toEqual([
      { id: 'repair', label: 'Repair & warranty', calibration: 'failed' },
      { id: 'community', label: 'Community & purpose', calibration: 'provisional', unread: 'no reading yet' },
    ])
  })

  it('says "not recorded" (null) for this update where the windowed read cannot answer, never 0', () => {
    const b = marketSubjectsOf({ ...base, added: null })
    expect(b.rows.every((r) => r.market?.thisUpdate === null)).toBe(true)
    expect(b.rows.every((r) => r.addedVideos === null)).toBe(true)
  })

  it('reads 0 for a read subject no market video cited this update', () => {
    const b = marketSubjectsOf({ ...base, added: [] })
    expect(b.rows.map((r) => r.market?.thisUpdate)).toEqual([0, 0])
  })

  it('leaves a rival that is no longer tracked out of both counts', () => {
    const b = marketSubjectsOf({ ...base, rivalAudiences: RIVALS.filter((a) => a !== 'competitor:Freitag') })
    const looks = b.rows.find((r) => r.id === 'looks')!
    expect(looks.market?.monthSoFar.k).toBe(102)
    expect(looks.market?.thisUpdate).toBe(72)
  })
})

describe('the update’s days in a month, pooled on the market (WP2.7, the weekly’s WR2 too)', () => {
  it('clips a window that reaches back into the month before to the month’s first day', () => {
    // Sealand's 10 Sep update covered 11 Aug to 10 Sep.
    expect(clipToMonth({ from: '2026-08-11T07:02:10.201Z', to: '2026-09-10T07:02:10.201Z' }, '2026-09-01'))
      .toEqual({ from: '2026-09-01', to: '2026-09-10T07:02:10.201Z' })
    // The 20 Sep update's days are all September's.
    expect(clipToMonth({ from: '2026-09-10T07:02:10.201Z', to: '2026-09-20T04:02:57.874Z' }, '2026-09-01'))
      .toEqual({ from: '2026-09-10T07:02:10.201Z', to: '2026-09-20T04:02:57.874Z' })
    // A window that ends before the month puts nothing into it.
    expect(clipToMonth({ from: '2026-08-11', to: '2026-09-01' }, '2026-09-01')).toBeNull()
  })

  it('gives the weekly no count, never "+0" on every row, where the update\'s days all fall before its month', async () => {
    // The weekly on 2 Oct reads October; the 20 Sep update (staging) covered
    // 10 to 20 Sep, so it put nothing into October and nothing is read.
    const reading = new Proxy({}, { get: () => { throw new Error('no read expected') } }) as never
    expect(await marketSubjectArrivals(reading, 'c', { from: '2026-09-10T07:02:10.201Z', to: '2026-09-20T04:02:57.874Z' }, '2026-10-01', [])).toBeNull()
    expect(await marketSubjectArrivals(reading, 'c', null, '2026-10-01', [])).toBeNull()
  })

  it('sums the category and the tracked brands, never the client’s own posts or an untracked rival', () => {
    // Staging, the 20 Sep update's window: Community & purpose carried 4 of
    // the client's own videos, 1 filed under The North Face and 3 in the
    // category.
    const pooled = pooledSubjectCounts([
      { subject_id: 'community', audience: 'client', videos: 4 },
      { subject_id: 'community', audience: 'competitor:The North Face', videos: 1 },
      { subject_id: 'community', audience: 'industry-other', videos: 3 },
      { subject_id: 'community', audience: 'competitor:Poler', videos: 2 },
      { subject_id: 'community', audience: 'industry-other', videos: 3 },
    ], ['competitor:The North Face'])
    expect(pooled.get('community')).toBe(4)
  })
})

// ---- market-first WP3.7: "With this update", "Heard for the first time" ------


// Sealand's 20 Sep update on staging, the window clipped to September
// (`window_denominators`, read 27 Sep): the rows the page pools.
const SEALAND_20_SEP_WINDOW = [
  { audience: 'industry-other', videos: 421, comments: 9271 },
  { audience: 'competitor:Cotopaxi', videos: 1, comments: 48 },
  { audience: 'competitor:The North Face', videos: 6, comments: 44 },
  { audience: 'competitor:Patagonia', videos: 5, comments: 97 },
  { audience: 'competitor:Freitag', videos: 3, comments: 11 },
  { audience: 'competitor:Freedom of Movement', videos: 0, comments: 0 },
  { audience: 'client', videos: 4, comments: 69 },
]
const SEALAND_TRACKED = ['competitor:Cotopaxi', 'competitor:Freitag', 'competitor:Rareform', 'competitor:The North Face', 'competitor:Patagonia', 'competitor:Freedom of Movement', 'competitor:Old School']

describe('marketCameIn (WP3.7): what the update brought into the market’s month', () => {
  it('pools the category and the brands you track, and leaves your own posts out (decision E)', () => {
    const m = marketCameIn({ month: '2026-09-01', update: '2026-09-20T08:33:47.358Z', read: SEALAND_20_SEP_WINDOW, rivalAudiences: SEALAND_TRACKED, monthVideos: 654, updates: 3, now: '2026-09-22T12:00:00.000Z' })!
    expect(m.category).toEqual({ videos: 421, comments: 9271 })
    expect(m.brands).toEqual({ videos: 15, comments: 200 })
    expect(m.market).toEqual({ videos: 436, comments: 9471 })
    expect(m.ended).toBe(false)
  })

  it('has no brands row for a tenant that tracks none, and says nothing where the read is not there', () => {
    const m = marketCameIn({ month: '2026-09-01', update: '2026-09-20T08:33:47.358Z', read: SEALAND_20_SEP_WINDOW, rivalAudiences: [], monthVideos: 625, updates: 3, now: '2026-10-02T06:00:00.000Z' })!
    expect(m.brands).toBeNull()
    expect(m.market).toEqual({ videos: 421, comments: 9271 })
    expect(m.ended).toBe(true)
    expect(marketCameIn({ month: '2026-09-01', update: '2026-09-20T08:33:47.358Z', read: null, rivalAudiences: SEALAND_TRACKED, monthVideos: 654, updates: 3, now: '2026-09-22T12:00:00.000Z' })).toBeNull()
  })

  it('counts the updates that read the month, this one included (staging: 9, 10 and 20 Sep)', () => {
    const runs = ['2026-08-17T09:00:00.000Z', '2026-09-09T10:12:00.000Z', '2026-09-10T07:17:02.291Z', '2026-09-20T08:33:47.358Z', '2026-09-24T09:00:00.000Z']
    expect(updatesInto('2026-09-01', runs, '2026-09-20T08:33:47.358Z')).toBe(3)
  })
})

describe('heardBlockOf (WP3.7): the themes first heard, grouped as the board groups them', () => {
  const fresh = { seen: 374, shown: [
    { id: 'aed3a6d0-5fe9-456f-b8a9-f1cd096f062c', label: 'Preference for secondhand fashion', videos: 10 },
    { id: '4f4bc420-8906-44ac-878d-2855c1011485', label: 'Laundry planning for travel', videos: 10 },
  ], regrouped: null }
  const segments = {
    maker: new Map([['4f4bc420-8906-44ac-878d-2855c1011485', 0.1], ['aed3a6d0-5fe9-456f-b8a9-f1cd096f062c', 0.2]]),
    noise: new Map([['4f4bc420-8906-44ac-878d-2855c1011485', 0], ['aed3a6d0-5fe9-456f-b8a9-f1cd096f062c', 0]]),
  }

  it('lists the market’s own, largest first then by id, each with its maker share and provenance', () => {
    const h = heardBlockOf({ month: '2026-09-01', fresh, segments, segmentsState: 'measured', provenance: new Map([['4f4bc420-8906-44ac-878d-2855c1011485', { fromNewSearches: 8, of: 10 }]]) })
    expect(h.rows.map((r) => r.label)).toEqual(['Laundry planning for travel', 'Preference for secondhand fashion'])
    expect(h.rows[0].provenance).toEqual({ fromNewSearches: 8, of: 10 })
    expect(h.rows[1].provenance).toBeNull()
    expect(h.prevMonth).toBe('2026-08-01')
    expect(heardAtFloor(h)).toBe(2)
  })

  it('groups a theme half or more makers’ into the makers line (decision F), counted with the floor', () => {
    const makers = { maker: new Map([...segments.maker, ['aed3a6d0-5fe9-456f-b8a9-f1cd096f062c', 0.6]]), noise: segments.noise }
    const h = heardBlockOf({ month: '2026-09-01', fresh, segments: makers, segmentsState: 'measured', provenance: new Map() })
    expect(h.rows.map((r) => r.label)).toEqual(['Laundry planning for travel'])
    expect(h.makers).toEqual({ count: 1, lead: [expect.objectContaining({ label: 'Preference for secondhand fashion' })] })
    expect(heardAtFloor(h)).toBe(2)
  })

  it('names nothing after an update that re-grouped the themes (WP1.9)', () => {
    const h = heardBlockOf({ month: '2026-09-01', fresh: { seen: 0, shown: [], regrouped: { update: '2026-09-20T08:33:47.358Z', themes: 468 } }, segments, segmentsState: 'measured', provenance: new Map() })
    expect(h.rows).toEqual([])
    expect(h.regrouped?.themes).toBe(468)
  })
})

describe('replyContextWords (WP3.7): the reply row’s context in the market’s words', () => {
  it('names a community as itself and a tracked brand’s video as filed under it', () => {
    expect(replyContextWords('under @r/heronebag’s post · competitor · 3 likes')).toBe('r/heronebag · filed under a brand you track · 3 likes')
    expect(replyContextWords('under @thenorthface’s post · competitor')).toBe('under @thenorthface’s post · filed under a brand you track')
    expect(replyContextWords('under @melania beadedbag’s post · 622 likes')).toBe('under @melania beadedbag’s post · 622 likes')
    expect(replyContextWords('under a category video')).toBe('under a category video')
  })
})

describe('comparableBaselineFrom (WP3.7): the unusual-week baseline on comparable months', () => {
  it('holds none of September’s three and forecasts January’s flags on staging’s change log', () => {
    const b = comparableBaselineFrom({ month: '2026-09-01', now: '2026-09-22T12:00:00.000Z', changes: withoutFlags(STAGING_CHANGES), rows: [] })
    expect(b.kept).toBe(0)
    expect(b.required).toBe(3)
    expect(b.flagsFrom).toBe('2027-01-01')
  })

  it('counts three months forward from a month', () => {
    expect(monthsAfter('2026-10-01', 3)).toBe('2027-01-01')
  })
})

describe('marketCameIn and heardBlockOf, their edges (WP3.7)', () => {
  it('counts a retired brand out of the market (the tracked list is the market)', () => {
    const m = marketCameIn({ month: '2026-09-01', update: '2026-09-20T08:33:47.358Z', read: SEALAND_20_SEP_WINDOW, rivalAudiences: ['competitor:Patagonia'], monthVideos: 654, updates: 3, now: '2026-09-22T12:00:00.000Z' })!
    expect(m.brands).toEqual({ videos: 5, comments: 97 })
    expect(m.market).toEqual({ videos: 426, comments: 9368 })
  })

  it('reads a missing comment count as none, never as a gap in the sum', () => {
    const m = marketCameIn({ month: '2026-09-01', update: '2026-09-20T08:33:47.358Z', read: [{ audience: 'industry-other', videos: 10 }], rivalAudiences: [], monthVideos: null, updates: null, now: '2026-09-22T12:00:00.000Z' })!
    expect(m.category).toEqual({ videos: 10, comments: 0 })
    expect(m.monthVideos).toBeNull()
  })

  it('keys the month to its first day, whatever instant it is handed', () => {
    const m = marketCameIn({ month: '2026-09-20T04:02:57.874Z', update: '2026-09-20T08:33:47.358Z', read: [], rivalAudiences: [], monthVideos: 0, updates: 0, now: '2026-09-22T12:00:00.000Z' })!
    expect(m.month).toBe('2026-09-01')
  })

  it('updatesInto counts no update from before the month or after the page’s own', () => {
    expect(updatesInto('2026-09-01', ['2026-08-31T23:59:00.000Z', '2026-09-27T06:00:00.000Z'], '2026-09-20T08:33:47.358Z')).toBe(0)
  })

  it('heardBlockOf groups an off-topic-led theme as set aside, not as makers', () => {
    const h = heardBlockOf({
      month: '2026-09-01',
      fresh: { seen: 3, shown: [{ id: 'r1', label: 'Poker night', videos: 12 }], regrouped: null },
      segments: { maker: new Map([['r1', 0]]), noise: new Map([['r1', 0.8]]) },
      segmentsState: 'measured',
      provenance: new Map(),
    })
    expect(h.rows).toEqual([])
    expect(h.setAside?.count).toBe(1)
    expect(h.makers).toBeNull()
  })

  it('heardBlockOf lists every theme where nothing was measured (no maker rule)', () => {
    const h = heardBlockOf({
      month: '2026-09-01',
      fresh: { seen: 93, shown: [{ id: '19c24f49-be3f-4a9c-8acb-1072de3078d4', label: 'Brand boycott over politics', videos: 16 }], regrouped: null },
      segments: null,
      segmentsState: 'no_rule',
      provenance: new Map(),
    })
    expect(h.rows.map((r) => r.k)).toEqual([16])
    expect(h.segments).toBe('no_rule')
  })

  it('replyContextWords leaves an own post’s words alone', () => {
    expect(replyContextWords('under your post · 41 likes')).toBe('under your post · 41 likes')
  })
})
