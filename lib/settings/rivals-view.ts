import { monthName } from '../format'
import { rivalSlug, type Competitor } from '../rivals'
import { ownPostBasis, OWN_POSTS_NO_ACCOUNTS } from '../reading/own-posts'
import type { Counted } from '../reading/verdicts'

/**
 * The rivals panel (Phase 1 WP16, design ST4).
 *
 * THREE STATES, NOT TWO. A rival is named, has accounts configured, and has
 * posts that were actually READ — and they are three different things. Össur's
 * Ottobock has a name and no accounts, so nothing it publishes is read at all;
 * Sealand's Freitag has accounts and 28 captured posts and none read. A panel
 * that stopped at "configured" would show green on both.
 *
 * AND THAT IS ALSO THE HANDLE CHECK. No expression can tell @cotopaxi (a
 * private individual named Nelson) from @cotopaxiofficial — both are perfect
 * TikTok usernames. What tells them apart is this census: a wrong handle
 * captures posts that are then discarded or never read, and a right one
 * produces findings. So the row prints capture-versus-read per platform and
 * the form prints the caveat, rather than implying a regex is the whole check.
 *
 * Pure.
 */

export interface RivalCensusRow {
  competitorName: string
  platform: string
  captured: number
  read: number
  /** Of `captured`, the posts PUBLISHED in the month the column is headed by.
   *  `captured` is all-time and is not a period figure; this is, and it is
   *  dated by `videos.upload_date` — the post's own date. */
  publishedThisMonth: number
}

/** What the rivals table's own-posts column holds.
 *
 * THE MOCK'S COLUMN IS "Own posts with a claim (Sep)" AND THIS IS NOT THAT.
 * A rival's claims are `video_claims` rows in their bucket, which no tenant
 * session may select — M8's policy is `entity = 'client'` and the verbatim
 * quote is not granted at all, both on purpose. So the column counts what they
 * PUBLISHED, which is real, readable and the half the mock's number was mostly
 * made of; the claim half would be a figure computed from a read that comes
 * back refused. `basis` travels with it, because a post is dated by the day it
 * went up and the rest of this page is not dated at all.
 *
 * Null where no account is configured: nothing that rival publishes is read,
 * so there is no census — which is not a zero, and `why` says which. */
export interface RivalOwnPosts {
  value: Counted
  basis: string
  month: string
}

export interface RivalRow {
  /** The competitors row, where there is one. Null before M1 is applied, or
   *  for a name added since — the panel still draws the rival. */
  identity: Competitor | null
  name: string
  /** `competitors.first_seen_at`: the earliest evidence the name was tracked,
   *  NOT the day tracking began, which nothing records. */
  trackedSince: string | null
  retiredAt: string | null
  handles: Record<string, string>
  perPlatform: { platform: string; handle: string | null; captured: number; read: number }[]
  captured: number
  read: number
  /** True when a name is tracked and no account is configured anywhere: the
   *  cheapest red on the page, and the only one a client can close. */
  noAccounts: boolean
  /** What they published in the month this table is headed by, or null with
   *  `ownPostsWhy` where nothing of theirs is read at all. */
  ownPosts: RivalOwnPosts | null
  /** Why there is no census, in the reader's words. Null where there is one. */
  ownPostsWhy: string | null
}

export function rivalRows(args: {
  names: readonly string[]
  handles: Readonly<Record<string, Record<string, string>>>
  identities: readonly Competitor[]
  census: readonly RivalCensusRow[]
  /** The month the own-posts column is headed by, as a month start. Omitted,
   *  the column is not drawn at all — a caller that has not said which month
   *  it means may not have one guessed for it. */
  month?: string | null
}): RivalRow[] {
  const { names, handles, identities, census } = args
  const month = args.month ?? null
  const bySlug = new Map(identities.map((c) => [c.slug, c]))

  const rows = names.map((name): RivalRow => {
    const slug = rivalSlug(name)
    const identity = bySlug.get(slug) ?? null
    const theirHandles = handles[name] ?? {}
    const mine = census.filter((c) => rivalSlug(c.competitorName) === slug)
    const platforms = [...new Set([...Object.keys(theirHandles), ...mine.map((c) => c.platform)])].sort()
    const noAccounts = Object.values(theirHandles).filter((h) => !!h && h.trim() !== '').length === 0
    return {
      identity,
      name: identity?.name ?? name,
      trackedSince: identity?.first_seen_at ?? null,
      retiredAt: identity?.retired_at ?? null,
      handles: theirHandles,
      perPlatform: platforms.map((platform) => ({
        platform,
        handle: theirHandles[platform] ?? null,
        captured: mine.filter((c) => c.platform === platform).reduce((n, c) => n + c.captured, 0),
        read: mine.filter((c) => c.platform === platform).reduce((n, c) => n + c.read, 0),
      })),
      captured: mine.reduce((n, c) => n + c.captured, 0),
      read: mine.reduce((n, c) => n + c.read, 0),
      noAccounts,
      ownPosts:
        month == null || noAccounts
          ? null
          : {
              value: (() => {
                const k = mine.reduce((n, c) => n + c.publishedThisMonth, 0)
                return { k, n: k }
              })(),
              basis: ownPostBasis(month),
              month,
            },
      ownPostsWhy: month == null ? null : noAccounts ? OWN_POSTS_NO_ACCOUNTS : null,
    }
  })

  // Rivals that are no longer named but still have an identity: their months are
  // frozen under their name and a reader still has to see them, which is exactly
  // why retireRival never deletes. Three Sealand names were erased from `videos`
  // on 9-10 September with no record; these rows are how that stops happening
  // silently.
  const named = new Set(names.map(rivalSlug))
  const gone = identities
    .filter((c) => !named.has(c.slug))
    .map((c): RivalRow => ({
      identity: c, name: c.name, trackedSince: c.first_seen_at, retiredAt: c.retired_at,
      handles: {}, perPlatform: [], captured: 0, read: 0, noAccounts: false,
      // A rival that is no longer named is not being read, whatever its
      // handles once were. An own-post census of "nothing this month" would
      // read as a fact about them rather than about us having stopped.
      ownPosts: null,
      ownPostsWhy: month == null ? null : 'No longer tracked, so nothing they publish is read.',
    }))

  return [...rows, ...gone]
}

