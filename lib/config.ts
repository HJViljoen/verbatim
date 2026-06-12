// Pipeline configuration constants. Centralised so the model and thresholds
// are a one-line change — see Analysis-Passes invariants 8–9 and Step A2.

/**
 * OpenAI model for all analysis passes. v4.1 chose gpt-4.1-mini (2026-04);
 * invariant 9 says re-evaluate the cheap-model landscape at build time before
 * the first Pass A run. Swapping is a one-line change here.
 */
export const ANALYSIS_MODEL = 'gpt-4.1-mini'

/**
 * Minimum distinct source videos for a theme to survive Step A2 aggregation.
 * Configurable because the floor collides with thin corpora — a demo/thin-data
 * run may drop this to 1 and badge single-source themes rather than ship empty.
 */
export const EVIDENCE_FLOOR = 2
