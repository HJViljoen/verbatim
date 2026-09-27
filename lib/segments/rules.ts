import { SEALAND_CLIENT_ID } from '../config'

// Segments v1: the maker rule and the noise rule (market-first decision F,
// plan WP1.4). ONE PLACE. The SQL copy inside MF1
// (supabase/migrations/20260928090000_market_first_s1.sql, the function
// `segments_v1_reason`) is generated from this file by `segmentsV1Sql()`, and
// rules.test.ts fails when the two drift; `scripts/pg-shim/segments-parity.ts`
// runs both copies over the same videos on the throwaway cluster.
//
// A LABEL, NEVER A DELETION. A video marked `maker` or `noise` stays in every
// count (decision F): themes led by makers are grouped on one line, a row at a
// fifth or more prints its maker share, and the headline's lead theme must be a
// quarter makers or fewer. Nothing here removes a video from a month.
//
// THE MAKER RULE (CQ F23). A word-bounded match over the lowercased caption,
// hashtags and topics, on the words below. Measured by the research against
// 150 hand-labelled Aug–Sep category videos: precision 0.82, recall 0.93. Its
// known errors are crochet or handmade SELLERS, a factory tour and a fishing
// shirt review; it misses some maker-business posts. Re-measured on staging
// (26 Sep, the 20 Sep corpus): 277 of the 850 Aug–Sep category videos (32.6%)
// and 43 of the md5-ordered 150 sample, against the research's 283 and 45.
//
// "Word-bounded" is written as an explicit ASCII class, not \b or \y: the two
// engines disagree about which characters are word characters outside ASCII
// (Postgres follows the database locale), so each side states the same class
// and reads the same answer. Every word is ASCII, so lowercasing agrees too.
//
// THE NOISE RULE (CQ F22, F25). A video every one of whose first-found search
// terms is a bare brand or rival name that today's relevance check keeps 0–4%
// of. Those names found poker, Ecuador politics, Navy SEAL podcasts and a
// Friday news briefing (CQ F19). "First-found" is `video_provenance`'s
// first_terms and first_subreddits where that row holds any, else the video's
// stored `source_keywords`. A video found by any other term, or by a
// community, is not noise. Nor is a video found by reading an ACCOUNT (the
// provenance row's evidence 'account', lib/provenance/reconstruct.ts): no
// search found it, so no bare name did, whatever has resurfaced it since. Its
// row holds no terms, and without this it would fall back to source_keywords.
//
// ENABLED PER TENANT. The word list is Sealand's: its non-buyer content is
// sewing and craft. Össur's is lived experience, not making (CQ F43), so no
// rule is switched on for it and its board reads "no rule", never "no makers".

export const SEGMENT_RULE_VERSION = 'segments_v1'

export type Segment = 'maker' | 'noise' | 'market'

/** The maker words, exactly as the research validated them (CQ F23). */
export const MAKER_WORDS: readonly string[] = [
  'sew', 'sewing', 'costura', 'crochet', 'knit', 'uncinetto', 'ganchillo', 'tutorial', 'diy',
  'pattern', 'patterns', 'stitch', 'stitching', 'thrift flip', 'refashion', 'crafts', 'crafting',
  'quilting', 'embroidery', 'plarn', 'reciclaje', 'how to make', 'best out of waste', 'daur ulang',
  'kerajinan',
]

/** The bare brand and rival names (CQ F22): the gate keeps 0–4% of what they
 *  find. Compared lowercased and trimmed. */
export const NOISE_TERMS: readonly string[] = [
  'poler', 'patagonia', 'cotopaxi', 'freitag', 'topo designs', 'sealand gear', '#sealandgear', 'sealandgear',
]

/** Which tenants the rule is switched on for, by client id: Sealand only. */
export const SEGMENT_RULES_ENABLED: Readonly<Record<string, boolean>> = {
  [SEALAND_CLIENT_ID]: true,
}

/** Is the v1 rule switched on for this tenant? */
export function segmentRulesEnabled(clientId: string): boolean {
  return SEGMENT_RULES_ENABLED[clientId] === true
}

