import { selectAll } from '@/lib/supabase-admin'
import { getSessionContext } from '@/lib/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// Competitive Intelligence — renders Pass C's competitive_insights for the latest
// run: qualitative cross-bucket intelligence drawn from competitors' customers'
// voices (topic ownership, content gaps, threats, sentiment differentials), each
// grounded in supporting themes + verbatim quotes. Leads with the qualitative
// 4th-paradigm intelligence; Share of Tracked Conversation (per-bucket video
// share — scoped, NOT comprehensive web SOV) is the supporting context.
//
// Honest empty-state: Pass C SKIPS when the corpus has <2 entity buckets with
// analysable content (e.g. competitor accounts are comment-deserts). The SOV
// breakdown is always shown — it explains *why* a run is single-bucket.
// Read-only server component; same auth/data pattern as Market Intelligence.

interface CompetitiveInsight {
  id: string
  category: string
  competitor_name: string | null
  title: string
  finding: string
  evidence: { supporting_theme_ids?: string[] } | null
  impact_level: string | null
}

interface AudienceInsight { id: string; category: string; theme: string; description: string }

interface VideoBucketRow { is_client: boolean; is_competitor: boolean; competitor_name: string | null }

// Category presentation. Order = the lead-with-strength reading order.
const CATEGORY_ORDER = ['topic_ownership', 'content_gap', 'competitive_threat', 'sentiment_differential'] as const
const CATEGORY_META: Record<string, { label: string; blurb: string }> = {
  topic_ownership: { label: 'Topic Ownership', blurb: 'Themes this brand owns vs competitors' },
  content_gap: { label: 'Content Gaps', blurb: 'What competitors’ audiences care about that this brand under-serves' },
  competitive_threat: { label: 'Competitive Threats', blurb: 'Where a competitor has an edge, momentum, or controversy' },
  sentiment_differential: { label: 'Sentiment Differentials', blurb: 'Where sentiment diverges between brands' },
}
const prettyType = (s: string) => s.replace(/_/g, ' ')

