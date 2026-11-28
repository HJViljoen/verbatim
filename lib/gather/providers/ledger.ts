import { createAdminClient, selectAll } from '../../supabase-admin'
import { getApifyRunContext } from '../apify-runs'

// The direct-provider ledger (28 Nov 2026, table provider_calls, migration
// 20261128090000_provider_calls.sql): one row per provider JOB (one hashtag
// feed paged, later one post's comments), with its HTTP call count and exact
// cost. The apify_runs pattern: attributed through the same AsyncLocalStorage
// context the pipeline enters inside each step, no context means no row (a
// script, a test, a dry run), and nothing here can fail the step that already
// spent the money. Before the migration is applied the write warns and the
// spend read answers 0, so the code can land first.

export type ProviderCallRow = {
  provider: string
  transport: string
  job: string
  target: string | null
  calls: number
  cost_usd: number
  items_seen: number
  items: number
  outcome: 'ok' | 'partial' | 'empty' | 'error'
  error: string | null
  duration_ms: number
}

/** How long the budget read may hold a search step up. */
const SPEND_READ_MS = 10_000

/** Write one row for a finished provider job. Never throws. */
export async function recordProviderCall(row: ProviderCallRow): Promise<void> {
  const ctx = getApifyRunContext()
  if (!ctx || !ctx.clientId) return
  try {
    const { error } = await createAdminClient().from('provider_calls').insert({
      client_id: ctx.clientId,
      run_id: ctx.runId ?? null,
      step: ctx.step ?? null,
      ...row,
      cost_usd: Math.round(row.cost_usd * 1e6) / 1e6,
      error: row.error ? row.error.slice(0, 500) : null,
    })
    if (error) console.warn(`[provider-calls] record ${row.provider} ${row.job} failed: ${error.message}`)
  } catch (e) {
    console.warn(`[provider-calls] record ${row.provider} ${row.job} threw: ${e instanceof Error ? e.message : String(e)}`)
  }
}

/** What this run has spent on direct providers so far, in USD. 0 on any read
 *  error (the table not there yet included): the budget is a soft stop, and
 *  the hard caps (the page cap, treg's capped prepaid token) do not read this. */
export async function providerSpendForRun(runId: string): Promise<number> {
  try {
    const admin = createAdminClient()
    const rows = await selectAll<{ cost_usd: number | string | null }>(() =>
      admin.from('provider_calls').select('cost_usd').eq('run_id', runId).order('id').abortSignal(AbortSignal.timeout(SPEND_READ_MS)),
    )
    return rows.reduce((sum, r) => sum + (Number(r.cost_usd) || 0), 0)
  } catch (e) {
    console.warn(`[provider-calls] spend read for run ${runId} failed: ${e instanceof Error ? e.message : String(e)}`)
    return 0
  }
}
