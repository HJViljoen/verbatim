import { z } from 'zod'

// Pass A output schema (Architecture/Analysis-Passes §Pass A) for OpenAI
// structured outputs via zodResponseFormat. The enum arrays below are the
// single source of truth and must stay aligned with the DB CHECK constraints
// (videos_classified_type_check, videos_hook_style_check,
// audience_insights_emotion_check) — model output that passes zod also passes
// the constraint.
//
// NOTE: no numeric/array size constraints (min/max/minItems) are placed on the
// schema sent to OpenAI — strict structured-output mode doesn't support them.
// Ranges (strength_score 1–10, non-empty evidence) are enforced post-parse.

export const CLASSIFIED_TYPES = [
  'tutorial', 'review', 'comparison', 'testimonial', 'unboxing', 'how-to',
  'story', 'challenge', 'behind-the-scenes', 'educational', 'promotional',
  'entertainment',
] as const

export const HOOK_STYLES = [
  'question', 'statistic', 'bold-claim', 'personal-story', 'before-after',
  'controversy', 'demonstration', 'listicle', 'trend-riding', 'shock-value',
] as const

export const VIDEO_SENTIMENTS = ['positive', 'negative', 'neutral', 'mixed'] as const

export const INSIGHT_CATEGORIES = [
  'pain_point', 'question', 'purchase_intent', 'feature_request', 'praise',
  'objection', 'misinformation', 'demographic_signal',
  // v5 pull-forwards (Redesign Spec 2026-07-03 §8, Pass A v3):
  'switching_signal', 'buying_trigger',
] as const

export const JOURNEY_STAGES = [
  'awareness', 'consideration', 'purchase', 'ownership', 'advocacy',
] as const

export const EMOTIONS = [
  'frustrated', 'excited', 'confused', 'angry', 'joyful', 'disappointed',
  'hopeful', 'curious', 'neutral',
] as const

export const SENTIMENT_IMPACTS = ['positive', 'negative', 'neutral'] as const

const evidenceSchema = z.object({
  quote: z.string(),
  comment_id: z.string(),
})

const insightSchema = z.object({
  category: z.enum(INSIGHT_CATEGORIES),
  theme: z.string(),
  description: z.string(),
  evidence: z.array(evidenceSchema),
  strength_score: z.number().int(),
  emotion: z.enum(EMOTIONS),
  sentiment_impact: z.enum(SENTIMENT_IMPACTS),
  // null when the comments don't reveal where the audience sits in the journey.
  journey_stage: z.enum(JOURNEY_STAGES).nullable(),
})

// Verbatim customer phrasing worth reusing in marketing copy — validated
// post-parse against the referenced comment exactly like insight evidence.
const languageSampleSchema = z.object({
  phrase: z.string(),
  comment_id: z.string(),
})

const classificationSchema = z.object({
  classified_type: z.enum(CLASSIFIED_TYPES),
  hook_style: z.enum(HOOK_STYLES),
  hook_text: z.string(),
  topics: z.array(z.string()),
  // null for metadata-only videos (<5 comments) — sentiment can't be derived
  // from comment reception when there are no comments.
  sentiment: z.enum(VIDEO_SENTIMENTS).nullable(),
})

/** Per-video Pass A output (videos with >=5 comments). */
export const PassAVideoSchema = z.object({
  classification: classificationSchema,
  insights: z.array(insightSchema),
  language_samples: z.array(languageSampleSchema),
})

export type PassAVideoOutput = z.infer<typeof PassAVideoSchema>
export type PassAClassification = z.infer<typeof classificationSchema>
export type PassAInsight = z.infer<typeof insightSchema>
export type PassALanguageSample = z.infer<typeof languageSampleSchema>

// --- Pass C / Pass D (Architecture/Analysis-Passes §Pass C, §Pass D) ----------
// DB-enforced enums are only impact_level / priority and the 1–10 score ranges;
// category / insight_type / rec type have NO DB CHECK and are app-level vocab.
// Scores (confidence/opportunity) are model JUDGMENT, allowed like strength_score
// — raw counts/percentages are never model-emitted (invariant 5). Upstream record
// references are short indices (T#/C#/M#) here, mapped to UUIDs in code (invariant 8).

export const COMPETITIVE_CATEGORIES = [
  'topic_ownership', 'content_gap', 'competitive_threat', 'sentiment_differential',
  'notable_account', 'organic_vs_paid', 'engagement_benchmark',
] as const

export const IMPACT_LEVELS = ['high', 'medium', 'low'] as const

const competitiveInsightSchema = z.object({
  category: z.enum(COMPETITIVE_CATEGORIES),
  competitor_name: z.string().nullable(),
  title: z.string(),
  finding: z.string(),
  // Theme indices (e.g. "T1") from the prompt — mapped to audience_insights ids in code.
  supporting_themes: z.array(z.string()),
  impact_level: z.enum(IMPACT_LEVELS),
})

