import { zodResponseFormat } from 'openai/helpers/zod'
import { createAdminClient } from '../supabase-admin'
import { openai, samplingParams } from '../openai'
import { SYNTHESIS_MODEL, estimateCost } from '../config'
import { PassDaSchema, PassDbSchema, type PassDaOutput, type PassDbOutput, type CiSummary } from './schemas'
import { priorityForRank } from '../calibration'
import { CALIBRATED_PROSE_RULE } from './prose-rules'
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

// v2/v4 (2026-07-04): calibrated language — both prompts get the shared prose
// rule (no model-chosen intensity words; measured badges say how much), and D-b
// switches from a model-set priority field to RANKED output: array order is the
// priority, code assigns high/medium/low by position (priorityForRank).
const PROMPT_VERSION_A = 'pass_d_a_v2'
const PROMPT_VERSION_B = 'pass_d_b_v4'

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
    '   The summary is client-facing prose: NEVER include bracket indices (T1, C2, …) or any internal references',
    '   in its text — plain sentences only. Indices belong ONLY in the market_insights supporting fields.',
    '',
    'Rules:',
    `- When you refer to the brand, always call it by name, "${name}" — never "the client", "the brand", or "our brand".`,
    '- Reference supporting themes by their bracket index (e.g. "T2") and competitive insights by theirs (e.g. "C1"). Use ONLY indices present in the input.',
    '- supporting_themes must list ONLY the themes a market insight is directly distilled from — the specific themes whose comments are the evidence for the claim. Cite the few that genuinely apply (usually 1–4), never a broad list. Do NOT add a theme just to satisfy a grounding requirement: the product shows the user the actual comments behind each cited theme as proof, so an unrelated theme there is a visible defect.',
    '- Some insights are NOT distilled from comment themes at all — insights about share of voice, content volume, posting presence, or platform coverage are derived from the SHARE OF VOICE data above, not from comments. For these, return an EMPTY supporting_themes array and rely on the share-of-voice figures. Never back-fill them with comment themes.',
    '- Do NOT invent counts or percentages. confidence_score and opportunity_score are 1–10 judgments, not measured quantities.',
    CALIBRATED_PROSE_RULE,
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

