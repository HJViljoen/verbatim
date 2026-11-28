// The Instagram search dry run's pure half (28 Nov 2026): its flags and its
// report. The script, scripts/ig-search-dry-run.ts, is the glue that loads a
// client's config, runs each planned Instagram search through the real
// router and adapter, and prints what this module formats. PURE.

export interface DryRunArgs {
  clientId: string
  /** Override tracking_configs.max_videos (still the per-search limit). */
  maxVideos?: number
  /** Override tracking_configs.report_period (the bound when no --since). */
  period?: string
  /** The window's lower bound, 'YYYY-MM-DD', as a run's frozen window. */
  since?: string
  /** Only these keywords (as configured); empty = every planned keyword. */
  keywords: string[]
  /** GATHER_INSTAGRAM_SEARCH_PROVIDERS for this process, e.g. 'tikhub'. */
  providers?: string
  samples: number
  parallel: number
  help: boolean
}

export const DRY_RUN_USAGE = `Instagram search dry run: every planned Instagram search for one client, through
the same router and adapter the pipeline uses (TikHub first, Apify last), with
nothing written to the database.

  node --env-file=.env.local --import tsx scripts/ig-search-dry-run.ts --client <uuid> [flags]

  --client <uuid>        the client (default: Ossur)
  --since <YYYY-MM-DD>   the window's lower bound, as a run's frozen window
                         (default: the client's report period back from today)
  --max-videos <n>       the per-search limit (default: tracking_configs.max_videos)
  --period <name>        override the report period (daily | weekly | monthly)
  --keyword <text>       only this keyword (repeatable)
  --providers <list>     the source order for this run, e.g. tikhub or tikhub,apify
                         (default: GATHER_INSTAGRAM_SEARCH_PROVIDERS, else tikhub,apify)
  --samples <n>          captions to print at the end (default 20)
  --parallel <n>         searches at once (default 3, the pipeline's)
  --help                 this

Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (the config is
read), TREG_API_KEY or TIKHUB_API_KEY (TikHub), and APIFY_TOKEN when Apify
runs as the fallback. It SPENDS: TikHub at $0.002 a page (at most 8 a search),
and Apify whenever a search falls back to it.`

const DATE = /^\d{4}-\d{2}-\d{2}$/

/** The flags, or a thrown error naming the bad one. */
export function parseDryRunArgs(argv: readonly string[], defaults: { clientId: string }): DryRunArgs {
  const args: DryRunArgs = { clientId: defaults.clientId, keywords: [], samples: 20, parallel: 3, help: false }
  const count = (flag: string, v: string | undefined): number => {
    const n = Number(v)
    if (!Number.isInteger(n) || n < 1) throw new Error(`${flag} needs a whole number above 0, got ${v ?? 'nothing'}`)
    return n
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const value = (): string => {
      const v = argv[++i]
      if (v === undefined || v.startsWith('--')) throw new Error(`${a} needs a value`)
      return v
    }
    if (a === '--help' || a === '-h') args.help = true
    else if (a === '--client') args.clientId = value()
    else if (a === '--since') {
      const v = value()
      if (!DATE.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) throw new Error(`--since needs YYYY-MM-DD, got ${v}`)
      args.since = v
    } else if (a === '--max-videos') args.maxVideos = count(a, value())
    else if (a === '--period') args.period = value()
    else if (a === '--keyword') args.keywords.push(value())
    else if (a === '--providers') args.providers = value()
    else if (a === '--samples') args.samples = count(a, value())
    else if (a === '--parallel') args.parallel = count(a, value())
    else throw new Error(`unknown flag: ${a}`)
  }
  return args
}

/** One search as the report shows it. */
export interface DryRunSearch {
  keyword: string
  variant: string
  /** The source whose answer was used; null when the search threw. */
  provider: string | null
  error?: string
  /** TikHub's HTTP calls for this search (pages, retries included). */
  calls: number
  /** Distinct items TikHub's feed handed back, in the window or not; null
   *  when TikHub did not answer. */
  seen: number | null
  /** Distinct videos the search returned, normalised (what `videos_found`
   *  counts), and those on or after the lower bound. */
  found: number
  inWindow: number
  /** TikHub's charge; Apify's is not known to a dry run. */
  costUsd: number
  notes: string[]
  /** In-window videos: id and caption. */
  videos: { id: string; caption: string }[]
}

const usd = (n: number) => `$${n.toFixed(3)}`
const oneLine = (s: string, max: number) => {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

/** Up to `n` captions, taken round-robin across the searches so every
 *  keyword shows, each video once. */
export function sampleCaptions(searches: readonly DryRunSearch[], n: number): { keyword: string; caption: string }[] {
  const out: { keyword: string; caption: string }[] = []
  const seen = new Set<string>()
  for (let round = 0; out.length < n; round++) {
    let any = false
    for (const s of searches) {
      const v = s.videos[round]
      if (!v) continue
      any = true
      if (seen.has(v.id) || !v.caption.trim()) continue
      seen.add(v.id)
      out.push({ keyword: s.keyword, caption: v.caption })
      if (out.length >= n) break
    }
    if (!any) break
  }
  return out
}

/** The report: a line a search, then the totals, then sample captions. */
export function formatDryRun(searches: readonly DryRunSearch[], opts: { since: string; samples: number }): string {
  const lines: string[] = []
  lines.push(`window: posts on or after ${opts.since}`)
  lines.push('')
  for (const s of searches) {
    const head = `${s.keyword} [${s.variant}]`
    if (!s.provider) {
      lines.push(`${head}: FAILED (${s.error ?? 'no reason'})`)
    } else {
      const tik = s.calls ? ` · TikHub ${s.calls} call${s.calls === 1 ? '' : 's'}, ${s.seen ?? 0} seen, ${usd(s.costUsd)}` : ''
      lines.push(`${head}: ${s.provider} · ${s.found} found, ${s.inWindow} in window${tik}`)
    }
    for (const note of s.notes) lines.push(`    note: ${note}`)
  }
  const byKeyword = new Map<string, Set<string>>()
  for (const s of searches) {
    const set = byKeyword.get(s.keyword) ?? new Set<string>()
    for (const v of s.videos) set.add(v.id)
    byKeyword.set(s.keyword, set)
  }
  const all = new Set(searches.flatMap((s) => s.videos.map((v) => v.id)))
  const providers = new Map<string, number>()
  for (const s of searches) providers.set(s.provider ?? 'failed', (providers.get(s.provider ?? 'failed') ?? 0) + 1)
  const calls = searches.reduce((n, s) => n + s.calls, 0)
  const cost = searches.reduce((n, s) => n + s.costUsd, 0)
  lines.push('')
  lines.push(`totals: ${searches.length} searches (${[...providers].map(([p, n]) => `${p} ${n}`).join(', ')})`)
  lines.push(`  in window: ${all.size} distinct videos; Σ per keyword (what keyword_performance.videos_found adds up) ${[...byKeyword.values()].reduce((n, set) => n + set.size, 0)}`)
  lines.push(`  TikHub: ${calls} calls, ${usd(cost)}`)
  const notes = searches.reduce((n, s) => n + s.notes.length, 0)
  if (notes) lines.push(`  notes: ${notes} across ${searches.filter((s) => s.notes.length).length} searches`)
  const sample = sampleCaptions(searches, opts.samples)
  lines.push('')
  lines.push(`sample captions (${sample.length}):`)
  sample.forEach((c, i) => lines.push(`${String(i + 1).padStart(2)}. [${c.keyword}] ${oneLine(c.caption, 160)}`))
  return lines.join('\n')
}
