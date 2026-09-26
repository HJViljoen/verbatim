import { normAccount, ownAccountNames } from '../gather/owned'

// Whose own post a video is (market-first WP2.6): a brand's own posts are its
// posts, never the market naming it (decision E), so a brand is never counted
// in a video it published. The census rule (lib/gather/owned.ts): a video is
// an entity's own post by its source ('owned', 'competitor_owned') or by its
// account, where the account is the entity's configured handle or one the
// owned read stored for it. The same rule scripts/brand-mentions.ts applies
// when it writes the rows and prints its counts, so the page and the script
// count one way.
//
// PURE.

/** A video's identity columns. */
export interface IdentityRow {
  id: string
  platform: string
  source: string | null
  account_name: string | null
  is_client: boolean | null
  is_competitor: boolean | null
  competitor_name: string | null
}

const norm = (s: string): string => s.trim().toLowerCase()

/**
 * The owner of a video: 'client', a rival's brand key, or null.
 *
 *   rows              the identity rows of the videos to be asked about
 *   owned             every row whose source is 'owned' or 'competitor_owned'
 *                     (the accounts the owned read stored)
 *   ownHandles        `tracking_configs.own_handles`
 *   competitorHandles `tracking_configs.competitor_handles`, by rival name
 *   rivalKey          a rival's name to its brand key (`competitors.id`)
 */
export function ownerOfVideos(input: {
  rows: ReadonlyMap<string, IdentityRow>
  owned: readonly IdentityRow[]
  ownHandles: Record<string, string> | null
  competitorHandles: Record<string, Record<string, string>> | null
  rivalKey: ReadonlyMap<string, string>
}): (videoId: string) => string | null {
  const owned = [...input.owned]
  const keyOf = (name: string | null | undefined): string | null => (name ? input.rivalKey.get(norm(name)) ?? null : null)
  const clientNames = ownAccountNames(owned, input.ownHandles ?? {}, { source: 'owned' })
  const rivalNames = Object.entries(input.competitorHandles ?? {}).map(([name, handles]) => ({
    key: keyOf(name),
    names: ownAccountNames(owned, handles ?? {}, { source: 'competitor_owned', competitorName: name }),
  }))
  return (videoId: string): string | null => {
    const r = input.rows.get(videoId)
    if (!r) return null
    if (r.source === 'owned') return 'client'
    if (r.source === 'competitor_owned') return keyOf(r.competitor_name)
    const account = normAccount(r.account_name)
    if (!account) return null
    if (clientNames.get(r.platform)?.has(account)) return 'client'
    return rivalNames.find((x) => x.names.get(r.platform)?.has(account))?.key ?? null
  }
}