export const PassCSchema = z.object({ competitive_insights: z.array(competitiveInsightSchema) })
export type PassCOutput = z.infer<typeof PassCSchema>
export type CompetitiveInsightOut = z.infer<typeof competitiveInsightSchema>

export const MARKET_INSIGHT_TYPES = [
  'unmet_need', 'platform_pattern', 'industry_signal', 'cross_platform_synthesis', 'sentiment_trajectory',
] as const

// Decision-grade taxonomy (2026-07-03): tags applied AFTER open-world
// generation, never the generative frame — the D-b prompt recommends whatever
// the evidence supports and then labels it with the closest type. 'other' +
// custom_category is the escape hatch for categories we didn't think to name;
// a recurring custom label is the signal to promote it into this list.
export const RECOMMENDATION_TYPES = [
  'product', 'positioning_messaging', 'customer_experience', 'competitive_response',
  'audience_targeting', 'content_communication', 'other',
] as const

// DB/UI priority vocabulary. NOT model-emitted since pass_d_b_v4: absolute
// priority judgment inflates (3 Jul run: 4 of 4 recs "high"), so the model
// RANKS its recommendations (output order) and code assigns the priority by
// position — lib/calibration.ts priorityForRank. Forced scarcity is what makes
// "Act now" mean something.
export const PRIORITIES = ['high', 'medium', 'low'] as const

const marketInsightSchema = z.object({
  insight_type: z.enum(MARKET_INSIGHT_TYPES),
  title: z.string(),
  description: z.string(),
  supporting_themes: z.array(z.string()),       // T# indices
  supporting_competitive: z.array(z.string()),  // C# indices
  confidence_score: z.number().int(),
  opportunity_score: z.number().int(),
})

// Ranked output: array order IS the priority (strictest first) — see the
// PRIORITIES note above. No priority field for the model to inflate.
const recommendationSchema = z.object({
  type: z.enum(RECOMMENDATION_TYPES),
  // The model's own short snake_case label when type is 'other'; null otherwise.
  custom_category: z.string().nullable(),
  title: z.string(),
  reasoning: z.string(),
  based_on: z.array(z.string()),  // M# (market insights in this output) / C# indices
  // The one place a raw verbatim belongs: the single most representative real
  // customer quote behind this recommendation, copied EXACTLY from the quotes
  // shown to the model. Validated in code against those quotes — a value that
  // doesn't match one is dropped (never show a quote the customer didn't say).
  hero_quote: z.string(),
})

// The "someone already read everything for you" block leading Market
// Intelligence (Spec §3). Item counts (top 3) are prompt-enforced — strict
// structured outputs don't support maxItems.
const ciSummarySchema = z.object({
  top_unmet_needs: z.array(z.string()),
  top_buying_triggers: z.array(z.string()),
  top_differentiators: z.array(z.string()),
  emotional_snapshot: z.string(),
  threats: z.array(z.string()),
})

/** Pass D-a — market insights + consumer-intelligence summary. */
export const PassDaSchema = z.object({
  market_insights: z.array(marketInsightSchema),
  consumer_intelligence_summary: ciSummarySchema,
})
export type PassDaOutput = z.infer<typeof PassDaSchema>
export type CiSummary = z.infer<typeof ciSummarySchema>

/** Pass D-b — recommendations, grounded via retrieved verbatim evidence. */
export const PassDbSchema = z.object({
  recommendations: z.array(recommendationSchema),
  // Per market insight (by its M# index): the single most representative real
  // customer quote, copied EXACTLY from the quotes shown for that insight. Code
  // validates each against the shown quotes and writes it to market_insights.hero_quote.
  insight_hero_quotes: z.array(z.object({ index: z.string(), quote: z.string() })),
})
export type PassDbOutput = z.infer<typeof PassDbSchema>
export type MarketInsightOut = z.infer<typeof marketInsightSchema>
export type RecommendationOut = z.infer<typeof recommendationSchema>

// --- Pass B (Redesign Spec §8) — canonical theme labels ----------------------
// One call over Step A2's clustered themes: each T# gets a clean, human,
// client-facing label + one-sentence description. Labels become page headlines.

const themeLabelSchema = z.object({
  // The T# index of the theme being labelled — must exist in the input.
  index: z.string(),
  label: z.string(),
  description: z.string(),
})

export const PassBSchema = z.object({ theme_labels: z.array(themeLabelSchema) })
export type PassBOutput = z.infer<typeof PassBSchema>
export type ThemeLabelOut = z.infer<typeof themeLabelSchema>
