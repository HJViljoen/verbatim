import { SEALAND_CLIENT_ID } from '../lib/config'
import { assertProject, modeLine, parseScriptArgs } from '../lib/ops/market-first-args'
import { isMissingObject } from '../lib/provenance/load'
import { createAdminClient, selectAll } from '../lib/supabase-admin'

// Heinrich's "never lead with this theme" (market-first plan §6, the trial's
// safety valve; MF1's `front_page_overrides`, WP1.4). If the lead theme or its
// voices read wrong on real data, one paste excludes it and the next largest
// qualifying theme leads (WP1.6's heroLead reads the set).
//
// READ-ONLY BY DEFAULT: it prints the overrides in force (the newest row per
// theme wins). With --apply --project <ref> and exactly one of
// --exclude <registry id> or --allow <registry id> it appends one row;
// --note says why. The table is append-only: an exclusion is lifted by a
// newer --allow row, never by a delete. It never prompts.
//
//   node --env-file=.env.local --import tsx scripts/front-page-override.ts --project <ref> \
//     [--exclude <registry id> | --allow <registry id>] [--note "<why>"] [--apply]

const NAME = 'front-page-override'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

interface OverrideRow { registry_id: string; action: 'exclude_lead' | 'allow_lead'; note: string | null; actor_label: string; set_at: string }

/** The overrides in force: the newest row per theme. */
export function inForce(rows: readonly OverrideRow[]): Map<string, OverrideRow> {
  const out = new Map<string, OverrideRow>()
  for (const r of rows) {
    const held = out.get(r.registry_id)
    if (!held || Date.parse(r.set_at) > Date.parse(held.set_at)) out.set(r.registry_id, r)
  }
  return out
}

async function main() {
  const args = parseScriptArgs(process.argv.slice(2), {
    name: NAME, values: ['exclude', 'allow', 'note'], defaultClient: SEALAND_CLIENT_ID,
  })
  assertProject(args, process.env.NEXT_PUBLIC_SUPABASE_URL, NAME)
  console.log(modeLine(args, NAME))
  const exclude = args.values.exclude
  const allow = args.values.allow
  if (exclude && allow) throw new Error(`${NAME}: give --exclude or --allow, not both`)
  const target = exclude ?? allow ?? null
  if (target && !UUID.test(target)) throw new Error(`${NAME}: a theme is named by its registry id (a uuid), got ${target}`)
  if (args.apply && !target) throw new Error(`${NAME}: --apply needs --exclude <registry id> or --allow <registry id>`)

  const admin = createAdminClient()
  let rows: OverrideRow[]
  try {
    rows = await selectAll<OverrideRow>(() => admin.from('front_page_overrides')
      .select('registry_id, action, note, actor_label, set_at').eq('client_id', args.clientId).order('set_at').order('registry_id'))
  } catch (e) {
    if (isMissingObject(e, 'front_page_overrides')) throw new Error(`${NAME}: front_page_overrides does not exist on ${args.project}. Apply MF1 first.`)
    throw e
  }
  const force = inForce(rows)
  const excluded = [...force.values()].filter((r) => r.action === 'exclude_lead')
  console.log(`  ${excluded.length} theme(s) may not lead${excluded.length ? ':' : ''}`)
  for (const r of excluded) console.log(`    ${r.registry_id} · since ${r.set_at}${r.note ? ` · ${r.note}` : ''}`)

  if (target) {
    // The theme must be this tenant's, so a pasted id from the other workspace is refused.
    const { data, error } = await admin.from('theme_registry').select('id, canonical_label').eq('client_id', args.clientId).eq('id', target).maybeSingle()
    if (error) throw new Error(`${NAME}: theme_registry read failed: ${error.message}`)
    if (!data) throw new Error(`${NAME}: ${target} is not a theme of client ${args.clientId}`)
    console.log(`  ${exclude ? 'exclude' : 'allow'} ${target} ("${(data as { canonical_label: string }).canonical_label}")`)
  }
  if (!args.apply) {
    console.log('read-only: nothing written')
    return
  }
  const { error } = await admin.from('front_page_overrides').insert({
    client_id: args.clientId, registry_id: target, action: exclude ? 'exclude_lead' : 'allow_lead',
    note: args.values.note ?? null, actor_label: `scripts/${NAME}.ts --apply`,
  })
  if (error) throw new Error(`${NAME}: not written: ${error.message}`)
  console.log(`APPLIED: ${exclude ? 'exclude_lead' : 'allow_lead'} for ${target}`)
}

if (process.argv[1]?.endsWith('front-page-override.ts')) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
}
