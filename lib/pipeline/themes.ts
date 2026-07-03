import { createAdminClient, selectAll } from '../supabase-admin'
import { THEME_MATCH_THRESHOLD } from '../config'
import { embedTexts, cosine } from './cluster'
import type { AggregatedTheme } from './types'

// Theme persistence + mini theme-matching (Redesign Spec 2026-07-03 §8).
// Persists Step A2's clustered themes — with Pass B labels, the single-source
// tier, and a first_seen flag — to the `themes` table, replaced per (client,
// run). first_seen comes from embedding-matching this run's label+description
// against the PREVIOUS run's stored theme embeddings: unmatched = a new theme
// ("New" badges + the weekly-email delta). Deliberately NOT full genealogy —
// one boolean, computed once, no persistent theme identity across runs.

export interface PersistThemesResult {
  inserted: number
  firstSeen: number
  /** False on the client's first themed run — every theme is trivially "new",
   *  so pages should suppress the badge (detectable: no earlier themed run). */
  hadPreviousRun: boolean
}

/** Read a run's persisted themes back into the in-memory shape Pass C/D
 *  consume. Lets the synthesis half run in its own Inngest step, decoupled
 *  from Step A2/Pass B via the DB. sampleDescriptions aren't persisted (they
 *  only feed Pass B, which has already run by the time rows exist). */
export async function loadThemes(clientId: string, runId: string): Promise<AggregatedTheme[]> {
  const admin = createAdminClient()
  const rows = await selectAll<{
    label: string; description: string | null; bucket: string; category: string
    member_themes: string[]; supporting_insight_ids: string[]; supporting_video_ids: string[]
    evidence_count: number; strength_score: number | null
    dominant_emotion: string | null; dominant_sentiment_impact: string | null; single_source: boolean
  }>(() =>
    admin
      .from('themes')
      .select('label, description, bucket, category, member_themes, supporting_insight_ids, supporting_video_ids, evidence_count, strength_score, dominant_emotion, dominant_sentiment_impact, single_source')
      .eq('client_id', clientId).eq('run_id', runId)
      .order('strength_score', { ascending: false }).order('id', { ascending: true }),
  )
  return rows.map((r) => ({
    bucket: r.bucket,
    category: r.category,
    theme: r.member_themes[0] ?? r.label,
    memberThemes: r.member_themes,
    supportingVideoIds: r.supporting_video_ids,
    supportingInsightIds: r.supporting_insight_ids,
    evidenceCount: r.evidence_count,
    strengthScore: r.strength_score ?? 0,
    dominantEmotion: r.dominant_emotion ?? 'neutral',
    dominantSentimentImpact: r.dominant_sentiment_impact ?? 'neutral',
    singleSource: r.single_source,
    sampleDescriptions: [],
    label: r.label,
    description: r.description ?? undefined,
  }))
}

/** Text embedded for cross-run matching — the client-facing identity of the theme. */
function matchText(t: AggregatedTheme): string {
  return `${t.label ?? t.theme}. ${t.description ?? ''}`.trim()
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6

export async function persistThemes(
  clientId: string,
  runId: string,
  themes: AggregatedTheme[],
): Promise<PersistThemesResult> {
  const admin = createAdminClient()

  // Previous themed run = the most recent themes rows for another run.
  const { data: prevRun } = await admin
    .from('themes')
    .select('run_id, created_at')
    .eq('client_id', clientId)
    .neq('run_id', runId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let prevEmbeddings: number[][] = []
  if (prevRun) {
    const prevRows = await selectAll<{ embedding: number[] | null }>(() =>
      admin
        .from('themes')
        .select('embedding')
        .eq('client_id', clientId)
        .eq('run_id', prevRun.run_id)
        .order('id', { ascending: true }),
    )
    prevEmbeddings = prevRows.map((r) => r.embedding).filter((e): e is number[] => Array.isArray(e) && e.length > 0)
  }

  const embeddings = await embedTexts(themes.map(matchText))
  const firstSeenFlags = embeddings.map((vec) => {
    if (prevEmbeddings.length === 0) return true
    return !prevEmbeddings.some((prev) => cosine(vec, prev) >= THEME_MATCH_THRESHOLD)
  })

  // Replace per (client, run) — invariant 6.
  const { error: delErr } = await admin.from('themes').delete().eq('client_id', clientId).eq('run_id', runId)
  if (delErr) throw new Error(`clear themes: ${delErr.message}`)

  if (themes.length) {
    const rows = themes.map((t, i) => ({
      client_id: clientId,
      run_id: runId,
      bucket: t.bucket,
      category: t.category,
      label: t.label ?? t.theme,
      description: t.description ?? null,
      member_themes: t.memberThemes,
      supporting_insight_ids: t.supportingInsightIds,
      supporting_video_ids: t.supportingVideoIds,
      evidence_count: t.evidenceCount,
      strength_score: t.strengthScore,
      dominant_emotion: t.dominantEmotion,
      dominant_sentiment_impact: t.dominantSentimentImpact,
      single_source: t.singleSource,
      first_seen: firstSeenFlags[i],
      embedding: embeddings[i].map(round6),
    }))
    const { error } = await admin.from('themes').insert(rows)
    if (error) throw new Error(`persist themes: ${error.message}`)
  }

  return {
    inserted: themes.length,
    firstSeen: firstSeenFlags.filter(Boolean).length,
    hadPreviousRun: prevEmbeddings.length > 0,
  }
}
