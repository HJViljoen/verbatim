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
  /** Confirmed ALSO needs this many distinct videos behind it once they are
   *  counted (`groundedTier`, lib/market-tiles.ts). Confidence and a source
   *  count are the model's own bookkeeping; "Strong evidence" printed beside
   *  "9 of 1,782 videos behind it" (Sealand, 27 Sep) is the badge claiming a
   *  volume the count beside it disproves. Below the floor a confirmed
   *  conclusion reads as an early signal. 25 is a default (walkthrough, 29
   *  Sep): on Sealand's 27 Sep update it keeps the five conclusions on 41 to
   *  258 videos and moves the one on 9; 1 is the rule before this floor. */
  confirmedMinVideos: 25,
  /** Early signal: below the confirmed gate but scored at least this. Also the
   *  bar a single-source THEME must clear to be badged "Early signal" on the
   *  pages — without it the term diluted to nothing (2026-07-04: 127 of 140
   *  themes were single-source; 105 scored ≤5). Sub-bar singles live in a
   *  collapsed "also heard once" archive. */
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
