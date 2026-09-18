import { longMonth } from '../format'
import { claimVerdict } from '../market-tiles'
import { PASS_A_MIN_COMMENTS_DEFAULT } from '../config'
import { quoteRef } from '../renderables/quotes-freeze'
import { monthStartOf } from './month-key'
import type { Counted } from './verdicts'
import type { Quote } from '../renderables/types'

// Own posts, own claims, and what the rivals say (Phase 1 Block D, package D3).
//
// WHAT THIS FILE IS FOR. `lib/pipeline/claims.ts` has produced both voices —
// the brand speaking on its own posts, and everybody else speaking about it —
// since August, and not one Phase 1 surface reads them. The mock asks for three
// things off the back of that: "Your own posts" on Subjects, "What they say
// about themselves" and "Said about them, by others" on Competitive, and an
// "Own posts with a claim" column on Settings. This is their one computation.
//
// THREE RULES DECIDE EVERY SHAPE BELOW.
//
// 1. AN OWN-POST CENSUS IS DATED BY THE POST. Everything else on a Phase 1
//    reading surface is dated by the COMMENT (`comments.comment_date`, through
//    lib/reading/monthly.ts) because that is the one clock the product keeps.
//    An own post is not a reading of a conversation: it is something the brand
//    published, and `videos.upload_date` is a real calendar date for it. That
//    makes it a THIRD dating, beside the comment's and the run's, and the one
//    way a third dating stays honest is that it never travels without saying
//    so. `OwnPostCensus.basis` is therefore not optional and not decoration —
//    it is printed beside every figure this file produces. The same failure
//    this avoids already has a name one page away: `UNANSWERED_BASIS`, on
//    Subjects, written because a count under a month heading is read as that
//    month's reading unless the heading is contradicted out loud.
//
// 2. AN ECHO IS A COUNTED READING, NOT AN ADJECTIVE. Pass D-a already writes a
//    stance per claim (`run_summary.say_vs_hear.audience` — echoes /
//    contradicts / silent), and a stance is a model's word with no n behind it.
//    A `ClaimEcho` keeps the word and adds the count it is a word ABOUT: k
//    videos of n, in a named audience, in a stated month. Where no count can be
//    had the echo says so rather than falling back to the adjective alone —
//    `not_tracked` with a `why`, never a bare "silent", because "nobody said
//    this" and "we could not look" are different answers and only one of them
//    is about the conversation.
//
// 3. A KIND, A HOOK AND A FORMAT ARE INDEPENDENT SHARES OF ONE DENOMINATOR.
//    The hook rows and the format rows below each carry their own `Counted`
//    over the census's published posts and they DO NOT SUM to it: a post may
//    carry neither (nothing classified it) and the classifier is per-video, so
//    a reader who adds the rows is answering a question nobody asked. Decision
//    T, applied to the own-post side.
//
// WHAT IS DELIBERATELY NOT HERE. No direction word, and no verdict: an
// own-post census is a level, and a level with two readings is two levels.
// Nothing here calls `directionWord` and nothing here builds a `Verdict` — the
// per-kind verdicts the mock wants on Subjects are `kindChange`'s, which is a
// comment-dated reading and belongs in the page that already holds the kind
// rows.

/** What one claim's audience did with it, as four answers rather than a word.
 *
 *  `silent` is a real reading — the audience was counted and nobody carried the
 *  claim. `not_tracked` is the absence of a reading, and is what a rival with
 *  no configured account gets, and what a claim nothing could be counted for
 *  gets. `why` tells the two apart in the reader's own words. */
export type ClaimEchoState = 'echoed' | 'pushed_back' | 'silent' | 'not_tracked'

export interface ClaimEcho {
  state: ClaimEchoState
  /** The audience the echo was counted in, as the literal bucket string. */
  audience: string
  audienceLabel: string
  value: Counted
  /** The badge's word for this state — `claimVerdict`'s, which is the word the
   *  say-vs-hear ledger already prints on Market, so one product has one
   *  vocabulary for one thing. */
  label: string
  /** Why nothing was counted, for `not_tracked` and `silent`. */
  why: string | null
}

