// VOICES' ADDRESSES (depth as pages, 17 Oct; the G3 boards, approved by
// Heinrich with every recommendation). Voices is a root and three kinds of
// page under it, each its own address, written ONCE here:
//
//   /dashboard/voices                                the root
//   /dashboard/voices/groups/<persona key>           a group (a hub)
//   /dashboard/voices/brands/<brand key>             a tracked brand (a hub)
//   /dashboard/voices/creators/<platform>/<account>  a creator (the evidence)
//
// A brand's key is its brand key ('client', a `competitors.id`,
// 'watched:<slug>'), which survives a rename; the page also takes a name, the
// audience key `competitor:<name>` or 'you', as the old `?brand=` did, so a
// stored link lands in one hop (`matchesBrand`). A creator is two segments
// (board decision 1): a pipe would read %7C in every shared link. An old
// `?creator=` that named the account alone lands on the one-segment form,
// which the page resolves as the panel did (the first by videos where two
// platforms share the name). Each page reads `?month=` as the root does.
//
// PURE, AND NO IMPORT OF lib/nav.ts: nav.ts imports this module for its
// redirect block, so the root's address is a literal here, pinned equal to
// `surface('voices').href` in lib/pages/v2/voices-address.test.ts.

export const VOICES_PATH = '/dashboard/voices'

/** A path segment, readable where a URL allows it: "@" and ":" are left as
 *  they are (both legal in a path segment), so a creator's handle reads
 *  "@stepbystep.amp" in a shared link, not "%40stepbystep.amp". */
export function pathSegment(raw: string): string {
  return encodeURIComponent(raw).replace(/%40/g, '@').replace(/%3A/gi, ':')
}

export const voicesGroupPath = (key: string): string => `${VOICES_PATH}/groups/${pathSegment(key)}`
export const voicesBrandPath = (key: string): string => `${VOICES_PATH}/brands/${pathSegment(key)}`
export const voicesCreatorPath = (platform: string, account: string): string =>
  `${VOICES_PATH}/creators/${pathSegment(platform)}/${pathSegment(account)}`

/** `?month=YYYY-MM` where a month was chosen, else nothing. */
export function voicesMonthQuery(month?: string | null): string {
  return month ? `?month=${encodeURIComponent(month.slice(0, 7))}` : ''
}

/** The pages with the reader's chosen month kept. */
export const voicesGroupHref = (key: string, p: { month?: string | null } = {}): string => `${voicesGroupPath(key)}${voicesMonthQuery(p.month)}`
export const voicesBrandHref = (key: string, p: { month?: string | null } = {}): string => `${voicesBrandPath(key)}${voicesMonthQuery(p.month)}`
export const voicesCreatorHref = (platform: string, account: string, p: { month?: string | null } = {}): string =>
  `${voicesCreatorPath(platform, account)}${voicesMonthQuery(p.month)}`

/** Whether a path is one of Voices' pages (the root or a level page), for
 *  the redirect table's "an address something serves". */
export function isVoicesPage(path: string): boolean {
  return path === VOICES_PATH
    || /^\/dashboard\/voices\/(groups|brands)\/[^/]+$/.test(path)
    || /^\/dashboard\/voices\/creators\/[^/]+(\/[^/]+)?$/.test(path)
}

/** An old `?creator=`: `platform|account`, or the account alone. */
export function creatorParam(raw: string): { platform: string | null; account: string } {
  const at = raw.indexOf('|')
  if (at > 0 && at < raw.length - 1) return { platform: raw.slice(0, at), account: raw.slice(at + 1) }
  return { platform: null, account: raw }
}

/** A creator's address from an old `?creator=` value. */
export function creatorPathOf(raw: string): string {
  const c = creatorParam(raw)
  return c.platform ? voicesCreatorPath(c.platform, c.account) : `${VOICES_PATH}/creators/${pathSegment(c.account)}`
}

// ---- the redirects ------------------------------------------------------------------

type Params = Record<string, string | string[] | undefined>

/** A param's value, a repeated key's first; an empty one is no value. */
function valueOf(v: string | string[] | undefined): string | undefined {
  const x = (Array.isArray(v) ? v[0] : v)?.trim()
  return x ? x : undefined
}

/** `href` with the params as its query, the named keys left out, every other
 *  value kept as it came (a repeated key stays repeated). */
function withRest(href: string, params: Params, drop: readonly string[]): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (drop.includes(k)) continue
    for (const x of Array.isArray(v) ? v : [v]) if (x !== undefined) q.append(k, x)
  }
  const qs = q.toString()
  return qs ? `${href}?${qs}` : href
}

/** The params that opened a level in place, and which page each opens, in
 *  the root's old order: a group, a brand, a creator. */
const LEVEL_PARAMS = ['group', 'persona', 'brand', 'creator'] as const

/** The level page a set of params names, or null where none names one. */
function levelOf(params: Params): string | null {
  const group = valueOf(params.group) ?? valueOf(params.persona)
  if (group) return voicesGroupPath(group)
  const brand = valueOf(params.brand)
  if (brand) return voicesBrandPath(brand)
  const creator = valueOf(params.creator)
  if (creator) return creatorPathOf(creator)
  return null
}

/**
 * VOICES' LEVELS ARE PAGES (17 Oct): where an old address that opened a
 * group, a brand or a creator in place lands now, in ONE hop, the level's
 * param dropped and every other kept (`?month=` with it). Stored snapshots,
 * sent emails and share pages carry these links, so the redirects are for
 * good. `undefined` where this mapping does not apply (lib/nav.ts
 * `redirectFor` then goes on as before); null where the address is Voices'
 * own root with nothing to open.
 *
 *   /dashboard/voices?group=G (or ?persona=)  → /dashboard/voices/groups/G
 *   /dashboard/voices?brand=B                 → /dashboard/voices/brands/B
 *   /dashboard/voices?creator=P|A             → /dashboard/voices/creators/P/A (or /A)
 *   /dashboard/voice?persona=… / ?brand=… / ?creator=…   the same, unless a
 *     `?theme=` / `?themes=` sends it to Market's conversation (that wins)
 *   /dashboard/competitive?vs=B               → /dashboard/voices/brands/B
 *
 * Pure.
 */
export function voicesLevelRedirect(path: string, params: Params = {}): string | null | undefined {
  switch (path) {
    case VOICES_PATH: {
      const to = levelOf(params)
      return to ? withRest(to, params, LEVEL_PARAMS) : null
    }
    case '/dashboard/voice': {
      if (valueOf(params.theme) ?? valueOf(params.themes)?.split(',').map((s) => s.trim()).find(Boolean)) return undefined
      const to = levelOf(params)
      return to ? withRest(to, params, [...LEVEL_PARAMS, 'theme', 'themes']) : undefined
    }
    case '/dashboard/competitive': {
      const brand = valueOf(params.vs)
      return brand ? withRest(voicesBrandPath(brand), params, ['vs']) : undefined
    }
    default:
      return undefined
  }
}
