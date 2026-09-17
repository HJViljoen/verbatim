import { createAdminClient, selectAll } from '../lib/supabase-admin'
import {
  planPurge, planTotal,
  type PurgeScope, type PurgeTables, type PurgePlan,
} from '../lib/reports/purge'

// Delete a workspace's reports. Dry by default.
//
//   node --env-file=.env.local --import tsx scripts/purge-reports.ts \
//     --client <uuid> --scope drafts|all [--apply]
//
// The owner's ask, 2026-09-17: "delete all the previous reports made on
// Sealand and Össur" — clients should not be opening old, unpolished reports.
// This is the tool for it, and the dry run is the point: it prints the exact
// rows that would go and the exact rows that would stay, with the reason for
// each, so the scope can be confirmed before anything is deleted.
//
//   --scope drafts  everything that was never delivered to anybody: snapshots
//                   with no `sent` send row and no share link that has ever
//                   been opened, their builds (plus failed and orphan builds),
//                   artifacts and their Storage objects, export events, share
//                   links nothing has opened, `weekly_reports` rows that were
//                   never emailed, and report definitions left with nothing.
//   --scope all     drafts plus the delivered history: sent snapshots, their
//                   share links and views, `report_sends`, emailed
//                   `weekly_reports`. This breaks URLs that are sitting in
//                   emails people already received. Read the KEPT section of a
//                   `drafts` run first to see what that is.
//
// WHAT IT WILL NOT DO, and why the rule is worth the code:
//
//   `report_schedules.report_id` is ON DELETE CASCADE, so deleting a `reports`
//   row deletes its schedule. Sealand's default "Weekly digest" schedule was
//   deliberately PAUSED on 2026-09-17. If it disappeared, `ensureDefaultSchedule`
//   would mint a fresh default on the next accepted invite — very possibly
//   ACTIVE — and Sealand's team would start receiving digests the owner
//   explicitly does not want. So a `reports` row that owns a schedule is never
//   deleted, and `report_schedules` is never written at all. After an apply the
//   table is re-read and compared, row for row, with what was there before.
//
// Analysis data is out of bounds entirely: insights, run_summary, themes, the
// monthly readings, account_snapshots, videos, comments. This script touches
// the report tables and the `artifacts` Storage bucket, and nothing else.
//
// The decision lives in lib/reports/purge.ts and is unit-tested there; this
// file is the I/O around it.

interface Args { clientId: string; scope: PurgeScope; apply: boolean }

function parseArgs(argv: string[]): Args {
  const a: Args = { clientId: '', scope: 'drafts', apply: false }
  let scopeGiven = false
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    const next = () => argv[++i]
    if (flag === '--client') a.clientId = next()
    else if (flag === '--scope') {
      const v = next()
      if (v !== 'drafts' && v !== 'all') throw new Error(`--scope takes drafts or all, got "${v}"`)
      a.scope = v
      scopeGiven = true
    } else if (flag === '--apply') a.apply = true
    else throw new Error(`unknown flag: ${flag}`)
  }
  if (!a.clientId) throw new Error('--client <uuid> is required')
  // No safe default for how much history goes.
  if (!scopeGiven) throw new Error('--scope drafts|all is required')
  return a
}

