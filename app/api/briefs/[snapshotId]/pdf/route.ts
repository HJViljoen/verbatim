import { NextResponse } from 'next/server'
import { getRouteSession } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { getBaseUrl } from '@/lib/site'
import { artifactFilename, logExport, replaceArtifactFile, signedArtifactUrl, storeArtifact, type ArtifactRow } from '@/lib/artifacts'
import { dayStartIso } from '@/lib/ask/quota'
import { EXPORT_DAILY_LIMIT } from '@/lib/config'
import { renderArtifact, renderBaseUrl } from '@/lib/render/render'
import { mayReadHeld, snapshotHeld } from '@/lib/reports/held'

// GET /api/briefs/<snapshot>/pdf: a month's department brief as a PDF (T8
// wired). The pipeline stores the brief as a frozen snapshot and prints
// nothing (AGENTS.md: rendering never runs inside an Inngest step), so the
// first download prints it here, the export route's way: a signed token,
// headless Chrome at /render/<snapshot> (the deck's own 1280×720 page size),
// Storage, an artifacts row, an export_events row; then a one-hour signed URL.
// A later download reuses the stored file; a STALE one (its file deleted by
// the erasure sweep) is printed again, as /api/artifacts does.
//
// The tenant comes from the SESSION: a snapshot of another workspace, or one
// that is not a monthly brief, is "no such brief". A new print counts toward
// the daily export cap and fails closed on a read error, as every render does.
// No dot in the path (proxy.ts would skip the auth check).

export const runtime = 'nodejs'
export const maxDuration = 300

interface BriefSnapshot {
  id: string
  title: string
  kind: string
  data_kind: string | null
  artifacts: ArtifactRow[] | null
}

export async function GET(_request: Request, ctx: { params: Promise<{ snapshotId: string }> }) {
  const session = await getRouteSession()
  if (!session) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const { snapshotId } = await ctx.params
  const { clientId, userId } = session
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('report_snapshots')
    .select('id, title, kind, data_kind:data->>kind, artifacts(*)')
    .eq('id', snapshotId)
    .eq('client_id', clientId)
    .eq('kind', 'report')
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'Could not read that brief.' }, { status: 503 })
  const snap = data as BriefSnapshot | null
  if (!snap || snap.data_kind !== 'monthly_brief') return NextResponse.json({ error: 'No such brief.' }, { status: 404 })
  // A brief no send carries is never held; asked anyway, as every PDF door asks.
  if (!mayReadHeld(session, clientId) && (await snapshotHeld(admin, clientId, snapshotId))) {
    return NextResponse.json({ error: 'No such brief.' }, { status: 404 })
  }

  const stored = (snap.artifacts ?? []).filter((a) => a.format === 'pdf' && !a.tile_key).sort((a, b) => b.version - a.version)[0] ?? null
  try {
    let artifact: ArtifactRow | null = stored
    if (!artifact || artifact.stale) {
      // A print is a render: it counts toward the daily cap, and fails closed.
      const { count, error: quotaErr } = await admin.from('export_events').select('id', { count: 'exact', head: true })
        .eq('client_id', clientId).in('action', ['export', 'rerender']).gte('created_at', dayStartIso(new Date()))
      if (quotaErr) return NextResponse.json({ error: 'Could not make that file just now. Try again shortly.' }, { status: 503 })
      if ((count ?? 0) >= EXPORT_DAILY_LIMIT) return NextResponse.json({ error: `That is ${EXPORT_DAILY_LIMIT} exports today, which is the daily limit. It resets tomorrow.` }, { status: 429 })
      const baseUrl = renderBaseUrl(await getBaseUrl())
      const { buffer, ms } = await renderArtifact({ baseUrl, snapshotId, format: 'pdf' })
      artifact = artifact
        ? await replaceArtifactFile(admin, artifact, { buffer, renderMs: ms })
        : await storeArtifact(admin, { clientId, snapshotId, format: 'pdf', tileKey: null, buffer, renderMs: ms })
      await logExport(admin, { clientId, userId, snapshotId, artifactId: artifact.id, action: stored ? 'rerender' : 'export', kind: snap.kind, format: 'pdf', page: null, tileKey: null })
    }
    await logExport(admin, { clientId, userId, snapshotId, artifactId: artifact.id, action: 'download', kind: snap.kind, format: 'pdf', page: null, tileKey: null })
    const url = await signedArtifactUrl(admin, artifact, artifactFilename(snap.title, artifact))
    return NextResponse.redirect(url, 302)
  } catch (e) {
    console.error('[briefs/pdf] failed:', e)
    // Reader-facing: no "render", no "snapshot", no "artifact" (calibrated copy).
    return NextResponse.json({ error: 'Couldn’t make that file. Try again.' }, { status: 500 })
  }
}
