import { createAdminClient, selectAll } from '../supabase-admin'
import { fold } from '../gather/util'
import { ownAccountNames, normAccount } from '../gather/owned'

// Brand-claims loader (Step 2b; hygiene hardened for real runs 2026-08-08).
// Claims are durable brand messaging captured by Pass A v4 from client/
// competitor video transcripts — sparse per run (a weekly gather may catch 0–2
// brand videos with speech), so consumption ACCUMULATES across runs (decision
// D1). Cross-run reads live here at the orchestrator layer, matching the
// themes-first_seen / report-delta precedent — never inside runPassC/runPassD,
// which stay single-run-scoped.

/** Who is speaking on a video in a brand's bucket. `own` = the brand itself (a
 *  post read off its own profile, or a video from one of its own accounts);
 *  `about` = a third party talking about that brand (a reviewer, a clinic, a
 *  news channel). Both sit in the same bucket, because a bucket means "about
 *  this brand" — which is why pooling them under "You say" misattributed 10 of
 *  Össur's 22 client claims (2026-08-16). The same split applies to a tracked
 *  rival (2026-09-15): 206 of Sealand's 208 "Cotopaxi claims" were creators
 *  reviewing Cotopaxi bags, printed under "what they say in their own videos". */
export type Voice = 'own' | 'about'

export interface BrandClaim {
  /** Named competitor, or null for the client's own claims. */
  competitor: string | null
  claim: string
  quote: string
  /** Which voice the claim is in (see Voice). Absent only on rows from a
   *  caller that does not compute it, which are read as own voice. */
  voice?: Voice
  /** Speaker context for the "About you" surface; present when the loader joined the video. */
  account?: string | null
  platform?: string | null
  url?: string | null
}

/** Post-hygiene, PRE-cap counts per side — the honest roll-up numbers
 *  ("N claims in your voice · N about you · N from competitors"). */
export interface ClaimCounts {
  own: number
  about: number
  /** Every claim in a rival's bucket, both voices — the key stored snapshots
   *  already carry, kept at its old meaning so an old run_summary still reads. */
  competitors: number
  competitors_own: number
  competitors_about: number
}

export interface BrandClaims {
  /** The client speaking — own voice ONLY. This is what say-vs-hear's "You say" quotes. */
  client: BrandClaim[]
  /** Third parties speaking about the client. Never enters say-vs-hear. */
  about: BrandClaim[]
  /** A tracked rival speaking in ITS OWN videos — the only side that may be
   *  printed as "what they are pitching". */
  competitorsOwn: BrandClaim[]
  /** Third parties speaking about a tracked rival: audience and creator voice,
   *  never that rival's marketing. */
  competitorsAbout: BrandClaim[]
  counts: ClaimCounts
}

/** What Market reads (run_summary.brand_voice) — see the 20260816230000
 *  migration. The two competitor keys arrived 2026-09-15; a snapshot written
 *  before then has neither, so both are optional on the way back in. */
export interface BrandVoiceSnapshot {
  counts: { own: number; about: number; competitors: number; competitors_own?: number; competitors_about?: number }
  about: AboutYouEntry[]
}
export interface AboutYouEntry {
  claim: string
  quote: string
  account: string
  platform: string
  url: string | null
}
export const ABOUT_YOU_MAX = 8

/** Does a claim (or its verbatim quote) actually name the brand? The `about`
 *  bucket is defined negatively (client-bucket video, not the client's own
 *  account), and Pass A extracts EVERY brand claim on such a video — including
 *  claims about the video's OWN third-party brand. Without this gate Sealand's
 *  block showed a shipping company's marketing copy under "What others say
 *  about you" (review, 2026-08-16). Product-only claims that never say the
 *  brand's name are dropped too — under-showing beats misattributing. */
export function mentionsBrand(c: { claim: string; quote: string }, brandKeywords: string[] | null | undefined): boolean {
  const hay = fold(`${c.claim} ${c.quote}`)
  return (brandKeywords ?? []).some((k) => {
    const kw = fold(k)
    return kw.length >= 3 && hay.includes(kw)
  })
}

