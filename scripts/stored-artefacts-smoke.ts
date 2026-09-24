// Do the artefacts that are ALREADY BUILT still render every tile they name?
//
//   node --env-file=.env.local --import tsx scripts/stored-artefacts-smoke.ts
//
// Read-only. No model call, no write, no render of a browser.
//
// WHY THIS EXISTS (Phase 1 WP9, refute-06 §2.3). What a report, a share link
// and a schedule store is not a URL — it is a PAGE KEY and a list of TILE KEYS.
// Four code paths resolve those keys and every one of them fails SILENTLY when
// a key stops resolving: lib/reports/compose.ts drops the whole section from a
// deck, components/share/share-shell.tsx renders nothing for it, heading
// included, components/email/document.tsx skips its tiles, and the same file's
// delta lookup goes null so DigestEmail falls to its no-dashboard branch. A
// 404 would at least be visible. So the Dashboard page module stays registered
// with no route of its own, and this script is what proves it: every stored
// key resolves, every stored section still passes the Studio's own validator,
// and every tile actually renders markup.

import { renderToStaticMarkup } from 'react-dom/server'
import { pageModule } from '../components/pages/registry'
import { sectionSlides } from '../lib/reports/compose'
import { sectionsSchema } from '../lib/reports/validate'
import { createAdminClient } from '../lib/supabase-admin'
import type { ReportSection } from '../lib/reports/types'

interface Check { ok: boolean; what: string; detail?: string }
const checks: Check[] = []
const check = (ok: boolean, what: string, detail = '') => { checks.push({ ok, what, detail }) }

/** Every tile key a section names, or every key the page prints by default. */
function keysOf(section: ReportSection, data: unknown): string[] {
  const mod = pageModule(section.page)
  if (!mod) return []
  return sectionSlides(mod, section, data).flatMap((s) => s.keys)
}

async function main() {
  const admin = createAdminClient()

  // 1. The stored reports — three of five name `dashboard`, one of them the
  //    active weekly schedule.
  const { data: reports, error: rErr } = await admin
    .from('reports')
    .select('id, client_id, title, sections')
  if (rErr) throw new Error(`reports: ${rErr.message}`)
  const { data: schedules } = await admin
    .from('report_schedules')
    .select('id, name, report_id, active, recipients')

  for (const r of reports ?? []) {
    const sections = (r.sections ?? []) as ReportSection[]
    const parsed = sectionsSchema.safeParse(sections)
    const sched = (schedules ?? []).filter((s) => s.report_id === r.id)
    const label = `report "${r.title}"${sched.some((s) => s.active) ? ' (ACTIVE SCHEDULE)' : ''}`
    check(parsed.success, `${label} still passes the Studio validator`, parsed.success ? `${sections.length} sections` : JSON.stringify(parsed.error.issues[0]))
    for (const s of sections) {
      const mod = pageModule(s.page)
      check(Boolean(mod), `${label} — page "${s.page}" resolves`)
      if (!mod) continue
      const missing = (s.keys ?? []).filter((k) => !mod.renderables[k])
      check(missing.length === 0, `${label} — every tile of "${s.page}" resolves`, missing.length ? `missing: ${missing.join(', ')}` : `${(s.keys ?? []).length} tiles`)
    }
  }

  // 2. Every snapshot — the sent one, the page one, and any share link's.
  const { data: snaps, error: sErr } = await admin
    .from('report_snapshots')
    .select('id, kind, title, ref, data, created_at')
    .order('created_at')
  if (sErr) throw new Error(`snapshots: ${sErr.message}`)
  const { data: links } = await admin
    .from('share_links')
    .select('id, token, snapshot_id, expires_at, revoked_at, view_count')
  const linkOf = (snapId: string) => (links ?? []).find((l) => l.snapshot_id === snapId && !l.revoked_at)

  for (const snap of snaps ?? []) {
    const ref = (snap.ref ?? {}) as { page?: string; tileKey?: string }
    const link = linkOf(snap.id as string)
    const label = `snapshot ${String(snap.id).slice(0, 8)}${link ? ` (LIVE SHARE LINK ${String(link.token).slice(0, 8)})` : ''}`

    if (ref.page) {
      const mod = pageModule(ref.page)
      check(Boolean(mod), `${label} — ref page "${ref.page}" resolves`)
      if (mod && ref.tileKey) check(Boolean(mod.renderables[ref.tileKey]), `${label} — ref tile "${ref.tileKey}" resolves`)
      // A page snapshot renders its whole page from its own frozen data.
      if (mod && !ref.tileKey) renderSection(label, ref.page, { id: 'ref', page: ref.page, params: {} } as ReportSection, snap.data, true)
    }

    const sections = ((snap.data as { sections?: { section: ReportSection; data: unknown }[] } | null)?.sections) ?? []
    for (const sec of sections) renderSection(label, sec.section.page, sec.section, sec.data, false)
  }

  // 3. The five legacy weekly_reports rows: where do their embedded absolute
  //    links land now? They are stored HTML — the one artefact in the product
  //    that keeps the words of an email — so this reports, it does not assert.
  const { data: weeklies } = await admin
    .from('weekly_reports')
    .select('id, sent_at, html_content')
    .order('sent_at', { nullsFirst: false })
  const urls = new Map<string, number>()
  for (const w of weeklies ?? []) {
    for (const m of String(w.html_content ?? '').matchAll(/https?:\/\/[^"'<> ]*\/dashboard[a-zA-Z0-9/_?=,-]*/g)) {
      urls.set(m[0], (urls.get(m[0]) ?? 0) + 1)
    }
  }
  console.log(`\nweekly_reports: ${(weeklies ?? []).length} rows, ${urls.size} distinct dashboard URLs`)
  for (const [u, n] of [...urls].sort()) console.log(`  ${n}x  ${u}`)

  const failed = checks.filter((c) => !c.ok)
  console.log('')
  for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'} ${c.what}${c.detail ? ` — ${c.detail}` : ''}`)
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`)
  if (failed.length) process.exit(1)
}

function renderSection(label: string, page: string, section: ReportSection, data: unknown, isPage: boolean) {
  const mod = pageModule(page)
  check(Boolean(mod), `${label} — section page "${page}" resolves`)
  if (!mod || !data) return
  const keys = keysOf(section, data)
  check(keys.length > 0, `${label} — "${page}" names at least one tile`, `${keys.length} tiles`)
  const empty: string[] = []
  for (const k of keys) {
    const r = mod.renderables[k]
    if (!r) { empty.push(`${k} (no renderable)`); continue }
    let markup = ''
    try {
      markup = renderToStaticMarkup(r.render(data, 'app') as React.ReactElement)
    } catch (e) {
      empty.push(`${k} (threw: ${(e as Error).message.slice(0, 80)})`)
      continue
    }
    if (markup.length === 0) empty.push(`${k} (rendered nothing)`)
  }
  check(empty.length === 0, `${label} — every ${isPage ? 'page' : 'section'} tile of "${page}" renders`, empty.length ? empty.join('; ') : `${keys.length} tiles rendered`)
}

main().catch((e) => { console.error(e); process.exit(1) })
