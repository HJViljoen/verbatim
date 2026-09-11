import { createAdminClient, selectAll } from '../lib/supabase-admin'
import { ownAccountNames, normAccount } from '../lib/gather/owned'
import { SEALAND_CLIENT_ID } from '../lib/config'

// Make videos.source tell the truth about rows the keyword gather found FIRST.
//
// stampOwnedSource used to keep a stored source forever, so a post published by
// the client's own account but discovered by keyword search kept
// source='discovered' for life. That stickiness was for metric continuity —
// share of voice would have dropped when a row left the discovered layer — and
// it stopped mattering on 2026-09-10, when share began counting everything BY
// and ABOUT a brand (6ccca80). stampOwnedSource now writes the truth for rows
// it re-ingests; this script is the same correction for HISTORY, which no
// owned read will visit again.
//
// Identity is the test, exactly as the census applies it (ownAccountNames):
// the configured handle plus every account name an owned read has stored for
// that platform. is_client is NOT the test — it is true of a stranger's review.
//
// Dry run by default; --apply writes.
//   node --env-file=.env.local --import tsx scripts/reconcile-video-source.ts --client <uuid> [--apply]

interface Row {
  id: string
  platform: string
  source: string | null
  account_name: string | null
  competitor_name: string | null
  upload_date: string | null
}

function parseArgs(argv: string[]) {
  let clientId = SEALAND_CLIENT_ID
  let apply = false
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--client' && argv[i + 1]) clientId = argv[++i]
    else if (argv[i] === '--apply') apply = true
  }
  return { clientId, apply }
}

async function main() {
  const { clientId, apply } = parseArgs(process.argv.slice(2))
  const admin = createAdminClient()

  const { data: tc, error: tcErr } = await admin
    .from('tracking_configs')
    .select('own_handles, competitor_handles')
    .eq('client_id', clientId)
    .maybeSingle()
  if (tcErr) throw new Error(`tracking_configs: ${tcErr.message}`)
  const ownHandles = (tc?.own_handles ?? {}) as Record<string, string>
  const competitorHandles = (tc?.competitor_handles ?? {}) as Record<string, Record<string, string>>

  // selectAll: a tenant's corpus is thousands of rows, and a bare select caps
  // at 1000 — a silent cap here would under-report the flip.
  const rows = await selectAll<Row>(() =>
    admin.from('videos')
      .select('id, platform, source, account_name, competitor_name, upload_date')
      .eq('client_id', clientId).order('id'),
  )

  // Who each entity IS, learned from the rows the owned reads stored.
  const identities: { label: string; fresh: 'owned' | 'competitor_owned'; names: Map<string, Set<string>>; competitorName?: string }[] = [
    { label: 'client', fresh: 'owned', names: ownAccountNames(rows, ownHandles, { source: 'owned' }) },
  ]
  for (const [name, handles] of Object.entries(competitorHandles)) {
    identities.push({
      label: `competitor:${name}`, fresh: 'competitor_owned', competitorName: name,
      names: ownAccountNames(rows, handles ?? {}, { source: 'competitor_owned', competitorName: name }),
    })
  }

  const flips: { id: string; platform: string; to: string; label: string }[] = []
  for (const r of rows) {
    if (r.source !== 'discovered' || !r.account_name) continue
    for (const idt of identities) {
      if (!idt.names.get(r.platform)?.has(normAccount(r.account_name))) continue
      // A competitor's own post must also be tagged to that competitor, or the
      // row is some other account that happens to share a name.
      if (idt.competitorName && normAccount(r.competitor_name) !== normAccount(idt.competitorName)) continue
      flips.push({ id: r.id, platform: r.platform, to: idt.fresh, label: idt.label })
      break
    }
  }

  const byKey = new Map<string, number>()
  for (const f of flips) {
    const k = `${f.label} · ${f.platform} → ${f.to}`
    byKey.set(k, (byKey.get(k) ?? 0) + 1)
  }
  console.log(`client ${clientId}: ${rows.length} videos, ${rows.filter((r) => r.source === 'discovered').length} on 'discovered'`)
  if (byKey.size === 0) console.log('  nothing to reconcile')
  for (const [k, n] of [...byKey].sort()) console.log(`  ${k}: ${n}`)

  // What the flip actually changes downstream: these rows would stop entering
  // Pass A's full lane (passALane sends owned/competitor_owned to claims-only),
  // so say how many of them have audience insights today — a brand's own fans'
  // comments distilled into audience themes is the guardrail this repairs.
  if (flips.length) {
    const ids = flips.map((f) => f.id)
    const withInsights = new Set<string>()
    for (let i = 0; i < ids.length; i += 200) {
      const part = ids.slice(i, i + 200)
      const { data } = await admin.from('audience_insights').select('source_video_id').in('source_video_id', part)
      for (const r of (data ?? []) as { source_video_id: string }[]) withInsights.add(r.source_video_id)
    }
    console.log(`  of those, ${withInsights.size} already carry audience insights (own-account comments in the market corpus)`)
  }

  if (!apply) return console.log('dry run — pass --apply to write')
  let done = 0
  for (const f of flips) {
    const { error } = await admin.from('videos').update({ source: f.to }).eq('id', f.id).eq('source', 'discovered')
    if (error) throw new Error(`update ${f.id}: ${error.message}`)
    done++
  }
  console.log(`applied: ${done} rows`)
}

main().catch((e) => { console.error(e); process.exit(1) })
