import { SEALAND_CLIENT_ID } from '../lib/config'
import { recordConfigChange, scriptActor } from '../lib/config-log'
import { assertProject, modeLine, parseScriptArgs } from '../lib/ops/market-first-args'
import { createAdminClient } from '../lib/supabase-admin'

// The two operator-only tracking columns MF3 adds (plan §4.1, §4.2; WP3.5,
// WP3.10, WP3.11): `market_description`, the market in the client's words for
// the briefs' {market}, and `watched_brands`, brands we count beyond the
// rivals. No tenant holds a grant to write either, and no Settings control
// writes them: this script is the one way in.
//
// READ-ONLY BY DEFAULT: it prints what is stored. With --apply --project <ref>
// and one or both of the value flags it writes them on the admin client and
// logs each column that moved through recordConfigChange, surface 'other',
// with the command as the actor (the audit trigger's column list does not
// watch these two, so without the log row nothing would say they moved). It
// never prompts.
//
//   node --env-file=.env.local --import tsx scripts/operator-config.ts --project <ref> [--client <uuid>] \
//     [--market-description "sustainable travel bags"] [--watched-brands "Osprey,Peak Design"] [--apply]
//
// --watched-brands is the WHOLE list, comma-separated ("" clears it).
//
// KNOWN SEAM, NOT THIS FILE'S TO CLOSE: `changesFromLog`
// (lib/reading/comparability.ts) reads every surface-'other' row as a change of
// ours on every view (VIEWS_BY_SURFACE.other), with only the attention-panel
// freeze exempt. So a description written inside a month the pages compare
// would refuse that pair, though it moves no count. Until that file exempts
// `market_description` (no view) and reads `watched_brands` as the brands view
// only, the dry run says so, and an --apply inside October or November should
// wait for that change (reported with WP3.10).

const NAME = 'operator-config'

/** A noun phrase that stands where the briefs say {market}. */
export const DESCRIPTION_MAX = 160
export const WATCHED_MAX = 20
const BRAND_MAX = 60

/** The notes the log rows store. Tenant-readable and stored for good, so they
 *  hold to plan §4.0: no digit, no em dash, no direction word. */
export const DESCRIPTION_NOTE = 'We changed how we describe your market in your briefs.'
export const WATCHED_NOTE = 'We changed the brands we count beyond your rivals.'

/** The description, checked: trimmed, one line, no em dash, not empty. */
export function checkDescription(raw: string): string {
  const v = raw.trim().replace(/\s+/g, ' ')
  if (!v) throw new Error(`${NAME}: --market-description is empty; to leave it as it is, do not pass the flag`)
  if (v.length > DESCRIPTION_MAX) throw new Error(`${NAME}: --market-description is over ${DESCRIPTION_MAX} characters`)
  if (/—/.test(v)) throw new Error(`${NAME}: --market-description carries an em dash (plan §4.0)`)
  return v
}

/** The watched list: comma-separated, trimmed, de-duplicated case-blind, the
 *  first spelling kept. "" is the empty list. */
export function parseWatched(raw: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of raw.split(',')) {
    const name = part.trim().replace(/\s+/g, ' ')
    if (!name) continue
    if (name.length < 2 || name.length > BRAND_MAX) throw new Error(`${NAME}: "${name}" is not a brand name of 2 to ${BRAND_MAX} characters`)
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(name)
  }
  if (out.length > WATCHED_MAX) throw new Error(`${NAME}: ${out.length} watched brands; keep it to ${WATCHED_MAX}`)
  return out
}

export interface Stored { market_description: string | null; watched_brands: string[] | null }
export interface Planned { field: 'market_description' | 'watched_brands'; before: unknown; after: unknown; note: string }

/** What an --apply would change: each column whose value moves, nothing else. */
export function plan(stored: Stored, wanted: { description?: string; watched?: string[] }): Planned[] {
  const out: Planned[] = []
  if (wanted.description !== undefined && wanted.description !== (stored.market_description ?? null)) {
    out.push({ field: 'market_description', before: stored.market_description ?? null, after: wanted.description, note: DESCRIPTION_NOTE })
  }
  if (wanted.watched !== undefined) {
    const before = stored.watched_brands ?? []
    const same = before.length === wanted.watched.length && before.every((b, i) => b === wanted.watched![i])
    if (!same) out.push({ field: 'watched_brands', before, after: wanted.watched, note: WATCHED_NOTE })
  }
  return out
}