/** The precedence rule, in one sentence, because it is the thing a client gets
 *  wrong: a post from a tracked account is that brand's whatever it says, and a
 *  post found by a search is decided by the words in it. */
export const RIVAL_PRECEDENCE =
  'A post from an account you or a rival owns is counted as that brand’s, whatever the words in it say; anything the search finds is decided by the words. That is why an account is worth configuring even when the search already finds the brand.'

/** What a row says about itself. Three states, said as three sentences. */
export function rivalState(row: RivalRow): string {
  if (row.retiredAt) return `no longer tracked — its months stay under this name and the line ends here, on ${row.retiredAt.slice(0, 10)}`
  if (row.noAccounts) return 'no accounts configured — nothing they publish is being read'
  if (row.captured === 0) return 'accounts configured, nothing captured from them yet'
  if (row.read === 0) return `${row.captured} of their posts captured, none read — worth checking the handles are the right accounts`
  return `${row.captured} of their posts captured, ${row.read} read`
}

/** The section's mono meta: "5 tracked · 2 with accounts · 3 on search terms
 *  only". All three are lengths of the rows below, so the head cannot disagree
 *  with the table; a rival that is no longer tracked is counted separately,
 *  because its months still render and its row is still drawn. */
export function rivalsMeta(rows: readonly RivalRow[]): string {
  const live = rows.filter((r) => !r.retiredAt)
  const withAccounts = live.filter((r) => !r.noAccounts).length
  const parts = [
    `${live.length} tracked`,
    `${withAccounts} with account${withAccounts === 1 ? '' : 's'}`,
    `${live.length - withAccounts} on search terms only`,
  ]
  const gone = rows.length - live.length
  if (gone > 0) parts.push(`${gone} no longer tracked`)
  return parts.join(' · ')
}

/** The rule beside it. Taking a rival off the list does not zero their
 *  standing — it ends the line, and the months already counted stay where they
 *  are (the frozen guard refuses to re-key them, and `retireRival` never
 *  deletes). */
export const RIVAL_BREAK_RULE = 'removing one is a break, not a zero'

/** A rival first seen inside the month the table is headed by — the artboard's
 *  "New" badge. Before M1 there is no `competitors` row and no `first_seen_at`,
 *  so nothing is new rather than everything being new. */
export function isNewRival(row: RivalRow, month: string): boolean {
  return row.trackedSince != null && row.trackedSince.slice(0, 7) === month.slice(0, 7)
}

/**
 * The note under the rivals table: which comparisons this month refuses, and
 * why.
 *
 * NOT DECORATION AND NOT A GUESS. A rival that arrived mid-month has been
 * tracked for part of it, so a comparison involving them is `refused` with
 * reason `tracking_change` (lib/reading/verdicts.ts) — the reading layer
 * already models exactly this, and Settings is where the reader can see the
 * cause of it. One sentence, naming the rivals and the month.
 */
export function rivalRefusalNote(rows: readonly RivalRow[], month: string): string | null {
  const fresh = rows.filter((r) => isNewRival(r, month))
  if (fresh.length === 0) return null
  const names = fresh.map((r) => r.name)
  const who = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  return `${who} ${names.length === 1 ? 'was' : 'were'} added this month, so comparisons involving ${names.length === 1 ? 'it' : 'them'} are refused for ${monthName(month)}.`
}
