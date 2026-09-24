import { describe, it, expect } from 'vitest'
import { parseDiagnoseOwnedArgs, splitBackfillRows, unscrapedRefs } from './owned-backfill'

const base = ['--client', 'c', '--run', 'r']
const today = new Date('2026-09-24T12:00:00Z')

describe('parseDiagnoseOwnedArgs', () => {
  it('is dry by default and takes no window of its own', () => {
    const a = parseDiagnoseOwnedArgs(base, today)
    expect(a).toMatchObject({ clientId: 'c', runId: 'r', since: '', commit: false, comments: false, rescrape: false })
  })

  it('takes --since for a backfill past the 30-day period window', () => {
    const a = parseDiagnoseOwnedArgs([...base, '--since', '2026-08-01', '--commit', '--comments'], today)
    expect(a).toMatchObject({ since: '2026-08-01', commit: true, comments: true })
  })

  it('refuses a malformed, impossible or future --since', () => {
    expect(() => parseDiagnoseOwnedArgs([...base, '--since', '2026-8-1'], today)).toThrow(/YYYY-MM-DD/)
    expect(() => parseDiagnoseOwnedArgs([...base, '--since', '2026-02-30'], today)).toThrow(/YYYY-MM-DD/)
    expect(() => parseDiagnoseOwnedArgs([...base, '--since'], today)).toThrow(/YYYY-MM-DD/)
    expect(() => parseDiagnoseOwnedArgs([...base, '--since', '2026-09-25'], today)).toThrow(/future/)
  })

  it('spends nothing without --commit, and --rescrape needs --comments', () => {
    expect(() => parseDiagnoseOwnedArgs([...base, '--comments'], today)).toThrow(/requires --commit/)
    expect(() => parseDiagnoseOwnedArgs([...base, '--commit', '--rescrape'], today)).toThrow(/--rescrape/)
    expect(() => parseDiagnoseOwnedArgs(['--run', 'r'], today)).toThrow(/required/)
    expect(() => parseDiagnoseOwnedArgs([...base, '--bogus'], today)).toThrow(/unknown flag/)
  })
})

describe('splitBackfillRows', () => {
  it('new posts take the backfill run; stored posts keep theirs', () => {
    const rows = [
      { video_id: 'aug', run_id: 'r', views: 1 },
      { video_id: 'sep', run_id: 'r', views: 2 },
    ]
    const { fresh, refresh } = splitBackfillRows(rows, [{ video_id: 'sep' }])
    expect(fresh).toEqual([{ video_id: 'aug', run_id: 'r', views: 1 }])
    expect(refresh).toEqual([{ video_id: 'sep', views: 2 }])
    expect('run_id' in refresh[0]).toBe(false)
  })
})

describe('unscrapedRefs', () => {
  const refs = [{ video_id: 'a' }, { video_id: 'b' }, { video_id: 'c' }]
  const known = [
    { video_id: 'a', comments_count_at_scrape: 12 },
    { video_id: 'b', comments_count_at_scrape: null },
  ]

  it('skips posts whose comments were already scraped', () => {
    expect(unscrapedRefs(refs, known, false).map((r) => r.video_id)).toEqual(['b', 'c'])
  })

  it('--rescrape pays for all of them', () => {
    expect(unscrapedRefs(refs, known, true)).toEqual(refs)
  })
})