/** Pure: shape the About-you block from hygiened claims — newest-first (the
 *  loader's order), brand-mention gated, at most 2 per source video (keyed by
 *  url), exact-normalised claim dedupe, capped. Evidence only: quote + who
 *  said it + where. Counts are the roll-up (all-time, post-hygiene, pre-cap). */
export function shapeBrandVoice(claims: BrandClaims, brandKeywords: string[] | null | undefined): BrandVoiceSnapshot {
  const perVideo = new Map<string, number>()
  const seen = new Set<string>()
  const about: AboutYouEntry[] = []
  for (const c of claims.about) {
    if (about.length >= ABOUT_YOU_MAX) break
    if (!mentionsBrand(c, brandKeywords)) continue
    const key = c.url ?? `${c.account ?? ''}::${c.claim}`
    if ((perVideo.get(key) ?? 0) >= 2) continue
    const norm = normClaim(c.claim)
    if (seen.has(norm)) continue
    seen.add(norm)
    perVideo.set(key, (perVideo.get(key) ?? 0) + 1)
    about.push({ claim: c.claim, quote: c.quote, account: c.account ?? 'unknown account', platform: c.platform ?? '', url: c.url ?? null })
  }
  return { counts: { ...claims.counts }, about }
}

/**
 * Pure: is this client-bucket video the client's OWN voice? Owned posts are,
 * by construction; a discovered video is when its account name folds to one
 * of the brand keywords ("ÖSSUR", "Össur Academy", "Össur DE" → yes;
 * "McMorris Prosthetic Services" → no). Name-fold is the v1 rule — YouTube
 * channel ids would be exact, but the videos table doesn't store them.
 */
/** Account-name words that mark a THIRD PARTY even when the brand's name is
 *  in the handle ("Össur Review", "WHOOP Fans", "Ossur vs Ottobock"). Folded
 *  whole-word match. Kept short and obvious on purpose — a long list is a
 *  second tagging system nobody maintains — and limited to words a brand
 *  would not put in its OWN handle (so not news/podcast/community: "Össur
 *  News" is plausibly Össur). Checked against both live tenants 2026-08-17:
 *  no brand-owned account demoted. */
export const THIRD_PARTY_ACCOUNT_WORDS = ['review', 'reviews', 'reviewer', 'unboxing', 'fan', 'fans', 'fanpage', 'vs', 'versus']

export function ownVoice(
  v: {
    source: string | null | undefined
    account_name: string | null | undefined
    platform?: string | null | undefined
  },
  brandKeywords: string[] | null | undefined,
  /** The brand's account names per platform, from the census rule
   *  (lib/gather/owned.ts ownAccountNames). Authoritative when supplied: a post
   *  the keyword gather found first kept source 'discovered' for life until
   *  2026-09-11, and one from an account own_handles does not name still does,
   *  so source alone under-counts the brand's own voice. The keyword fold below
   *  stays as the fallback for callers that cannot supply this. */
  ownNames?: Map<string, Set<string>>,
): boolean {
  if (v.source === 'owned') return true
  if (v.platform && v.account_name && ownNames?.get(v.platform)?.has(normAccount(v.account_name))) return true
  const acct = fold(v.account_name ?? '')
  if (!acct) return false
  const words = new Set(acct.split(/[^a-z0-9]+/).filter(Boolean))
  if (THIRD_PARTY_ACCOUNT_WORDS.some((w) => words.has(w))) return false
  return (brandKeywords ?? []).some((k) => {
    const kw = fold(k)
    return kw.length >= 3 && acct.includes(kw)
  })
}

