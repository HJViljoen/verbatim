import { createAdminClient, selectAll } from './supabase-admin'
import { sendReportEmail } from './email'

// Weekly (or monthly) consumer-intelligence report.
//
// Generates a client's report for a given pipeline run — computes headline KPIs
// from the corpus (mirroring the dashboard), pulls the run's top market insights,
// recommendations, audience signals and competitive findings, renders an email-safe
// HTML report, sends it to the configured recipients (tracking_configs.report_emails),
// and persists it to weekly_reports so it also shows on the in-app Reports page.
//
// Email is optional: with no Resend provider (or no recipients) the report is still
// built and stored, just not sent — see lib/email.ts. run_summary is intentionally
// not used (it isn't populated by the pipeline); KPIs are derived from source tables.

const BRAND = '#1E40AF'
const DEFAULT_APP_URL = 'https://verbatimintel.com'

const PRIORITY_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 }

interface MarketInsight {
  insight_type: string | null
  title: string
  description: string | null
  confidence_score: number | null
  opportunity_score: number | null
}
interface Recommendation {
  type: string | null
  title: string
  reasoning: string | null
  priority: string | null
}
interface AudienceInsight {
  category: string | null
  theme: string | null
  description: string | null
  strength_score: number | null
}
interface CompetitiveInsight {
  competitor_name: string | null
  title: string
  finding: string | null
  impact_level: string | null
}
interface VideoStat {
  views: number | null
  engagement_rate: number | null
  sentiment: string | null
}

interface ReportData {
  companyName: string
  period: 'weekly' | 'monthly'
  weekStart: string
  weekEnd: string
  recipients: string[]
  kpis: {
    videosScraped: number
    videosAnalysed: number
    totalViews: number
    avgEngagement: number
    positiveShare: number | null
  }
  marketInsights: MarketInsight[]
  recommendations: Recommendation[]
  audience: AudienceInsight[]
  competitive: CompetitiveInsight[]
  appUrl: string
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
  const [clientRes, cfgRes, miRes, recRes, aiRes, ciRes, videos] = await Promise.all([
    admin.from('clients').select('company_name').eq('id', clientId).maybeSingle(),
    admin.from('tracking_configs').select('report_emails, report_period').eq('client_id', clientId).maybeSingle(),
    admin.from('market_insights')
      .select('insight_type, title, description, confidence_score, opportunity_score')
      .eq('client_id', clientId).eq('run_id', runId),
    admin.from('recommendations')
      .select('type, title, reasoning, priority')
      .eq('client_id', clientId).eq('run_id', runId),
    admin.from('audience_insights')
      .select('category, theme, description, strength_score')
      .eq('client_id', clientId).eq('run_id', runId),
    admin.from('competitive_insights')
      .select('competitor_name, title, finding, impact_level')
      .eq('client_id', clientId).eq('run_id', runId),
    selectAll<VideoStat>(() =>
      admin.from('videos').select('views, engagement_rate, sentiment')
        .eq('client_id', clientId).order('id', { ascending: true })),
  ])

  // KPIs — same derivation as the dashboard (corpus-wide; videos carry their
  // latest classification in place).
  const analysed = videos.filter((v) => v.sentiment != null)
  const withEng = videos.filter((v) => Number(v.engagement_rate) > 0)
  const kpis = {
    videosScraped: videos.length,
    videosAnalysed: analysed.length,
    totalViews: videos.reduce((s, v) => s + (Number(v.views) || 0), 0),
    avgEngagement: withEng.length
      ? Number((withEng.reduce((s, v) => s + Number(v.engagement_rate), 0) / withEng.length).toFixed(1))
      : 0,
    positiveShare: analysed.length
      ? Math.round((analysed.filter((v) => v.sentiment === 'positive').length / analysed.length) * 100)
      : null,
  }

  const marketInsights = ((miRes.data ?? []) as MarketInsight[])
    .sort((a, b) =>
      (Number(b.opportunity_score) || 0) - (Number(a.opportunity_score) || 0) ||
      (Number(b.confidence_score) || 0) - (Number(a.confidence_score) || 0))
    .slice(0, 4)