// v3 (2026-07-03): open-world generation, categories tag afterwards. v2's frame
// ("content ideas, hook strategies, …") made the taxonomy the blinders — every
// action came out social-content-shaped, which reads as a content planner, not
// consumer intelligence (trigger: buyer-persona feedback, see vault Strategy
// §Retention risk). The category list must never appear as the menu of what to
// produce; it exists only for the tag-after step.
function buildSystemPromptB(brandName?: string): string {
  const name = brandName?.trim() || 'the brand'
  return [
    `You advise ${name}'s leadership on what the business should do — not just its social media team.`,
    '',
    'You are given market insights (M#) — each with the VERBATIM customer quotes behind it — plus',
    'competitive insights (C#) and share-of-voice context.',
    '',
    'Produce recommendations: the highest-value actions this evidence supports, across ANY part of the',
    'business — product and service, positioning and messaging, customer experience, pricing and access,',
    'partnerships and distribution, competitive response, audience targeting, content and communication,',
    'or anything else the evidence justifies. Never force a content answer when the evidence points at a',
    'product, service, positioning, or experience move. Mix horizons: quick wins alongside bigger moves',
    'that take a quarter — a recommendation is never too big to state if the evidence carries it.',
    '',
    'Only after deciding a recommendation, tag it with the closest type from the schema. If none genuinely',
    'fits, use type "other" and put a short snake_case category of your own in custom_category',
    '(set custom_category to null for every named type).',
    '',
    'Rules:',
    `- When you refer to the brand, always call it by name, "${name}" — never "the client", "the brand", or "our brand".`,
    '- Each recommendation must be concrete enough to start acting on: name the move, the angle, the audience,',
    '  or the change. "Post more educational content" and "improve customer experience" are failures;',
    '  a specific action drawn from the quotes is the standard.',
    '- Ground reasoning in the evidence, but NEVER copy customer quotes verbatim into the title or reasoning:',
    '  raw comments are often fragments and in many languages, so out of context they read as noise. Paraphrase',
    '  what customers are saying in plain English instead (translating where needed). The product shows the real',
    '  quotes behind every recommendation via its evidence link, so your prose never needs to reproduce them.',
    '  (Hooks, titles, or example questions you AUTHOR yourself may of course be quoted.)',
    '- based_on lists the market insights a recommendation follows from as "M1", "M2" … and/or competitive insights as "C1" …',
    '  Use ONLY indices present in the input.',
    '- Do NOT invent counts or percentages.',
    CALIBRATED_PROSE_RULE,
    '- ORDER IS PRIORITY: return recommendations ranked, most important first. There is no priority field —',
    '  the product labels your first recommendation "Act now" and the next two "Plan next", so rank deliberately.',
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

  const db = await runDbCall({
    admin, clientId, runId, brandName: opts.brandName, sov,
    insightsForB, miById, ciIndex, persist,
    initialRejectedRefs: rejectedRefs,
  })
  result.recommendations = db.recommendations
  result.promptTokens += db.promptTokens
  result.completionTokens += db.completionTokens
  result.costUsd += db.costUsd
  result.rejectedRefs = db.rejectedRefs
  return result
}

// ---- D-b call proper — shared by runPassD and rerunPassDb --------------------

interface RunDbCallArgs {
  admin: ReturnType<typeof createAdminClient>
  clientId: string
  runId: string
  brandName?: string
  sov?: Record<string, SovEntry>
  insightsForB: MarketInsightForB[]
  /** market_insights UUIDs in M# order (M1 → index 0). */
  miById: string[]
  ciIndex: Map<string, PersistedCompetitiveInsight>
  persist: boolean
  /** Rerun path: clear the run's existing recommendations before inserting
   * (runPassD already cleared them alongside market_insights). */
  replaceExisting?: boolean
  /** Carried over from D-a's reference resolution so the D-b log stays cumulative. */
  initialRejectedRefs?: number
}

interface RunDbCallResult {
  recommendations: RunPassDResult['recommendations']
  rejectedRefs: number
  promptTokens: number
  completionTokens: number
  costUsd: number
}

async function runDbCall(args: RunDbCallArgs): Promise<RunDbCallResult> {
  const { admin, clientId, runId, sov, insightsForB, miById, ciIndex, persist } = args
  let rejectedRefs = args.initialRejectedRefs ?? 0
  const out: RunDbCallResult = { recommendations: [], rejectedRefs, promptTokens: 0, completionTokens: 0, costUsd: 0 }

  const systemPromptB = buildSystemPromptB(args.brandName)
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
  out.promptTokens = b.usage.prompt_tokens
  out.completionTokens = b.usage.completion_tokens
  out.costUsd = estimateCost(SYNTHESIS_MODEL, b.usage.prompt_tokens, b.usage.completion_tokens)

  if (!b.parsed) {
    if (persist) {
      await logAiCall(admin, { clientId, runId, pass: 'pass_d_b', callIndex: 1, model: SYNTHESIS_MODEL, promptVersion: PROMPT_VERSION_B, systemPrompt: systemPromptB, userPrompt: userPromptB, response: { refusal: true }, error: 'no parsed output', usage: b.usage, durationMs: b.durationMs, validationStatus: 'parse_error' })
    }
    return out
  }

  // 'other' persists as the model's own label so novel categories surface as
  // themselves (CategoryChip renders any string); recurring labels are the
  // promote-into-the-enum signal. Falls back to 'other' on an unusable label.
  const slugify = (s: string) =>
    s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)

  // Recommendations: based_on references M# (D-a's output) and/or C#.
  // priority is positional (calibrated language): output rank → high/medium/low.
  const recRows = b.parsed.recommendations.map((rec, rank) => {
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
      type: (rec.type === 'other' && rec.custom_category && slugify(rec.custom_category)) || rec.type,
      title: rec.title,
      reasoning: rec.reasoning,
      priority: priorityForRank(rank),
      based_on: { insight_ids: [...new Set(ids)] },
    }
  })

  if (persist) {
    // Replace only after a successful parse — a failed call leaves the old rows.
    if (args.replaceExisting) {
      const { error } = await admin.from('recommendations').delete().eq('client_id', clientId).eq('run_id', runId)
      if (error) throw new Error(`clear recommendations: ${error.message}`)
    }
    if (recRows.length) {
      const { data: insertedRec, error } = await admin
        .from('recommendations')
        .insert(recRows)
        .select('id, type, title, priority')
      if (error) throw new Error(`persist recommendations: ${error.message}`)
      out.recommendations = (insertedRec ?? []) as RunDbCallResult['recommendations']
    }
    await logAiCall(admin, {
      clientId, runId, pass: 'pass_d_b', callIndex: 1, model: SYNTHESIS_MODEL, promptVersion: PROMPT_VERSION_B, systemPrompt: systemPromptB, userPrompt: userPromptB,
      response: { recommendations: recRows.length, rejected_refs: rejectedRefs },
      error: null, usage: b.usage, durationMs: b.durationMs,
      validationStatus: rejectedRefs > 0 ? 'ref_rejected' : 'ok',
    })
  } else {
    out.recommendations = recRows.map((r) => ({ id: '(unsaved)', type: r.type, title: r.title, priority: r.priority }))
  }

  out.rejectedRefs = rejectedRefs
  return out
}