const short = (id: string | number) => String(id).slice(0, 8)
const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : 'never')
const kb = (n: number | null) => (n === null ? '?' : n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`)

async function load(admin: ReturnType<typeof createAdminClient>, clientId: string): Promise<PurgeTables> {
  const eq = <T>(table: string, cols: string) =>
    selectAll<T>(() => admin.from(table).select(cols).eq('client_id', clientId) as never)

  const [snapshots, sends, builds, artifacts, links, exportEvents, edits, reports, schedules, weekly] = await Promise.all([
    eq<PurgeTables['snapshots'][number]>('report_snapshots', 'id, kind, title, report_id, created_at'),
    eq<PurgeTables['sends'][number]>('report_sends', 'id, snapshot_id, share_link_id, subject, recipients, status, claimed_at, sent_at'),
    eq<PurgeTables['builds'][number]>('report_builds', 'id, report_id, snapshot_id, status, started_at, error'),
    eq<PurgeTables['artifacts'][number]>('artifacts', 'id, snapshot_id, format, bytes, storage_path, rendered_at'),
    eq<PurgeTables['links'][number]>('share_links', 'id, snapshot_id, title, view_count, last_viewed_at, created_at'),
    eq<PurgeTables['exportEvents'][number]>('export_events', 'id, snapshot_id, action, kind, format, created_at'),
    eq<PurgeTables['edits'][number]>('report_edits', 'id, snapshot_id, block_id'),
    eq<PurgeTables['reports'][number]>('reports', 'id, title, kind, template_key, created_at'),
    eq<PurgeTables['schedules'][number]>('report_schedules', 'id, report_id, name, active, is_default'),
    eq<PurgeTables['weekly'][number]>('weekly_reports', 'id, subject, week_start, week_end, sent_at, sent_to'),
  ])
  return { snapshots, sends, builds, artifacts, links, exportEvents, edits, reports, schedules, weekly }
}

/** The whole `report_schedules` table for this workspace, ordered, as one
 *  string — the before/after the apply compares. */
async function scheduleFingerprint(admin: ReturnType<typeof createAdminClient>, clientId: string): Promise<string> {
  const { data, error } = await admin
    .from('report_schedules').select('*').eq('client_id', clientId).order('id')
  if (error) throw new Error(`report_schedules fingerprint: ${error.message}`)
  return JSON.stringify(data ?? [])
}

function printPlan(p: PurgePlan, t: PurgeTables) {
  const section = (title: string, lines: string[]) => {
    console.log(`\n  ${title} (${lines.length})`)
    if (!lines.length) console.log('    nothing')
    for (const l of lines) console.log(`    ${l}`)
  }

  console.log('\nWOULD DELETE')

  section('report_edits', p.edits.map((e) => `${short(e.id)}  block ${e.block_id ?? '?'}  on snapshot ${short(e.snapshot_id ?? '')}`))
  section('export_events', p.exportEvents.map((e) => `${short(e.id)}  ${e.action ?? '?'} ${e.kind ?? ''} ${e.format ?? ''}  ${day(e.created_at)}  snapshot ${short(e.snapshot_id ?? '')}`))
  section('artifacts (+ Storage object)', p.artifacts.map((a) => `${short(a.id)}  ${a.format}  ${kb(a.bytes)}  ${day(a.rendered_at)}  ${a.storage_path}`))
  section('share_links (+ their share_views)', p.links.map((l) => `${short(l.id)}  ${l.title ?? 'untitled'}  ${l.view_count} view${l.view_count === 1 ? '' : 's'}  last viewed ${day(l.last_viewed_at)}  created ${day(l.created_at)}`))
  section('report_builds', p.builds.map((b) => `${short(b.id)}  ${b.status}  ${day(b.started_at)}  snapshot ${b.snapshot_id ? short(b.snapshot_id) : '(none)'}${b.error ? `  "${b.error}"` : ''}`))
  section('report_sends', p.sends.map((s) => `${short(s.id)}  ${s.status}  ${day(s.sent_at ?? s.claimed_at)}  "${s.subject ?? 'no subject'}"  to ${(s.recipients ?? []).join(', ') || 'nobody'}`))
  section('report_snapshots', p.snapshots.map((s) => `${short(s.id)}  ${s.kind}  ${day(s.created_at)}  "${s.title ?? 'untitled'}"`))
  section('weekly_reports (legacy)', p.weekly.map((w) => `${short(w.id)}  ${day(w.week_start)} to ${day(w.week_end)}  ${w.sent_at ? `emailed ${day(w.sent_at)} to ${(w.sent_to ?? []).join(', ') || 'nobody'}` : 'never emailed'}  "${w.subject ?? 'no subject'}"`))
  section('reports (definitions)', p.reports.map((r) => `${short(r.id)}  ${r.kind ?? '?'}/${r.template_key ?? '?'}  ${day(r.created_at)}  "${r.title ?? 'untitled'}"`))

  const views = Object.values(p.viewsByLink).reduce((n, v) => n + v, 0)
  console.log(`\n  share_views cascading with those links: ${views}`)
  console.log(`  Storage objects to remove from the \`artifacts\` bucket: ${p.storagePaths.length}`)

  console.log('\nWOULD KEEP')
  const byTable = new Map<string, typeof p.kept>()
  for (const k of p.kept) byTable.set(k.table, [...(byTable.get(k.table) ?? []), k])
  if (!byTable.size) console.log('\n  nothing (this workspace has no report rows at all)')
  for (const [table, rows] of byTable) {
    console.log(`\n  ${table} (${rows.length})`)
    for (const k of rows) console.log(`    ${short(k.id)}  ${k.label}\n        why: ${k.why}`)
  }

  if (p.warnings.length) {
    console.log('\nWARNINGS')
    for (const w of p.warnings) console.log(`  ! ${w}`)
  }
  if (p.blockers.length) {
    console.log('\nBLOCKED — --apply will refuse')
    for (const b of p.blockers) console.log(`  ✗ ${b}`)
  }

  console.log(`\n  totals: ${planTotal(p)} rows would go, ${p.kept.length} rows named as kept, of ${
    t.snapshots.length + t.sends.length + t.builds.length + t.artifacts.length + t.links.length
    + t.exportEvents.length + t.edits.length + t.reports.length + t.weekly.length
  } report rows on this workspace (report_schedules excluded, it is configuration).`)
}

