import { readFileSync } from 'node:fs'

import { CONFIG_CHANGES_TABLE, scriptActor, updateWithActor } from '../lib/config-log'
import { checkMarketDefinition, marketDefinitionChange, planMarketDefinition, type MarketDefinitionPlan } from '../lib/gather/market-definition'
import { assertProject, modeLine, parseScriptArgs } from '../lib/ops/market-first-args'
import { createAdminClient } from '../lib/supabase-admin'

// Set (or clear) a tenant's market definition: `tracking_configs.market_description`,
// the market the relevance gate judges by (lib/gather/relevance.ts). What the
// definition is for, how it must be worded and the row it leaves are
// lib/gather/market-definition.ts. Generic: any tenant, any file.
//
//   node --env-file=.env.local --import tsx scripts/set-market-description.ts \
//     --client <uuid> --project <ref> (--file <path> | --clear) [--apply] [--allow-running]
//
// READ-ONLY BY DEFAULT (lib/ops/market-first-args.ts): a timed probe, then
// four small reads (the stored definition, the newest frozen month, any
// running update), and it prints what would change, the prompt version the
// gate's calls would carry, the months it re-judges and the pairs it refuses.
// No OpenAI call, no Apify.
//
// WITH --apply: ONE tracking_configs UPDATE of market_description, the actor
// stamped (`updateWithActor`; the audit trigger does not watch this column, so
// the stamp alone writes no row), then ONE config_changes row, `gate_rule` /
// `market_description` with `affects_months` (`marketDefinitionChange`): the
// comparison break. Refused while the tenant has a running update (its gate
// steps would judge part of one gather each way), unless --allow-running.
//
// THE BREAK HOLDS ONLY ONCE THE CORPUS IS REGATED: after this, remove what the
// two raters' plan calls off-market under the definition (the regate script;
// it does not re-run the gate, which judges only what later gathers find) and
// refresh the filling months the dry run names. Until then those months still
// hold what the old rule let in.
//
// UNDO: --clear --apply (or --file <the earlier words> --apply) writes the
// old value back and logs a second row. The log is append-only, so the first
// row stays and its months stay refused against the frozen ones before them:
// the fail-closed side.

const NAME = 'set-market-description'
const PROBE_MAX_MS = 3000

type Result = { data?: unknown; error: { message?: string; code?: string } | null; count?: number | null }
interface Query extends PromiseLike<Result> {
  select: (cols: string) => Query
  eq: (col: string, v: unknown) => Query
  order: (col: string, opts?: { ascending?: boolean }) => Query
  limit: (n: number) => Query
  maybeSingle: () => PromiseLike<Result>
  update: (payload: Record<string, unknown>, opts?: { count?: 'exact' }) => Query
}
/** The admin client, as far as this script uses it (a test passes a fake). */
export interface DefinitionAdmin {
  from: (table: string) => Query & { insert: (row: Record<string, unknown>) => PromiseLike<Result> }
}

export interface RunDeps {
  admin: DefinitionAdmin
  supabaseUrl: string | undefined
  now?: () => string
  log?: (line: string) => void
  readFile?: (path: string) => string
}

export interface RunOutcome { plan: MarketDefinitionPlan; applied: boolean }

const monthName = (m: string): string => new Date(`${m.slice(0, 10)}T12:00:00Z`).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })

/** The plan in words, as the dry run prints it. Pure. */
export function planLines(plan: MarketDefinitionPlan): string[] {
  const from = plan.rejudgedFrom
  return [
    `  market_description: ${plan.before.market_description == null ? '(none)' : `${plan.before.market_description.length} characters`} → ${plan.after.market_description == null ? '(none)' : `${plan.after.market_description.length} characters`}${plan.moves ? '' : ' (unchanged)'}`,
    `  the gate's prompt version: ${plan.before.prompt_version} → ${plan.after.prompt_version}`,
    `  re-judged months (affects_months): ${plan.band}: ${monthName(from)} on is read under the new definition; the months before it keep their frozen figures`,
    `  month comparisons refused: any month before ${monthName(from)} against ${monthName(from)} or later; the weekly bars are not cut`,
  ]
}

