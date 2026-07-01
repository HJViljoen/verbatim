import { getSessionContext } from '@/lib/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { categoryTint, categorySolid, SENTIMENT_BADGE } from '@/lib/ui-colors'
import { VoiceFilters } from '@/components/voice-filters'

// Voice of Customer — every audience_insight (Pass A → Step A2) grouped by
// category, each theme grounded in its verbatim comment quotes (insight_evidence).
// Read-only server component; same auth/run-selection pattern as Market
// Intelligence. Categories with no insights are shown explicitly so the page
// doubles as a readout of what Pass A is actually extracting.

interface AudienceInsight {
  id: string
  category: string
  theme: string
  description: string
  strength_score: number | null
  emotion: string | null
  sentiment_impact: string | null
}

// All eight Pass A categories (schemas.ts INSIGHT_CATEGORIES), most actionable first.
const CATEGORY_ORDER = [
  'pain_point', 'question', 'feature_request', 'purchase_intent',
  'objection', 'praise', 'misinformation', 'demographic_signal',
] as const

const prettyType = (s: string) => s.replace(/_/g, ' ')

export default async function VoiceOfCustomerPage({
  searchParams,
}: {
  searchParams?: Promise<{ themes?: string; type?: string; min?: string }>
}) {
  // Auth + tenant via the RLS-enforced session client. See lib/auth.ts.
  const { supabase, clientId } = await getSessionContext()

  const sp = (await searchParams) ?? {}
  // Deep-link from a Market/Competitive insight: ?themes=slug1,slug2 narrows the
  // page to just the theme(s) that insight is grounded in (with their quotes).
  const groundingThemes = new Set((sp.themes ?? '').split(',').map((s) => s.trim()).filter(Boolean))
  const deepLinked = groundingThemes.size > 0
  // Manual filters (URL-driven): type = category, min = strength-score threshold.
  const typeFilter = sp.type ?? 'all'
  const minScore = Number(sp.min ?? '0') || 0

  const { data: latestRun } = await supabase
    .from('pipeline_runs').select('id, started_at')
    .eq('client_id', clientId).order('started_at', { ascending: false }).limit(1).maybeSingle()

  if (!latestRun) return <EmptyState>No pipeline run yet. Run the analysis to extract audience insights.</EmptyState>
  const runId = latestRun.id as string

  const { data: aiData } = await supabase
    .from('audience_insights')
    .select('id, category, theme, description, strength_score, emotion, sentiment_impact')
    .eq('client_id', clientId).eq('run_id', runId)
    .order('strength_score', { ascending: false })

  const insights = (aiData ?? []) as AudienceInsight[]

  // Deep-link filters to just the grounding themes; manual filters narrow further.
  const anyFilter = deepLinked || typeFilter !== 'all' || minScore > 0
  const shown = insights.filter(
    (i) =>
      (!deepLinked || groundingThemes.has(i.theme)) &&
      (typeFilter === 'all' || i.category === typeFilter) &&
      Number(i.strength_score ?? 0) >= minScore,
  )

  // Verbatim quotes per shown insight.
  const quotesByInsight = new Map<string, string[]>()
  if (shown.length) {
    const { data: evData } = await supabase
      .from('insight_evidence').select('audience_insight_id, quote, relevance_rank')
      .in('audience_insight_id', shown.map((i) => i.id))
      .order('relevance_rank', { ascending: true })
    for (const ev of (evData ?? []) as { audience_insight_id: string; quote: string }[]) {
      const arr = quotesByInsight.get(ev.audience_insight_id)
      if (arr) arr.push(ev.quote)
      else quotesByInsight.set(ev.audience_insight_id, [ev.quote])
    }
  }

  // Group the shown insights by category.
  const byCategory = new Map<string, AudienceInsight[]>()
  for (const i of shown) {
    const arr = byCategory.get(i.category)
    if (arr) arr.push(i)
    else byCategory.set(i.category, [i])
  }
  const presentExtras = [...byCategory.keys()].filter((c) => !CATEGORY_ORDER.includes(c as never))
  // Default view lists every category (empty ones as a readout of what Pass A
  // extracts); once any filter is active, only show categories that have matches.
  const categories = anyFilter
    ? [...CATEGORY_ORDER, ...presentExtras].filter((c) => (byCategory.get(c)?.length ?? 0) > 0)
    : [...CATEGORY_ORDER, ...presentExtras]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Voice of Customer</h1>
          <p className="text-sm text-muted-foreground">
            {shown.length}{shown.length !== insights.length ? ` of ${insights.length}` : ''} audience insights · {byCategory.size} categories · run {runId.slice(0, 8)}
          </p>
        </div>
        <VoiceFilters type={typeFilter} min={String(minScore)} deepLinked={deepLinked} />
      </div>

      {shown.length === 0 && (
        <EmptyState>
          {anyFilter
            ? 'No audience insights match these filters.'
            : 'This run produced no audience insights — Pass A found nothing above the evidence floor.'}
        </EmptyState>
      )}

      {shown.length > 0 && categories.map((cat) => {
        const items = byCategory.get(cat) ?? []
        return (
          <section key={cat} className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              <span className={`size-2 rounded-full ${categorySolid(cat)}`} aria-hidden />
              {prettyType(cat)} <span className="opacity-60">· {items.length}</span>
            </h2>
            {items.length === 0
              ? <p className="text-xs text-muted-foreground italic">No {prettyType(cat)} insights in this run.</p>
              : <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {items.map((i) => {
                    const quotes = quotesByInsight.get(i.id) ?? []
                    return (
                      <Card key={i.id}>
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between gap-3">
                            <CardTitle className="text-sm capitalize">{i.theme.replace(/_/g, ' ')}</CardTitle>
                            {i.strength_score != null && (
                              <span className="text-xs text-muted-foreground shrink-0">
                                {i.strength_score}<span className="opacity-60">/10</span>
                              </span>
                            )}
                          </div>
                          <div className="flex gap-2 text-[10px] mt-1">
                            {i.emotion && <span className={`px-1.5 py-0.5 rounded-full capitalize ${categoryTint(i.emotion)}`}>{i.emotion}</span>}
                            {i.sentiment_impact && (
                              <span className={`px-1.5 py-0.5 rounded-full capitalize ${SENTIMENT_BADGE[i.sentiment_impact] ?? 'bg-muted text-muted-foreground'}`}>
                                {i.sentiment_impact}
                              </span>
                            )}
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <p className="text-xs text-muted-foreground">{i.description}</p>
                          {quotes.length > 0
                            ? <div className="border-t pt-2 space-y-1">
                                {quotes.slice(0, 3).map((q, n) => (
                                  <p key={n} className="text-xs text-muted-foreground italic">&ldquo;{q}&rdquo;</p>
                                ))}
                                {quotes.length > 3 && <p className="text-[10px] text-muted-foreground">+{quotes.length - 3} more quotes</p>}
                              </div>
                            : <p className="text-[10px] text-muted-foreground italic">No verbatim evidence linked.</p>}
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>}
          </section>
        )
      })}
    </div>
  )
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="py-10 text-center text-sm text-muted-foreground">{children}</CardContent>
    </Card>
  )
}
