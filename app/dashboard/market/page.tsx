import { getSessionContext } from '@/lib/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// Market Intelligence — the core value page. Renders Pass D's market_insights +
// recommendations for the latest run, each grounded in its supporting themes
// (audience_insights) and verbatim comment quotes (insight_evidence). Read-only
// server component; same auth/data pattern as the dashboard.

type Json = Record<string, unknown>

interface MarketInsight {
  id: string
  insight_type: string
  title: string
  description: string
  evidence: { supporting_theme_ids?: string[] } | null
  confidence_score: number | null
  opportunity_score: number | null
}

interface Recommendation {
  id: string
  type: string
  title: string
  reasoning: string
  priority: string | null
  based_on: { insight_ids?: string[] } | null
}

interface AudienceInsight {
  id: string
  category: string
  theme: string
  description: string
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

function Score({ label, value }: { label: string; value: number | null }) {
  if (value == null) return null
  return (
    <div className="text-center">
      <div className="text-lg font-bold leading-none">{value}<span className="text-xs text-muted-foreground">/10</span></div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mt-0.5">{label}</div>
    </div>
  )
}

export default async function MarketIntelligencePage() {
  // Auth + tenant via the RLS-enforced session client. See lib/auth.ts.
  const { supabase, clientId } = await getSessionContext()

  // Latest run for this client.
  const { data: latestRun } = await supabase
    .from('pipeline_runs').select('id, started_at')
    .eq('client_id', clientId).order('started_at', { ascending: false }).limit(1).maybeSingle()

  if (!latestRun) {
    return <EmptyState />
  }
  const runId = latestRun.id as string

  const [{ data: miData }, { data: recData }, { data: aiData }] = await Promise.all([
    supabase.from('market_insights').select('*').eq('client_id', clientId).eq('run_id', runId).order('opportunity_score', { ascending: false }),
    supabase.from('recommendations').select('*').eq('client_id', clientId).eq('run_id', runId),
    supabase.from('audience_insights').select('id, category, theme, description').eq('client_id', clientId).eq('run_id', runId),
  ])

  const marketInsights = (miData ?? []) as MarketInsight[]
  const recommendations = (recData ?? []) as Recommendation[]
  const audienceInsights = (aiData ?? []) as AudienceInsight[]
  const aiById = new Map(audienceInsights.map((a) => [a.id, a]))

  // Evidence quotes for the supporting audience_insights.
  const supportingIds = [...new Set(marketInsights.flatMap((m) => m.evidence?.supporting_theme_ids ?? []))]
  const quotesByInsight = new Map<string, string[]>()
  if (supportingIds.length) {
    const { data: evData } = await supabase
      .from('insight_evidence').select('audience_insight_id, quote, relevance_rank')
      .in('audience_insight_id', supportingIds).order('relevance_rank', { ascending: true })
    for (const ev of (evData ?? []) as { audience_insight_id: string; quote: string }[]) {
      const arr = quotesByInsight.get(ev.audience_insight_id)
      if (arr) arr.push(ev.quote)
      else quotesByInsight.set(ev.audience_insight_id, [ev.quote])
    }
  }

  // For one market insight, resolve its supporting themes (deduped by theme) + a quote each.
  function supportFor(mi: MarketInsight): { theme: string; category: string; quote: string | null }[] {
    const ids = mi.evidence?.supporting_theme_ids ?? []
    const seen = new Set<string>()
    const out: { theme: string; category: string; quote: string | null }[] = []
    for (const id of ids) {
      const ai = aiById.get(id)
      if (!ai || seen.has(ai.theme)) continue
      seen.add(ai.theme)
      out.push({ theme: ai.theme, category: ai.category, quote: quotesByInsight.get(id)?.[0] ?? null })
    }
    return out.slice(0, 4)
  }

  const priorityRank: Record<string, number> = { high: 0, medium: 1, low: 2 }
  const recsSorted = [...recommendations].sort((a, b) => (priorityRank[a.priority ?? 'low'] ?? 3) - (priorityRank[b.priority ?? 'low'] ?? 3))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Market Intelligence</h1>
        <p className="text-sm text-muted-foreground">
          {marketInsights.length} insights · {recommendations.length} recommendations · drawn from {audienceInsights.length} audience themes
        </p>
      </div>

      {marketInsights.length === 0 && recommendations.length === 0 && <EmptyState />}

      {marketInsights.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Market Insights</h2>
          {marketInsights.map((mi) => {
            const support = supportFor(mi)
            return (
              <Card key={mi.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1.5">
                      <Badge tone="blue">{prettyType(mi.insight_type)}</Badge>
                      <CardTitle className="text-base">{mi.title}</CardTitle>
                    </div>
                    <div className="flex gap-4 shrink-0">
                      <Score label="conf" value={mi.confidence_score} />
                      <Score label="opp" value={mi.opportunity_score} />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">{mi.description}</p>
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
          })}
        </section>
      )}

      {recsSorted.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Recommendations</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {recsSorted.map((rec) => (
              <Card key={rec.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <Badge tone={rec.priority === 'high' ? 'high' : 'muted'}>{rec.priority ?? 'low'}</Badge>
                    <Badge>{prettyType(rec.type)}</Badge>
                  </div>
                  <CardTitle className="text-sm mt-1.5">{rec.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">{rec.reasoning}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <Card>
      <CardContent className="py-10 text-center text-sm text-muted-foreground">
        No market intelligence yet. Run the analysis pipeline to populate insights and recommendations.
      </CardContent>
    </Card>
  )
}