/** The word class both engines treat as "inside a word". */
const WORD_CHAR = 'a-z0-9_'

/** The maker pattern's source, identical in JavaScript and in a Postgres ARE:
 *  a word from the list, with no word character on either side. */
export function makerPatternSource(words: readonly string[] = MAKER_WORDS): string {
  for (const w of words) {
    if (!/^[a-z0-9 ]+$/.test(w)) throw new Error(`maker word ${JSON.stringify(w)} is not plain lowercase ASCII`)
  }
  return `(^|[^${WORD_CHAR}])(${words.join('|')})([^${WORD_CHAR}]|$)`
}

const MAKER_RE = new RegExp(makerPatternSource())

/** What the maker rule reads: caption, hashtags and topics, lowercased, one
 *  space between each. The SQL side builds the same string. */
export function makerHaystack(v: { caption?: string | null; hashtags?: readonly string[] | null; topics?: readonly string[] | null }): string {
  return `${v.caption ?? ''} ${(v.hashtags ?? []).join(' ')} ${(v.topics ?? []).join(' ')}`.toLowerCase()
}

/** The maker word the text names first, or null. */
export function makerWordIn(haystack: string): string | null {
  const m = MAKER_RE.exec(haystack)
  return m ? m[2] : null
}

/** Postgres' lower(btrim(t)): spaces trimmed, lowercased. */
const fold = (t: string): string => t.replace(/^ +| +$/g, '').toLowerCase()
const NOISE_SET = new Set(NOISE_TERMS.map(fold))

/** `video_provenance.evidence` for a video found by reading an account. */
export const ACCOUNT_EVIDENCE = 'account'

/** The terms the noise rule reads: none for a video found by reading an
 *  account (no search found it); else the first-found terms and communities
 *  when provenance holds any (a video first found in a community is found by
 *  no bare name); else the stored `source_keywords`. The SQL side
 *  (segments_for_videos) passes `'{}'` for evidence 'account', then
 *  `first_terms || first_subreddits`, the same way. */
export function noiseTerms(
  firstTerms: readonly string[] | null | undefined,
  sourceKeywords: readonly string[] | null | undefined,
  firstSubreddits: readonly string[] | null | undefined = null,
  firstEvidence: string | null | undefined = null,
): readonly string[] {
  if (firstEvidence === ACCOUNT_EVIDENCE) return []
  const first = [...(firstTerms ?? []), ...(firstSubreddits ?? [])]
  return first.length > 0 ? first : (sourceKeywords ?? [])
}

/** The first term, folded, when EVERY term is a bare name; else null. An empty
 *  list is not noise: a video no search is recorded against is unknown, not
 *  off-topic. */
export function bareNameOnly(terms: readonly string[]): string | null {
  if (terms.length === 0) return null
  for (const t of terms) if (!NOISE_SET.has(fold(t))) return null
  return fold(terms[0])
}

export interface SegmentInput {
  caption?: string | null
  hashtags?: readonly string[] | null
  topics?: readonly string[] | null
  firstTerms?: readonly string[] | null
  firstSubreddits?: readonly string[] | null
  /** `video_provenance.evidence`: 'account' means no search found it. */
  firstEvidence?: string | null
  sourceKeywords?: readonly string[] | null
}

/**
 * The v1 reason for one video: `maker_regex:<word>`, `bare_name_only:<term>`,
 * or null for the market. Maker is decided first: the research counted the
 * name-keyword share among videos the maker rule had not flagged (CQ F25).
 */
export function segmentReason(v: SegmentInput): string | null {
  const word = makerWordIn(makerHaystack(v))
  if (word) return `maker_regex:${word}`
  const name = bareNameOnly(noiseTerms(v.firstTerms, v.sourceKeywords, v.firstSubreddits, v.firstEvidence))
  return name ? `bare_name_only:${name}` : null
}

/** The segment a reason names. */
export function segmentOfReason(reason: string | null): Segment {
  if (reason?.startsWith('maker_regex:')) return 'maker'
  if (reason?.startsWith('bare_name_only:')) return 'noise'
  return 'market'
}

export const segmentOf = (v: SegmentInput): Segment => segmentOfReason(segmentReason(v))

