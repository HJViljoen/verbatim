import { createClient } from '@supabase/supabase-js'

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * Fetch ALL rows from a select query, paging past PostgREST's default 1000-row
 * cap (a silent truncation that, before this, made Pass A analyse only the first
 * 1000 comments of any client with more — e.g. Sealand at 2.3k saw ~44%).
 *
 * `build` MUST return a FRESH query each call — a query builder is single-use
 * once awaited. Pass a thunk ending at the filters/order:
 *   selectAll<CommentRow>(() =>
 *     admin.from('comments').select('*').eq('client_id', id).order('id'))
 *
 * Give the query a stable order (a unique tiebreaker like `id`) so range paging
 * can't skip or repeat rows between pages.
 */
export async function selectAll<T>(
  build: () => {
    range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
  },
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1)
    if (error) {
      const msg = (error as { message?: string }).message ?? String(error)
      throw new Error(`selectAll: ${msg}`)
    }
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < pageSize) break
  }
  return out
}