/** Children before parents, so a half-finished run leaves no dangling row. */
async function apply(admin: ReturnType<typeof createAdminClient>, clientId: string, p: PurgePlan) {
  const del = async (table: string, idColumn: string, values: (string | number)[]) => {
    if (!values.length) { console.log(`  ${table}: nothing`); return }
    const { error } = await admin.from(table).delete().eq('client_id', clientId).in(idColumn, values)
    if (error) throw new Error(`delete ${table}: ${error.message}`)
    console.log(`  ${table}: ${values.length} deleted`)
  }

  // Storage first: a removed row is an object nothing can name again.
  if (p.storagePaths.length) {
    const { data, error } = await admin.storage.from('artifacts').remove(p.storagePaths)
    if (error) throw new Error(`storage remove: ${error.message}`)
    const removed = new Set(((data ?? []) as { name: string }[]).map((o) => o.name))
    const missed = p.storagePaths.filter((path) => !removed.has(path))
    console.log(`  storage: ${removed.size}/${p.storagePaths.length} objects removed`)
    for (const m of missed) console.log(`  ! storage object NOT removed, delete it by hand: ${m}`)
  } else {
    console.log('  storage: nothing')
  }

  await del('report_edits', 'id', p.edits.map((r) => r.id))
  await del('export_events', 'id', p.exportEvents.map((r) => r.id))
  await del('artifacts', 'id', p.artifacts.map((r) => r.id))
  // share_views has no client_id; it cascades from share_links.
  await del('share_links', 'id', p.links.map((r) => r.id))
  await del('report_builds', 'id', p.builds.map((r) => r.id))
  await del('report_sends', 'id', p.sends.map((r) => r.id))
  await del('report_snapshots', 'id', p.snapshots.map((r) => r.id))
  await del('weekly_reports', 'id', p.weekly.map((r) => r.id))
  await del('reports', 'id', p.reports.map((r) => r.id))
}

/** After an apply: nothing may point at something that is gone. */
async function assertClean(admin: ReturnType<typeof createAdminClient>, clientId: string, p: PurgePlan, before: string) {
  const after = await load(admin, clientId)
  const snapshotIds = new Set(after.snapshots.map((s) => s.id))
  const linkIds = new Set(after.links.map((l) => l.id))
  const problems: string[] = []

  for (const a of after.artifacts) if (a.snapshot_id === null || !snapshotIds.has(a.snapshot_id)) problems.push(`artifact ${short(a.id)} has no snapshot`)
  for (const b of after.builds) if (b.snapshot_id !== null && !snapshotIds.has(b.snapshot_id)) problems.push(`build ${short(b.id)} points at a deleted snapshot`)
  for (const l of after.links) if (l.snapshot_id !== null && !snapshotIds.has(l.snapshot_id)) problems.push(`share link ${short(l.id)} points at a deleted snapshot`)

  const { data: views, error } = await admin.from('share_views').select('id, share_link_id')
  if (error) throw new Error(`share_views re-count: ${error.message}`)
  for (const v of (views ?? []) as { id: number; share_link_id: string }[]) {
    if (p.viewsByLink[v.share_link_id] !== undefined && !linkIds.has(v.share_link_id)) {
      problems.push(`share_view ${v.id} outlived its link ${short(v.share_link_id)}`)
    }
  }

  const fingerprint = await scheduleFingerprint(admin, clientId)
  if (fingerprint !== before) problems.push('report_schedules CHANGED — this script must never touch that table')
  else console.log(`  report_schedules: unchanged (${after.schedules.length} row${after.schedules.length === 1 ? '' : 's'}, byte-identical)`)

  if (problems.length) {
    console.log('\n  ORPHANS FOUND:')
    for (const p2 of problems) console.log(`    ✗ ${p2}`)
    throw new Error('post-apply check failed')
  }
  console.log('  orphans: none (artifacts, builds, share links, share_views all check out)')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const admin = createAdminClient()

  const { data: client, error: cErr } = await admin
    .from('clients').select('company_name').eq('id', args.clientId).maybeSingle()
  if (cErr) throw new Error(`clients: ${cErr.message}`)
  if (!client) throw new Error(`no client ${args.clientId}`)

  const before = await scheduleFingerprint(admin, args.clientId)
  const tables = await load(admin, args.clientId)
  const plan = planPurge(tables, { scope: args.scope })

  console.log(`\n${client.company_name} — report purge, scope '${args.scope}' ${args.apply ? 'APPLY' : 'DRY RUN'}`)
  console.log(`client ${args.clientId}`)
  printPlan(plan, tables)

  if (!args.apply) {
    console.log('\n(dry run — nothing written, nothing removed from Storage. Re-run with --apply.)')
    return
  }
  if (plan.blockers.length) {
    throw new Error('refusing to apply: see the blocked list above')
  }
  if (planTotal(plan) === 0) {
    console.log('\nNothing to delete.')
    return
  }

  console.log('\nAPPLYING')
  await apply(admin, args.clientId, plan)
  console.log('\nRE-READING')
  await assertClean(admin, args.clientId, plan, before)
  console.log(
    `\nAUDIT purge-reports client=${args.clientId} (${client.company_name}) scope=${args.scope} ` +
    `at=${new Date().toISOString()} rows=${planTotal(plan)} ` +
    `snapshots=${plan.snapshots.length} builds=${plan.builds.length} artifacts=${plan.artifacts.length} ` +
    `links=${plan.links.length} sends=${plan.sends.length} weekly=${plan.weekly.length} reports=${plan.reports.length} ` +
    `storage=${plan.storagePaths.length}`,
  )
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
