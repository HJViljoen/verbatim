import { renderToStaticMarkup } from 'react-dom/server'
import { createAdminClient } from '../lib/supabase-admin'
import { loadWeek } from '../lib/pages/week'
import { WeekPage } from '../components/pages/week'

const TENANTS = [
  ['Össur', 'e52cac94-30e1-426a-9a36-31b11e0b30b6'],
  ['Sealand', 'ac16988e-c4f3-4baf-b388-73895852a554'],
] as const

const text = (m: string) => m.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]*>/g, ' ')
  .replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/&#x2F;/g, '/').replace(/\s+/g, ' ').trim()

async function main() {
  const db = createAdminClient()
  for (const [name, clientId] of TENANTS) {
    const t0 = Date.now()
    const data = await loadWeek({ supabase: db, clientId, reading: { client: db, clientId }, params: {} })
    const ms = Date.now() - t0
    console.log(`\n==================== ${name} (${ms} ms) ====================`)
    if (!data) { console.log('loadWeek returned null'); continue }
    console.log(JSON.stringify({
      update: data.update, window: data.window, month: data.month, windowVideos: data.windowVideos,
      unusual: { state: data.unusual.state, note: data.unusual.note, baseline: data.unusual.baseline, startsWith: data.unusual.startsWith, flags: data.unusual.flags.length },
      subjects: { unread: data.subjects.unread, rows: data.subjects.rows.length },
      rising: { unread: data.rising.unread, rows: data.rising.rows.map((r) => ({ label: r.label, k: r.month.k, n: r.month.n, chg: r.verdict.changePts, band: r.verdict.bandPts, quotes: r.quotes.length })), monthOf: data.rising.monthOf },
      cameIn: { gathered: data.cameIn.gathered, analysed: data.cameIn.analysed, windowComments: data.cameIn.windowComments, contribution: data.cameIn.contribution, crossesInto: data.cameIn.crossesInto, newThemesSeen: data.cameIn.newThemesSeen, newThemes: data.cameIn.newThemes, rivals: data.cameIn.rivals, quotesTotal: data.cameIn.quotesTotal, quotesUnread: data.cameIn.quotesUnread !== null, audiences: data.cameIn.rows.map((r) => `${r.label} ${r.analysed}/${r.gathered}`) },
      sales: { grouping: data.sales.grouping, videos: data.sales.videos, objections: data.sales.objections.map((g) => `${g.label}:${g.videos}`), praise: data.sales.praise.length, switching: data.sales.switching.length, rivalComplaints: data.sales.rivalComplaints.map((g) => `${g.label}:${g.videos}`), unread: data.sales.unread },
      worked: { rated: data.worked.rated, formats: data.worked.formats.map((f) => `${f.label} ${f.videos} ${f.multiple.toFixed(2)}x`), hooks: data.worked.hooks.map((f) => `${f.label} ${f.videos}`), unread: data.worked.unread },
      coverage: data.coverage.line,
    }, null, 2))
    const markup = renderToStaticMarkup(<WeekPage data={data} />)
    console.log('\n--- rendered text ---\n' + text(markup))
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