// ---- The SQL copy ---------------------------------------------------------------

/** A SQL string literal. */
const lit = (s: string): string => `'${s.replace(/'/g, "''")}'`

export const SEGMENTS_SQL_BEGIN = '-- >>> segments_v1 (generated by lib/segments/rules.ts segmentsV1Sql; do not edit by hand)'
export const SEGMENTS_SQL_END = '-- <<< segments_v1'

/**
 * `public.segments_v1_reason(caption, hashtags, topics, terms)`: the same
 * answer as `segmentReason`, in SQL. `terms` is what `noiseTerms` returns (the
 * caller picks first-found terms or `source_keywords`). IMMUTABLE and pure, so
 * the readers can call it per video; executed by the service role only.
 */
export function segmentsV1Sql(): string {
  return [
    SEGMENTS_SQL_BEGIN,
    'create or replace function public.segments_v1_reason(',
    '  p_caption text, p_hashtags text[], p_topics text[], p_terms text[])',
    'returns text',
    'language sql',
    'immutable',
    'set search_path = public, pg_temp',
    'as $segments_v1$',
    '  select case',
    `    when m.hay ~ ${lit(makerPatternSource())}`,
    `      then 'maker_regex:' || (regexp_match(m.hay, ${lit(makerPatternSource())}))[2]`,
    '    when cardinality(coalesce(p_terms, \'{}\'::text[])) > 0',
    '     and not exists (select 1 from unnest(p_terms) t',
    `                      where lower(btrim(t)) <> all (array[${NOISE_TERMS.map((t) => lit(fold(t))).join(', ')}]::text[]))`,
    "      then 'bare_name_only:' || lower(btrim(p_terms[1]))",
    '  end',
    "  from (select lower(coalesce(p_caption, '') || ' ' || coalesce(array_to_string(p_hashtags, ' '), '')",
    "                    || ' ' || coalesce(array_to_string(p_topics, ' '), '')) as hay) m",
    '$segments_v1$;',
    SEGMENTS_SQL_END,
  ].join('\n')
}

// ---- Stored labels: the reader precedence (segments_v2, plan WP3.2) -------------
//
// ADDITIVE. Nothing above this line changes: the segments_v1 rule, its word
// lists and the SQL copy MF1 carries stay byte-identical, so the v1 parity
// (scripts/pg-shim/segments-parity.ts) needs no re-run.
//
// `video_segments` holds three kinds of row (MF1): a `rule` row (segments_v1,
// label-segments and the run's segment-videos step), a `judge` row (segments_v2,
// lib/segments/judge.ts) and an `override` row (a client's "this is not my
// market", lib/segments/override.ts). A reader takes, per video, the newest
// override, else the newest judge row, else the newest rule row, else the v1
// rule computed inline. That is MF1's `segments_for_videos`; `readerSegment`
// is the same order in TypeScript, so the override path and its tests read a
// video's segment the way every SQL reader does.

/** `video_segments.method`. */
export type SegmentMethod = 'rule' | 'judge' | 'override'

/** A stored `video_segments` row, as far as the precedence reads it. */
export interface StoredSegment {
  segment: Segment
  method: SegmentMethod
  /** timestamptz. Compared as an instant, never as text (MF1: "Newest is
   *  decided_at, never a text sort"). */
  decided_at: string
  rule_version?: string
  reason?: string | null
}

const METHOD_RANK: Readonly<Record<SegmentMethod, number>> = { override: 0, judge: 1, rule: 2 }

/**
 * The row that decides one video's segment: the newest override, else the
 * newest judge row, else the newest rule row. Null when the video has no stored
 * row, and the caller computes segments_v1 inline (`segmentOf`), as
 * `segments_for_videos` does.
 */
export function readerSegment<T extends StoredSegment>(rows: readonly T[]): T | null {
  let best: T | null = null
  for (const r of rows) {
    if (!best) { best = r; continue }
    const rank = METHOD_RANK[r.method] - METHOD_RANK[best.method]
    if (rank < 0 || (rank === 0 && Date.parse(r.decided_at) > Date.parse(best.decided_at))) best = r
  }
  return best
}
