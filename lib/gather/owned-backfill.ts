// The pure half of scripts/diagnose-owned.ts — its flags and the two decisions
// a backfill makes that the pipeline's owned step does not. Pure; tested in
// owned-backfill.test.ts. The script keeps the I/O.

export interface DiagnoseOwnedArgs {
  clientId: string
  runId: string
  platform: string
  period: string
  /** Explicit window start, YYYY-MM-DD. Replaces the period-derived window,
   *  which reaches back at most 30 days (`periodWindowDays('monthly')`). */
  since: string
  commit: boolean
  comments: boolean
  /** Re-scrape comments on posts that already have a scrape on record. */
  rescrape: boolean
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

/** Parse the script's flags. Dry by default: `--commit` writes, `--comments`
 *  (which spends Apify money) requires it. `today` is injectable for tests. */
export function parseDiagnoseOwnedArgs(argv: string[], today: Date = new Date()): DiagnoseOwnedArgs {
  const args: DiagnoseOwnedArgs = {
    clientId: '', runId: '', platform: '', period: '', since: '', commit: false, comments: false, rescrape: false,
  }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--client') args.clientId = argv[++i]
    else if (argv[i] === '--run') args.runId = argv[++i]
    else if (argv[i] === '--platform') args.platform = argv[++i]
    else if (argv[i] === '--period') args.period = argv[++i]
    else if (argv[i] === '--since') {
      args.since = argv[++i] ?? ''
      if (!args.since) throw new Error('--since wants YYYY-MM-DD, got nothing')
    }
    else if (argv[i] === '--commit') args.commit = true
    else if (argv[i] === '--comments') args.comments = true
    else if (argv[i] === '--rescrape') args.rescrape = true
    else throw new Error(`unknown flag: ${argv[i]}`)
  }
  if (!args.clientId || !args.runId) throw new Error('--client and --run are required')
  if (args.comments && !args.commit) throw new Error('--comments requires --commit (it spends Apify money)')
  if (args.rescrape && !args.comments) throw new Error('--rescrape only means something with --comments')
  if (args.since) {
    // Round-trip check: rejects 2026-02-30 as well as a malformed string.
    const ms = Date.parse(`${args.since}T00:00:00Z`)
    if (!ISO_DAY.test(args.since) || !Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== args.since) {
      throw new Error(`--since wants YYYY-MM-DD, got ${JSON.stringify(args.since)}`)
    }
    if (args.since > today.toISOString().slice(0, 10)) throw new Error(`--since ${args.since} is in the future`)
  }
  return args
}

/** A stored row the backfill needs to know about. */
export interface KnownOwnedRow {
  video_id: string
  /** The delta baseline `scrapeCommentsBatch` stamps: non-null = this post's
   *  comments were scraped at least once. */
  comments_count_at_scrape?: number | null
}

/**
 * Split the upsert. A post not yet stored is new and takes the backfill's
 * `--run`. A post already stored keeps its `run_id`: a later run's dashboard
 * reads `videos.run_id` (`lib/pages/latest-video-run.ts`), and a backfill
 * reaching back to August would otherwise re-tag every September post to the
 * run it was given. Rows are upserted in two calls because PostgREST writes the
 * UNION of the batch's keys — a missing `run_id` in a mixed batch would null it.
 */
export function splitBackfillRows<T extends { video_id: string; run_id: string }>(
  rows: T[],
  known: KnownOwnedRow[],
): { fresh: T[]; refresh: Omit<T, 'run_id'>[] } {
  const stored = new Set(known.map((k) => k.video_id))
  const fresh: T[] = []
  const refresh: Omit<T, 'run_id'>[] = []
  for (const row of rows) {
    if (stored.has(row.video_id)) {
      const { run_id: _drop, ...rest } = row
      void _drop
      refresh.push(rest)
    } else fresh.push(row)
  }
  return { fresh, refresh }
}

/** The comment refs still worth paying for: posts whose comments were never
 *  scraped. The runs since mid-August already scraped theirs, and a backfill
 *  from 1 Aug would otherwise buy them all again. `rescrape` pays anyway. */
export function unscrapedRefs<R extends { video_id: string }>(
  refs: R[],
  known: KnownOwnedRow[],
  rescrape: boolean,
): R[] {
  if (rescrape) return refs
  const scraped = new Set(known.filter((k) => k.comments_count_at_scrape != null).map((k) => k.video_id))
  return refs.filter((r) => !scraped.has(r.video_id))
}
