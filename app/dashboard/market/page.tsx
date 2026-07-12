import Link from 'next/link'
import { getSessionContext } from '@/lib/auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { categoryTint } from '@/lib/ui-colors'
import { CURATION_GATE, gateTier, type GateTier } from '@/lib/curation'
import { priorityWord, glossaryRule } from '@/lib/calibration'
import { CalibrationLegend } from '@/components/calibration-legend'
import { Quotes } from '@/components/quotes'
import { rankByTheme, fetchQuotesByAudience, createQuotePicker, bucketByAudienceId, scopeToClientVoices, type ThemeBucketRow } from '@/lib/quotes'
import type { CiSummary } from '@/lib/pipeline/schemas'

// Market Intelligence — "What should we do?" (Redesign Spec §3). The editorial
// layer over Pass D: the consumer-intelligence summary leads (the "someone
// already read everything for you" block), gate-passed recommendations are
// promoted above insights, then max-3 key insights, early signals honestly
// framed, and the full un-curated list demoted to a collapsed archive. Scores
// gate and order but are never displayed as numbers (spec §1) — evidence chips
// replace them. Read-only server component; same auth/run-anchor pattern as
// the dashboard.

interface MarketInsight {
  id: string
  insight_type: string
  title: string
  description: string
  evidence: { supporting_theme_ids?: string[]; supporting_competitive_insight_ids?: string[] } | null
  confidence_score: number | null
  opportunity_score: number | null
  hero_quote: string | null
}

interface Recommendation {
  id: string
  type: string
  title: string
  reasoning: string
  priority: string | null
  based_on: { insight_ids?: string[] } | null
  hero_quote: string | null
}

interface CompetitiveRef {
  id: string
  evidence: { supporting_theme_ids?: string[] } | null
  impact_level: string | null
}

interface SingleSourceTheme {
  label: string
  description: string | null
}

/** Single-source theme pills shown before the "+N more" overflow line. */
const SINGLE_SOURCE_SHOWN = 12

const prettyType = (s: string) => s.replace(/_/g, ' ')

const chipBase = 'px-2 py-0.5 rounded-full text-xs font-medium'

/** A stable coloured category chip (insight type, rec type). */
function CategoryChip({ children }: { children: string }) {
  return <span className={`${chipBase} capitalize ${categoryTint(children)}`}>{prettyType(children)}</span>
}

/** Calibrated priority word — positional, never the model's own rating
 *  (lib/calibration.ts): "Act now" appears exactly once per update. */
const PRIORITY_TIP: Record<string, string> = {
  'Act now': glossaryRule('act_now'),
  'Plan next': glossaryRule('plan_next'),
  'Worth considering': glossaryRule('worth_considering'),
}

function PriorityChip({ word }: { word: string }) {
  return (
    <span title={PRIORITY_TIP[word]} className={`${chipBase} ${word === 'Act now' ? 'bg-warning/15 text-warning' : 'bg-muted text-muted-foreground'}`}>
      {word}
    </span>
  )
}

/** The score replacement (spec §1): judgment as a chip, never a number. */
function EvidenceChip({ tier }: { tier: GateTier }) {
  if (tier === 'confirmed') return <span title={glossaryRule('strong_evidence')} className={`${chipBase} bg-positive/12 text-positive`}>Strong evidence</span>
  if (tier === 'early_signal') return <span title={glossaryRule('early_signal')} className={`${chipBase} bg-warning/15 text-warning`}>Early signal</span>
  return null
}

