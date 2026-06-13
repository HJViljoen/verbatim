import { zodResponseFormat } from 'openai/helpers/zod'
import { createAdminClient } from '../supabase-admin'
import { openai } from '../openai'
import { ANALYSIS_MODEL, ANALYSIS_TEMPERATURE, estimateCost } from '../config'
import { PassDSchema, type PassDOutput } from './schemas'
import { logAiCall } from './ai-log'
import { indexThemes, type PersistedCompetitiveInsight } from './pass-c'
import type { AggregatedTheme, SovEntry } from './types'

// Pass D — market intelligence + recommendations (Architecture/Analysis-Passes
// §Pass D). Single synthesis call over ALL bucketed themes (entity boundaries
// collapsed for market-wide patterns) + Pass C's competitive insights. Produces
// the strategic output the product is sold on. Themes (T#) and competitive
// insights (C#) are referenced by index; recommendations reference the market
// insights they generate in THIS call by M# (their 1-based position) and/or C#.
// Code maps every index back to a UUID and rejects unknowns (invariant 8).

const PROMPT_VERSION = 'pass_d_v1'

const clampScore = (n: number) => Math.max(1, Math.min(10, Math.round(n)))

export interface RunPassDOptions {
  clientId: string
  runId: string
  themes: AggregatedTheme[]
  competitiveInsights?: PersistedCompetitiveInsight[]
  sov?: Record<string, SovEntry>
  persist?: boolean
  dryRun?: boolean
}

export interface RunPassDResult {
  marketInsights: { id: string; insight_type: string; title: string; confidence_score: number; opportunity_score: number }[]
  recommendations: { id: string; type: string; title: string; priority: string | null }[]
  rejectedRefs: number
  promptTokens: number
  completionTokens: number
  costUsd: number
  dryRun: boolean
}

function buildSystemPrompt(): string {
  return [
    'You are a media-based consumer intelligence analyst producing the strategic output a brand pays for.',
    '',
    'You are given audience themes (distilled from real comments) and, if present, competitive insights.',
    'Synthesise across the whole conversation — not one theme at a time.',
    '',
    'Produce two things:',
    '1. market_insights — patterns that span themes: unmet needs, platform patterns, industry signals,',
    '   cross-platform synthesis, sentiment trajectory. Look at the market, not a single bucket.',
    '2. recommendations — concrete actions grounded in those insights: content ideas, hook strategies,',
    '   urgent topics, competitive moves, audience targets, platform strategies.',
    '',
    'Rules:',
    '- Reference supporting themes by their bracket index (e.g. "T2") and competitive insights by theirs (e.g. "C1"). Use ONLY indices present in the input.',
    '- Each recommendation’s "based_on" lists the market insights it follows from, referenced as "M1", "M2" … by their 1-based position in YOUR market_insights array, and/or competitive insights as "C1" …',
    '- Do NOT invent counts or percentages. confidence_score and opportunity_score are 1–10 judgments, not measured quantities.',
    '- Ground every insight and recommendation in the provided themes. If the data is thin, produce fewer, honest insights rather than padding.',
  ].join('\n')
}

function buildUserPrompt(
  themeIndex: { label: string; theme: AggregatedTheme }[],
  competitive: PersistedCompetitiveInsight[],
  ciIndex: Map<string, PersistedCompetitiveInsight>,
  sov: Record<string, SovEntry> | undefined,
): string {
  const lines: string[] = []
  if (sov && Object.keys(sov).length) {
    lines.push('SHARE OF VOICE (by bucket):')
    for (const [bucket, e] of Object.entries(sov)) lines.push(`- ${bucket}: ${e.videos} videos (${e.pct_videos}%)`)
    lines.push('')
  }
  lines.push(`THEMES (${themeIndex.length})`)
  for (const { label, theme } of themeIndex) {
    lines.push(
      `[${label}] bucket=${theme.bucket} category=${theme.category} theme=${theme.theme} ` +
        `· ${theme.evidenceCount} videos · strength ${theme.strengthScore} · ${theme.dominantEmotion}/${theme.dominantSentimentImpact}`,
    )
  }
  if (competitive.length) {
    lines.push('', `COMPETITIVE INSIGHTS (${competitive.length})`)
    let i = 0
    for (const [, ci] of ciIndex) {
      i++
      lines.push(`[C${i}] category=${ci.category} ${ci.competitor_name ? `competitor=${ci.competitor_name} ` : ''}— ${ci.title}: ${ci.finding}`)
    }
  }
  return lines.join('\n')
}

