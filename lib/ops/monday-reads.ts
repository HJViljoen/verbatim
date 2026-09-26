import { INDUSTRY_AUDIENCE, audienceOf } from '../rivals'
import { JUDGE_VERSION, SUBJECT_PRECISION_FLOOR, subjectCalibration, wilsonUpper } from '../subjects/types'
import { segmentReason, segmentOfReason } from '../segments/rules'
import { evidenceTerms, normTerm, type GatherRun } from '../provenance/searches'

// The pure halves of scripts/monday-reads.ts: Heinrich's one read-only Monday
// command after the 27 Sep run (market-first plan WP1.0, WP1.8's production
// measures, the deploy-1 prechecks and the six month-table baselines).
//
// PURE. The script reads; everything here only counts what it was handed, so
// the counting is tested offline (AGENTS.md) and the reads stay I/O glue.

// ---- Runs ------------------------------------------------------------------------------

export interface RunLite {
  id: string
  status: string | null
  started_at: string | null
  completed_at?: string | null
  scheduled_for?: string | null
  clustering_key?: string | null
}

/** A run that will not move any more: the pipeline's end states. */
export const FINAL_RUN_STATUSES: ReadonlySet<string> = new Set(['completed', 'partial', 'failed', 'cancelled'])
export const isFinalRun = (status: string | null | undefined): boolean => status != null && FINAL_RUN_STATUSES.has(status)

/** The UTC day of an instant, `YYYY-MM-DD`, or null. */
export function dayOf(iso: string | null | undefined): string | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10)
}

export interface TargetRun {
  run: RunLite | null
  how: 'explicit' | 'run-day' | 'latest-final' | 'none'
  note: string
}

/**
 * The run the grounding reads "after": `explicit` when named; else the run
 * scheduled for or started on `runDay` (UTC; the Sunday 06:00 SAST run is
 * 04:00Z), preferring one with `scheduled_for` that day; else, and said so, the
 * latest run that reached an end state (staging has no 27 Sep run).
 */
export function pickTargetRun(runs: readonly RunLite[], runDay: string, explicit?: string | null): TargetRun {
  if (explicit) {
    const run = runs.find((r) => r.id === explicit || r.id.startsWith(explicit)) ?? null
    return { run, how: run ? 'explicit' : 'none', note: run ? `named run ${run.id}` : `the named run ${explicit} is not among the runs read` }
  }
  const onDay = runs.filter((r) => dayOf(r.scheduled_for) === runDay || dayOf(r.started_at) === runDay)
  if (onDay.length > 0) {
    const scheduled = onDay.filter((r) => dayOf(r.scheduled_for) === runDay)
    const run = [...(scheduled.length > 0 ? scheduled : onDay)].sort((a, b) => (a.started_at ?? '').localeCompare(b.started_at ?? ''))[0]
    return { run, how: 'run-day', note: `the ${runDay} run` }
  }
  const final = runs.filter((r) => isFinalRun(r.status)).sort((a, b) => (b.started_at ?? '').localeCompare(a.started_at ?? ''))
  if (final.length > 0) {
    return { run: final[0], how: 'latest-final', note: `NO RUN ON ${runDay}: reading after the latest finished run instead (${dayOf(final[0].started_at)})` }
  }
  return { run: null, how: 'none', note: `no run on ${runDay} and no finished run` }
}

/** The runs on each named day, for the clustering-key line. */
export function runsOnDays(runs: readonly RunLite[], days: readonly string[]): { day: string; runs: { id: string; status: string | null; clustering_key: string | null }[] }[] {
  return days.map((day) => ({
    day,
    runs: runs
      .filter((r) => dayOf(r.started_at) === day)
      .map((r) => ({ id: r.id, status: r.status, clustering_key: r.clustering_key ?? null })),
  }))
}

// ---- Schedules ---------------------------------------------------------------------------

export interface ScheduleLite { id: string; name: string | null; active: boolean | null }

/** Every schedule row must be off, and the named one must be there and off. */
export function schedulesVerdict(rows: readonly ScheduleLite[], mustId: string): { pass: boolean; found: boolean; active: string[]; rows: number } {
  const active = rows.filter((r) => r.active !== false).map((r) => r.id)
  const found = rows.some((r) => r.id.startsWith(mustId))
  return { pass: found && active.length === 0, found, active, rows: rows.length }
}

