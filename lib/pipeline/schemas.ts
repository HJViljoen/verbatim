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
})

export type PassAVideoOutput = z.infer<typeof PassAVideoSchema>
export type PassAClassification = z.infer<typeof classificationSchema>
export type PassAInsight = z.infer<typeof insightSchema>

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

export const RECOMMENDATION_TYPES = [
  'content_idea', 'hook_strategy', 'urgent_topic', 'competitive_move', 'audience_target', 'platform_strategy',
] as const

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

const recommendationSchema = z.object({
  type: z.enum(RECOMMENDATION_TYPES),
  title: z.string(),
  reasoning: z.string(),
  based_on: z.array(z.string()),  // M# (market insights in this output) / C# indices
  priority: z.enum(PRIORITIES),
})

export const PassDSchema = z.object({
  market_insights: z.array(marketInsightSchema),
  recommendations: z.array(recommendationSchema),
})
export type PassDOutput = z.infer<typeof PassDSchema>
export type MarketInsightOut = z.infer<typeof marketInsightSchema>
export type RecommendationOut = z.infer<typeof recommendationSchema>
