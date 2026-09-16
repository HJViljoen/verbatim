// Request-level memoisation for the reading layer's reads (Phase 1 WP23).
//
// WHY THIS EXISTS. One render of one page asks the same question several times,
// because blocks are independent by design and each loads what it needs. On
// production, measured 16 September: Overview reads `config_changes` three
// times, `theme_registry` labels twice, `month_denominators` twice and
// `pipeline_runs` four times, for the same tenant, with the same arguments,
// inside a single `loadOverview`. Each of those is a round trip of 180–800 ms
// against a warm instance and there are enough of them that the page spends
// most of its time waiting on answers it already has.
//
// WHY NOT React `cache()`. `cache()` is the obvious tool and it is a NO-OP
// outside a React render: with no dispatcher it calls straight through
// (react/src/ReactCacheImpl.js). The reading layer's callers are not all
// renders — `/api/export`, `lib/reports/build.ts`, `/api/reports/[id]/build`
// and the operator scripts run the same loaders with no render around them, and
// those are exactly the paths that load several pages' worth of blocks at once.
// A memo those paths do not get is a memo that misses the slowest caller.
//
// SO THE SCOPE IS THE CLIENT OBJECT. Every request builds its own Supabase
// clients — `getSessionContext()` makes the session client per request and
// `readingHandle()` builds its service-role client lazily, once, per handle —
// so a WeakMap keyed on the client instance IS request scope, in a render and
// out of one, with no framework underneath it. It also makes the tenant
// boundary structural rather than remembered: two tenants are never one scope,
// because they are never one client object, and a memo entry cannot outlive the
// client that made it.
//
// WHAT MAY BE MEMOISED. Reads, and only reads that are pure functions of their
// key within one request: the same tenant, the same arguments, the same answer.
// Nothing that writes, and nothing a caller mutates in place — every memoised
// value here is handed out as the same object to every caller, so a caller that
// sorts an array in place would sort it for the next block too. The reading
// layer treats its rows as readonly; a new memo must check that it still does.
//
// A REJECTION IS NOT REMEMBERED. A failed read is evicted before it is handed
// on, so a transient failure costs the caller that met it and not the whole
// page: the next block asks again, exactly as it would have without the memo.

/** The per-client scopes. Weak on purpose: a memo dies with the client that
 *  made it, so a finished request leaves nothing behind. */
const SCOPES = new WeakMap<object, Map<string, Promise<unknown>>>()

function scopeOf(client: unknown): Map<string, Promise<unknown>> | null {
  if (!client || (typeof client !== 'object' && typeof client !== 'function')) return null
  const key = client as object
  let scope = SCOPES.get(key)
  if (!scope) {
    scope = new Map()
    SCOPES.set(key, scope)
  }
  return scope
}

/**
 * Run `read` once per `key` per client, and hand every later caller in the same
 * request the same promise.
 *
 * `key` must name every argument that changes the answer. A key that forgets
 * one is a page that shows another block's answer, which is worse than a slow
 * page — so the callers here build their keys from the tenant id and every
 * filter, and the tests hold them.
 *
 * An unmemoisable client (a plain value, a mock that is not an object) is not
 * an error: the read simply runs, which is what a caller without a scope should
 * get.
 */
export function memoRead<T>(client: unknown, key: string, read: () => Promise<T>): Promise<T> {
  const scope = scopeOf(client)
  if (!scope) return read()
  const found = scope.get(key)
  if (found) return found as Promise<T>
  const started = read().catch((error) => {
    // Evict BEFORE rethrowing, so the rejection is not what the next caller
    // gets handed. `delete` guards on identity in case a later call has already
    // replaced the entry.
    if (scope.get(key) === started) scope.delete(key)
    throw error
  })
  scope.set(key, started)
  return started
}

/**
 * A stable key fragment for a set of ids: order and duplicates must not make
 * two identical asks look different.
 *
 * UP TO EIGHT IDS THIS IS AN IDENTITY. ABOVE THAT IT IS A DIGEST, and the rule
 * stated two functions up — a key names every argument that changes the answer
 * — holds only in the first case. A longer list is named by its size, its
 * lowest and highest id and a 32-bit djb2 hash of all of them, because a key is
 * a Map key and a three-thousand-id string is copied on every lookup. Two
 * different sets that agree on all four would share an answer.
 *
 * A deliberate trade, said out loud rather than implied: the sets inside one
 * request are a handful, they are one tenant's own objects, and a collision
 * needs the size, both bounds and the hash to agree. A caller whose id sets are
 * many, or not of its own making, should key on something it controls instead.
 */
export function idsKey(ids: readonly string[]): string {
  const sorted = [...new Set(ids)].sort()
  if (sorted.length <= 8) return sorted.join(',')
  let h = 5381
  for (const id of sorted) {
    for (let i = 0; i < id.length; i++) h = (((h << 5) + h) ^ id.charCodeAt(i)) >>> 0
  }
  return `${sorted.length}:${sorted[0]}:${sorted[sorted.length - 1]}:${h.toString(36)}`
}

/** How many answers this client is holding — for tests and for a status note,
 *  never for a decision on a page. */
export function memoSize(client: unknown): number {
  const key = client as object
  return SCOPES.get(key)?.size ?? 0
}

/** Forget everything this client remembers. An operator script that writes and
 *  then reads back through the same client calls this between the two; a page
 *  never does, because a page's client does not outlive its request. */
export function clearMemo(client: unknown): void {
  const key = client as object
  SCOPES.get(key)?.clear()
}