// ---- Searches ----------------------------------------------------------------------------

/** The searches one gather ran that the other did not, both ways. */
export function searchSetDiff(a: GatherRun | undefined, b: GatherRun | undefined): { onlyA: string[]; onlyB: string[]; same: boolean } | null {
  if (!a || !b) return null
  const show = (k: string): string => k.replace('\u0000', ':')
  const onlyA = [...a.searches].filter((s) => !b.searches.has(s)).map(show).sort()
  const onlyB = [...b.searches].filter((s) => !a.searches.has(s)).map(show).sort()
  return { onlyA, onlyB, same: onlyA.length === 0 && onlyB.length === 0 }
}

/** Searches per platform in one gather. */
export function searchesPerPlatform(g: GatherRun | undefined): Record<string, number> {
  const out: Record<string, number> = {}
  for (const s of g?.searches ?? []) {
    const p = s.split('\u0000')[0]
    out[p] = (out[p] ?? 0) + 1
  }
  return out
}

/** The terms first searched at or after `since`. */
export function termsFirstSearchedSince(firstSearched: ReadonlyMap<string, string>, since: string): Set<string> {
  const cut = Date.parse(since)
  const out = new Set<string>()
  for (const [t, at] of firstSearched) if (Date.parse(at) >= cut) out.add(t)
  return out
}

/** Every term the current configuration searches: the three keyword lists and
 *  each active community as `r/<name>`, normalised. */
export function currentSearchTerms(cfg: {
  brand_keywords?: string[] | null
  competitor_keywords?: string[] | null
  industry_keywords?: string[] | null
}, activeCommunities: Iterable<string>): Set<string> {
  return evidenceTerms([cfg.brand_keywords, cfg.competitor_keywords, cfg.industry_keywords, [...activeCommunities].map((c) => `r/${c}`)])
}

// ---- Evidence ----------------------------------------------------------------------------

export interface EvidenceVideo { id: string; platform: string; video_id: string; source_keywords: string[] | null }
export interface EvidenceVerdict { platform: string; video_id: string; keyword: string | null }

/**
 * Every search term that shows how each video was surfaced, by video uuid:
 * source_keywords as the staging export held them (to 20 Sep), as production
 * holds them now, and every gate verdict's keyword (the export's, to 20 Sep,
 * and production's since). The same evidence lib/provenance/load.ts
 * `evidenceMap` reads, less the provenance rows MF1 has not written yet.
 */
export function evidenceByVideo(args: {
  now: readonly EvidenceVideo[]
  earlier: readonly EvidenceVideo[]
  verdicts: readonly EvidenceVerdict[]
}): Map<string, Set<string>> {
  const uuidOf = new Map<string, string>()
  for (const v of [...args.earlier, ...args.now]) uuidOf.set(`${v.platform}\u0000${v.video_id}`, v.id)
  const parts = new Map<string, (readonly string[] | null)[]>()
  const push = (id: string, terms: readonly string[] | null) => parts.set(id, [...(parts.get(id) ?? []), terms])
  for (const v of args.earlier) push(v.id, v.source_keywords)
  for (const v of args.now) push(v.id, v.source_keywords)
  for (const g of args.verdicts) {
    const id = uuidOf.get(`${g.platform}\u0000${g.video_id}`)
    if (id && g.keyword) push(id, [g.keyword])
  }
  const out = new Map<string, Set<string>>()
  for (const [id, p] of parts) out.set(id, evidenceTerms(p))
  return out
}

/** Found only by the allowed terms: some evidence, and every term allowed. A
 *  video with no evidence is unknown, never "only". */
export function onlyFrom(evidence: ReadonlySet<string> | undefined, allowed: ReadonlySet<string>): boolean {
  if (!evidence || evidence.size === 0) return false
  for (const t of evidence) if (!allowed.has(t)) return false
  return true
}

/** Any evidence term among these. */
export function anyOf(evidence: ReadonlySet<string> | undefined, terms: ReadonlySet<string>): boolean {
  for (const t of evidence ?? []) if (terms.has(t)) return true
  return false
}

