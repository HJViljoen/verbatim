import { describe, expect, it } from 'vitest'

import { methodRecordFixture } from '../test/method-fixture'
import { buildPlaybook } from './playbook'
import {
  BRIEF_UNIT,
  LABEL_RULE,
  PLAYBOOK_EMPTY,
  QUARTER_NEEDS,
  buildPlaybookSlide,
  buildRecordSlide,
  heldBackRow,
  instrumentRow,
  languageRow,
  numberRows,
  sourcesRow,
  videosRow,
} from './content-brief'

// The content brief's own reading, tested as pure logic (Block D wave 2,
// E-content). Nothing here mocks a loader: every function takes the shape the
// loader hands it and returns the shape a block draws.

const MONTH = '2026-09-01'

describe('the numbers card', () => {
  it('always names the unit, even with no record at all', () => {
    expect(numberRows(null)).toEqual([{ label: 'The unit', value: BRIEF_UNIT, figure: false }])
  })

  it('states the language share on the basis it was measured on (D15)', () => {
    const row = languageRow({ analysed: 2_359, unknown: 604, english: 1_281, notEnglish: 474, basis: 'video_speech' })
    expect(row!.value).toContain('of what was said on camera was not in English')
    // AND ITS DENOMINATOR IS THE VIDEOS WHOSE LANGUAGE WE KNOW, not the whole
    // corpus: 604 of Össur's analysed videos carry no language at all, and
    // dividing by the corpus would print a share of a population the
    // measurement never reached.
    expect(row!.value).toContain('474 of 1,755')
  })

  it('draws no language row where no language was ever recorded — which is not “all English”', () => {
    expect(languageRow({ analysed: 0, unknown: 0, english: 0, notEnglish: 0, basis: 'video_speech' })).toBeNull()
    expect(languageRow({ analysed: 900, unknown: 900, english: 0, notEnglish: 0, basis: 'video_speech' })).toBeNull()
  })

  it('says a refusal of zero in words rather than printing a zero', () => {
    expect(heldBackRow(methodRecordFixture({ comparisonsRefused: 0 }))!.value).toContain('No comparison was refused')
    expect(heldBackRow(methodRecordFixture({ comparisonsRefused: 1 }))!.value).toBe('1 comparison not drawn')
    expect(heldBackRow(methodRecordFixture({ comparisonsRefused: null }))).toBeNull()
  })

  it('dates the instrument by the update it was measured on (D9)', () => {
    expect(instrumentRow(methodRecordFixture())!.value).toContain('on the most recent update')
    expect(instrumentRow(methodRecordFixture({ instrument: { themesPerVideo: null, themeAttachments: 0, analysedVideos: 0, runId: null } }))).toBeNull()
  })

  it('draws no coverage rows at all where the month tables are not applied', () => {
    const fresh = methodRecordFixture({ coverage: null })
    expect(sourcesRow(fresh)).toBeNull()
    expect(videosRow(fresh)).toBeNull()
    expect(numberRows(fresh).map((r) => r.label)).not.toContain('Sources')
  })
})

describe('the record slide', () => {
  const record = methodRecordFixture()

  it('carries the Reddit cap and the label rule, which no brief has printed', () => {
    const slide = buildRecordSlide({ month: MONTH, monthStatus: 'filling', record, delivery: null, readings: 3 })
    expect(slide.reddit).toContain('capped at 40 per thread')
    expect(slide.labels).toBe(LABEL_RULE)
  })

  it('prints the reading counter only where the months have been counted', () => {
    const counted = buildRecordSlide({ month: MONTH, monthStatus: 'filling', record, delivery: null, readings: 3 })
    expect(counted.counter).toBe(`your 3rd monthly reading · the quarter view needs ${QUARTER_NEEDS}`)
    // NULL IS NOT ZERO. "We have not started counting" and "no month has been
    // read" are different sentences, and `readingsCounter(0)` says the second.
    const uncounted = buildRecordSlide({ month: MONTH, monthStatus: 'filling', record, delivery: null, readings: null })
    expect(uncounted.counter).toBeNull()
  })

  it('is empty only when there is neither a record nor a delivery line', () => {
    expect(buildRecordSlide({ month: MONTH, monthStatus: 'filling', record: null, delivery: null, readings: null }).empty).toContain('has not been read')
    expect(buildRecordSlide({ month: MONTH, monthStatus: 'filling', record: null, delivery: '2 updates', readings: null }).empty).toBeNull()
    expect(buildRecordSlide({ month: MONTH, monthStatus: 'filling', record, delivery: null, readings: null }).empty).toBeNull()
  })

  it('normalises the month it was handed', () => {
    const slide = buildRecordSlide({ month: '2026-09-18', monthStatus: 'filling', record, delivery: null, readings: 1 })
    expect(slide.month).toBe('2026-09-01')
    expect(slide.monthLabel).toBe('September')
  })
})

describe('the playbook slide', () => {
  const videos = [
    { id: 'a', upload_date: '2026-09-04', platform: 'tiktok', classified_type: 'review', hook_style: 'spoken', engagement_rate: 4.2, is_client: false, is_competitor: false, competitor_name: null, source: null, sentiment: null, sentiment_source: null, analyzed_lane: null },
    { id: 'b', upload_date: '2026-09-06', platform: 'tiktok', classified_type: 'review', hook_style: 'spoken', engagement_rate: 3.8, is_client: false, is_competitor: false, competitor_name: null, source: null, sentiment: null, sentiment_source: null, analyzed_lane: null },
    { id: 'c', upload_date: '2026-09-08', platform: 'tiktok', classified_type: 'demo', hook_style: 'text', engagement_rate: 6.1, is_client: false, is_competitor: false, competitor_name: null, source: null, sentiment: null, sentiment_source: null, analyzed_lane: null },
    { id: 'd', upload_date: '2026-09-09', platform: 'youtube', classified_type: 'demo', hook_style: 'text', engagement_rate: 5.4, is_client: true, is_competitor: false, competitor_name: null, source: 'owned', sentiment: null, sentiment_source: null, analyzed_lane: null },
  ]

  it('says so rather than drawing a hole when nothing was published', () => {
    const slide = buildPlaybookSlide({ playbook: null, brand: 'Sealand', rival: null })
    expect(slide.empty).toBe(PLAYBOOK_EMPTY)
    expect(slide.below).toEqual([])
  })

  it('carries the builder’s own below-median rows rather than recomputing them', () => {
    const playbook = buildPlaybook({ month: MONTH, brand: 'Sealand', rival: null, videos })
    const slide = buildPlaybookSlide({ playbook, brand: 'Sealand', rival: null })
    expect(slide.empty).toBeNull()
    expect(slide.below).toBe(playbook.below)
  })

  it('is empty where the table would have no rows, not merely where the read failed', () => {
    const none = buildPlaybook({ month: MONTH, brand: 'Sealand', rival: null, videos: [] })
    expect(buildPlaybookSlide({ playbook: none, brand: 'Sealand', rival: null }).empty).toBe(PLAYBOOK_EMPTY)
  })
})
