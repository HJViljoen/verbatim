import { zodResponseFormat } from 'openai/helpers/zod'
import { createAdminClient } from '../supabase-admin'
import { openai, samplingParams } from '../openai'
import { SYNTHESIS_MODEL, estimateCost } from '../config'
import { PassDaSchema, PassDbSchema, type PassDaOutput, type PassDbOutput, type CiSummary } from './schemas'
import { logAiCall } from './ai-log'
import { indexThemes, type PersistedCompetitiveInsight } from './pass-c'
import type { AggregatedTheme, SovEntry } from './types'

// Pass D — market intelligence + recommendations, SPLIT per Redesign Spec
// 2026-07-03 §8 into two calls:
//   D-a: market insights + the consumer_intelligence_summary (the "someone
//        already read everything for you" block leading Market Intelligence).
//   D-b: recommendations, grounded via evidence retrieval — the model sees the
//        actual verbatim quotes behind each market insight's themes, which is
//        the fix for generic recommendations (trigger: the 2026-07-03 Ossur run).
// Themes (T#) and competitive insights (C#) are referenced by index; D-b
// references D-a's market insights by M#. Code maps every index back to a UUID
// and rejects unknowns (invariant 8).

const PROMPT_VERSION_A = 'pass_d_a_v1'
const PROMPT_VERSION_B = 'pass_d_b_v1'

/** Max verbatim quotes retrieved per market insight for the D-b prompt. */
const QUOTES_PER_INSIGHT = 6

const clampScore = (n: number) => Math.max(1, Math.min(10, Math.round(n)))

export interface RunPassDOptions {
  clientId: string
  runId: string
  themes: AggregatedTheme[]
  competitiveInsights?: PersistedCompetitiveInsight[]
  /** The client's display name (clients.company_name) — insights name it directly. */
  brandName?: string
  sov?: Record<string, SovEntry>
  persist?: boolean
  dryRun?: boolean
}

export interface RunPassDResult {
  marketInsights: { id: string; insight_type: string; title: string; confidence_score: number; opportunity_score: number }[]
  recommendations: { id: string; type: string; title: string; priority: string | null }[]
  ciSummary: CiSummary | null
  rejectedRefs: number
  promptTokens: number
  completionTokens: number
  costUsd: number
  dryRun: boolean
}

// ---- D-a: market insights + CI summary --------------------------------------

function buildSystemPromptA(brandName?: string): string {
  const name = brandName?.trim() || 'the brand'
  return [
    `You are a media-based consumer intelligence analyst producing the strategic output that ${name} pays for.`,
    '',
    'You are given audience themes (distilled from real comments) and, if present, competitive insights.',
    'Synthesise across the whole conversation — not one theme at a time.',
    '',
    'Produce two things:',
    '1. market_insights — patterns that span themes: unmet needs, platform patterns, industry signals,',
    '   cross-platform synthesis, sentiment trajectory. Look at the market, not a single bucket.',
    '2. consumer_intelligence_summary — the at-a-glance read of the whole corpus:',
    '   - top_unmet_needs: the 3 (at most) clearest unmet needs in the conversation.',
    '   - top_buying_triggers: the 3 (at most) clearest events/reasons that push people to buy.',
    '   - top_differentiators: the 3 (at most) clearest things that set brands apart in this conversation (name the brand each favours).',
    '   - emotional_snapshot: 1–2 sentences on the dominant feelings in the audience.',
    '   - threats: up to 3 findings that should worry ' + name + ' (empty array if none are genuine).',
    '   Every summary item must trace back to the themes/competitive insights below — nothing invented, no numbers.',
    '',
    'Rules:',
    `- When you refer to the brand, always call it by name, "${name}" — never "the client", "the brand", or "our brand".`,
    '- Reference supporting themes by their bracket index (e.g. "T2") and competitive insights by theirs (e.g. "C1"). Use ONLY indices present in the input.',
    '- supporting_themes must list ONLY the themes a market insight is directly distilled from — the specific themes whose comments are the evidence for the claim. Cite the few that genuinely apply (usually 1–4), never a broad list. Do NOT add a theme just to satisfy a grounding requirement: the product shows the user the actual comments behind each cited theme as proof, so an unrelated theme there is a visible defect.',
    '- Some insights are NOT distilled from comment themes at all — insights about share of voice, content volume, posting presence, or platform coverage are derived from the SHARE OF VOICE data above, not from comments. For these, return an EMPTY supporting_themes array and rely on the share-of-voice figures. Never back-fill them with comment themes.',
    '- Do NOT invent counts or percentages. confidence_score and opportunity_score are 1–10 judgments, not measured quantities.',
    '- If the data is thin, produce fewer, honest insights rather than padding. Fewer, tightly-grounded insights beat many loosely-grounded ones.',
  ].join('\n')
}