/** The current source_keywords, all current searches (and at least one). */
export function carriesOnlyCurrent(sourceKeywords: readonly string[] | null | undefined, current: ReadonlySet<string>): boolean {
  const terms = [...evidenceTerms([sourceKeywords])]
  return terms.length > 0 && terms.every((t) => current.has(normTerm(t)))
}

// ---- The market ----------------------------------------------------------------------------

export interface AudienceVideo { is_client: boolean | null; is_competitor: boolean | null; competitor_name: string | null }

/** Is this video in the market (the category plus the tracked rivals' audiences)? */
export function inMarket(v: AudienceVideo, marketAudiences: ReadonlySet<string>): boolean {
  return marketAudiences.has(audienceOf(v))
}
export const inCategory = (v: AudienceVideo): boolean => audienceOf(v) === INDUSTRY_AUDIENCE

/** Sum one field of per-audience rows over the market's audiences, per month and key. */
export function pooledBy<R extends { month: string; audience: string }>(
  rows: readonly R[],
  marketAudiences: ReadonlySet<string>,
  keyOf: (r: R) => string,
  valueOf: (r: R) => number | null | undefined,
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {}
  for (const r of rows) {
    if (!marketAudiences.has(r.audience)) continue
    const m = r.month.slice(0, 7)
    const v = valueOf(r)
    if (typeof v !== 'number' || !Number.isFinite(v)) continue
    const k = keyOf(r)
    out[m] = out[m] ?? {}
    out[m][k] = (out[m][k] ?? 0) + v
  }
  return out
}

// ---- Makers and noise on a theme -----------------------------------------------------------

export interface TextVideo extends AudienceVideo {
  id: string
  caption: string | null
  hashtags: string[] | null
  topics: string[] | null
  source_keywords: string[] | null
}

export interface ThemeSegments { refs: number; known: number; maker: number; noise: number; makerShare: number | null; noiseShare: number | null }

/**
 * The v1 rule (lib/segments/rules.ts) over a theme's month videos. Before MF1 no
 * provenance row exists, so the noise rule reads `source_keywords`, as MF1's
 * `theme_maker_shares` does for a video without one. Shares are over the
 * theme's own videos (makerShare = maker / videos, WP1.4). A referenced video
 * the read did not return is counted in `refs` and not in `known`; the share
 * is then over `known`, and the caller prints both.
 */
export function themeSegments(videoIds: readonly string[], byId: ReadonlyMap<string, TextVideo>): ThemeSegments {
  const ids = [...new Set(videoIds)]
  let known = 0
  let maker = 0
  let noise = 0
  for (const id of ids) {
    const v = byId.get(id)
    if (!v) continue
    known++
    const seg = segmentOfReason(segmentReason({ caption: v.caption, hashtags: v.hashtags, topics: v.topics, sourceKeywords: v.source_keywords }))
    if (seg === 'maker') maker++
    else if (seg === 'noise') noise++
  }
  return {
    refs: ids.length,
    known,
    maker,
    noise,
    makerShare: known > 0 ? maker / known : null,
    noiseShare: known > 0 ? noise / known : null,
  }
}

// WP1.6's board rules (lib/pages/overview-market/board.ts and hero.ts on
// mf/wp1-6), restated here because that branch is not in this tree.
export const THEME_FLOOR = 10
export const MAKER_GROUP_SHARE = 0.5
export const LEAD_MAX_MAKER_SHARE = 0.25
export const UNQUOTED_KINDS: ReadonlySet<string> = new Set(['demographic_signal'])

export interface BoardTheme {
  id: string
  label: string
  kind: string | null
  k: number
  matchKind: string | null
  seg: ThemeSegments | null
}

export type BoardGroup = 'makers' | 'noise' | null

export function groupOf(seg: ThemeSegments | null): BoardGroup {
  if (!seg || seg.makerShare == null || seg.noiseShare == null) return null
  const makers = seg.makerShare >= MAKER_GROUP_SHARE
  const set = seg.noiseShare >= MAKER_GROUP_SHARE
  if (makers && set) return seg.makerShare >= seg.noiseShare ? 'makers' : 'noise'
  return makers ? 'makers' : set ? 'noise' : null
}

