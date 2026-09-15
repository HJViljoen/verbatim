import { rivalSlug, type Competitor } from '../rivals'

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
}

export function rivalRows(args: {
  names: readonly string[]
  handles: Readonly<Record<string, Record<string, string>>>
  identities: readonly Competitor[]
  census: readonly RivalCensusRow[]
}): RivalRow[] {
  const { names, handles, identities, census } = args
  const bySlug = new Map(identities.map((c) => [c.slug, c]))

  const rows = names.map((name): RivalRow => {
    const slug = rivalSlug(name)
    const identity = bySlug.get(slug) ?? null
    const theirHandles = handles[name] ?? {}
    const mine = census.filter((c) => rivalSlug(c.competitorName) === slug)
    const platforms = [...new Set([...Object.keys(theirHandles), ...mine.map((c) => c.platform)])].sort()
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
      noAccounts: Object.values(theirHandles).filter(Boolean).length === 0,
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
