import type { SupabaseClient } from '@supabase/supabase-js'

import { authorKey } from '../gather/suppression'
import { selectAll } from '../supabase-admin'
import { proseNeedles, scrubJson } from './analysis-prose'
import { isMissingTable } from './stored-prose'

// The raw actor payloads, on an erasure request (scripts/erase-commenter.ts,
// step 7h).
//
// `video_raw` keeps each kept video's whole actor item for 30 days, for the
// transcript step (lib/gather/gather.ts:781). The script used to say it
// never carries comments; for Instagram it very likely does: the scraper's
// post items carry the post's latest comments, each with its author's
// username and text (`latestComments`, plus `firstComment`). No fixture in
// the repo shows a stored row, so this does not lean on that shape. It walks
// the payload, and:
//   * drops any element of any array that is a comment by this handle: an
//     object with a string `text` and an author field (`ownerUsername`,
//     `username`, `author`, `owner.username`) whose key is one of the
//     suppression keys; and
//   * scrubs the person's words from every other string, by the analysis
//     sweep's rule (lib/retention/analysis-prose.ts).
// The payload's root is the post and is never dropped. A payload with no such
// element and none of the words is left exactly as it was, so a wrong guess
// about the shape costs nothing. Every tenant's rows on the platform are read:
// a post's latest comments can name someone whose comment we never stored.

export const RAW_TABLE = 'video_raw'

const authorOf = (o: Record<string, unknown>): unknown => {
  for (const k of ['ownerUsername', 'username', 'author']) if (typeof o[k] === 'string') return o[k]
  const owner = o.owner as { username?: unknown } | null | undefined
  return owner && typeof owner === 'object' ? owner.username : undefined
}

/** A comment written by one of these keys. */
function isTheirComment(v: unknown, platform: string, keys: ReadonlySet<string>): boolean {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false
  const o = v as Record<string, unknown>
  if (typeof o.text !== 'string') return false
  const author = authorOf(o)
  const key = typeof author === 'string' ? authorKey(platform, author) : null
  return key != null && keys.has(key)
}

/**
 * One payload without this person's comments or words; the SAME value (===)
 * where it held neither. Pure.
 */
export function scrubRawPayload(raw: unknown, platform: string, keys: ReadonlySet<string>, texts: readonly string[]): unknown {
  const needles = proseNeedles(texts)
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) {
      let changed = false
      const out: unknown[] = []
      for (const x of v) {
        if (isTheirComment(x, platform, keys)) { changed = true; continue }
        const next = walk(x)
        if (next !== x) changed = true
        out.push(next)
      }
      return changed ? out : v
    }
    if (v && typeof v === 'object') {
      let changed = false
      const out: Record<string, unknown> = {}
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        const next = walk(x)
        if (next !== x) changed = true
        out[k] = next
      }
      return changed ? out : v
    }
    return needles.length ? scrubJson(v, needles) : v
  }
  return walk(raw)
}

/**
 * This platform's raw payloads that carry the person, scrubbed (`apply`) or
 * counted. Returns how many rows did. Runs on the handle alone, so a person
 * with no stored comment is still found here.
 */
export async function scrubRawPayloads(
  admin: SupabaseClient,
  platform: string,
  keys: ReadonlySet<string>,
  texts: readonly string[],
  opts: { apply: boolean },
): Promise<number> {
  if (!keys.size && !proseNeedles(texts).length) return 0
  const probe = await admin.from(RAW_TABLE).select('id').eq('platform', platform).limit(1)
  if (probe.error) {
    if (isMissingTable(probe.error, RAW_TABLE)) return 0
    throw new Error(`read ${RAW_TABLE}: ${(probe.error as { message?: string }).message ?? probe.error}`)
  }
  // Small pages: a payload is a whole actor item.
  const rows = await selectAll<{ id: number; raw: unknown }>(
    () => admin.from(RAW_TABLE).select('id, raw').eq('platform', platform).order('id', { ascending: true }),
    200,
  )
  let n = 0
  for (const r of rows) {
    const next = scrubRawPayload(r.raw, platform, keys, texts)
    if (next === r.raw) continue
    n++
    if (opts.apply) {
      const { error } = await admin.from(RAW_TABLE).update({ raw: next }).eq('id', r.id)
      if (error) throw new Error(`scrub ${RAW_TABLE} ${r.id}: ${(error as { message?: string }).message ?? error}`)
    }
  }
  return n
}