export interface OwnClaimRow {
  id: string
  /** Whose post it was: 'client' or 'competitor:<name>'. */
  entity: string
  entityLabel: string
  claim: string
  quote: Quote | null
  /** The post's own date. */
  postedOn: string | null
  /** How many of the census's posts carried this claim, of the census's own
   *  published count — the honest form of the mock's bare "(7 posts)". A level
   *  is never printed without its "of N", and this is a level.
   *
   *  ADDITIVE TO THE BRIEF'S PINNED SHAPE, and the reason is the honesty rule
   *  rather than the mock: without it the count the mock prints has nowhere to
   *  live, and with it as a bare integer the surface would have to invent a
   *  denominator at render. */
  posts: Counted
  echo: ClaimEcho
}

export interface OwnPostCensus {
  month: string
  /** ALWAYS printed beside every figure here. See rule 1 at the head. */
  basis: string
  audience: string
  audienceLabel: string
  /** k = posts, n = posts (the census is its own n). */
  published: Counted
  /** k = posts with comments >= the floor, n = published. */
  overFloor: Counted
  commentFloor: number
  /** By hook_style, each with its own "of N". These do not sum to the census —
   *  a post may carry none. */
  hooks: { label: string; value: Counted }[]
  /** By classified_type, same rule. */
  formats: { label: string; value: Counted }[]
  /** Subjects these posts matched. */
  subjects: { subjectId: string; label: string; value: Counted }[]
  claims: OwnClaimRow[]
  /** Why the census is empty, when it is. */
  unread: string | null
  /** What the census says about the CLAIMS half when the posts were counted
   *  and the claims could not be read. Null when the claims were read (even to
   *  zero) or when the whole census is unread.
   *
   *  ADDITIVE TO THE BRIEF'S PINNED SHAPE. The two halves of this census come
   *  off two tables with two different grants: `videos` is tenant-readable and
   *  `video_claims` is not (M8 opens the client's OWN claims to a tenant
   *  session and never a rival's — `entity = 'client'` sits in the USING
   *  clause). So a census routinely has real posts and no readable claims, and
   *  `unread` — "why the census is empty" — cannot say that without claiming
   *  the posts are missing too. */
  claimsNote: string | null
}

export interface OwnPostInput {
  month: string
  audience: string
  audienceLabel: string
  videos: readonly {
    id: string
    upload_date: string | null
    comments_count: number
    hook_style: string | null
    classified_type: string | null
    /** Only read to date the claim rows that hang off this post. */
    platform?: string | null
  }[]
  claims: readonly { id: string; source_video_id: string; entity: string; claim: string; quote: string }[]
  membership: readonly { subjectId: string; label: string; videoIds: readonly string[] }[]
  /** One per RETURNED claim row, in the returned rows' own order — which is
   *  first-appearance order of `claims` after the month filter and the
   *  normalised-text dedupe. A shorter array leaves the remaining rows with
   *  `ECHO_NOT_COUNTED`, which is the honest answer for "nobody counted this",
   *  never a bare `silent`. */
  echoes: readonly ClaimEcho[]
  commentFloor?: number
  /** `tracking_configs.competitor_handles[name]` for a rival census: the
   *  accounts we read this entity's own posts from. An entity with none has no
   *  own-post read at all, which is `rivalRows`' `noAccounts` and the only way
   *  to tell "no accounts configured" from "accounts configured, nothing
   *  captured" — three states, not two (lib/settings/rivals-view.ts).
   *
   *  ADDITIVE TO THE BRIEF'S PINNED SHAPE, and named in the brief's own Data
   *  line; `rivalOwnClaims` cannot answer "no handle is configured" without
   *  it, and answering it from an empty video list would fold the two states
   *  into one. Absent means the caller did not say, which is not the same as
   *  "none" and is never read as it. */
  handles?: Readonly<Record<string, string>> | null
}