export async function runSetMarketDescription(argv: readonly string[], deps: RunDeps): Promise<RunOutcome> {
  const log = deps.log ?? ((line: string) => console.log(line))
  const now = deps.now ?? (() => new Date().toISOString())
  const args = parseScriptArgs(argv, { name: NAME, values: ['file'], flags: ['clear', 'allow-running'], defaultClient: '' })
  assertProject(args, deps.supabaseUrl, NAME)
  const file = args.values.file
  const clear = args.flags.has('clear')
  if ((file == null) === !clear) throw new Error(`${NAME}: give exactly one of --file <path> or --clear`)
  const wanted = clear ? null : checkMarketDefinition((deps.readFile ?? ((p) => readFileSync(p, 'utf8')))(file!))
  log(modeLine(args, NAME))

  const { admin } = deps
  const t0 = Date.now()
  const probe = await admin.from('clients').select('id').eq('id', args.clientId).limit(1)
  const ms = Date.now() - t0
  if (probe.error) throw new Error(`${NAME}: the probe failed (${probe.error.message}). Back off 15 minutes. Nothing read further.`)
  if (ms > PROBE_MAX_MS) throw new Error(`${NAME}: the probe took ${ms} ms (over ${PROBE_MAX_MS}). Back off 15 minutes. Nothing read further.`)

  const tc = await admin.from('tracking_configs').select('market_description').eq('client_id', args.clientId).maybeSingle()
  if (tc.error) throw new Error(`${NAME}: tracking_configs: ${tc.error.message}. Nothing written.`)
  if (!tc.data) throw new Error(`${NAME}: client ${args.clientId} has no tracking_configs row. Nothing written.`)
  const frozen = await admin.from('month_denominators').select('month').eq('client_id', args.clientId).eq('status', 'frozen')
    .order('month', { ascending: false }).limit(1)
  if (frozen.error) throw new Error(`${NAME}: month_denominators: ${frozen.error.message}. Nothing written.`)
  const latestFrozen = ((frozen.data ?? []) as { month: string }[])[0]?.month ?? null
  const runningRes = await admin.from('pipeline_runs').select('id').eq('client_id', args.clientId).eq('status', 'running')
  if (runningRes.error) throw new Error(`${NAME}: pipeline_runs: ${runningRes.error.message}. Nothing written.`)
  const running = ((runningRes.data ?? []) as { id: string }[]).map((r) => r.id)

  const plan = planMarketDefinition((tc.data as { market_description?: unknown }).market_description, wanted, latestFrozen, now())
  log(`  newest frozen month: ${latestFrozen ?? '(none)'}`)
  for (const line of planLines(plan)) log(line)
  if (plan.after.market_description) {
    log('  the definition, as the gate and the written reads will read it:')
    for (const line of plan.after.market_description.split('\n')) log(`    | ${line}`)
  }
  if (running.length > 0) log(`  running update(s): ${running.join(', ')}`)
  log(`  next: the regate (it removes what the raters' plan calls off-market), then the refresh of ${monthName(plan.rejudgedFrom)} onward (the filling months); the break holds only once both are done`)

  if (!args.apply) {
    log(`${NAME}: read-only, nothing written. --apply writes the column and logs one change row.`)
    return { plan, applied: false }
  }
  if (!plan.moves) {
    log(`${NAME}: nothing to change: the stored definition is the one given. Nothing written.`)
    return { plan, applied: false }
  }
  if (running.length > 0 && !args.flags.has('allow-running')) {
    throw new Error(`${NAME}: REFUSED: an update is running for this client (${running.join(', ')}). Run again when it has finished, or pass --allow-running. Nothing written.`)
  }

  // The command, never the words: actor_label is tenant-readable, and the
  // words are on the row's `after` with their prompt version.
  const label = `scripts/${NAME}.ts --client ${args.clientId} ${clear ? '--clear' : '--file <file>'} --apply --project ${args.project}`
  const at = now()
  const write = await updateWithActor(
    (payload) => admin.from('tracking_configs').update(payload, { count: 'exact' }).eq('client_id', args.clientId),
    { market_description: plan.after.market_description, updated_at: at },
    scriptActor(label),
  )
  if (write.error) throw new Error(`${NAME}: not written: ${write.error.message}`)
  if (write.count === 0) throw new Error(`${NAME}: the update matched no row; nothing written`)
  if (!write.stamped) log(`  WARNING: written WITHOUT the actor stamp (tracking_configs.last_actor was refused)`)

  const row = marketDefinitionChange({ clientId: args.clientId, plan, actorLabel: label, at })
  const logged = await admin.from(CONFIG_CHANGES_TABLE).insert(row)
  if (logged.error) {
    throw new Error(
      `${NAME}: market_description WAS WRITTEN but its change row was NOT recorded (${logged.error.message}). ` +
      `Record it by hand before anything else moves; the row: ${JSON.stringify(row)}`,
    )
  }
  log(`APPLIED: market_description written and logged (gate_rule / market_description, affects_months ${plan.band})`)
  return { plan, applied: true }
}

if (process.argv[1]?.endsWith('set-market-description.ts')) {
  runSetMarketDescription(process.argv.slice(2), {
    admin: createAdminClient() as unknown as DefinitionAdmin,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  }).catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e))
    process.exit(1)
  })
}