function isMissingColumns(error: unknown): boolean {
  const m = String((error as { message?: string })?.message ?? error)
  return /market_description|watched_brands/.test(m) && /does not exist|schema cache|Could not find/i.test(m)
}

async function main() {
  const args = parseScriptArgs(process.argv.slice(2), {
    name: NAME, values: ['market-description', 'watched-brands'], defaultClient: SEALAND_CLIENT_ID,
  })
  assertProject(args, process.env.NEXT_PUBLIC_SUPABASE_URL, NAME)
  console.log(modeLine(args, NAME))
  const wanted = {
    ...(args.values['market-description'] !== undefined ? { description: checkDescription(args.values['market-description']) } : {}),
    ...(args.values['watched-brands'] !== undefined ? { watched: parseWatched(args.values['watched-brands']) } : {}),
  }
  if (args.apply && Object.keys(wanted).length === 0) {
    throw new Error(`${NAME}: --apply needs --market-description or --watched-brands`)
  }

  const admin = createAdminClient()
  const { data, error } = await admin.from('tracking_configs').select('market_description, watched_brands').eq('client_id', args.clientId).maybeSingle()
  if (error) {
    if (isMissingColumns(error)) throw new Error(`${NAME}: market_description and watched_brands are not on ${args.project} yet. Apply MF3 first. Nothing read, nothing written.`)
    throw new Error(`${NAME}: tracking_configs read failed: ${error.message}`)
  }
  if (!data) throw new Error(`${NAME}: client ${args.clientId} has no tracking_configs row`)
  const stored = data as Stored
  console.log(`  market_description: ${stored.market_description == null ? '(none)' : JSON.stringify(stored.market_description)}`)
  console.log(`  watched_brands: ${(stored.watched_brands ?? []).length ? (stored.watched_brands ?? []).join(', ') : '(none)'}`)

  const changes = plan(stored, wanted)
  for (const c of changes) console.log(`  would set ${c.field}: ${JSON.stringify(c.before)} → ${JSON.stringify(c.after)}`)
  if (Object.keys(wanted).length > 0 && changes.length === 0) console.log('  nothing to change: the stored values are the ones given')
  if (changes.length > 0) {
    console.log('  note: the change log reads a surface-\'other\' row as a change of ours on every view until lib/reading/comparability.ts exempts these two columns; a write inside a month the pages compare would refuse that pair.')
  }
  if (!args.apply) {
    console.log('read-only: nothing written')
    return
  }
  if (changes.length === 0) return

  const patch = Object.fromEntries(changes.map((c) => [c.field, c.after]))
  const { error: writeError, count } = await admin.from('tracking_configs')
    .update({ ...patch, updated_at: new Date().toISOString() }, { count: 'exact' }).eq('client_id', args.clientId)
  if (writeError) throw new Error(`${NAME}: not written: ${writeError.message}`)
  if (count === 0) throw new Error(`${NAME}: the update matched no row; nothing written`)
  for (const c of changes) {
    const logged = await recordConfigChange(admin, {
      clientId: args.clientId,
      surface: 'other',
      field: c.field,
      before: c.before,
      after: c.after,
      // The flag, never its value: actor_label is tenant-readable.
      actor: scriptActor(`scripts/${NAME}.ts --${c.field === 'market_description' ? 'market-description' : 'watched-brands'} <value> --apply --project ${args.project}`),
      note: c.note,
    })
    if (!logged) throw new Error(`${NAME}: ${c.field} was written but its change-log row was NOT recorded. Record it by hand before anything else moves.`)
    console.log(`APPLIED: ${c.field}, logged (surface 'other')`)
  }
}

if (process.argv[1]?.endsWith('operator-config.ts')) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
}