/**
 * Pure: is this video the named RIVAL speaking, rather than someone talking
 * about it? The mirror of `ownVoice`, and the reason it exists: nothing
 * downstream of Pass A ever re-checked who was holding the camera on a
 * competitor video, so "What they say in their own videos" printed a creator's
 * unboxing narration as Cotopaxi's marketing — 206 of 208 rows on Sealand
 * (2026-09-14). The three tests, in order:
 *   1. the post came off the rival's own profile read (`competitor_owned`);
 *   2. the account is one the census knows as that rival's — the configured
 *      handle, or a name an owned read has already stamped for it;
 *   3. the account name carries the rival's name and none of the third-party
 *      words ("Ottobock Professionals", "ottobock deutschland" → the rival;
 *      "Ossur vs Ottobock", "ottobock fan page" → somebody else).
 * Everything else is said ABOUT them, by others.
 *
 * Test 3 is what covers a rival's regional and sub-brand channels, which the
 * one-handle-per-platform schema cannot reach: it is why Össur reads 280 own
 * to 74 about today on a tenant with no competitor handles configured at all.
 */
export function competitorVoice(
  v: {
    source: string | null | undefined
    account_name: string | null | undefined
    platform?: string | null | undefined
  },
  /** The rival's name as configured, e.g. "Ottobock". */
  competitorName: string | null | undefined,
  /** That rival's account names per platform, from the census rule
   *  (lib/gather/owned.ts ownAccountNames with source 'competitor_owned').
   *  Empty for a tenant with no handles configured, which is Össur today. */
  ownNames?: Map<string, Set<string>>,
): Voice {
  if (v.source === 'competitor_owned') return 'own'
  if (v.platform && v.account_name && ownNames?.get(v.platform)?.has(normAccount(v.account_name))) return 'own'
  const acct = fold(v.account_name ?? '')
  if (!acct) return 'about'
  const words = new Set(acct.split(/[^a-z0-9]+/).filter(Boolean))
  if (THIRD_PARTY_ACCOUNT_WORDS.some((w) => words.has(w))) return 'about'
  const name = fold(competitorName ?? '')
  return name.length >= 3 && acct.includes(name) ? 'own' : 'about'
}

/**
 * Pure: whose claim is this, read from the video as it stands NOW.
 *
 * `video_claims.entity` froze `videos.is_client` at the run that wrote the row,
 * and a re-tag since rewrites the video and never the claim: 72 of Sealand's
 * 376 stored rows disagree with their video today (2026-09-14), 54 of them
 * naming brands Sealand no longer tracks and 18 of them on Sealand's own posts.
 *
 * Authorship first, then subject. A post read off a profile IS that account's,
 * whatever a caption-only re-tag later decided — Sealand has 13 `owned` rows
 * carrying `is_client = false` (the captions never say "Sealand"), two of them
 * with 18 claims between them. Only then the subject tags, which is what a
 * keyword-discovered video has. A video that is now neither the client's nor a
 * named rival's belongs to nobody, and its claims are dropped rather than
 * attributed to whoever the tagger used to think it was about.
 */
export function claimEntity(v: {
  source?: string | null
  is_client?: boolean | null
  is_competitor?: boolean | null
  competitor_name?: string | null
}): { entity: 'client' | 'competitor'; competitor: string | null } | null {
  const rival = (v.competitor_name ?? '').trim()
  if (v.source === 'owned') return { entity: 'client', competitor: null }
  if (v.source === 'competitor_owned') return rival ? { entity: 'competitor', competitor: rival } : null
  if (v.is_client) return { entity: 'client', competitor: null }
  if (v.is_competitor) return rival ? { entity: 'competitor', competitor: rival } : null
  return null
}

/** Cap per entity per voice (the client, or each named competitor) after
 *  dedupe: this is the prompt-sized side. */
export const MAX_CLAIMS_PER_ENTITY = 12
/** The about side is evidence, not prompt input — the client's feeds a block
 *  of quotes and a rival's is trimmed again at the prompt — so it can hold
 *  more than the prompt-sized cap: enough that ≤2-per-video still fills 8. */
export const MAX_ABOUT_CLAIMS = 24