/**
 * Re-run ONLY D-b for a run whose market/competitive insights are already
 * persisted: regenerate the recommendations in place without re-rolling the
 * rest of the synthesis. The operator tool for recommendation prompt
 * iteration (first use: purging embedded verbatim quotes, pass_d_b_v2).
 */
export async function rerunPassDb(opts: { clientId: string; runId: string; persist?: boolean }): Promise<RunDbCallResult> {
  const { clientId, runId } = opts
  const persist = opts.persist ?? true
  const admin = createAdminClient()

  const [clientRes, miRes, ciRes, rsRes] = await Promise.all([
    admin.from('clients').select('company_name').eq('id', clientId).maybeSingle(),
    admin.from('market_insights').select('id, title, description, evidence')
      .eq('client_id', clientId).eq('run_id', runId)
      .order('opportunity_score', { ascending: false }),
    admin.from('competitive_insights').select('id, category, competitor_name, title, finding, impact_level')
      .eq('client_id', clientId).eq('run_id', runId)
      .order('id', { ascending: true }),
    admin.from('run_summary').select('share_of_voice')
      .eq('client_id', clientId).eq('run_id', runId).maybeSingle(),
  ])
  if (miRes.error) throw new Error(`load market_insights: ${miRes.error.message}`)
  if (ciRes.error) throw new Error(`load competitive_insights: ${ciRes.error.message}`)

  const mi = (miRes.data ?? []) as { id: string; title: string; description: string; evidence: { supporting_theme_ids?: string[] } | null }[]
  const competitive = (ciRes.data ?? []) as PersistedCompetitiveInsight[]
  const sov = (rsRes.data?.share_of_voice ?? undefined) as Record<string, SovEntry> | undefined

  const insightsForB: MarketInsightForB[] = []
  const miById: string[] = []
  for (let i = 0; i < mi.length; i++) {
    const row = mi[i]
    miById.push(row.id)
    insightsForB.push({
      index: `M${i + 1}`,
      title: row.title,
      description: row.description,
      quotes: await retrieveQuotes(admin, row.evidence?.supporting_theme_ids ?? [], QUOTES_PER_INSIGHT),
    })
  }
  const ciIndex = new Map<string, PersistedCompetitiveInsight>()
  competitive.forEach((ci, i) => ciIndex.set(`c${i + 1}`, ci))

  if (insightsForB.length === 0 && ciIndex.size === 0) {
    return { recommendations: [], rejectedRefs: 0, promptTokens: 0, completionTokens: 0, costUsd: 0 }
  }

  return runDbCall({
    admin, clientId, runId,
    brandName: clientRes.data?.company_name ?? undefined, sov,
    insightsForB, miById, ciIndex, persist, replaceExisting: true,
  })
}
