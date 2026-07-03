import { createAdminClient } from './supabase-admin'
import { sendReportEmail } from './email'
import {
  computeRunDelta,
  loadRunSummary,
  readShare,
  type RunDelta,
  type RunSummaryRow,
  type ShareSide,
} from './report-delta'

// Weekly (or monthly) consumer-intelligence report (Redesign Spec §7).
//
// The email is the product's delta surface: it leads with "what changed since
// your last update" — sentiment shift, share shift, new themes, the top
// recommendation — computed from consecutive run_summary rows, and every item
// deep-links to its page section so the report drives logins without the site
// repeating its prose. A first report (no previous run_summary) leads with a
// "where you stand" baseline instead, so nothing renders half-empty.
//
// Client-facing language rules (§1) apply throughout: no pipeline jargon
// (run/scraped/analysed-videos), no raw confidence/opportunity scores.
//
// Sending goes through lib/email.ts (Resend, optional): with no provider the
// report is still built + stored to weekly_reports for the in-app Reports page.

const GREEN = '#14503A'
const CREAM = '#F7F3EA'
const INK = '#292524'
const MUTED = '#78716C'
const BORDER = '#E7E5E4'
const UP = '#3E9E72'
const DOWN = '#B45309'

const DEFAULT_APP_URL = 'https://verbatimintel.com'
const PRIORITY_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 }

interface ThemeItem {
  label: string
  description: string | null
  evidenceCount: number
  firstSeen: boolean
  slug: string | null
}
interface RecItem {
  title: string
  reasoning: string | null
}
interface CompetitiveItem {
  competitorName: string | null
  title: string
  finding: string | null
}

interface ReportData {
  companyName: string
  period: 'weekly' | 'monthly'
  runDate: string
  weekStart: string
  weekEnd: string
  recipients: string[]
  appUrl: string
  summary: RunSummaryRow | null
  delta: RunDelta | null
  share: ShareSide | null
  themes: ThemeItem[]
  rec: RecItem | null
  competitive: CompetitiveItem | null
}

export interface ReportResult {
  reportId: string | null
  runId: string | null
  subject: string
  recipients: string[]
  sent: boolean
  reason?: string
}

/**
 * Build, send, and persist a client's report for a run.
 * @param clientId tenant
 * @param runId    pipeline run to report on; defaults to the latest completed/partial run
 * @param send     actually attempt email delivery (default true); when false the report is only stored
 */
export async function generateWeeklyReport(opts: {
  clientId: string
  runId?: string
  send?: boolean
}): Promise<ReportResult> {
  const { clientId } = opts
  const send = opts.send ?? true
  const admin = createAdminClient()

  const runId = await resolveRunId(admin, clientId, opts.runId)
  if (!runId) {
    return {
      reportId: null,
      runId: null,
      subject: '',
      recipients: [],
      sent: false,
      reason: 'no completed run to report on',
    }
  }

  const data = await buildReportData(admin, clientId, runId)
  const subject = reportSubject(data)
  const html = renderReportHtml(data, subject)
  const text = renderReportText(data, subject)

  let sent = false
  if (send) {
    const res = await sendReportEmail({ to: data.recipients, subject, html, text })
    sent = res.sent
  }

  const { data: inserted, error } = await admin
    .from('weekly_reports')
    .insert({
      client_id: clientId,
      run_id: runId,
      subject,
      html_content: html,
      week_start: data.weekStart,
      week_end: data.weekEnd,
      sent_to: sent ? data.recipients : [],
      sent_at: sent ? new Date().toISOString() : null,
    })
    .select('id')
    .maybeSingle()
  if (error) throw new Error(`weekly_reports insert: ${error.message}`)

  return {
    reportId: (inserted?.id as string) ?? null,
    runId,
    subject,
    recipients: data.recipients,
    sent,
    reason:
      data.recipients.length === 0
        ? 'no report_emails configured'
        : sent
          ? undefined
          : 'email provider not configured — report stored only',
  }
}

