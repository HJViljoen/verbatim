import { describe, it, expect } from 'vitest'
import { formatDryRun, parseDryRunArgs, sampleCaptions, type DryRunSearch } from './dry-run'

// The Instagram search dry run's flags and report (28 Nov 2026). The script
// itself (scripts/ig-search-dry-run.ts) is glue over routedSearch.

const D = { clientId: 'default-client' }

describe('parseDryRunArgs', () => {
  it('defaults to the default client, every keyword, 20 samples, 3 at once', () => {
    expect(parseDryRunArgs([], D)).toEqual({ clientId: 'default-client', keywords: [], samples: 20, parallel: 3, help: false })
  })

  it('reads every flag', () => {
    expect(parseDryRunArgs(['--client', 'c1', '--since', '2026-11-22', '--max-videos', '40', '--period', 'monthly', '--keyword', 'sealand gear', '--keyword', 'ossur', '--providers', 'tikhub', '--samples', '5', '--parallel', '2'], D)).toEqual({
      clientId: 'c1', since: '2026-11-22', maxVideos: 40, period: 'monthly', keywords: ['sealand gear', 'ossur'], providers: 'tikhub', samples: 5, parallel: 2, help: false,
    })
    expect(parseDryRunArgs(['--help'], D).help).toBe(true)
    expect(parseDryRunArgs(['-h'], D).help).toBe(true)
  })

  it('refuses a bad date, a bad number, a missing value and an unknown flag', () => {
    expect(() => parseDryRunArgs(['--since', '22-11-2026'], D)).toThrow('--since needs YYYY-MM-DD')
    expect(() => parseDryRunArgs(['--since', '2026-13-40'], D)).toThrow('--since needs YYYY-MM-DD')
    expect(() => parseDryRunArgs(['--samples', '0'], D)).toThrow('--samples needs a whole number above 0')
    expect(() => parseDryRunArgs(['--max-videos', 'ten'], D)).toThrow('--max-videos needs a whole number')
    expect(() => parseDryRunArgs(['--client'], D)).toThrow('--client needs a value')
    expect(() => parseDryRunArgs(['--client', '--since', '2026-11-22'], D)).toThrow('--client needs a value')
    expect(() => parseDryRunArgs(['--dry'], D)).toThrow('unknown flag: --dry')
  })
})

const search = (over: Partial<DryRunSearch>): DryRunSearch => ({
  keyword: 'kw', variant: 'reels', provider: 'tikhub', calls: 0, seen: null, found: 0, inWindow: 0, costUsd: 0, notes: [], videos: [], ...over,
})

describe('formatDryRun', () => {
  const searches = [
    search({ keyword: 'sealand gear', variant: 'reels', calls: 8, seen: 170, found: 31, inWindow: 31, costUsd: 0.016, videos: [{ id: 'A', caption: 'first\ncaption' }, { id: 'B', caption: 'second' }] }),
    search({ keyword: 'sealand gear', variant: 'posts', provider: 'apify', calls: 1, seen: 0, found: 3, inWindow: 2, costUsd: 0.002, notes: ['TikHub found nothing, so the search also tried Apify'], videos: [{ id: 'A', caption: 'first\ncaption' }, { id: 'C', caption: 'third' }] }),
    search({ keyword: 'ossur', variant: 'reels', provider: null, error: 'Apify 500: down', calls: 1, costUsd: 0 }),
  ]

  it('prints a line a search, its notes, then the totals and the captions', () => {
    expect(formatDryRun(searches, { since: '2026-11-22', samples: 20 })).toBe([
      'window: posts on or after 2026-11-22',
      '',
      'sealand gear [reels]: tikhub · 31 found, 31 in window · TikHub 8 calls, 170 seen, $0.016',
      'sealand gear [posts]: apify · 3 found, 2 in window · TikHub 1 call, 0 seen, $0.002',
      '    note: TikHub found nothing, so the search also tried Apify',
      'ossur [reels]: FAILED (Apify 500: down)',
      '',
      'totals: 3 searches (tikhub 1, apify 1, failed 1)',
      '  in window: 3 distinct videos; Σ per keyword (what keyword_performance.videos_found adds up) 3',
      '  TikHub: 10 calls, $0.018',
      '  notes: 1 across 1 searches',
      '',
      'sample captions (3):',
      ' 1. [sealand gear] first caption',
      ' 2. [sealand gear] second',
      ' 3. [sealand gear] third',
    ].join('\n'))
  })

  it('samples round-robin across searches, each video once, no empty captions', () => {
    const s = [
      search({ keyword: 'a', videos: [{ id: '1', caption: 'a1' }, { id: '2', caption: 'a2' }, { id: '3', caption: 'a3' }] }),
      search({ keyword: 'b', videos: [{ id: '1', caption: 'a1' }, { id: '4', caption: '' }, { id: '5', caption: 'b3' }] }),
    ]
    expect(sampleCaptions(s, 4)).toEqual([
      { keyword: 'a', caption: 'a1' }, { keyword: 'a', caption: 'a2' }, { keyword: 'a', caption: 'a3' }, { keyword: 'b', caption: 'b3' },
    ])
    expect(sampleCaptions(s, 2)).toHaveLength(2)
    expect(sampleCaptions([], 20)).toEqual([])
  })
})