interface ClaimRow {
  run_id: string
  source_video_id: string
  /** Re-derived by the loader from the joined video (claimEntity), not the
   *  stored column. */
  entity: string
  competitor_name: string | null
  claim: string
  quote: string
  /** Set by the loader from the joined video; absent = treated as own voice
   *  (callers that do not compute it, and tests). */
  voice?: Voice
  account?: string | null
  platform?: string | null
  url?: string | null
}

const normClaim = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

/** Pure core, exported for tests. Rows must arrive newest-first.
 *  1. NEWEST-RUN-WINS per video: Pass A re-analysis of the same video under a
 *     new run rewrites its claim set, but older runs' rows persist in the
 *     table with paraphrase-variant wording that defeats text dedupe — so a
 *     video's claims are taken ONLY from its newest run.
 *  2. Competitor claims must belong to a CURRENTLY-tracked competitor
 *     (fold-compared; stored names are config-cased) — an untracked brand
 *     must not keep feeding Pass C. Unnamed ('unknown') rows are excluded:
 *     a prompt that names brands can't use them.
 *  3. Exact-normalized dedupe within what survives, then the per-entity cap.
 *  4. EVERY entity's claims split by VOICE (own vs about), each side capped
 *     separately — a busy reviewer must never crowd the brand's own words out
 *     of its quota, on the client's side or a rival's. */
export function selectClaims(rows: ClaimRow[], trackedCompetitors: string[], maxPerEntity: number = MAX_CLAIMS_PER_ENTITY): BrandClaims {
  const newestRunByVideo = new Map<string, string>()
  for (const r of rows) {
    if (!newestRunByVideo.has(r.source_video_id)) newestRunByVideo.set(r.source_video_id, r.run_id)
  }
  const tracked = new Set(trackedCompetitors.map((n) => fold(n)))

  const seen = new Set<string>()
  const perEntity = new Map<string, number>()
  const client: BrandClaim[] = []
  const about: BrandClaim[] = []
  const competitorsOwn: BrandClaim[] = []
  const competitorsAbout: BrandClaim[] = []
  const counts: ClaimCounts = { own: 0, about: 0, competitors: 0, competitors_own: 0, competitors_about: 0 }

  for (const r of rows) {
    if (newestRunByVideo.get(r.source_video_id) !== r.run_id) continue

    const isClient = r.entity === 'client'
    const name = isClient ? null : (r.competitor_name ?? '').trim()
    if (!isClient && (!name || name.toLowerCase() === 'unknown' || !tracked.has(fold(name)))) continue

    const key = `${r.source_video_id}::${normClaim(r.claim)}`
    if (seen.has(key)) continue
    seen.add(key)

    const voice: Voice = r.voice ?? 'own'
    if (!isClient) {
      counts.competitors++
      if (voice === 'about') counts.competitors_about++
      else counts.competitors_own++
    } else if (voice === 'about') counts.about++
    else counts.own++
    const entityKey = `${isClient ? 'client' : `competitor:${fold(name!)}`}:${voice}`
    const count = perEntity.get(entityKey) ?? 0
    // The about side is evidence rather than prompt input, so it holds more.
    if (count >= (voice === 'about' ? MAX_ABOUT_CLAIMS : maxPerEntity)) continue
    perEntity.set(entityKey, count + 1)

    const out: BrandClaim = { competitor: isClient ? null : name, claim: r.claim, quote: r.quote }
    if (r.voice) out.voice = r.voice
    if (r.account !== undefined) out.account = r.account
    if (r.platform !== undefined) out.platform = r.platform
    if (r.url !== undefined) out.url = r.url
    if (isClient) (voice === 'about' ? about : client).push(out)
    else (voice === 'about' ? competitorsAbout : competitorsOwn).push(out)
  }

  return { client, about, competitorsOwn, competitorsAbout, counts }
}

/** All-time claims for a client, newest-first, hygiened per selectClaims. Joins
 *  the source video for two things the stored row cannot give: who the claim
 *  belongs to today (claimEntity), and whose voice it is (ownVoice /
 *  competitorVoice). Rows whose video no longer belongs to the client or a
 *  named rival are dropped. */
