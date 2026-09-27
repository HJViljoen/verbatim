import {
  evidenceTerms,
  firstSearched,
  gathersOf,
  isAddedOnly,
  searchesFirstRunIn,
  type KeywordRow,
} from '../../provenance/searches'

// The lead theme's "{x} of its {n} videos came from searches we added in
// September" (market-first WP1.6; the hero rule in the WP, `MarketTheme.
// provenance`), and in time the board's and Conversation's "From searches
// added in Sep" column; and, by the same rule, Subjects' "Where we found
// them" (`foundSplit`).
//
// THE MONTH'S ONE FIGURE, OVER A THEME'S OWN VIDEOS (the ruling of 26 Sep). A
// video counts when its search evidence is non-empty and made up only of
// searches FIRST RUN in the reading month (lib/provenance/searches.ts
// isAddedOnly: the definition measure-comparability stores as 356 of
// September's 654 market videos on staging). A search is a term, or a
// community written `r/<name>`; its first run is its earliest gather in
// keyword_performance, on any platform, a gather dated by its earliest row.
// A video any older search also surfaced does not count, whether that search
// still runs or was removed; nor does one with no evidence, or one whose
// provenance is 'ambiguous'.
//
// NOT THE CHANGE LOG, AND NOT FIRST-FOUND TERMS ALONE. The rule this replaced
// read the log's `terms` and `subreddits` rows and each video's first-found
// terms, which gives 320 of 625: on 9 Sep the log only flips r/backpacks from
// candidate to active (it has run since 17 Aug), and it never logs r/onebag as
// active (it first ran on 9 Sep).
//
// THE EVIDENCE THE PAGE HOLDS: first-found terms and communities
// (`video_provenance`, MF1), the video's source_keywords now, and every gate
// verdict's keyword. measure-comparability also reads the provenance
// snapshots, which are files: a theme's count here can only be the same or
// higher than those files would make it, never lower, and on staging the
// snapshot adds nothing (no gather since it was taken).
//
// PURE. Null where there is nothing to measure against (no provenance rows:
// MF1 not applied), never a zero.

/** The searches first run in `month`, from keyword_performance rows. */
export function searchesAddedIn(month: string, keywordRows: readonly KeywordRow[]): Set<string> {
  return searchesFirstRunIn(firstSearched(gathersOf(keywordRows, [])), month)
}

/** What the page holds about how each of a theme's videos was found. */
export interface ThemeEvidence {
  /** `video_provenance`, keyed by the video's uuid. */
  provenance: readonly { video_id: string; first_terms: readonly string[] | null; first_subreddits: readonly string[] | null; method?: string | null }[]
  /** The videos themselves: their platform key and current source_keywords. */
  videos: readonly { id: string; platform: string; video_id: string; source_keywords: readonly string[] | null }[]
  /** `gate_verdicts`, by the platform's own video id. */
  verdicts: readonly { platform: string; video_id: string; keyword: string | null }[]
}

/** Each video's search evidence (its first-found terms and communities, its
 *  source_keywords now and every gate verdict's keyword) and its provenance
 *  method: what `isAddedOnly` is asked about, read one way for every caller. */
function evidenceOf(evidence: ThemeEvidence): (id: string) => { terms: Set<string>; method: string | null | undefined } {
  const provenance = new Map(evidence.provenance.map((p) => [p.video_id, p]))
  const videos = new Map(evidence.videos.map((v) => [v.id, v]))
  const verdictTerms = new Map<string, string[]>()
  for (const g of evidence.verdicts) {
    if (!g.keyword) continue
    const key = `${g.platform}\u0000${g.video_id}`
    verdictTerms.set(key, [...(verdictTerms.get(key) ?? []), g.keyword])
  }
  return (id) => {
    const p = provenance.get(id)
    const v = videos.get(id)
    const terms = evidenceTerms([
      p?.first_terms, p?.first_subreddits, v?.source_keywords,
      v ? verdictTerms.get(`${v.platform}\u0000${v.video_id}`) : null,
    ])
    return { terms, method: p?.method }
  }
}

/** How many of `videoIds` were found only by searches first run in the month. */
export function fromNewSearches(
  videoIds: readonly string[],
  evidence: ThemeEvidence,
  added: ReadonlySet<string>,
): { fromNewSearches: number; of: number } | null {
  if (videoIds.length === 0 || evidence.provenance.length === 0) return null
  const of = evidenceOf(evidence)
  const ids = new Set(videoIds)
  let count = 0
  for (const id of ids) {
    const { terms, method } = of(id)
    if (isAddedOnly(terms, added, method)) count += 1
  }
  return { fromNewSearches: count, of: ids.size }
}

/** A subject's videos this month by where we found them (`foundSplit`); the
 *  three parts add up to `of`. */
export interface FoundSplit { of: number; before: number; added: number; unrecorded: number }

/**
 * WHERE A SUBJECT'S VIDEOS WERE FOUND (Subjects, "Where we found them": the
 * approved preview's inner block under the pane's headline). The month's
 * videos of one subject, split three ways:
 *
 *   - `added`: found only by searches first run in the month. EXACTLY
 *     `fromNewSearches`' count (the front page's settled figure's rule,
 *     `isAddedOnly`), over the same evidence;
 *   - `before`: surfaced by at least one search first run before the month
 *     (it ran before the month, so what the month added cannot account for
 *     the video, whether or not an added search found it too);
 *   - `unrecorded`: neither. A video with no evidence, one whose provenance is
 *     'ambiguous' (the gather that first stored it searched none of its
 *     evidence) and names no older search, or one found only by searches
 *     keyword_performance never shows running. Zero on staging's September
 *     (654 market videos: 356 added, 298 before).
 *
 * Null where there is nothing to split against: no videos, no provenance rows
 * (MF1 not applied), or no search first run in the month (every video is then
 * on searches we ran before it, which says nothing). Null too where a video
 * neither added nor before names a search first run AFTER the month: a past
 * month read later (staging's August: 13 of Comfort's 28 and 9 of Looks &
 * style's 38 were found only by the 9 Sep searches), where "no record of the
 * search that found them" would be false and the month's two parts do not
 * cover it. PURE.
 */
export function foundSplit(
  videoIds: readonly string[],
  evidence: ThemeEvidence,
  keywordRows: readonly KeywordRow[],
  month: string,
): FoundSplit | null {
  if (videoIds.length === 0 || evidence.provenance.length === 0) return null
  const first = firstSearched(gathersOf(keywordRows, []))
  const added = searchesFirstRunIn(first, month)
  if (added.size === 0) return null
  const monthStart = Date.parse(`${month.slice(0, 7)}-01T00:00:00Z`)
  const start = new Date(monthStart)
  const monthEnd = Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)
  // `evidenceTerms` and `firstSearched` both key a search by `normTerm`.
  const firstRun = (term: string): number => {
    const at = first.get(term)
    return at == null ? Number.NaN : Date.parse(at)
  }
  const of = evidenceOf(evidence)
  const ids = new Set(videoIds)
  const out: FoundSplit = { of: ids.size, before: 0, added: 0, unrecorded: 0 }
  for (const id of ids) {
    const { terms, method } = of(id)
    if (isAddedOnly(terms, added, method)) out.added += 1
    else if ([...terms].some((t) => firstRun(t) < monthStart)) out.before += 1
    // Found later, by a search the month had not run yet: not a split to print.
    else if ([...terms].some((t) => firstRun(t) >= monthEnd)) return null
    else out.unrecorded += 1
  }
  return out
}