export async function runPassD(opts: RunPassDOptions): Promise<RunPassDResult> {
  const { clientId, runId, themes, sov } = opts
  const competitive = opts.competitiveInsights ?? []
  const dryRun = opts.dryRun ?? false
  const persist = opts.persist ?? !dryRun
  const admin = createAdminClient()

  const themeIndex = indexThemes(themes)
  const themeByLabel = new Map(themeIndex.map((t) => [t.label.toLowerCase(), t.theme]))
  // C# index, 1-based in input order.
  const ciIndex = new Map<string, PersistedCompetitiveInsight>()
  competitive.forEach((ci, i) => ciIndex.set(`c${i + 1}`, ci))

  const systemPrompt = buildSystemPrompt()
  const userPrompt = buildUserPrompt(themeIndex, competitive, ciIndex, sov)

  const result: RunPassDResult = {
    marketInsights: [],
    recommendations: [],
    rejectedRefs: 0,
    promptTokens: 0,
    completionTokens: 0,
    costUsd: 0,
    dryRun,
  }
  if (dryRun) return result

  const startedAt = Date.now()
  let parsed: PassDOutput | null = null
  let usage = { prompt_tokens: 0, completion_tokens: 0 }
  try {
    const completion = await openai.chat.completions.parse({
      model: ANALYSIS_MODEL,
      temperature: ANALYSIS_TEMPERATURE,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: zodResponseFormat(PassDSchema, 'pass_d'),
    })
    parsed = completion.choices[0]?.message?.parsed ?? null
    if (completion.usage) {
      usage = { prompt_tokens: completion.usage.prompt_tokens, completion_tokens: completion.usage.completion_tokens }
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    if (persist) {
      await logAiCall(admin, { clientId, runId, pass: 'pass_d', callIndex: 1, promptVersion: PROMPT_VERSION, systemPrompt, userPrompt, response: null, error, usage, durationMs: Date.now() - startedAt, validationStatus: 'parse_error' })
    }
    throw new Error(`Pass D call failed: ${error}`)
  }

  const durationMs = Date.now() - startedAt
  result.costUsd = estimateCost(ANALYSIS_MODEL, usage.prompt_tokens, usage.completion_tokens)
  result.promptTokens = usage.prompt_tokens
  result.completionTokens = usage.completion_tokens

  if (!parsed) {
    if (persist) {
      await logAiCall(admin, { clientId, runId, pass: 'pass_d', callIndex: 1, promptVersion: PROMPT_VERSION, systemPrompt, userPrompt, response: { refusal: true }, error: 'no parsed output', usage, durationMs, validationStatus: 'parse_error' })
    }
    return result
  }

  let rejectedRefs = 0
  const resolveThemes = (refs: string[]): string[] => {
    const ids: string[] = []
    for (const r of refs) {
      const theme = themeByLabel.get(r.toLowerCase().trim())
      if (!theme) { rejectedRefs++; continue }
      ids.push(...theme.supportingInsightIds)
    }
    return [...new Set(ids)]
  }
  const resolveCompetitive = (refs: string[]): string[] => {
    const ids: string[] = []
    for (const r of refs) {
      const ci = ciIndex.get(r.toLowerCase().trim())
      if (!ci) { rejectedRefs++; continue }
      ids.push(ci.id)
    }
    return [...new Set(ids)]
  }

  // Build market_insights rows (M# resolved after insert, in array order).
  const miRows = parsed.market_insights.map((mi) => ({
    client_id: clientId,
    run_id: runId,
    insight_type: mi.insight_type,
    title: mi.title,
    description: mi.description,
    evidence: {
      supporting_theme_ids: resolveThemes(mi.supporting_themes),
      supporting_competitive_insight_ids: resolveCompetitive(mi.supporting_competitive),
    },
    confidence_score: clampScore(mi.confidence_score),
    opportunity_score: clampScore(mi.opportunity_score),
  }))

  if (!persist) {
    result.marketInsights = miRows.map((m) => ({ id: '(unsaved)', insight_type: m.insight_type, title: m.title, confidence_score: m.confidence_score, opportunity_score: m.opportunity_score }))
    result.recommendations = parsed.recommendations.map((r) => ({ id: '(unsaved)', type: r.type, title: r.title, priority: r.priority }))
    result.rejectedRefs = rejectedRefs
    return result
  }

  // Idempotent per (client, run) — invariant 6.
  await admin.from('market_insights').delete().eq('client_id', clientId).eq('run_id', runId)
  await admin.from('recommendations').delete().eq('client_id', clientId).eq('run_id', runId)

  // Insert market insights; capture ids in order so M# maps to a real UUID.
  const miById: string[] = []
  if (miRows.length) {
    const { data: insertedMi, error } = await admin
      .from('market_insights')
      .insert(miRows)
      .select('id, insight_type, title, confidence_score, opportunity_score')
    if (error) throw new Error(`persist market_insights: ${error.message}`)
    const inserted = (insertedMi ?? []) as { id: string; insight_type: string; title: string; confidence_score: number; opportunity_score: number }[]
    // .insert preserves input order in the returned set.
    inserted.forEach((row) => miById.push(row.id))
    result.marketInsights = inserted
  }

  // Recommendations: based_on references M# (this output) and/or C#.
  const recRows = parsed.recommendations.map((rec) => {
    const ids: string[] = []
    for (const ref of rec.based_on) {
      const key = ref.toLowerCase().trim()
      if (key.startsWith('m')) {
        const idx = Number(key.slice(1)) - 1
        if (Number.isInteger(idx) && idx >= 0 && idx < miById.length) ids.push(miById[idx])
        else rejectedRefs++
      } else if (key.startsWith('c')) {
        const ci = ciIndex.get(key)
        if (ci) ids.push(ci.id)
        else rejectedRefs++
      } else {
        rejectedRefs++
      }
    }
    return {
      client_id: clientId,
      run_id: runId,
      type: rec.type,
      title: rec.title,
      reasoning: rec.reasoning,
      priority: rec.priority,
      based_on: { insight_ids: [...new Set(ids)] },
    }
  })

  if (recRows.length) {
    const { data: insertedRec, error } = await admin
      .from('recommendations')
      .insert(recRows)
      .select('id, type, title, priority')
    if (error) throw new Error(`persist recommendations: ${error.message}`)
    result.recommendations = (insertedRec ?? []) as { id: string; type: string; title: string; priority: string | null }[]
  }

  result.rejectedRefs = rejectedRefs
  await logAiCall(admin, {
    clientId, runId, pass: 'pass_d', callIndex: 1, promptVersion: PROMPT_VERSION, systemPrompt, userPrompt,
    response: { market_insights: result.marketInsights.length, recommendations: result.recommendations.length, rejected_refs: rejectedRefs },
    error: null, usage, durationMs,
    validationStatus: rejectedRefs > 0 ? 'ref_rejected' : 'ok',
  })

  return result
}
