import Link from 'next/link'
import { getSessionContext } from '@/lib/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { categoryTint, levelBadge } from '@/lib/ui-colors'

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

const chipBase = 'px-2 py-0.5 rounded-full text-xs font-medium capitalize'

/** A stable coloured category chip (insight type, rec type). */
function CategoryChip({ children }: { children: string }) {
  return <span className={`${chipBase} ${categoryTint(children)}`}>{prettyType(children)}</span>
}

/** A priority/level chip — high stands out (amber), the rest sit back. */
function LevelChip({ children }: { children: string }) {
  return <span className={`${chipBase} ${levelBadge(children)}`}>{children}</span>
}

function Score({ label, value }: { label: string; value: number | null }) {
  if (value == null) return null
  return (
    <div className="text-center">
      <div className="text-lg font-bold leading-none text-primary">{value}<span className="text-xs text-muted-foreground font-normal">/10</span></div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mt-0.5">{label}</div>
    </div>
  )
}

export default async function MarketIntelligencePage() {
  // Auth + tenant via the RLS-enforced session client. See lib/auth.ts.
  const { supabase, clientId } = await getSessionContext()

  // Latest COMPLETED run — an in-flight run has no synthesis rows yet, so the
  // page keeps serving the previous run's insights until the new one closes.
  const { data: latestRun } = await supabase
    .from('pipeline_runs').select('id, started_at')
    .eq('client_id', clientId).in('status', ['completed', 'partial'])
    .order('started_at', { ascending: false }).limit(1).maybeSingle()

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

  // Supporting themes (deduped) per market insight — the grounding shown as chips.
  function supportFor(mi: MarketInsight): string[] {
    const themes = new Set<string>()
    for (const id of mi.evidence?.supporting_theme_ids ?? []) {
      const ai = aiById.get(id)
      if (ai) themes.add(ai.theme)
    }
    return [...themes].slice(0, 4)
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
                      <CategoryChip>{mi.insight_type}</CategoryChip>
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
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs font-medium text-muted-foreground">Grounded in</div>
                        <Link
                          href={`/dashboard/voice?themes=${encodeURIComponent(support.join(','))}#grounding`}
                          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-primary ring-1 ring-primary/25 transition-colors hover:bg-primary/5"
                        >
                          See supporting voices <span aria-hidden>→</span>
                        </Link>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {support.map((theme, i) => (
                          <span key={i} className={`px-2 py-0.5 rounded-full text-xs capitalize ${categoryTint(theme)}`}>{theme.replace(/_/g, ' ')}</span>
                        ))}
                      </div>
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
                    <LevelChip>{rec.priority ?? 'low'}</LevelChip>
                    <CategoryChip>{rec.type}</CategoryChip>
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