function themeLine(label: string, theme: AggregatedTheme): string {
  const name = theme.label ?? theme.theme
  return (
    `[${label}] bucket=${theme.bucket} category=${theme.category} "${name}" ` +
    `· ${theme.evidenceCount} videos · strength ${theme.strengthScore} · ${theme.dominantEmotion}/${theme.dominantSentimentImpact}`
  )
}

function buildUserPromptA(
  themeIndex: { label: string; theme: AggregatedTheme }[],
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
  for (const { label, theme } of themeIndex) lines.push(themeLine(label, theme))
  if (ciIndex.size) {
    lines.push('', `COMPETITIVE INSIGHTS (${ciIndex.size})`)
    let i = 0
    for (const [, ci] of ciIndex) {
      i++
      lines.push(`[C${i}] category=${ci.category} ${ci.competitor_name ? `competitor=${ci.competitor_name} ` : ''}— ${ci.title}: ${ci.finding}`)
    }
  }
  return lines.join('\n')
}

// ---- D-b: grounded recommendations ------------------------------------------

function buildSystemPromptB(brandName?: string): string {
  const name = brandName?.trim() || 'the brand'
  return [
    `You are a media-based consumer intelligence analyst turning findings into actions for ${name}.`,
    '',
    'You are given market insights (M#) — each with the VERBATIM customer quotes behind it — plus',
    'competitive insights (C#) and share-of-voice context.',
    '',
    'Produce recommendations: concrete, specific actions grounded in what customers actually said —',
    'content ideas, hook strategies, urgent topics, competitive moves, audience targets, platform strategies.',
    '',
    'Rules:',
    `- When you refer to the brand, always call it by name, "${name}" — never "the client", "the brand", or "our brand".`,
    '- Each recommendation must be specific enough to act on this week. "Post more educational content" is a failure;',
    '  a concrete angle, hook, topic, or audience drawn from the quotes is the standard.',
    '- Ground reasoning in the evidence: reference what customers say (echo their actual language where it strengthens the case).',
    '- based_on lists the market insights a recommendation follows from as "M1", "M2" … and/or competitive insights as "C1" …',
    '  Use ONLY indices present in the input.',
    '- Do NOT invent counts or percentages.',
    '- Fewer, sharper recommendations beat a padded list. Every one must be worth the client\'s time.',
  ].join('\n')
}

interface MarketInsightForB {
  index: string
  title: string
  description: string
  quotes: string[]
}

function buildUserPromptB(
  insights: MarketInsightForB[],
  ciIndex: Map<string, PersistedCompetitiveInsight>,
  sov: Record<string, SovEntry> | undefined,
): string {
  const lines: string[] = []
  if (sov && Object.keys(sov).length) {
    lines.push('SHARE OF VOICE (by bucket):')
    for (const [bucket, e] of Object.entries(sov)) lines.push(`- ${bucket}: ${e.videos} videos (${e.pct_videos}%)`)
    lines.push('')
  }
  lines.push(`MARKET INSIGHTS (${insights.length})`)
  for (const mi of insights) {
    lines.push(`[${mi.index}] ${mi.title} — ${mi.description}`)
    for (const q of mi.quotes) lines.push(`    · "${q}"`)
  }
  if (ciIndex.size) {
    lines.push('', `COMPETITIVE INSIGHTS (${ciIndex.size})`)
    let i = 0
    for (const [, ci] of ciIndex) {
      i++
      lines.push(`[C${i}] category=${ci.category} ${ci.competitor_name ? `competitor=${ci.competitor_name} ` : ''}— ${ci.title}: ${ci.finding}`)
    }
  }
  return lines.join('\n')
}

