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