function Badge({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'high' | 'medium' | 'blue' }) {
  const tones: Record<string, string> = {
    muted: 'bg-muted text-muted-foreground',
    high: 'bg-amber-100 text-amber-700',
    medium: 'bg-muted text-muted-foreground',
    blue: 'bg-blue-100 text-blue-700',
  }
  return <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${tones[tone]}`}>{children}</span>
}

export default async function CompetitiveIntelligencePage() {
  // Auth + tenant via the RLS-enforced session client. See lib/auth.ts.
  const { supabase, clientId } = await getSessionContext()

  const { data: latestRun } = await supabase
    .from('pipeline_runs').select('id, started_at')
    .eq('client_id', clientId).order('started_at', { ascending: false }).limit(1).maybeSingle()
  if (!latestRun) return <Shell><EmptyRun /></Shell>
  const runId = latestRun.id as string

  // Insights + grounding themes for this run; corpus buckets for Share of Tracked
  // Conversation (whole-corpus, market-wide — matches the run-cd metrics).
  const [{ data: ciData }, { data: aiData }, videoRows] = await Promise.all([
    supabase.from('competitive_insights').select('*').eq('client_id', clientId).eq('run_id', runId),
    supabase.from('audience_insights').select('id, category, theme, description').eq('client_id', clientId).eq('run_id', runId),
    selectAll<VideoBucketRow>(() =>
      supabase.from('videos').select('is_client, is_competitor, competitor_name').eq('client_id', clientId).order('id', { ascending: true }),
    ),
  ])

  const insights = (ciData ?? []) as CompetitiveInsight[]
  const audienceInsights = (aiData ?? []) as AudienceInsight[]
  const aiById = new Map(audienceInsights.map((a) => [a.id, a]))

  // Verbatim quotes for the supporting themes (same grounding as Market Intel).
  const supportingIds = [...new Set(insights.flatMap((c) => c.evidence?.supporting_theme_ids ?? []))]
  const quotesByInsight = new Map<string, string>()
  if (supportingIds.length) {
    const { data: evData } = await supabase
      .from('insight_evidence').select('audience_insight_id, quote, relevance_rank')
      .in('audience_insight_id', supportingIds).order('relevance_rank', { ascending: true })
    for (const ev of (evData ?? []) as { audience_insight_id: string; quote: string }[]) {
      if (!quotesByInsight.has(ev.audience_insight_id)) quotesByInsight.set(ev.audience_insight_id, ev.quote)
    }
  }

  function supportFor(ci: CompetitiveInsight): { theme: string; quote: string | null }[] {
    const ids = ci.evidence?.supporting_theme_ids ?? []
    const seen = new Set<string>()
    const out: { theme: string; quote: string | null }[] = []
    for (const id of ids) {
      const ai = aiById.get(id)
      if (!ai || seen.has(ai.theme)) continue
      seen.add(ai.theme)
      out.push({ theme: ai.theme, quote: quotesByInsight.get(id) ?? null })
    }
    return out.slice(0, 4)
  }

  // Share of Tracked Conversation — per-bucket video share.
  const sov = computeShare(videoRows)

  const byCategory = CATEGORY_ORDER
    .map((cat) => ({ cat, items: insights.filter((c) => c.category === cat) }))
    .filter((g) => g.items.length > 0)
  // Any insights with an unrecognised category still get shown under "Other".
  const otherItems = insights.filter((c) => !CATEGORY_ORDER.includes(c.category as typeof CATEGORY_ORDER[number]))

  return (
    <Shell subtitle={`${insights.length} competitive insight${insights.length === 1 ? '' : 's'} · ${sov.competitorCount} tracked competitor${sov.competitorCount === 1 ? '' : 's'} · latest run`}>
      <ShareOfVoice sov={sov} />

      {insights.length === 0 ? (
        <EmptyInsights sov={sov} />
      ) : (
        <>
          {byCategory.map(({ cat, items }) => (
            <section key={cat} className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{CATEGORY_META[cat].label}</h2>
                <p className="text-xs text-muted-foreground">{CATEGORY_META[cat].blurb}</p>
              </div>
              {items.map((ci) => <InsightCard key={ci.id} ci={ci} support={supportFor(ci)} />)}
            </section>
          ))}
          {otherItems.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Other</h2>
              {otherItems.map((ci) => <InsightCard key={ci.id} ci={ci} support={supportFor(ci)} />)}
            </section>
          )}
        </>
      )}
    </Shell>
  )
}

function InsightCard({ ci, support }: { ci: CompetitiveInsight; support: { theme: string; quote: string | null }[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              {ci.competitor_name && <Badge tone="blue">vs {ci.competitor_name}</Badge>}
              <Badge>{prettyType(ci.category)}</Badge>
            </div>
            <CardTitle className="text-base">{ci.title}</CardTitle>
          </div>
          {ci.impact_level && (
            <span className="shrink-0">
              <Badge tone={ci.impact_level === 'high' ? 'high' : 'muted'}>{ci.impact_level} impact</Badge>
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{ci.finding}</p>
        {support.length > 0 && (
          <div className="border-t pt-3 space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Grounded in</div>
            {support.map((s, i) => (
              <div key={i} className="text-xs">
                <span className="px-1.5 py-0.5 bg-muted rounded capitalize mr-2">{s.theme.replace(/_/g, ' ')}</span>
                {s.quote && <span className="text-muted-foreground italic">&ldquo;{s.quote}&rdquo;</span>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// --- Share of Tracked Conversation -----------------------------------------

interface Share {
  total: number
  client: number
  industry: number
  competitors: { name: string; count: number }[]
  competitorCount: number
}

function computeShare(rows: VideoBucketRow[]): Share {
  let client = 0, industry = 0
  const comp = new Map<string, number>()
  for (const v of rows) {
    if (v.is_client) client++
    else if (v.is_competitor) comp.set(v.competitor_name ?? 'competitor', (comp.get(v.competitor_name ?? 'competitor') ?? 0) + 1)
    else industry++
  }
  const competitors = [...comp.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
  return { total: rows.length, client, industry, competitors, competitorCount: competitors.length }
}

function ShareOfVoice({ sov }: { sov: Share }) {
  const pct = (n: number) => (sov.total ? Math.round((n / sov.total) * 1000) / 10 : 0)
  const segments = [
    { label: 'Your brand', count: sov.client, color: 'bg-blue-600' },
    ...sov.competitors.map((c, i) => ({ label: c.name, count: c.count, color: COMP_COLORS[i % COMP_COLORS.length] })),
    { label: 'Industry', count: sov.industry, color: 'bg-muted-foreground/40' },
  ].filter((s) => s.count > 0)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Share of Tracked Conversation</CardTitle>
        <p className="text-xs text-muted-foreground">
          Share of {sov.total.toLocaleString()} tracked videos by brand. Scoped to your tracked keywords — not comprehensive web share of voice.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
          {segments.map((s, i) => (
            <div key={i} className={s.color} style={{ width: `${pct(s.count)}%` }} title={`${s.label}: ${pct(s.count)}%`} />
          ))}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {segments.map((s, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs">
              <span className={`inline-block h-2.5 w-2.5 rounded-sm ${s.color}`} />
              <span className="font-medium capitalize">{s.label}</span>
              <span className="text-muted-foreground">{pct(s.count)}% ({s.count})</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

const COMP_COLORS = ['bg-amber-500', 'bg-emerald-500', 'bg-violet-500', 'bg-rose-500', 'bg-cyan-500']

// --- Shell + empty states ---------------------------------------------------

function Shell({ children, subtitle }: { children: React.ReactNode; subtitle?: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Competitive Intelligence</h1>
        <p className="text-sm text-muted-foreground">
          {subtitle ?? 'Competitor intelligence from competitors’ customers’ voices.'}
        </p>
      </div>
      {children}
    </div>
  )
}

function EmptyRun() {
  return (
    <Card>
      <CardContent className="py-10 text-center text-sm text-muted-foreground">
        No analysis runs yet. Run the pipeline to populate competitive intelligence.
      </CardContent>
    </Card>
  )
}

function EmptyInsights({ sov }: { sov: Share }) {
  const reason = sov.competitorCount === 0
    ? 'No competitor-tagged content cleared analysis this run — competitor accounts are typically comment-deserts, so the consumer voice about them lives in creator/industry content that isn’t yet attributed to a competitor.'
    : 'Competitor content was tracked, but not enough of it cleared the comment bar to form a comparable theme — so Pass C had a single effective bucket and skipped cross-brand analysis.'
  return (
    <Card>
      <CardContent className="py-8 space-y-2 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">No cross-brand insights for this run.</p>
        <p>
          Competitive intelligence compares your brand against tracked competitors using their customers’ comments.
          It needs at least two entity buckets with enough comment-bearing content.
        </p>
        <p>{reason}</p>
        <p className="text-xs">The Share of Tracked Conversation above shows the current bucket balance.</p>
      </CardContent>
    </Card>
  )
}