/**
 * The sentence a rival's own-post row already carries on Overview when their
 * claims cannot be read.
 *
 * THE SAME STRING AS `lib/pages/overview.ts:OWN_POSTS_UNREADABLE`, AND A COPY,
 * which is a thing this codebase otherwise refuses. Two reasons it is a copy
 * today and neither is "nobody looked": `lib/reading` is a leaf that `lib/pages`
 * imports and not the other way round — importing a page module here would
 * drag the Supabase client into the reading layer — and `lib/pages/overview.ts`
 * belongs to another package in this wave, so the constant cannot be MOVED to a
 * shared leaf from here. `own-posts.test.ts` asserts the two are character-
 * identical, so the day one is re-worded the other fails rather than drifting;
 * the move belongs to whoever next owns both files.
 */
export const OWN_POSTS_UNREADABLE = '— not tracked · their own posts are not readable yet · Verbatim engineering'

/** The same absence without the internal owner, for a reader outside the
 *  workspace (a brief's PDF, a `/r/<token>` page). Pinned against Overview's
 *  copy by the same test. */
export const OWN_POSTS_UNREADABLE_OUTSIDE = '— not tracked · their own posts are not readable yet'

/** A rival that is named and has no account configured anywhere. Nothing they
 *  publish is read, so there is no census to take — which is a different
 *  sentence from "we read them and found nothing". */
export const OWN_POSTS_NO_ACCOUNTS =
  'No account is configured for this rival, so nothing they publish is read — add their accounts in Settings and this starts counting.'

/** What the client's own census says while `video_claims` is closed to a
 *  tenant session. The half we DID read is named; so is the half we did not. */
export const OWN_CLAIMS_UNREADABLE =
  'These are the posts you published. What those posts claim is not readable on this page yet — Verbatim engineering.'

/** The same, without the internal owner. */
export const OWN_CLAIMS_UNREADABLE_OUTSIDE =
  'These are the posts you published. What those posts claim is not readable on this page yet.'

/** A rival's claims are never a tenant's to read in full sentences (M8's
 *  policy is `entity = 'client'`), so this census is posts and no claims, for
 *  a reason that is a rule rather than a gap. */
export const RIVAL_CLAIMS_WITHHELD =
  'These are the posts they published. What they claim in them is read from their own transcripts and is not printed here.'

/** Why an echo has no count behind it. Said in place of a stance word, never
 *  beside one. */
export const ECHO_NOT_COUNTED =
  'Nothing in this audience has been counted against this claim, so there is no reading to report.'

/** Why an echo counted the audience and found nobody. A reading, not a gap. */
export const ECHO_SILENT = 'The audience was read this month and nobody carried what this claim rests on.'

/** The census's own empty state. */
export const CENSUS_EMPTY = (basis: string): string => `No post was published in this period — ${basis}.`

/** The basis line, and the only sentence that makes an upload-dated figure
 *  safe to print beside comment-dated ones. */
export const ownPostBasis = (month: string): string => `posts published in ${longMonth(month)}`

/** An enum value as a reader's words: `bold-claim` → `Bold claim`. The product
 *  stores `videos.hook_style` and `videos.classified_type` as the Pass A enums
 *  (lib/pipeline/schemas.ts HOOK_STYLES / CLASSIFIED_TYPES) and no label map
 *  exists anywhere — the Content page prints the raw value. Kept private here
 *  rather than exported so the month-scoped video reading (package D6) can own
 *  the shared one when it needs it. */
const pretty = (value: string): string => {
  const words = value.replace(/[-_]+/g, ' ').trim()
  return words ? words[0].toUpperCase() + words.slice(1) : value
}

const normClaim = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim()

/** The floor a post has to clear to be READ at all — Pass A's own default
 *  (`PASS_A_MIN_COMMENTS_DEFAULT`). Pass A takes a lower one on Reddit
 *  (`PASS_A_MIN_COMMENTS_BY_PLATFORM`), which is deliberately not applied
 *  per-post here: the census prints ONE floor beside the count, and a figure
 *  whose threshold changes row by row is not checkable against the number
 *  printed next to it. A brand's own posts are on TikTok, Instagram and
 *  YouTube; an own post on Reddit is not a shape this product has seen. */
