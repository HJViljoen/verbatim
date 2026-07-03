// Curation gate (Redesign Spec §1) — the two display tiers applied across the
// data pages: Confirmed findings headline, Early signals are honestly framed
// as "worth watching, not yet confirmed", everything else lives in collapsed
// archives. Scores gate and order but are NEVER displayed as numbers — pages
// show a "Strong evidence" / "Early signal" chip instead. Thresholds live here
// (config, not hard-code) so they can be tuned on live output; flagged for
// review on real Ossur data after the first build pass (spec §10).

export const CURATION_GATE = {
  /** Confirmed: model confidence ≥ this AND sources ≥ confirmedMinSources. */
  confirmedMinScore: 7,
  /** Confirmed: minimum distinct supporting references (themes, insights). */
  confirmedMinSources: 2,
  /** Early signal: below the confirmed gate but scored at least this. */
  earlySignalMinScore: 6,
} as const

export type GateTier = 'confirmed' | 'early_signal' | 'archive'

/** Classify one scored, source-referenced finding into its display tier. */
export function gateTier(score: number | null | undefined, sourceCount: number): GateTier {
  const s = Number(score ?? 0)
  if (s >= CURATION_GATE.confirmedMinScore && sourceCount >= CURATION_GATE.confirmedMinSources) return 'confirmed'
  if (s >= CURATION_GATE.earlySignalMinScore) return 'early_signal'
  return 'archive'
}
