import Link from 'next/link'
import { getSessionContext } from '@/lib/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { categoryTint, SENTIMENT_BADGE, PREVALENCE_BADGE } from '@/lib/ui-colors'
import { gateTier } from '@/lib/curation'
import { prevalenceTier, PREVALENCE_LABEL, glossaryRule } from '@/lib/calibration'
import { VoiceFilters } from '@/components/voice-filters'
import { CalibrationLegend } from '@/components/calibration-legend'

// Voice of Customer — "What are they actually saying?" (Redesign Spec §4).
// Themes are the organizing unit, not the raw insight list: each card is a
// Pass B-labelled theme with its synthesized description, emotion, video
// coverage, and expandable verbatim quotes (insight_evidence). Below the
// confirmed themes: "How your customers talk" (the language-samples panel —
// the signature panel for a product named Verbatim) and single-source early
// signals, honestly badged. Category filtering is a tab row (demo layout);
// journey-stage + strength filters stay URL-driven in the bar. Deep links from
// Market/Dashboard (?themes=slug1,slug2) narrow to the themes those insights
// are grounded in. Scores gate and order but are never shown as numbers.

interface ThemeRow {
  id: string
  bucket: string
  category: string
  label: string
  description: string | null
  member_themes: string[]
  supporting_insight_ids: string[]
  supporting_video_ids: string[]
  evidence_count: number
  strength_score: number | null
  dominant_emotion: string | null
  dominant_sentiment_impact: string | null
  single_source: boolean
  first_seen: boolean
}

/** Quotes shown per theme before the "+ more" line. */
const QUOTES_SHOWN = 5
/** Member-insight ids sampled per theme for the quote fetch (URL-length cap). */
const QUOTE_IDS_PER_THEME = 12
/** Early-signal cards shown before the "+N more" line. */
const EARLY_SHOWN = 12
/** Language-sample phrases shown before the "+N more" line. */
const PHRASES_SHOWN = 24

const prettyType = (s: string) => s.replace(/_/g, ' ')
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const chipBase = 'px-2 py-0.5 rounded-full text-xs font-medium'

