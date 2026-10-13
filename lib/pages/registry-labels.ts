import type { SupabaseClient } from '@supabase/supabase-js'

import { chunk, mapWithLimit, READ_CONCURRENCY, UUID_IN_CHUNK } from '../chunk'
import { selectAll } from '../supabase-admin'

/**
 * Registry labels, by id: the "on what" of a theme move, an advice's leading
 * theme, a conversation an old link names that the run does not. A registry id
 * is the stable identity (AGENTS.md); the label is what a reader is shown.
 *
 * ONE READ FOR EVERY PAGE (Phase 4 fix round). Your moves and the legacy
 * market surface read through this; Market (lib/pages/v2/market.ts) kept its
 * own copy, one unchunked `.in()` that threw, until the fix round moved it
 * here. `lib/pages/market-surface.ts` re-exports it for its old importers.
 *
 * THE COLUMN IS `canonical_label` (depth v2, T7). The legacy read asked for
 * `label`, which `theme_registry` has never had, so PostgREST refused it and
 * every theme move printed no "on what". Measured 13 Oct: every one of Össur's
 * 1,471 and Sealand's 3,590 registry rows carries a `canonical_label`.
 *
 * ONLY THE IDS A PAGE NAMES, chunked like every `.in()` (lib/chunk.ts) and
 * paged (`selectAll`); none named, no read. FAIL-SOFT: a failed chunk is
 * logged and adds no label, so a reader prints its id-less fallback rather
 * than losing the page.
 */
export async function loadRegistryLabels(
  supabase: SupabaseClient,
  clientId: string,
  ids: readonly string[],
  /** Told of a failed chunk, for a reader that must say a read failed rather
   *  than print the missing labels as absent. */
  onError?: (error: unknown) => void,
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return new Map()
  const parts = await mapWithLimit(chunk(unique, UUID_IN_CHUNK), READ_CONCURRENCY, (part) =>
    selectAll<{ id: string; canonical_label: string | null }>(() =>
      supabase.from('theme_registry').select('id, canonical_label').eq('client_id', clientId).in('id', part).order('id', { ascending: true }),
    ).catch((error: unknown) => {
      onError?.(error)
      console.error(`[pages] registryLabels: ${error instanceof Error ? error.message : (error as { message?: string })?.message ?? String(error)}`)
      return [] as { id: string; canonical_label: string | null }[]
    }),
  )
  return new Map(parts.flat().filter((r) => r.canonical_label?.trim()).map((r) => [r.id, (r.canonical_label as string).trim()]))
}