export const OWN_POST_COMMENT_FLOOR = PASS_A_MIN_COMMENTS_DEFAULT

export interface ClaimEchoInput {
  audience: string
  audienceLabel: string
  /** The claim's reading in that audience: k videos of n that carried what the
   *  claim rests on. Null where nothing could be counted — which is an absence
   *  of a reading, never a zero. */
  reading: Counted | null
  /** Pass D-a's own resolution of this claim
   *  (`run_summary.say_vs_hear.audience`): `echoes`, `contradicts`, `silent`,
   *  or null where the ledger has no row for it. It decides WHICH WAY a
   *  non-zero reading is read; it never decides whether there is one. */
  stance?: string | null
  /** False where the audience itself is not read — no account configured, no
   *  denominator, nothing to count in. Absent means the caller did not say. */
  tracked?: boolean
  /** Overrides the reason sentence, for a caller that knows a better one. */
  why?: string | null
}

/**
 * One claim's echo, built the one way.
 *
 * THE COUNT DECIDES THE STATE, AND THE STANCE ONLY DECIDES ITS SIGN. That
 * order is the whole point of the shape: Pass D-a's word is a model's, and a
 * model that says "echoed" about a claim nothing carried has said something
 * about itself. So a null reading is `not_tracked` however confident the
 * stance, a zero reading is `silent` however confident the stance, and only a
 * reading with k > 0 is allowed to become `echoed` or `pushed_back` — at which
 * point the stance picks which.
 */
export function claimEcho(input: ClaimEchoInput): ClaimEcho {
  const word = (a: 'echoes' | 'contradicts' | 'silent'): string => claimVerdict(a).label
  const base = { audience: input.audience, audienceLabel: input.audienceLabel }
  if (input.tracked === false) {
    return { ...base, state: 'not_tracked', value: { k: 0, n: 0 }, label: '— not tracked', why: input.why ?? OWN_POSTS_UNREADABLE }
  }
  if (input.reading == null || input.reading.n <= 0) {
    return { ...base, state: 'not_tracked', value: input.reading ?? { k: 0, n: 0 }, label: '— not tracked', why: input.why ?? ECHO_NOT_COUNTED }
  }
  if (input.reading.k <= 0) {
    return { ...base, state: 'silent', value: input.reading, label: word('silent'), why: input.why ?? ECHO_SILENT }
  }
  const pushed = input.stance === 'contradicts'
  return {
    ...base,
    state: pushed ? 'pushed_back' : 'echoed',
    value: input.reading,
    label: word(pushed ? 'contradicts' : 'echoes'),
    why: null,
  }
}

/** The four figures, each over the census's own denominator. Exported for the
 *  loaders, which need the same grouping over a rival's posts without taking
 *  the whole census. */
function countBy(
  posts: readonly { id: string; hook_style: string | null; classified_type: string | null }[],
  key: 'hook_style' | 'classified_type',
): { label: string; value: Counted }[] {
  const groups = new Map<string, number>()
  for (const p of posts) {
    const v = p[key]
    if (!v) continue
    groups.set(v, (groups.get(v) ?? 0) + 1)
  }
  return [...groups.entries()]
    .map(([value, k]) => ({ label: pretty(value), value: { k, n: posts.length } }))
    .sort((a, b) => b.value.k - a.value.k || a.label.localeCompare(b.label))
}

/**
 * The census: what this entity published in this month, and what it said in it.
 *
 * Pure. Every figure it returns is a `Counted` over the posts it counted, and
 * `basis` says what those posts were counted by — see rule 1 at the head of
 * this file.
 *
 * A POST WITH NO `upload_date` IS NOT IN THE CENSUS. It cannot be dated by the
 * post, and there is no second clock to fall back on that would not silently
 * be the run's. Roughly nothing in production is in that state; where a tenant
 * has some, the census simply does not count them, which under-counts rather
 * than mis-dates.
 */