/** Verbatim quotes behind a set of audience_insights ids, best-ranked first. */
async function retrieveQuotes(
  admin: ReturnType<typeof createAdminClient>,
  insightIds: string[],
  cap: number,
): Promise<string[]> {
  if (insightIds.length === 0 || cap === 0) return []
  const quotes: string[] = []
  const CHUNK = 100
  for (let i = 0; i < insightIds.length && quotes.length < cap; i += CHUNK) {
    const { data, error } = await admin
      .from('insight_evidence')
      .select('quote')
      .in('audience_insight_id', insightIds.slice(i, i + CHUNK))
      .order('relevance_rank', { ascending: true })
      .limit(cap - quotes.length)
    if (error) throw new Error(`retrieve evidence: ${error.message}`)
    for (const row of data ?? []) {
      const q = (row.quote ?? '').trim()
      if (q) quotes.push(q)
    }
  }
  return quotes
}

// ---- orchestration -----------------------------------------------------------

type ParsedCall<T> = { parsed: T | null; usage: { prompt_tokens: number; completion_tokens: number }; durationMs: number }

async function structuredCall<T>(
  schema: Parameters<typeof zodResponseFormat>[0],
  schemaName: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<ParsedCall<T>> {
  const startedAt = Date.now()
  const completion = await openai.chat.completions.parse({
    model: SYNTHESIS_MODEL,
    ...samplingParams(SYNTHESIS_MODEL),
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: zodResponseFormat(schema, schemaName),
  })
  const usage = completion.usage
    ? { prompt_tokens: completion.usage.prompt_tokens, completion_tokens: completion.usage.completion_tokens }
    : { prompt_tokens: 0, completion_tokens: 0 }
  return { parsed: (completion.choices[0]?.message?.parsed ?? null) as T | null, usage, durationMs: Date.now() - startedAt }
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

  const result: RunPassDResult = {
    marketInsights: [],
    recommendations: [],
    ciSummary: null,
    rejectedRefs: 0,
    promptTokens: 0,
    completionTokens: 0,
    costUsd: 0,
    dryRun,
  }
  if (dryRun) return result

  // ---- D-a: market insights + CI summary ----
  const systemPromptA = buildSystemPromptA(opts.brandName)
  const userPromptA = buildUserPromptA(themeIndex, ciIndex, sov)

  let a: ParsedCall<PassDaOutput>
  try {
    a = await structuredCall<PassDaOutput>(PassDaSchema, 'pass_d_a', systemPromptA, userPromptA)
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    if (persist) {
      await logAiCall(admin, { clientId, runId, pass: 'pass_d_a', callIndex: 1, model: SYNTHESIS_MODEL, promptVersion: PROMPT_VERSION_A, systemPrompt: systemPromptA, userPrompt: userPromptA, response: null, error, usage: { prompt_tokens: 0, completion_tokens: 0 }, durationMs: 0, validationStatus: 'parse_error' })
    }
    throw new Error(`Pass D-a call failed: ${error}`)
  }
  result.promptTokens += a.usage.prompt_tokens
  result.completionTokens += a.usage.completion_tokens
  result.costUsd += estimateCost(SYNTHESIS_MODEL, a.usage.prompt_tokens, a.usage.completion_tokens)

  if (!a.parsed) {
    if (persist) {
      await logAiCall(admin, { clientId, runId, pass: 'pass_d_a', callIndex: 1, model: SYNTHESIS_MODEL, promptVersion: PROMPT_VERSION_A, systemPrompt: systemPromptA, userPrompt: userPromptA, response: { refusal: true }, error: 'no parsed output', usage: a.usage, durationMs: a.durationMs, validationStatus: 'parse_error' })
    }
    return result
  }
  result.ciSummary = a.parsed.consumer_intelligence_summary

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

  // Build market_insights rows (M# = 1-based array order).
  const miRows = a.parsed.market_insights.map((mi) => ({
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

  const miById: string[] = []
  if (persist) {
    // Idempotent per (client, run) — invariant 6.
    await admin.from('market_insights').delete().eq('client_id', clientId).eq('run_id', runId)
    await admin.from('recommendations').delete().eq('client_id', clientId).eq('run_id', runId)

    if (miRows.length) {
      const { data: insertedMi, error } = await admin
        .from('market_insights')
        .insert(miRows)
        .select('id, insight_type, title, confidence_score, opportunity_score')
      if (error) throw new Error(`persist market_insights: ${error.message}`)
      const inserted = (insertedMi ?? []) as typeof result.marketInsights
      // .insert preserves input order in the returned set.
      inserted.forEach((row) => miById.push(row.id))
      result.marketInsights = inserted
    }
    await logAiCall(admin, {
      clientId, runId, pass: 'pass_d_a', callIndex: 1, model: SYNTHESIS_MODEL, promptVersion: PROMPT_VERSION_A, systemPrompt: systemPromptA, userPrompt: userPromptA,
      response: { market_insights: miRows.length, ci_summary: true, rejected_refs: rejectedRefs },
      error: null, usage: a.usage, durationMs: a.durationMs,
      validationStatus: rejectedRefs > 0 ? 'ref_rejected' : 'ok',
    })
  } else {
    result.marketInsights = miRows.map((m) => ({ id: '(unsaved)', insight_type: m.insight_type, title: m.title, confidence_score: m.confidence_score, opportunity_score: m.opportunity_score }))
  }

  // ---- D-b: recommendations grounded in retrieved verbatim evidence ----
  const insightsForB: MarketInsightForB[] = []
  for (let i = 0; i < miRows.length; i++) {
    const row = miRows[i]
    insightsForB.push({
      index: `M${i + 1}`,
      title: row.title,
      description: row.description,
      quotes: await retrieveQuotes(admin, row.evidence.supporting_theme_ids, QUOTES_PER_INSIGHT),
    })
  }

  if (insightsForB.length === 0 && ciIndex.size === 0) return result

  const systemPromptB = buildSystemPromptB(opts.brandName)
  const userPromptB = buildUserPromptB(insightsForB, ciIndex, sov)

  let b: ParsedCall<PassDbOutput>
  try {
    b = await structuredCall<PassDbOutput>(PassDbSchema, 'pass_d_b', systemPromptB, userPromptB)
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    if (persist) {
      await logAiCall(admin, { clientId, runId, pass: 'pass_d_b', callIndex: 1, model: SYNTHESIS_MODEL, promptVersion: PROMPT_VERSION_B, systemPrompt: systemPromptB, userPrompt: userPromptB, response: null, error, usage: { prompt_tokens: 0, completion_tokens: 0 }, durationMs: 0, validationStatus: 'parse_error' })
    }
    throw new Error(`Pass D-b call failed: ${error}`)
  }
  result.promptTokens += b.usage.prompt_tokens
  result.completionTokens += b.usage.completion_tokens
  result.costUsd += estimateCost(SYNTHESIS_MODEL, b.usage.prompt_tokens, b.usage.completion_tokens)

  if (!b.parsed) {
    if (persist) {
      await logAiCall(admin, { clientId, runId, pass: 'pass_d_b', callIndex: 1, model: SYNTHESIS_MODEL, promptVersion: PROMPT_VERSION_B, systemPrompt: systemPromptB, userPrompt: userPromptB, response: { refusal: true }, error: 'no parsed output', usage: b.usage, durationMs: b.durationMs, validationStatus: 'parse_error' })
    }
    result.rejectedRefs = rejectedRefs
    return result
  }

  // Recommendations: based_on references M# (D-a's output) and/or C#.
  const recRows = b.parsed.recommendations.map((rec) => {
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

  if (persist) {
    if (recRows.length) {
      const { data: insertedRec, error } = await admin
        .from('recommendations')
        .insert(recRows)
        .select('id, type, title, priority')
      if (error) throw new Error(`persist recommendations: ${error.message}`)
      result.recommendations = (insertedRec ?? []) as typeof result.recommendations
    }
    await logAiCall(admin, {
      clientId, runId, pass: 'pass_d_b', callIndex: 1, model: SYNTHESIS_MODEL, promptVersion: PROMPT_VERSION_B, systemPrompt: systemPromptB, userPrompt: userPromptB,
      response: { recommendations: recRows.length, rejected_refs: rejectedRefs },
      error: null, usage: b.usage, durationMs: b.durationMs,
      validationStatus: rejectedRefs > 0 ? 'ref_rejected' : 'ok',
    })
  } else {
    result.recommendations = recRows.map((r) => ({ id: '(unsaved)', type: r.type, title: r.title, priority: r.priority }))
  }

  result.rejectedRefs = rejectedRefs
  return result
}