/**
 * The board as WP1.6 draws it: every theme at the floor, the ones led by makers
 * or noise grouped out, the rest biggest first; and the lead, the first row
 * that may lead (not minted new by this run, not a counted-only kind, maker
 * share measured and at most a quarter). `newRegime`: the run opened a new
 * clustering regime, so its 'new' match kinds re-group and do not mint.
 */
export function boardOf(themes: readonly BoardTheme[], newRegime: boolean): {
  atFloor: number
  rows: BoardTheme[]
  makers: BoardTheme[]
  noise: BoardTheme[]
  lead: BoardTheme | null
} {
  const atFloor = themes.filter((t) => t.k >= THEME_FLOOR && t.label.trim()).sort((a, b) => b.k - a.k || a.id.localeCompare(b.id))
  const makers = atFloor.filter((t) => groupOf(t.seg) === 'makers')
  const noise = atFloor.filter((t) => groupOf(t.seg) === 'noise')
  const rows = atFloor.filter((t) => groupOf(t.seg) == null)
  const lead = rows.find((t) => {
    if (!newRegime && t.matchKind === 'new') return false
    if (t.kind != null && UNQUOTED_KINDS.has(t.kind)) return false
    const s = t.seg?.makerShare
    return s != null && s <= LEAD_MAX_MAKER_SHARE
  }) ?? null
  return { atFloor: atFloor.length, rows, makers, noise, lead }
}

// ---- The name line ---------------------------------------------------------------------------

export const SEALAND_NAME = /sealand/i

/** Up to `width` characters around the first match, on one line. */
export function excerpt(text: string | null | undefined, re: RegExp, width = 160): string | null {
  const s = (text ?? '').replace(/\s+/g, ' ').trim()
  const m = re.exec(s)
  if (!m) return null
  const half = Math.floor(width / 2)
  const from = Math.max(0, m.index - half)
  const to = Math.min(s.length, m.index + m[0].length + half)
  return `${from > 0 ? '…' : ''}${s.slice(from, to)}${to < s.length ? '…' : ''}`
}

/** Where a video names the brand: caption, hashtags or account. */
export function videoNameHits(v: { caption: string | null; hashtags: string[] | null; account_name: string | null }, re: RegExp = SEALAND_NAME): { where: string[]; excerpt: string | null } {
  const where: string[] = []
  if (re.test(v.caption ?? '')) where.push('caption')
  if ((v.hashtags ?? []).some((h) => re.test(h))) where.push('hashtags')
  if (re.test(v.account_name ?? '')) where.push('account')
  return { where, excerpt: excerpt(v.caption, re) ?? excerpt((v.hashtags ?? []).join(' '), re) ?? excerpt(v.account_name, re) }
}

// ---- Subjects ---------------------------------------------------------------------------------

export interface SubjectCalibrationRow {
  calibrated_at: string | null
  calibration_precision: number | string | null
  calibration_n: number | string | null
  calibration_judge_version: string | null
}