/** Build the report (subject + html + text) without sending or persisting — for previews/tests. */
export async function previewWeeklyReport(opts: {
  clientId: string
  runId?: string
}): Promise<{ runId: string; subject: string; html: string; text: string; recipients: string[] } | null> {
  const admin = createAdminClient()
  const runId = await resolveRunId(admin, opts.clientId, opts.runId)
  if (!runId) return null
  const data = await buildReportData(admin, opts.clientId, runId)
  const subject = reportSubject(data)
  return {
    runId,
    subject,
    html: renderReportHtml(data, subject),
    text: renderReportText(data, subject),
    recipients: data.recipients,
  }
}

// Latest completed/partial run for a client, or the explicit one if given.
async function resolveRunId(
  admin: ReturnType<typeof createAdminClient>,
  clientId: string,
  explicit?: string,
): Promise<string | undefined> {
  if (explicit) return explicit
  const { data: run } = await admin
    .from('pipeline_runs')
    .select('id')
    .eq('client_id', clientId)
    .in('status', ['completed', 'partial'])
    .order('completed_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()
  return (run?.id as string) ?? undefined
}

async function buildReportData(
  admin: ReturnType<typeof createAdminClient>,
  clientId: string,
  runId: string,
): Promise<ReportData> {
  const [clientRes, cfgRes, summary] = await Promise.all([
    admin.from('clients').select('company_name').eq('id', clientId).maybeSingle(),
    admin.from('tracking_configs').select('report_emails, report_period').eq('client_id', clientId).maybeSingle(),
    loadRunSummary(admin, clientId, runId),
  ])

  const [delta, recRes, themeRes, ciRes] = await Promise.all([
    summary ? computeRunDelta(admin, clientId, summary) : Promise.resolve(null),
    admin.from('recommendations')
      .select('title, reasoning, priority')
      .eq('client_id', clientId).eq('run_id', runId),
    admin.from('themes')
      .select('label, description, evidence_count, first_seen, member_themes')
      .eq('client_id', clientId).eq('run_id', runId).eq('single_source', false)
      .order('strength_score', { ascending: false })
      .order('evidence_count', { ascending: false })
      .limit(3),
    admin.from('competitive_insights')
      .select('competitor_name, title, finding, impact_level')
      .eq('client_id', clientId).eq('run_id', runId),
  ])

  const recs = (recRes.data ?? []) as (RecItem & { priority: string | null })[]
  const rec =
    recs.sort((a, b) => (PRIORITY_RANK[b.priority ?? ''] ?? 0) - (PRIORITY_RANK[a.priority ?? ''] ?? 0))[0] ?? null

  const themes = ((themeRes.data ?? []) as {
    label: string; description: string | null; evidence_count: number
    first_seen: boolean; member_themes: string[]
  }[]).map((t) => ({
    label: t.label,
    description: t.description,
    evidenceCount: t.evidence_count,
    firstSeen: t.first_seen,
    slug: t.member_themes[0] ?? null,
  }))

  const comps = (ciRes.data ?? []) as {
    competitor_name: string | null; title: string; finding: string | null; impact_level: string | null
  }[]
  const topComp =
    comps.sort((a, b) => (PRIORITY_RANK[b.impact_level ?? ''] ?? 0) - (PRIORITY_RANK[a.impact_level ?? ''] ?? 0))[0] ?? null

  const period: 'weekly' | 'monthly' = cfgRes.data?.report_period === 'monthly' ? 'monthly' : 'weekly'
  const runDate = summary?.run_date ?? new Date().toISOString()
  const end = new Date(runDate)
  const start = new Date(end)
  start.setDate(end.getDate() - (period === 'monthly' ? 30 : 7))

  const recipients = ((cfgRes.data?.report_emails ?? []) as string[])
    .map((e) => e.trim())
    .filter(Boolean)

  return {
    companyName: (clientRes.data?.company_name as string) || 'your brand',
    period,
    runDate,
    weekStart: start.toISOString().slice(0, 10),
    weekEnd: end.toISOString().slice(0, 10),
    recipients,
    appUrl: (process.env.NEXT_PUBLIC_APP_URL || DEFAULT_APP_URL).replace(/\/$/, ''),
    summary,
    delta,
    share: readShare(summary?.share_of_voice ?? null),
    themes,
    rec: rec ? { title: rec.title, reasoning: rec.reasoning } : null,
    competitive: topComp
      ? { competitorName: topComp.competitor_name, title: topComp.title, finding: topComp.finding }
      : null,
  }
}

function reportSubject(d: ReportData): string {
  const cadence = d.period === 'monthly' ? 'monthly' : 'weekly'
  if (!d.delta) return `${d.companyName} — your consumer intelligence baseline`
  const bits: string[] = []
  if (d.delta.newThemes && d.delta.newThemes.count > 0) {
    const n = d.delta.newThemes.count
    bits.push(`${n} new theme${n === 1 ? '' : 's'}`)
  }
  if (d.delta.sentiment && Math.abs(d.delta.sentiment.change) >= 0.5) {
    const s = d.delta.sentiment.change
    bits.push(`sentiment ${s > 0 ? 'up' : 'down'} ${Math.abs(s)}pts`)
  }
  return bits.length
    ? `${d.companyName} — what changed: ${bits.join(', ')}`
    : `${d.companyName} — your ${cadence} update`
}

// ---------- rendering ----------

const fmtNum = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
  : n >= 10_000 ? `${(n / 1_000).toFixed(0)}K`
  : n.toLocaleString('en-US')

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function changeChip(delta: number, unit: string): string {
  if (Math.abs(delta) < 0.05) {
    return `<span style="display:inline-block;background:#F5F5F4;color:${MUTED};font-size:11px;font-weight:600;padding:2px 8px;border-radius:10px;white-space:nowrap">no change</span>`
  }
  const up = delta > 0
  const color = up ? UP : DOWN
  const bg = up ? '#E8F0EB' : '#FBEEDD'
  return `<span style="display:inline-block;background:${bg};color:${color};font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;white-space:nowrap">${up ? '▲' : '▼'} ${Math.abs(delta)}${unit}</span>`
}

interface Row {
  label: string
  text: string
  chip?: string
  href?: string
  linkText?: string
}

function rowBlock(r: Row): string {
  const link = r.href
    ? `<div style="margin-top:4px"><a href="${r.href}" style="color:${GREEN};font-size:12px;font-weight:600;text-decoration:none">${escapeHtml(r.linkText ?? 'See the detail')} →</a></div>`
    : ''
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid ${BORDER}">
      <tr>
        <td style="padding:12px 0;vertical-align:top">
          <div style="font-size:11px;font-weight:700;color:${MUTED};text-transform:uppercase;letter-spacing:.5px">${escapeHtml(r.label)}</div>
          <div style="font-size:14px;color:${INK};line-height:1.5;margin-top:3px">${r.text}</div>
          ${link}
        </td>
        ${r.chip ? `<td style="padding:12px 0 12px 12px;vertical-align:top;text-align:right;white-space:nowrap">${r.chip}</td>` : ''}
      </tr>
    </table>`
}

function sectionTitle(title: string): string {
  return `
    <div style="margin:22px 0 2px">
      <div style="font-size:13px;font-weight:700;color:${GREEN};text-transform:uppercase;letter-spacing:.6px">${escapeHtml(title)}</div>
    </div>`
}

/** The lead block: "what changed" when a previous update exists, else "where you stand". */
function leadRows(d: ReportData): { title: string; rows: Row[] } {
  const rows: Row[] = []

  if (d.delta) {
    const { sentiment, share, newThemes, conversations } = d.delta
    if (sentiment) {
      rows.push({
        label: 'Sentiment',
        text: `<strong>${sentiment.now}%</strong> of conversations about you are positive`,
        chip: changeChip(sentiment.change, 'pts'),
        href: `${d.appUrl}/dashboard`,
        linkText: 'See where you stand',
      })
    }
    if (share) {
      const comp = share.now.competitor
      const clientChange = Math.round((share.now.client - share.prev.client) * 10) / 10
      rows.push({
        label: 'Share of tracked conversation',
        text: comp
          ? `You <strong>${share.now.client}%</strong> · ${escapeHtml(comp.name)} <strong>${comp.pct}%</strong>`
          : `You hold <strong>${share.now.client}%</strong> of the tracked conversation`,
        chip: changeChip(clientChange, 'pts'),
        href: `${d.appUrl}/dashboard/competitive`,
        linkText: 'See the competitive picture',
      })
    }
    if (newThemes) {
      const labels = newThemes.labels.map((l) => `“${escapeHtml(l)}”`).join(' · ')
      rows.push({
        label: 'New themes',
        text:
          newThemes.count > 0
            ? `<strong>${newThemes.count} new theme${newThemes.count === 1 ? '' : 's'}</strong> in your market's conversation${labels ? ` — ${labels}` : ''}`
            : `No new themes — the conversation held steady`,
        href: `${d.appUrl}/dashboard/voice`,
        linkText: 'Hear the voices',
      })
    }
    if (conversations) {
      const pct = conversations.prev > 0
        ? Math.round(((conversations.now - conversations.prev) / conversations.prev) * 100)
        : null
      rows.push({
        label: 'Coverage',
        text: `<strong>${fmtNum(conversations.now)}</strong> conversations analysed this update`,
        chip: pct != null ? changeChip(pct, '%') : undefined,
      })
    }
    return { title: 'What changed since your last update', rows }
  }

  // First report — a baseline, framed as state.
  const sent = d.summary?.overall_sentiment_positive != null ? Number(d.summary.overall_sentiment_positive) : null
  if (sent != null) {
    rows.push({
      label: 'Sentiment',
      text: `<strong>${sent}%</strong> of conversations about you are positive`,
      href: `${d.appUrl}/dashboard`,
      linkText: 'See where you stand',
    })
  }
  if (d.share) {
    const comp = d.share.competitor
    rows.push({
      label: 'Share of tracked conversation',
      text: comp
        ? `You <strong>${d.share.client}%</strong> · ${escapeHtml(comp.name)} <strong>${comp.pct}%</strong>`
        : `You hold <strong>${d.share.client}%</strong> of the tracked conversation`,
      href: `${d.appUrl}/dashboard/competitive`,
      linkText: 'See the competitive picture',
    })
  }
  if (d.summary?.total_comments != null) {
    rows.push({
      label: 'Coverage',
      text: `<strong>${fmtNum(Number(d.summary.total_comments))}</strong> conversations analysed across your market`,
    })
  }
  return { title: 'Where you stand', rows }
}