export default async function VoiceOfCustomerPage({
  searchParams,
}: {
  searchParams?: Promise<{ themes?: string; type?: string; stage?: string; min?: string }>
}) {
  // Auth + tenant via the RLS-enforced session client. See lib/auth.ts.
  const { supabase, clientId } = await getSessionContext()

  const sp = (await searchParams) ?? {}
  // Deep-link from a Market/Dashboard insight: ?themes=slug1,slug2 narrows the
  // page to the theme(s) whose members ground that insight.
  const groundingSlugs = new Set((sp.themes ?? '').split(',').map((s) => s.trim()).filter(Boolean))
  const deepLinked = groundingSlugs.size > 0
  const typeFilter = sp.type ?? 'all'
  const stageFilter = sp.stage ?? 'all'
  const minScore = Number(sp.min ?? '0') || 0

  // Latest COMPLETED run — an in-flight run has no themes yet, so the page
  // keeps serving the previous run's voices until the new one closes.
  const { data: latestRun } = await supabase
    .from('pipeline_runs').select('id')
    .eq('client_id', clientId).in('status', ['completed', 'partial'])
    .order('started_at', { ascending: false }).limit(1).maybeSingle()

  if (!latestRun) {
    return (
      <div className="space-y-6">
        <PageHeader />
        <EmptyState>Your customer voices land with your first update — check back then.</EmptyState>
      </div>
    )
  }
  const runId = latestRun.id as string

  const [themesRes, earlierRes, insightsRes, samplesRes, clientRes] = await Promise.all([
    supabase.from('themes')
      .select('id, bucket, category, label, description, member_themes, supporting_insight_ids, supporting_video_ids, evidence_count, strength_score, dominant_emotion, dominant_sentiment_impact, single_source, first_seen')
      .eq('client_id', clientId).eq('run_id', runId)
      .order('strength_score', { ascending: false }).order('evidence_count', { ascending: false }),
    supabase.from('themes').select('id')
      .eq('client_id', clientId).neq('run_id', runId).limit(1),
    supabase.from('audience_insights').select('id, journey_stage')
      .eq('client_id', clientId).eq('run_id', runId),
    supabase.from('language_samples')
      .select('phrase, platform', { count: 'exact' })
      .eq('client_id', clientId).eq('run_id', runId)
      .limit(PHRASES_SHOWN),
    supabase.from('clients').select('company_name').eq('id', clientId).maybeSingle(),
  ])

  const themes = (themesRes.data ?? []) as ThemeRow[]
  const showNew = ((earlierRes.data ?? []).length) > 0
  const brand = clientRes.data?.company_name ?? 'your brand'

  // ---- Prevalence denominators (calibrated language) ----
  // A theme's reach is measured against its own entity group: the group's
  // distinct insight-bearing conversations = union of its themes' evidence
  // (clustering partitions every insight, so the union covers the group).
  const groupConversations = new Map<string, Set<string>>()
  for (const t of themes) {
    let set = groupConversations.get(t.bucket)
    if (!set) groupConversations.set(t.bucket, (set = new Set()))
    for (const id of t.supporting_video_ids ?? []) set.add(id)
  }
  const groupSize = (bucket: string) => groupConversations.get(bucket)?.size ?? 0
  const groupName = (bucket: string) =>
    bucket === 'client' ? brand : bucket === 'industry-other' ? 'industry' : bucket.replace(/^competitor:/, '')
  const stageByInsight = new Map(
    ((insightsRes.data ?? []) as { id: string; journey_stage: string | null }[]).map((i) => [i.id, i.journey_stage]),
  )
  const stagesPresent = new Set([...stageByInsight.values()].filter(Boolean))
  const samples = (samplesRes.data ?? []) as { phrase: string; platform: string | null }[]
  const sampleTotal = samplesRes.count ?? samples.length

  // ---- Filters (applied to both tiers) ----
  const anyFilter = deepLinked || typeFilter !== 'all' || stageFilter !== 'all' || minScore > 0
  const shown = themes.filter((t) =>
    (!deepLinked || t.member_themes.some((slug) => groundingSlugs.has(slug))) &&
    (typeFilter === 'all' || t.category === typeFilter) &&
    (stageFilter === 'all' || t.supporting_insight_ids.some((id) => stageByInsight.get(id) === stageFilter)) &&
    Number(t.strength_score ?? 0) >= minScore,
  )
  const confirmed = shown.filter((t) => !t.single_source)
  const early = shown.filter((t) => t.single_source)

  // Category tabs with counts — over the whole run, so the row is stable while
  // a tab is active. Ordered by theme volume.
  const categoryCounts = new Map<string, number>()
  for (const t of themes) categoryCounts.set(t.category, (categoryCounts.get(t.category) ?? 0) + 1)
  const tabs = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1])

  // ---- Verbatim quotes for the confirmed themes on display ----
  // Sample a capped slice of member insights per theme (URL-length safety),
  // then group the ranked evidence back per theme.
  const quoteIds = [...new Set(confirmed.flatMap((t) => t.supporting_insight_ids.slice(0, QUOTE_IDS_PER_THEME)))]
  const quoteByInsight = new Map<string, string[]>()
  const CHUNK = 100
  for (let i = 0; i < quoteIds.length; i += CHUNK) {
    const { data } = await supabase
      .from('insight_evidence').select('audience_insight_id, quote, relevance_rank')
      .in('audience_insight_id', quoteIds.slice(i, i + CHUNK))
      .order('relevance_rank', { ascending: true })
    for (const ev of (data ?? []) as { audience_insight_id: string; quote: string }[]) {
      const arr = quoteByInsight.get(ev.audience_insight_id)
      if (arr) arr.push(ev.quote)
      else quoteByInsight.set(ev.audience_insight_id, [ev.quote])
    }
  }
  const quotesFor = (t: ThemeRow): string[] => {
    const out: string[] = []
    for (const id of t.supporting_insight_ids.slice(0, QUOTE_IDS_PER_THEME)) {
      for (const q of quoteByInsight.get(id) ?? []) {
        if (out.length >= QUOTES_SHOWN) return out
        if (!out.includes(q)) out.push(q)
      }
    }
    return out
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader />
        <VoiceFilters stage={stageFilter} min={String(minScore)} deepLinked={deepLinked} showStage={stagesPresent.size > 0} />
      </div>

      {themes.length > 0 && (
        <CalibrationLegend items={showNew
          ? ['dominant', 'widespread', 'recurring', 'early_signal', 'strong_evidence', 'new']
          : ['dominant', 'widespread', 'recurring', 'early_signal', 'strong_evidence']} />
      )}

      {/* Category tabs (demo layout) — URL-driven, shareable */}
      {tabs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <TabLink label="All" count={themes.length} active={typeFilter === 'all'} category={null} sp={sp} />
          {tabs.map(([category, n]) => (
            <TabLink key={category} label={cap(prettyType(category))} count={n} active={typeFilter === category} category={category} sp={sp} />
          ))}
        </div>
      )}

      {themes.length === 0 && (
        <EmptyState>Your customer voices are being organised into themes — they land with your next update.</EmptyState>
      )}
      {themes.length > 0 && shown.length === 0 && (
        <EmptyState>{anyFilter ? 'No themes match these filters.' : 'No themes this update.'}</EmptyState>
      )}

      {/* Confirmed themes — the organizing unit */}
      {confirmed.length > 0 && (
        <section id="grounding" className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            What your market is saying <span className="opacity-60">· {confirmed.length}</span>
            <span className="ml-2 normal-case font-normal tracking-normal text-xs opacity-70">strongest first, with the voices behind each theme</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {confirmed.map((t) => {
              const quotes = quotesFor(t)
              const tier = gateTier(t.strength_score, t.evidence_count)
              // Calibrated prevalence: word by rule, count next to it (never the model's wording).
              const denom = groupSize(t.bucket)
              const prevalence = prevalenceTier(t.evidence_count, denom)
              return (
                <Card key={t.id}>
                  <CardHeader className="pb-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span title={glossaryRule(prevalence)} className={`${chipBase} ${PREVALENCE_BADGE[prevalence]}`}>{PREVALENCE_LABEL[prevalence]}</span>
                      <span className={`${chipBase} capitalize ${categoryTint(t.category)}`}>{prettyType(t.category)}</span>
                      {t.bucket !== 'client' && (
                        <span className={`${chipBase} capitalize bg-muted text-muted-foreground`}>{t.bucket}</span>
                      )}
                      {t.dominant_emotion && (
                        <span className={`${chipBase} capitalize ${categoryTint(t.dominant_emotion)}`}>{t.dominant_emotion}</span>
                      )}
                      {t.dominant_sentiment_impact && (
                        <span className={`${chipBase} capitalize ${SENTIMENT_BADGE[t.dominant_sentiment_impact] ?? 'bg-muted text-muted-foreground'}`}>
                          {t.dominant_sentiment_impact}
                        </span>
                      )}
                      {tier === 'confirmed' && <span title={glossaryRule('strong_evidence')} className={`${chipBase} bg-positive/12 text-positive`}>Strong evidence</span>}
                      {showNew && t.first_seen && (
                        <span title={glossaryRule('new')} className={`${chipBase} font-semibold bg-warning/15 text-warning`}>New</span>
                      )}
                    </div>
                    <CardTitle className="text-base mt-1.5">{t.label}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {t.description && <p className="text-sm text-muted-foreground">{t.description}</p>}
                    <p className="border-t pt-2 text-[10px] text-muted-foreground">
                      heard in {t.evidence_count} of {denom} {groupName(t.bucket)} conversations
                    </p>
                    {quotes.length > 0 && (
                      <details className="group">
                        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-primary [&::-webkit-details-marker]:hidden">
                          <span className="text-[9px] transition-transform group-open:rotate-90" aria-hidden>▶</span>
                          Hear these voices
                        </summary>
                        <div className="mt-2 space-y-1.5">
                          {quotes.map((q, n) => (
                            <p key={n} className="text-xs text-muted-foreground italic">&ldquo;{q}&rdquo;</p>
                          ))}
                          <p className="text-[10px] text-muted-foreground">a sample of the conversations behind this theme</p>
                        </div>
                      </details>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </section>
      )}

      {/* How your customers talk — the signature panel */}
      {samples.length > 0 && (
        <Card className="ring-1 ring-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">How your customers talk</CardTitle>
            <p className="text-xs text-muted-foreground">
              Real phrases from real comments, word for word — lift them straight into your copy.
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-2">
              {samples.map((s, i) => (
                <span
                  key={i}
                  title={s.platform ? cap(s.platform) : undefined}
                  className="rounded-full bg-secondary px-3 py-1 text-xs italic text-secondary-foreground"
                >
                  &ldquo;{s.phrase}&rdquo;
                </span>
              ))}
              {sampleTotal > samples.length && (
                <span className="text-xs text-muted-foreground">+{sampleTotal - samples.length} more collected</span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Early signals — single-source themes, honestly framed */}
      {early.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Early signals <span className="opacity-60">· {early.length}</span>
            <span className="ml-2 normal-case font-normal tracking-normal text-xs opacity-70">heard in a single conversation so far — worth watching, not yet confirmed</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {early.slice(0, EARLY_SHOWN).map((t) => (
              <Card key={t.id} className="py-4">
                <CardContent className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`${chipBase} capitalize ${categoryTint(t.category)}`}>{prettyType(t.category)}</span>
                    <span title={glossaryRule('early_signal')} className={`${chipBase} bg-warning/15 text-warning`}>Early signal</span>
                  </div>
                  <p className="text-sm font-medium">{t.label}</p>
                  {t.description && <p className="text-xs text-muted-foreground line-clamp-2">{t.description}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
          {early.length > EARLY_SHOWN && (
            <p className="text-xs text-muted-foreground">+{early.length - EARLY_SHOWN} more early signals in this update</p>
          )}
        </section>
      )}
    </div>
  )
}

function PageHeader() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Voice of Customer</h1>
      <p className="text-sm text-muted-foreground italic">&ldquo;What are they actually saying?&rdquo;</p>
    </div>
  )
}

/** A category tab — a Link so the server filters; preserves the other params. */
function TabLink({ label, count, active, category, sp }: {
  label: string
  count: number
  active: boolean
  category: string | null
  sp: { themes?: string; stage?: string; min?: string }
}) {
  const params = new URLSearchParams()
  if (category) params.set('type', category)
  if (sp.themes) params.set('themes', sp.themes)
  if (sp.stage) params.set('stage', sp.stage)
  if (sp.min) params.set('min', sp.min)
  const qs = params.toString()
  return (
    <Link
      href={qs ? `/dashboard/voice?${qs}` : '/dashboard/voice'}
      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
        active
          ? 'bg-primary text-primary-foreground'
          : 'bg-card text-foreground ring-1 ring-border hover:bg-muted/40'
      }`}
    >
      {label}
      <span className={active ? 'opacity-70' : 'text-muted-foreground'}>{count}</span>
    </Link>
  )
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="py-10 text-center text-sm text-muted-foreground">{children}</CardContent>
    </Card>
  )
}