const asNumber = (v: number | string | null | undefined): number | null => {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/** WP1.1's three states (lib/subjects/calibration-state.ts on mf/wp1-1, restated). */
export function threeStateCalibration(s: SubjectCalibrationRow, judgeVersion: string = JUDGE_VERSION): 'ready' | 'provisional' | 'failed' {
  if (!s.calibrated_at) return 'provisional'
  if (s.calibration_judge_version !== judgeVersion) return 'provisional'
  const precision = asNumber(s.calibration_precision)
  if (precision == null) return 'provisional'
  if (precision >= SUBJECT_PRECISION_FLOOR) return 'ready'
  const n = asNumber(s.calibration_n)
  if (n == null || n <= 0) return 'provisional'
  return wilsonUpper(precision, n) < SUBJECT_PRECISION_FLOOR ? 'failed' : 'provisional'
}

/** The deployed (mf-d1) two states and WP1.1's three, side by side. */
export function calibrationStates(s: SubjectCalibrationRow): { deployed: string; wp11: string } {
  const precision = asNumber(s.calibration_precision)
  return {
    deployed: subjectCalibration({ calibrated_at: s.calibrated_at, calibration_precision: precision, calibration_judge_version: s.calibration_judge_version }),
    wp11: threeStateCalibration(s),
  }
}

// ---- Words -----------------------------------------------------------------------------------

/** `k of n (p%)`, or `k of n` when n is 0 or unknown. */
export function ofN(k: number | null | undefined, n: number | null | undefined): string {
  if (k == null) return 'not measured'
  if (n == null || n <= 0) return `${k}`
  return `${k} of ${n} (${((100 * k) / n).toFixed(1)}%)`
}

// ---- Fewer pages ------------------------------------------------------------------------------

/**
 * A run's observations by match kind, from a read ordered by match_kind
 * DESCENDING that may stop at the first page holding an 'exact' row. 'exact'
 * is the smallest value theme_observations_match_kind_check allows (exact,
 * new, revived, strong, weak), so every row after it is 'exact' too, and their
 * number is the read's exact count less the other kinds. With no count,
 * `seen` must be every row. Keys sorted.
 */
export function matchKindTally(seen: readonly (string | null)[], total: number | null): { byKind: Record<string, number>; total: number } {
  const byKind: Record<string, number> = {}
  for (const k of seen) byKind[k ?? 'null'] = (byKind[k ?? 'null'] ?? 0) + 1
  if (total != null) {
    const exact = Math.max(0, total - seen.filter((k) => k !== 'exact').length)
    if (exact > 0) byKind.exact = exact
    else delete byKind.exact
  }
  return { byKind: Object.fromEntries(Object.entries(byKind).sort(([a], [b]) => a.localeCompare(b))), total: total ?? seen.length }
}

export interface MembershipVideo { id: string; platform: string; video_id: string }

/**
 * The videos whose September membership the staging export cannot place, in
 * the groups' order (each once, under the first group that holds it), cut
 * into requests of `size` videos across platforms, so a ration that runs out
 * cuts the last group first. `toCheck` is each group's share of the list.
 */
export function membershipPlan<V extends MembershipVideo>(
  groups: readonly { name: string; ids: ReadonlySet<string> }[],
  placed: ReadonlySet<string>,
  byId: ReadonlyMap<string, V>,
  size: number,
): { chunks: V[][]; toCheck: Record<string, number> } {
  const listed = new Set<string>()
  const list: V[] = []
  const toCheck: Record<string, number> = {}
  for (const g of groups) {
    toCheck[g.name] = 0
    for (const id of g.ids) {
      const v = byId.get(id)
      if (!v || placed.has(id) || listed.has(id)) continue
      listed.add(id)
      list.push(v)
      toCheck[g.name]++
    }
  }
  const chunks: V[][] = []
  for (let i = 0; i < list.length; i += size) chunks.push(list.slice(i, i + size))
  return { chunks, toCheck }
}

/** The chunk's videos a comment row names, by platform AND video id (the read
 *  filters the two separately, so a video id another platform shares is not a hit). */
export function videosNamed(chunk: readonly MembershipVideo[], rows: readonly { platform: string; video_id: string }[]): Set<string> {
  const idOf = new Map(chunk.map((v) => [`${v.platform}\u0000${v.video_id}`, v.id]))
  const out = new Set<string>()
  for (const r of rows) {
    const id = idOf.get(`${r.platform}\u0000${r.video_id}`)
    if (id) out.add(id)
  }
  return out
}

// ---- Files ------------------------------------------------------------------------------------

/**
 * A path nothing is at: `path` itself, else the UTC time to the second before
 * the extension (`-113812Z`), else that and a counter (`-113812Z-2`). The
 * snapshot cannot be retaken, so no file is ever replaced.
 */
export function freshPath(path: string, exists: (p: string) => boolean, now: Date = new Date()): string {
  if (!exists(path)) return path
  const stamp = now.toISOString().slice(11, 19).replace(/:/g, '')
  for (let n = 1; ; n++) {
    const p = path.replace(/(\.[a-z]+)?$/, (ext) => `-${stamp}Z${n === 1 ? '' : `-${n}`}${ext}`)
    if (!exists(p)) return p
  }
}