  const recommendations = ((recRes.data ?? []) as Recommendation[])
    .sort((a, b) => (PRIORITY_RANK[b.priority ?? ''] ?? 0) - (PRIORITY_RANK[a.priority ?? ''] ?? 0))
    .slice(0, 4)

  const audience = ((aiRes.data ?? []) as AudienceInsight[])
    .sort((a, b) => (Number(b.strength_score) || 0) - (Number(a.strength_score) || 0))
    .slice(0, 5)

  const competitive = ((ciRes.data ?? []) as CompetitiveInsight[])
    .sort((a, b) => (PRIORITY_RANK[b.impact_level ?? ''] ?? 0) - (PRIORITY_RANK[a.impact_level ?? ''] ?? 0))
    .slice(0, 3)

  const period: 'weekly' | 'monthly' = cfgRes.data?.report_period === 'monthly' ? 'monthly' : 'weekly'
  const end = new Date()
  const start = new Date(end)
  start.setDate(end.getDate() - (period === 'monthly' ? 30 : 7))

  const recipients = ((cfgRes.data?.report_emails ?? []) as string[])
    .map((e) => e.trim())
    .filter(Boolean)

  return {
    companyName: (clientRes.data?.company_name as string) || 'your brand',
    period,
    weekStart: start.toISOString().slice(0, 10),
    weekEnd: end.toISOString().slice(0, 10),
    recipients,
    kpis,
    marketInsights,
    recommendations,
    audience,
    competitive,
    appUrl: process.env.NEXT_PUBLIC_APP_URL || DEFAULT_APP_URL,
  }
}

function reportSubject(d: ReportData): string {
  const cadence = d.period === 'monthly' ? 'Monthly' : 'Weekly'
  const n = d.marketInsights.length + d.recommendations.length
  const tail = n > 0 ? ` — ${n} new insight${n === 1 ? '' : 's'}` : ''
  return `${d.companyName}: ${cadence} consumer intelligence${tail}`
}

// ---------- rendering ----------

const fmtNum = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
  : n >= 1_000 ? `${(n / 1_000).toFixed(0)}K`
  : String(n)

const titleCase = (s: string) => s.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderReportHtml(d: ReportData, subject: string): string {
  const kpiCells = [
    { label: 'Videos analysed', value: `${fmtNum(d.kpis.videosAnalysed)}`, sub: `of ${fmtNum(d.kpis.videosScraped)} scraped` },
    { label: 'Total views', value: fmtNum(d.kpis.totalViews), sub: 'tracked content' },
    { label: 'Avg engagement', value: `${d.kpis.avgEngagement}%`, sub: 'across videos' },
    { label: 'Positive sentiment', value: d.kpis.positiveShare != null ? `${d.kpis.positiveShare}%` : '—', sub: 'of analysed videos' },
  ]

  const kpiHtml = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px">
      <tr>
        ${kpiCells.map((k) => `
        <td width="25%" valign="top" style="padding:6px">
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 12px;text-align:center">
            <div style="font-size:24px;font-weight:700;color:#0f172a;line-height:1.1">${escapeHtml(k.value)}</div>
            <div style="font-size:11px;color:#64748b;margin-top:6px;text-transform:uppercase;letter-spacing:.4px">${escapeHtml(k.label)}</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:2px">${escapeHtml(k.sub)}</div>
          </div>
        </td>`).join('')}
      </tr>
    </table>`

  const sections: string[] = []

  if (d.marketInsights.length) {
    sections.push(section('Top market insights', d.marketInsights.map((m) => itemBlock(
      m.title,
      m.description ?? '',
      [m.insight_type ? titleCase(m.insight_type) : null,
       m.opportunity_score != null ? `Opportunity ${m.opportunity_score}/10` : null].filter(Boolean) as string[],
    )).join('')))
  }

  if (d.recommendations.length) {
    sections.push(section('Recommended actions', d.recommendations.map((r) => itemBlock(
      r.title,
      r.reasoning ?? '',
      [r.priority ? `${titleCase(r.priority)} priority` : null].filter(Boolean) as string[],
    )).join('')))
  }

  if (d.audience.length) {
    sections.push(section('What your audience is saying', d.audience.map((a) => itemBlock(
      a.theme ? titleCase(a.theme) : 'Audience signal',
      a.description ?? '',
      [a.category ? titleCase(a.category) : null].filter(Boolean) as string[],
    )).join('')))
  }

  if (d.competitive.length) {
    sections.push(section('Competitive signals', d.competitive.map((c) => itemBlock(
      c.title,
      c.finding ?? '',
      [c.competitor_name ? `vs ${c.competitor_name}` : null,
       c.impact_level ? `${titleCase(c.impact_level)} impact` : null].filter(Boolean) as string[],
    )).join('')))
  }

  const dashboardUrl = `${d.appUrl.replace(/\/$/, '')}/dashboard`

  return `<!doctype html>
<html>
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
    <span style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(subject)}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0">
          <tr><td style="background:${BRAND};padding:24px 28px">
            <div style="color:#ffffff;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;opacity:.85">Verbatim</div>
            <div style="color:#ffffff;font-size:20px;font-weight:700;margin-top:6px">${escapeHtml(d.companyName)} — ${d.period} consumer intelligence</div>
            <div style="color:#dbeafe;font-size:13px;margin-top:4px">${escapeHtml(d.weekStart)} – ${escapeHtml(d.weekEnd)}</div>
          </td></tr>
          <tr><td style="padding:20px 22px">
            ${kpiHtml}
            ${sections.join('')}
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 4px">
              <tr><td align="center">
                <a href="${dashboardUrl}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 28px;border-radius:8px">
                  Open your dashboard
                </a>
              </td></tr>
            </table>
          </td></tr>
          <tr><td style="padding:16px 28px;border-top:1px solid #e2e8f0">
            <div style="font-size:12px;color:#94a3b8">Verbatim — media-based consumer intelligence. You're receiving this because your team is set to get ${d.period} reports.</div>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`
}