function renderReportHtml(d: ReportData, subject: string): string {
  const lead = leadRows(d)
  const showNewBadges = Boolean(d.delta?.newThemes)

  const themeItems = d.themes.map((t) => {
    const href = t.slug
      ? `${d.appUrl}/dashboard/voice?themes=${encodeURIComponent(t.slug)}`
      : `${d.appUrl}/dashboard/voice`
    const badge = showNewBadges && t.firstSeen
      ? ` <span style="display:inline-block;background:#E8F0EB;color:${GREEN};font-size:10px;font-weight:700;padding:1px 7px;border-radius:9px;vertical-align:2px">NEW</span>`
      : ''
    return `
      <div style="padding:11px 0;border-bottom:1px solid ${BORDER}">
        <div style="font-size:14px;font-weight:600;color:${INK}">
          <a href="${href}" style="color:${INK};text-decoration:none">${escapeHtml(t.label)}</a>${badge}
        </div>
        ${t.description ? `<div style="font-size:13px;color:${MUTED};line-height:1.5;margin-top:2px">${escapeHtml(t.description)}</div>` : ''}
        <div style="margin-top:4px">
          <a href="${href}" style="color:${GREEN};font-size:12px;font-weight:600;text-decoration:none">${t.evidenceCount} voice${t.evidenceCount === 1 ? '' : 's'} →</a>
        </div>
      </div>`
  }).join('')

  const recHtml = d.rec ? `
    ${sectionTitle('The one thing to act on')}
    <div style="background:${GREEN};border-radius:12px;padding:16px 18px;margin-top:8px">
      <div style="font-size:15px;font-weight:700;color:#FFFFFF;line-height:1.4">${escapeHtml(d.rec.title)}</div>
      ${d.rec.reasoning ? `<div style="font-size:13px;color:#D8E5DC;line-height:1.55;margin-top:6px">${escapeHtml(d.rec.reasoning)}</div>` : ''}
      <div style="margin-top:10px">
        <a href="${d.appUrl}/dashboard/market" style="color:#FFFFFF;font-size:12px;font-weight:700;text-decoration:none">Why this, why now →</a>
      </div>
    </div>` : ''

  const compHtml = d.competitive ? `
    ${sectionTitle('Competitive signal')}
    ${rowBlock({
      label: d.competitive.competitorName ? `vs ${d.competitive.competitorName}` : 'Competitors',
      text: `<strong>${escapeHtml(d.competitive.title)}</strong>${d.competitive.finding ? ` — ${escapeHtml(d.competitive.finding)}` : ''}`,
      href: `${d.appUrl}/dashboard/competitive`,
      linkText: 'See the full picture',
    })}` : ''

  const cadence = d.period === 'monthly' ? 'monthly' : 'weekly'

  return `<!doctype html>
<html>
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;background:${CREAM};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${INK}">
    <span style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(subject)}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border-radius:14px;overflow:hidden;border:1px solid ${BORDER}">
          <tr><td style="background:${GREEN};padding:24px 28px">
            <div style="color:${CREAM};font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;opacity:.9">Verbatim · Consumer Intelligence</div>
            <div style="color:#FFFFFF;font-size:20px;font-weight:700;margin-top:8px">${escapeHtml(d.companyName)} — ${escapeHtml(lead.title.toLowerCase())}</div>
            <div style="color:#BCD3C6;font-size:13px;margin-top:4px">Data through ${escapeHtml(fmtDate(d.runDate))}</div>
          </td></tr>
          <tr><td style="padding:8px 24px 22px">
            ${sectionTitle(lead.title)}
            ${lead.rows.map(rowBlock).join('')}
            ${recHtml}
            ${d.themes.length ? `${sectionTitle(d.delta ? 'Themes worth a look' : 'What your market is talking about')}${themeItems}` : ''}
            ${compHtml}
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 4px">
              <tr><td align="center">
                <a href="${d.appUrl}/dashboard" style="display:inline-block;background:${GREEN};color:#FFFFFF;text-decoration:none;font-weight:600;font-size:15px;padding:12px 28px;border-radius:10px">
                  Open your dashboard
                </a>
              </td></tr>
            </table>
          </td></tr>
          <tr><td style="padding:16px 28px;border-top:1px solid ${BORDER}">
            <div style="font-size:12px;color:${MUTED};line-height:1.5">Verbatim — consumer intelligence, in their own words. You're receiving this because your team gets ${cadence} updates.</div>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`
}

function renderReportText(d: ReportData, subject: string): string {
  const lead = leadRows(d)
  const strip = (html: string) => html.replace(/<[^>]+>/g, '')
  const lines: string[] = [subject, `Data through ${fmtDate(d.runDate)}`, '', lead.title.toUpperCase()]
  for (const r of lead.rows) lines.push(`- ${r.label}: ${strip(r.text)}`)
  lines.push('')
  if (d.rec) {
    lines.push('THE ONE THING TO ACT ON', `- ${d.rec.title}`)
    if (d.rec.reasoning) lines.push(`  ${d.rec.reasoning}`)
    lines.push('')
  }
  if (d.themes.length) {
    lines.push(d.delta ? 'THEMES WORTH A LOOK' : 'WHAT YOUR MARKET IS TALKING ABOUT')
    for (const t of d.themes) lines.push(`- ${t.label} (${t.evidenceCount} voices)`)
    lines.push('')
  }
  if (d.competitive) {
    lines.push('COMPETITIVE SIGNAL', `- ${d.competitive.title}`)
    lines.push('')
  }
  lines.push(`Open your dashboard: ${d.appUrl}/dashboard`)
  return lines.join('\n')
}
