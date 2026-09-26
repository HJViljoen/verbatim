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
// added in Sep" column.
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

/** How many of `videoIds` were found only by searches first run in the month. */
export function fromNewSearches(
  videoIds: readonly string[],
  evidence: ThemeEvidence,
  added: ReadonlySet<string>,
): { fromNewSearches: number; of: number } | null {
  if (videoIds.length === 0 || evidence.provenance.length === 0) return null
  const provenance = new Map(evidence.provenance.map((p) => [p.video_id, p]))
  const videos = new Map(evidence.videos.map((v) => [v.id, v]))
  const verdictTerms = new Map<string, string[]>()
  for (const g of evidence.verdicts) {
    if (!g.keyword) continue
    const key = `${g.platform}\u0000${g.video_id}`
    verdictTerms.set(key, [...(verdictTerms.get(key) ?? []), g.keyword])
  }
  const ids = new Set(videoIds)
  let count = 0
  for (const id of ids) {
    const p = provenance.get(id)
    const v = videos.get(id)
    const terms = evidenceTerms([
      p?.first_terms, p?.first_subreddits, v?.source_keywords,
      v ? verdictTerms.get(`${v.platform}\u0000${v.video_id}`) : null,
    ])
    if (isAddedOnly(terms, added, p?.method)) count += 1
  }
  return { fromNewSearches: count, of: ids.size }
}