function section(title: string, body: string): string {
  return `
    <div style="margin:18px 0 4px">
      <div style="font-size:13px;font-weight:700;color:#0f172a;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid ${BRAND};display:inline-block;padding-bottom:3px">${escapeHtml(title)}</div>
    </div>
    ${body}`
}

function itemBlock(title: string, body: string, tags: string[]): string {
  const tagHtml = tags.length
    ? `<div style="margin-top:6px">${tags.map((t) =>
        `<span style="display:inline-block;background:#eff6ff;color:${BRAND};font-size:11px;font-weight:600;padding:2px 8px;border-radius:10px;margin-right:6px">${escapeHtml(t)}</span>`).join('')}</div>`
    : ''
  return `
    <div style="padding:12px 0;border-bottom:1px solid #f1f5f9">
      <div style="font-size:15px;font-weight:600;color:#0f172a">${escapeHtml(title)}</div>
      ${body ? `<div style="font-size:13px;color:#475569;line-height:1.5;margin-top:4px">${escapeHtml(body)}</div>` : ''}
      ${tagHtml}
    </div>`
}

function renderReportText(d: ReportData, subject: string): string {
  const lines: string[] = [subject, `${d.weekStart} - ${d.weekEnd}`, '']
  lines.push(
    `Videos analysed: ${d.kpis.videosAnalysed} of ${d.kpis.videosScraped}`,
    `Total views: ${fmtNum(d.kpis.totalViews)}`,
    `Avg engagement: ${d.kpis.avgEngagement}%`,
    `Positive sentiment: ${d.kpis.positiveShare != null ? `${d.kpis.positiveShare}%` : 'n/a'}`,
    '',
  )
  const block = (title: string, items: string[]) => {
    if (!items.length) return
    lines.push(title.toUpperCase())
    for (const i of items) lines.push(`- ${i}`)
    lines.push('')
  }
  block('Top market insights', d.marketInsights.map((m) => m.title))
  block('Recommended actions', d.recommendations.map((r) => r.title))
  block('What your audience is saying', d.audience.map((a) => (a.theme ? titleCase(a.theme) : a.description ?? '')))
  block('Competitive signals', d.competitive.map((c) => c.title))
  lines.push(`Open your dashboard: ${d.appUrl.replace(/\/$/, '')}/dashboard`)
  return lines.join('\n')
}
