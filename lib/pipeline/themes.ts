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