export function ownPostCensus(input: OwnPostInput): OwnPostCensus {
  const month = monthStartOf(input.month)
  const basis = ownPostBasis(month)
  const floor = input.commentFloor ?? OWN_POST_COMMENT_FLOOR
  const noAccounts = input.handles != null && Object.values(input.handles).filter((h) => !!h && h.trim() !== '').length === 0

  const posts = input.videos.filter((v) => v.upload_date != null && monthStartOf(v.upload_date) === month)
  const inMonth = new Set(posts.map((p) => p.id))
  const published: Counted = { k: posts.length, n: posts.length }
  const dateOf = new Map(posts.map((p) => [p.id, p.upload_date]))

  // The claims, deduped on what a reader would read as one claim, counted in
  // posts. `id` is the first row's, so a surface can key on it.
  const byClaim = new Map<string, { id: string; entity: string; claim: string; quote: string; videos: Set<string>; postedOn: string | null }>()
  for (const c of input.claims) {
    if (!inMonth.has(c.source_video_id)) continue
    const key = normClaim(c.claim)
    if (!key) continue
    const cur = byClaim.get(key)
    const day = dateOf.get(c.source_video_id) ?? null
    if (cur) {
      cur.videos.add(c.source_video_id)
      // The EARLIEST post carrying the claim is the one it is dated by: a
      // claim's date is when it was first said, not when it was last repeated.
      if (day && (cur.postedOn == null || day < cur.postedOn)) cur.postedOn = day
    } else {
      byClaim.set(key, { id: c.id, entity: c.entity, claim: c.claim, quote: c.quote, videos: new Set([c.source_video_id]), postedOn: day })
    }
  }

  const claims: OwnClaimRow[] = [...byClaim.values()].map((c, i) => ({
    id: c.id,
    entity: c.entity,
    entityLabel: input.audienceLabel,
    claim: c.claim,
    // A CLAIM'S REF IS THE CLAIM'S, NEVER THE VIDEO'S. `v:<videos.id>` resolves
    // through `insight_evidence` to a COMMENTER's excerpt on that video
    // (lib/quotes.ts), and these words are the speaker's own, off their own
    // transcript — so under a `v:` ref a frozen snapshot would empty the
    // brand's sentence and hand back a stranger's comment in its place,
    // printed as what the brand claims. `k:<video_claims.id>` is the claim's
    // own kind, on `b:`'s precedent.
    quote: c.quote.trim()
      ? { ref: quoteRef.claim(c.id), text: c.quote.replace(/\s+/g, ' ').trim() }
      : null,
    postedOn: c.postedOn,
    posts: { k: c.videos.size, n: published.k },
    echo: input.echoes[i] ?? claimEcho({ audience: input.audience, audienceLabel: input.audienceLabel, reading: null }),
  }))

  const subjects = input.membership
    .map((m) => ({
      subjectId: m.subjectId,
      label: m.label,
      value: { k: m.videoIds.filter((id) => inMonth.has(id)).length, n: published.k },
    }))
    .filter((s) => s.value.k > 0)
    .sort((a, b) => b.value.k - a.value.k || a.label.localeCompare(b.label))

  return {
    month,
    basis,
    audience: input.audience,
    audienceLabel: input.audienceLabel,
    published,
    overFloor: { k: posts.filter((p) => p.comments_count >= floor).length, n: published.k },
    commentFloor: floor,
    hooks: countBy(posts, 'hook_style'),
    formats: countBy(posts, 'classified_type'),
    subjects,
    claims,
    unread: noAccounts ? OWN_POSTS_NO_ACCOUNTS : published.k === 0 ? CENSUS_EMPTY(basis) : null,
    claimsNote: null,
  }
}

/**
 * One census per tracked rival, with the honest absence where no account is
 * configured.
 *
 * THREE STATES, NOT TWO — the rivals panel's own rule (lib/settings/
 * rivals-view.ts). A rival with no account configured has no own-post read at
 * all and says so; a rival with accounts and nothing captured this month is a
 * real census that came back empty; a rival with posts is a census. Folding
 * the first two together is what a bare `published.k === 0` would do, and it
 * would print "nothing published in September" about a brand nobody is
 * watching.
 *
 * And a rival's CLAIMS are never a tenant's to read: M8's policy is
 * `entity = 'client'`, and the verbatim quote is not granted at all. So every
 * census here carries `RIVAL_CLAIMS_WITHHELD` beside real post counts, rather
 * than an empty claims list that reads as "they claimed nothing".
 */