export default async function MarketIntelligencePage() {
  // Auth + tenant via the RLS-enforced session client. See lib/auth.ts.
  const { supabase, clientId } = await getSessionContext()

  // Latest COMPLETED run — an in-flight run has no synthesis rows yet, so the
  // page keeps serving the previous run's read until the new one closes.
  const { data: latestRun } = await supabase
    .from('pipeline_runs').select('id')
    .eq('client_id', clientId).in('status', ['completed', 'partial'])
    .order('started_at', { ascending: false }).limit(1).maybeSingle()

  if (!latestRun) {
    return (
      <div className="space-y-8">
        <PageHeader />
        <EmptyState />
      </div>
    )
  }
  const runId = latestRun.id as string

  const [miRes, recRes, aiRes, ciRes, summaryRes, ssRes, bucketRes] = await Promise.all([
    supabase.from('market_insights')
      .select('id, insight_type, title, description, evidence, confidence_score, opportunity_score, hero_quote')
      .eq('client_id', clientId).eq('run_id', runId)
      .order('opportunity_score', { ascending: false }),
    supabase.from('recommendations')
      .select('id, type, title, reasoning, priority, based_on, hero_quote')
      .eq('client_id', clientId).eq('run_id', runId),
    supabase.from('audience_insights').select('id, theme, source_video_id')
      .eq('client_id', clientId).eq('run_id', runId),
    supabase.from('competitive_insights').select('id, evidence, impact_level')
      .eq('client_id', clientId).eq('run_id', runId),
    supabase.from('run_summary').select('consumer_intelligence_summary')
      .eq('client_id', clientId).eq('run_id', runId).maybeSingle(),
    // Single-source pills must clear the same strength bar as early-signal
    // insights — "Early signal" is a calibrated term, not a catch-all for
    // everything heard once (127 of 140 themes were single-source).
    supabase.from('themes')
      .select('label, description', { count: 'exact' })
      .eq('client_id', clientId).eq('run_id', runId).eq('single_source', true)
      .gte('strength_score', CURATION_GATE.earlySignalMinScore)
      .order('strength_score', { ascending: false }).limit(SINGLE_SOURCE_SHOWN),
    // Entity buckets per audience insight — quote pools on this page are
    // client-facing claims, so competitor-audience voices are scoped out.
    supabase.from('themes')
      .select('bucket, supporting_insight_ids')
      .eq('client_id', clientId).eq('run_id', runId),
  ])

  const insights = (miRes.data ?? []) as MarketInsight[]
  const recommendations = (recRes.data ?? []) as Recommendation[]
  const competitive = (ciRes.data ?? []) as CompetitiveRef[]
  const ciSummary = (summaryRes.data?.consumer_intelligence_summary ?? null) as CiSummary | null
  const singleSourceThemes = (ssRes.data ?? []) as SingleSourceTheme[]
  const singleSourceTotal = ssRes.count ?? singleSourceThemes.length

  const miById = new Map(insights.map((mi) => [mi.id, mi]))
  const competitiveById = new Map(competitive.map((c) => [c.id, c]))
  const audienceRows = (aiRes.data ?? []) as { id: string; theme: string; source_video_id: string | null }[]
  const themeSlugById = new Map(audienceRows.map((a) => [a.id, a.theme]))
  const videoByInsight = new Map(audienceRows.map((a) => [a.id, a.source_video_id]))

  /** Measured grounding: distinct conversations behind an insight's evidence. */
  const conversationCount = (mi: MarketInsight): number => {
    const vids = new Set<string>()
    for (const id of mi.evidence?.supporting_theme_ids ?? []) {
      const v = videoByInsight.get(id)
      if (v) vids.add(v)
    }
    return vids.size
  }

  // ---- Curation gate over the insights (already in opportunity order) ----
  const sourceCount = (mi: MarketInsight) =>
    (mi.evidence?.supporting_theme_ids?.length ?? 0) +
    (mi.evidence?.supporting_competitive_insight_ids?.length ?? 0)
  const tierOf = new Map(insights.map((mi) => [mi.id, gateTier(mi.confidence_score, sourceCount(mi))]))
  const confirmed = insights.filter((mi) => tierOf.get(mi.id) === 'confirmed')
  const keyInsights = confirmed.slice(0, 3)
  const earlyInsights = insights.filter((mi) => tierOf.get(mi.id) === 'early_signal')

  /** Deduped grounding theme slugs for an insight — chips + the Voice deep-link. */
  function insightThemes(mi: MarketInsight): string[] {
    const slugs = new Set<string>()
    for (const id of mi.evidence?.supporting_theme_ids ?? []) {
      const slug = themeSlugById.get(id)
      if (slug) slugs.add(slug)
    }
    return [...slugs].slice(0, 4)
  }

  // ---- Recommendations: gate-passed ones promoted (spec §3.2) ----
  // A recommendation passes when at least one insight behind it does: a
  // confirmed market insight, or — competitive insights carry no confidence
  // score — a high-impact competitive insight clearing the same source floor.
  const confirmedGroundIds = new Set<string>([
    ...confirmed.map((mi) => mi.id),
    ...competitive
      .filter((c) =>
        c.impact_level === 'high' &&
        (c.evidence?.supporting_theme_ids?.length ?? 0) >= CURATION_GATE.confirmedMinSources)
      .map((c) => c.id),
  ])
  const priorityRank: Record<string, number> = { high: 0, medium: 1, low: 2 }
  const recsSorted = [...recommendations].sort(
    (a, b) =>
      (priorityRank[a.priority ?? 'low'] ?? 3) - (priorityRank[b.priority ?? 'low'] ?? 3) ||
      (b.based_on?.insight_ids?.length ?? 0) - (a.based_on?.insight_ids?.length ?? 0),
  )
  const topRecs = recsSorted
    .filter((r) => (r.based_on?.insight_ids ?? []).some((id) => confirmedGroundIds.has(id)))
    .slice(0, 3)
  const topRecIds = new Set(topRecs.map((r) => r.id))
  const restRecs = recsSorted.filter((r) => !topRecIds.has(r.id))

  /** Grounding theme slugs behind a recommendation, via its supporting insights. */
  function recThemes(rec: Recommendation): string[] {
    const slugs = new Set<string>()
    for (const id of rec.based_on?.insight_ids ?? []) {
      for (const tid of miById.get(id)?.evidence?.supporting_theme_ids ?? []) {
        const slug = themeSlugById.get(tid)
        if (slug) slugs.add(slug)
      }
      for (const tid of competitiveById.get(id)?.evidence?.supporting_theme_ids ?? []) {
        const slug = themeSlugById.get(tid)
        if (slug) slugs.add(slug)
      }
    }
    return [...slugs].slice(0, 4)
  }

  // ---- verbatim quotes for the evidence-led cards (shared lib/quotes) ----
  // Pull the audience insights most on-topic for each card into the quote pool
  // (theme-ranked so the specific voices beat the generic, high-volume ones),
  // fetch once, and build a page-scoped picker. Cards lead with the pipeline's
  // hero_quote where present and fall back to the heuristic otherwise. Every
  // card here is a claim about the client, so pools keep client + category
  // voices only — a competitor's customers never speak under a client claim.
  const bucketById = bucketByAudienceId((bucketRes.data ?? []) as ThemeBucketRow[])
  function recSupportAudienceIds(rec: Recommendation): string[] {
    const ids: string[] = []
    for (const id of rec.based_on?.insight_ids ?? []) {
      ids.push(...(miById.get(id)?.evidence?.supporting_theme_ids ?? []))
      ids.push(...(competitiveById.get(id)?.evidence?.supporting_theme_ids ?? []))
    }
    return scopeToClientVoices(ids, bucketById)
  }
  const insightAudienceIds = (mi: MarketInsight): string[] =>
    scopeToClientVoices(mi.evidence?.supporting_theme_ids ?? [], bucketById)
  const cardSpecs: { ids: string[]; claim: string }[] = [
    ...[...keyInsights, ...earlyInsights].map((mi) => ({ ids: insightAudienceIds(mi), claim: `${mi.title} ${mi.description}` })),
    ...topRecs.map((rec) => ({ ids: recSupportAudienceIds(rec), claim: `${rec.title} ${rec.reasoning}` })),
  ]
  const poolIds = new Set<string>()
  for (const spec of cardSpecs) {
    for (const id of rankByTheme(spec.ids, spec.claim, themeSlugById).slice(0, 80)) {
      if (poolIds.size < 600) poolIds.add(id)
    }
  }
  const quotesByAudience = await fetchQuotesByAudience(supabase, [...poolIds])
  const pick = createQuotePicker(quotesByAudience, themeSlugById)

  const nothingYet = !ciSummary && insights.length === 0 && recommendations.length === 0

  return (
    <div className="space-y-8">
      <PageHeader />

      {nothingYet && <EmptyState />}

      {!nothingYet && (
        <CalibrationLegend items={['conversations', 'act_now', 'plan_next', 'worth_considering', 'strong_evidence', 'early_signal']} />
      )}

      {/* The short read — consumer-intelligence summary (spec §3.1) */}
      {ciSummary && <ShortRead s={ciSummary} />}

      {/* Top recommendations (spec §3.2) — the outcome, promoted above insights */}
      {recommendations.length > 0 && (
        <section className="space-y-4">
          <SectionHeading label="Top recommendations" />
          {topRecs.length > 0 ? (
            <div className="space-y-4">
              {topRecs.map((rec, i) => (
                <RecCard key={rec.id} rec={rec} word={priorityWord(i)} voices={recThemes(rec)} quotes={pick(recSupportAudienceIds(rec), 3, `${rec.title} ${rec.reasoning}`, rec.hero_quote)} gatePassed />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nothing has strong enough evidence to lead with yet — the full list is under &ldquo;All recommendations&rdquo;.
            </p>
          )}
          {restRecs.length > 0 && (
            <CollapsedSection label="All recommendations" count={restRecs.length}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {restRecs.map((rec) => (
                  <RecCard key={rec.id} rec={rec} word="Worth considering" voices={recThemes(rec)} compact />
                ))}
              </div>
            </CollapsedSection>
          )}
        </section>
      )}

      {/* Key insights (spec §3.3) — max 3, gate-passed, by opportunity */}
      {keyInsights.length > 0 && (
        <section className="space-y-4">
          <SectionHeading label="Key insights" />
          {keyInsights.map((mi) => (
            <InsightCard key={mi.id} mi={mi} tier="confirmed" themes={insightThemes(mi)} conversations={conversationCount(mi)} quotes={pick(insightAudienceIds(mi), 2, `${mi.title} ${mi.description}`, mi.hero_quote)} />
          ))}
        </section>
      )}

      {/* Early signals (spec §3.4) — honestly framed */}
      {(earlyInsights.length > 0 || singleSourceThemes.length > 0) && (
        <section className="space-y-4">
          <SectionHeading label="Early signals" hint="worth watching, not yet confirmed" />
          {earlyInsights.map((mi) => (
            <InsightCard key={mi.id} mi={mi} tier="early_signal" themes={insightThemes(mi)} conversations={conversationCount(mi)} quotes={pick(insightAudienceIds(mi), 2, `${mi.title} ${mi.description}`, mi.hero_quote)} />
          ))}
          {singleSourceThemes.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Each of these was heard in a single conversation so far:
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                {singleSourceThemes.map((t, i) => (
                  <span key={i} title={t.description ?? undefined} className="px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">
                    {t.label}
                  </span>
                ))}
                {singleSourceTotal > singleSourceThemes.length && (
                  <span className="text-xs text-muted-foreground">
                    +{singleSourceTotal - singleSourceThemes.length} more
                  </span>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {/* All findings (spec §3.5) — the un-curated list, demoted to an archive */}
      {insights.length > 0 && (
        <CollapsedSection label="All findings" count={insights.length}>
          <div className="space-y-4">
            {insights.map((mi) => (
              <InsightCard key={mi.id} mi={mi} tier={tierOf.get(mi.id) ?? 'archive'} themes={insightThemes(mi)} conversations={conversationCount(mi)} />
            ))}
          </div>
        </CollapsedSection>
      )}
    </div>
  )
}

function PageHeader() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Market Intelligence</h1>
      <p className="text-sm text-muted-foreground italic">&ldquo;What should we do?&rdquo;</p>
    </div>
  )
}

function SectionHeading({ label, hint }: { label: string; hint?: string }) {
  return (
    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
      {label}
      {hint && <span className="ml-2 normal-case font-normal tracking-normal text-xs opacity-70">{hint}</span>}
    </h2>
  )
}

/** Native details/summary — collapsed archives without client JS. */
function CollapsedSection({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground [&::-webkit-details-marker]:hidden">
        <span className="text-[10px] transition-transform group-open:rotate-90" aria-hidden>▶</span>
        {label} <span className="opacity-60">· {count}</span>
      </summary>
      <div className="mt-4">{children}</div>
    </details>
  )
}

/** §3.1 — the "someone already read everything for you" headline block. */
function ShortRead({ s }: { s: CiSummary }) {
  const cols = [
    { label: 'Unmet needs', items: s.top_unmet_needs, dot: 'bg-clay' },
    { label: 'Buying triggers', items: s.top_buying_triggers, dot: 'bg-pine' },
    // "Who stands out" not "Your differentiators": Pass D's list includes
    // competitor standouts, so a "your" heading would mislabel two-thirds of it.
    { label: 'Who stands out', items: s.top_differentiators, dot: 'bg-plum' },
  ].filter((c) => (c.items?.length ?? 0) > 0)
  const threats = s.threats ?? []
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">The short read</CardTitle>
        <p className="text-xs text-muted-foreground">Every conversation analysed, distilled to what matters — start here.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {cols.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {cols.map((c) => (
              <div key={c.label} className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{c.label}</div>
                <ul className="space-y-1.5">
                  {c.items.slice(0, 3).map((item, i) => (
                    <li key={i} className="flex gap-2 text-sm">
                      <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${c.dot}`} aria-hidden />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        {(s.emotional_snapshot || threats.length > 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 border-t pt-4">
            {s.emotional_snapshot && (
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Audience mood</div>
                <p className="text-sm text-muted-foreground">{s.emotional_snapshot}</p>
              </div>
            )}
            {threats.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Threats to watch</div>
                <ul className="space-y-1.5">
                  {threats.map((t, i) => (
                    <li key={i} className="flex gap-2 text-sm">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-warning" aria-hidden />
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function RecCard({ rec, word, voices, gatePassed, compact, quotes = [] }: {
  rec: Recommendation
  /** Calibrated priority word — positional (Act now / Plan next / Worth considering). */
  word: string
  voices: string[]
  gatePassed?: boolean
  compact?: boolean
  /** Verbatim voices that lead the card (evidence-led); empty on compact/archive. */
  quotes?: string[]
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <PriorityChip word={word} />
          <CategoryChip>{rec.type}</CategoryChip>
          {gatePassed && <EvidenceChip tier="confirmed" />}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!compact && <Quotes items={quotes} />}
        <div className="space-y-1">
          <h3 className={`font-semibold ${compact ? 'text-sm' : 'text-base'}`}>{rec.title}</h3>
          <p className={`text-muted-foreground ${compact ? 'text-xs' : 'text-sm'}`}>{rec.reasoning}</p>
        </div>
        {voices.length > 0 && (
          <Link
            href={`/dashboard/voice?themes=${encodeURIComponent(voices.join(','))}#grounding`}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-primary ring-1 ring-primary/25 transition-colors hover:bg-primary/5"
          >
            See the voices behind this <span aria-hidden>→</span>
          </Link>
        )}
      </CardContent>
    </Card>
  )
}

function InsightCard({ mi, tier, themes, conversations, quotes = [] }: {
  mi: MarketInsight
  tier: GateTier
  themes: string[]
  /** Measured: distinct conversations behind this insight's evidence. */
  conversations: number
  /** Verbatim voices that lead the card (evidence-led); empty in the archive. */
  quotes?: string[]
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <CategoryChip>{mi.insight_type}</CategoryChip>
          <EvidenceChip tier={tier} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Quotes items={quotes} />
        <div className="space-y-1">
          <h3 className="text-base font-semibold">{mi.title}</h3>
          <p className="text-sm text-muted-foreground">{mi.description}</p>
        </div>
        {themes.length > 0 && (
          <div className="border-t pt-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-medium text-muted-foreground">
                Grounded in{conversations > 0 ? ` · ${conversations} conversation${conversations === 1 ? '' : 's'}` : ''}
              </div>
              <Link
                href={`/dashboard/voice?themes=${encodeURIComponent(themes.join(','))}#grounding`}
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-primary ring-1 ring-primary/25 transition-colors hover:bg-primary/5"
              >
                See supporting voices <span aria-hidden>→</span>
              </Link>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {themes.map((theme, i) => (
                <span key={i} className={`px-2 py-0.5 rounded-full text-xs capitalize ${categoryTint(theme)}`}>{theme.replace(/_/g, ' ')}</span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function EmptyState() {
  return (
    <Card>
      <CardContent className="py-10 text-center text-sm text-muted-foreground">
        Your market intelligence lands with your first update — check back then.
      </CardContent>
    </Card>
  )
}
