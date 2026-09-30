// The written read's inputs (plan "Verbatim, writing back", T1 and T2).
//
// CODE OWNS EVERY FACT HERE. A pool candidate and a standing fact are what the
// writer (T3) is handed and what compose checks it against: which themes carry
// a week's finding, how many videos stand behind each, which quotes may print,
// and where each subject stands. Nothing in these shapes is a comment's words:
// a quote travels as a ref with `text: ''` (the ref spine,
// lib/renderables/quotes-freeze.ts) and resolves at render, and `notes` are
// Pass A's insight descriptions, which are paraphrases.
//
// The interfaces below are pinned by the plan. Comments on a field say which
// product rule it mirrors.

/** The departments a report is written for (decision D2). */
export type Department = 'sales' | 'marketing' | 'content' | 'leadership'   // + 'product' if D2 changes

/** A reading lens: a department, or product (not a report yet, D2). */
export type Lens = Department | 'product'

/**
 * A quote as a stored read keeps it: the ref and where it was heard, never
 * the words. `ref` is `e:<insight_evidence.id>` (`quoteRef.evidence`), so
 * `isQuote` recognises it and the render resolves it through the same door
 * (and the same erasure rule) as every other stored quote. `thread` is the
 * gate's thread key (platform and the platform's video id), which is what
 * "one quote per thread" is counted on.
 */
export interface QuoteRef {
  ref: string
  text: ''
  /** The comment's date, `YYYY-MM-DD` (UTC). */
  date: string | null
  platform: string | null
  thread: string | null
}

export interface PoolCandidate {
  id: string                 // 'C1'…'C12', stable within one read
  themeId: string            // theme_registry.id
  label: string              // Pass B label
  description: string | null // Pass B description
  kinds: string[]            // insight kinds seen in the window
  lenses: Lens[]             // derived from kinds (purchase_intent/objection → sales; pain_point/feature_request → product; question → content; praise/switching/demographic → marketing); leadership = all
  weekVideos: number         // distinct category read-lane videos citing the theme, comment dated in the window
  gatedVideos: number        // of those, videos with ≥1 quote passing the strict gate
  monthK: number; monthN: number   // category videos in the reading month to date (month_theme_readings / window read)
  subjectId: string | null   // subject with the largest share of the theme's member insights (subject_memberships.member), null under 30%
  isNew: boolean             // the existing themeFlags 'new' rule (not minted by a regime-opening run)
  quoteRefs: QuoteRef[]      // strict-gated, one per thread, ≤3, text ''
  notes: string[]            // ≤8 member insight descriptions dated in the window (Pass A paraphrases, never comment text)
}

export interface WeekPool {
  clientId: string; runId: string
  window: { from: string; to: string }   // the run's frozen [window_start, window_end)
  month: string                          // reading month (YYYY-MM-01)
  weekVideos: number; weekComments: number; monthVideos: number   // category, read lane
  candidates: PoolCandidate[]            // eligible = gatedVideos ≥ 3, maker segments excluded; ranked gatedVideos, then weekVideos; cap 12
  thin: boolean                          // < 3 eligible candidates
}