export function rivalOwnClaims(inputs: readonly OwnPostInput[]): OwnPostCensus[] {
  return inputs.map((input) => {
    const census = ownPostCensus(input)
    if (census.unread === OWN_POSTS_NO_ACCOUNTS) return census
    return { ...census, claimsNote: census.claims.length === 0 ? RIVAL_CLAIMS_WITHHELD : null }
  })
}

/** What is said ABOUT a rival by everybody else — claims from
 *  `lib/pipeline/claims.ts:competitorsAbout`, counted and quoted. */
export interface SaidAbout {
  audience: string
  label: string
  rows: { claim: string; quote: Quote | null; value: Counted }[]
  /** The block's own words when nothing was said. */
  empty: string | null
}

export const SAID_ABOUT_EMPTY = (label: string): string =>
  `Nothing was said about ${label} in what we read this month.`

/** Said about a rival, as a count rather than a list of sentences.
 *
 * THE DENOMINATOR IS THE CALLER'S, AND IT IS NAMED. `of` is the audience's
 * videos for the month (`month_denominators.videos`), so a row reads "63 of
 * 376" and not "63". A claim said on four videos is k = 4: the unit is
 * DISTINCT VIDEOS, the same unit every band in this product was calibrated on,
 * so this figure sits beside a theme's reading without changing units under
 * the reader.
 *
 * The quote travels as a ref (`k:<video_claims.id>`), never as stored words: a
 * snapshot keeps the ref and resolves the text at render, which is how a voice
 * withdrawn after the freeze disappears from an export
 * (lib/renderables/quotes-freeze.ts). It is the CLAIM's own ref and not the
 * video's, because `v:` resolves to a commenter's excerpt on that video and
 * these words are the speaker's — the same rule the census's own claims keep.
 * A row that arrives without its claim row's `id` carries NO quote: a ref that
 * cannot be keyed is not a ref, and an unkeyed quotation frozen into a
 * snapshot is exactly the wrong-attribution failure this rule exists to stop.
 */
export function saidAbout(input: {
  audience: string
  label: string
  claims: readonly { claim: string; quote: string; videoId: string; id?: string }[]
  of: number
}): SaidAbout {
  const byClaim = new Map<string, { claim: string; quote: string; id?: string; videos: Set<string> }>()
  for (const c of input.claims) {
    const key = normClaim(c.claim)
    if (!key) continue
    const cur = byClaim.get(key)
    if (cur) cur.videos.add(c.videoId)
    else byClaim.set(key, { claim: c.claim, quote: c.quote, id: c.id, videos: new Set([c.videoId]) })
  }
  const rows = [...byClaim.values()]
    .map((c) => ({
      claim: c.claim,
      quote: c.id && c.quote.trim() ? { ref: quoteRef.claim(c.id), text: c.quote.replace(/\s+/g, ' ').trim() } : null,
      value: { k: c.videos.size, n: input.of },
    }))
    .sort((a, b) => b.value.k - a.value.k || a.claim.localeCompare(b.claim))
  return {
    audience: input.audience,
    label: input.label,
    rows,
    empty: rows.length === 0 ? SAID_ABOUT_EMPTY(input.label) : null,
  }
}

/** The client's own census, with the claims half named when it could not be
 *  read. `read` is false where `video_claims` came back closed rather than
 *  empty — see `OwnPostCensus.claimsNote`. */
export function ownCensusWithClaims(input: OwnPostInput, read: boolean, outside = false): OwnPostCensus {
  const census = ownPostCensus(input)
  if (read || census.unread != null) return census
  return { ...census, claims: [], claimsNote: outside ? OWN_CLAIMS_UNREADABLE_OUTSIDE : OWN_CLAIMS_UNREADABLE }
}