export async function loadBrandClaims(
  admin: ReturnType<typeof createAdminClient>,
  clientId: string,
  trackedCompetitors: string[],
  brandKeywords: string[] | null | undefined = [],
  /** tracking_configs.own_handles. Lets the client/about split use the same
   *  account-identity rule the census counts by, instead of source alone. */
  ownHandles: Record<string, string> | null | undefined = {},
  /** tracking_configs.competitor_handles, keyed by the competitor name. Does
   *  the same for each rival's own/about split. `{}` (Össur today) leaves the
   *  name rule in competitorVoice to carry it. */
  competitorHandles: Record<string, Record<string, string>> | null | undefined = {},
): Promise<BrandClaims> {
  interface JoinedRow {
    run_id: string
    source_video_id: string
    entity: string
    competitor_name: string | null
    claim: string
    quote: string
    created_at: string
    // PostgREST returns ONE object for a many→one embed; the untyped client
    // infers an array, so accept both and normalise below.
    videos: JoinedVideo | JoinedVideo[] | null
  }
  interface JoinedVideo {
    source: string | null
    account_name: string | null
    platform: string | null
    video_url: string | null
    is_client: boolean | null
    is_competitor: boolean | null
    competitor_name: string | null
  }
  const raw = await selectAll<JoinedRow>(() =>
    admin
      .from('video_claims')
      .select('run_id, source_video_id, entity, competitor_name, claim, quote, created_at, videos:source_video_id(source, account_name, platform, video_url, is_client, is_competitor, competitor_name)')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: true }),
  )
  const videoOf = (r: JoinedRow): JoinedVideo | null => (Array.isArray(r.videos) ? r.videos[0] : r.videos) ?? null
  // Account identity, learned the same way the census learns it: once for the
  // client, once per rival. A rival's map is keyed by its FOLDED name, because
  // that is how the video's competitor_name is compared everywhere else.
  const censusRows = raw.map((r) => {
    const v = videoOf(r)
    return {
      platform: v?.platform ?? '',
      source: v?.source ?? null,
      account_name: v?.account_name ?? null,
      competitor_name: v?.competitor_name ?? null,
    }
  })
  const ownNames = ownAccountNames(censusRows, ownHandles ?? {}, { source: 'owned' })
  const handlesByFold = new Map(Object.entries(competitorHandles ?? {}).map(([name, h]) => [fold(name), h ?? {}]))
  const rivalNames = new Map<string, Map<string, Set<string>>>()
  for (const name of [...trackedCompetitors, ...Object.keys(competitorHandles ?? {})]) {
    const key = fold(name)
    if (!key || rivalNames.has(key)) continue
    rivalNames.set(key, ownAccountNames(censusRows, handlesByFold.get(key) ?? {}, { source: 'competitor_owned', competitorName: name }))
  }

  const rows: ClaimRow[] = []
  for (const r of raw) {
    const v = videoOf(r)
    // No joined video means the row outlived its video, which the FK forbids;
    // fall back to what Pass A froze rather than silently dropping evidence.
    const who = v ? claimEntity(v) : { entity: r.entity === 'client' ? ('client' as const) : ('competitor' as const), competitor: r.competitor_name }
    if (!who) continue
    const speaker = { source: v?.source, account_name: v?.account_name, platform: v?.platform }
    rows.push({
      run_id: r.run_id,
      source_video_id: r.source_video_id,
      entity: who.entity,
      competitor_name: who.competitor,
      claim: r.claim,
      quote: r.quote,
      voice: who.entity === 'client'
        ? (ownVoice(speaker, brandKeywords, ownNames) ? 'own' : 'about')
        : competitorVoice(speaker, who.competitor, rivalNames.get(fold(who.competitor ?? ''))),
      account: v?.account_name ?? null,
      platform: v?.platform ?? null,
      url: v?.video_url ?? null,
    })
  }
  return selectClaims(rows, trackedCompetitors)
}
