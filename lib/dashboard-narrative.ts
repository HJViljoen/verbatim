import type { ExecutiveBrief, BriefMetric } from './pipeline/schemas'
import { FIGURE_TOKEN } from './pipeline/narrative'

// Render-time resolver for the dashboard's executive brief (2026-07-18). Pass
// D-a authors the woven prose and leaves a `[[n]]` token where each figure goes;
// here we substitute the AUTHORITATIVE value — computed by the dashboard from
// run_summary, never trusted from the model — so a wrong number is structurally
// impossible in the final render. A beat whose metric isn't computable this run
// is dropped; if no model brief survives (null, or every beat dropped) we compose
// an equivalent narrative from the same figures + the theme's own numberless
// description, so the hero always renders something honest.
//
// Deltas ("since last update") are deliberately NOT woven in here — they depend
// on which prior run is anchored at read time, so they stay code-owned chrome
// (DeltaBadge) around this narrative, not inside its prose.

/** The figures the resolver may substitute — all computed by the page from
 *  run_summary. A null field means that metric isn't computable this run. */
export interface NarrativeFigures {
  brand: string
  topTheme: { label: string; description: string; conversations: number } | null
  /** Corpus positive share (the same number the Sentiment card leads with). */
  sentiment: { positivePct: number } | null
  /** Client share of tracked conversation; only meaningful with competitors. */
  shareOfVoice: { clientPct: number; hasCompetitors: boolean } | null
}

/** A beat split around its figure so the component can bold the value: renders
 *  as `{before}<strong>{figure}</strong>{after}`. */
export interface ResolvedBeat {
  metric: BriefMetric
  before: string
  figure: string
  after: string
}

export interface DashboardNarrative {
  headline: string
  beats: ResolvedBeat[]
  /** true when the model brief was unusable and this was composed in code. */
  fallback: boolean
}

/** The authoritative display figure for a metric, or null if uncomputable. */
function figureFor(metric: BriefMetric, f: NarrativeFigures): string | null {
  switch (metric) {
    case 'top_theme':
      return f.topTheme ? `${f.topTheme.conversations} conversation${f.topTheme.conversations === 1 ? '' : 's'}` : null
    case 'sentiment':
      return f.sentiment ? `${f.sentiment.positivePct}% positive` : null
    case 'share_of_voice':
      // A share against no competitors is a meaningless 100% — drop it.
      return f.shareOfVoice && f.shareOfVoice.hasCompetitors ? `${f.shareOfVoice.clientPct}%` : null
  }
}

/** Drop a word from the start of `after` when it duplicates the last word of the
 *  figure — e.g. figure "71% positive" + text "…at [[n]] positive" would read
 *  "…71% positive positive" (the model wrote the polarity the figure already
 *  carries). Generic: also catches "42 conversations" + "conversations were…". */
function dedupeSeam(figure: string, after: string): string {
  const last = figure.trim().split(/\s+/).pop()?.toLowerCase().replace(/[^a-z]/g, '')
  const m = after.match(/^\s*([A-Za-z]+)/)
  if (last && m && m[1].toLowerCase() === last) return after.slice(m[0].length)
  return after
}

/** Split a beat's prose at its `[[n]]` token. Token-absent (rare — the validator
 *  re-anchors most cases): append the figure to the end of the sentence. */
function splitFigure(text: string, figure: string): Omit<ResolvedBeat, 'metric'> {
  const i = text.indexOf(FIGURE_TOKEN)
  if (i === -1) return { before: text ? `${text} ` : '', figure, after: '' }
  return { before: text.slice(0, i), figure, after: dedupeSeam(figure, text.slice(i + FIGURE_TOKEN.length)) }
}

/** Code-composed narrative used when the model brief is unusable — same figures,
 *  numberless framing from the theme's own description. */
function composeFallback(f: NarrativeFigures): DashboardNarrative {
  const beats: ResolvedBeat[] = []
  const push = (metric: BriefMetric, text: string) => {
    const figure = figureFor(metric, f)
    if (figure) beats.push({ metric, ...splitFigure(text, figure) })
  }
  push('top_theme', `The conversation keeps returning to ${f.topTheme?.label ?? 'a handful of themes'}, heard across ${FIGURE_TOKEN}.`)
  push('sentiment', `Across the rated conversations, feeling about ${f.brand} sits at ${FIGURE_TOKEN}.`)
  push('share_of_voice', `${f.brand} holds ${FIGURE_TOKEN} of the conversation it tracks against its competitors.`)

  const headline =
    f.topTheme?.description?.trim() ||
    (f.topTheme ? `${f.brand}'s audience keeps returning to ${f.topTheme.label}.` : `Here's what ${f.brand}'s audience is saying this update.`)
  return { headline, beats, fallback: true }
}

/** Resolve the model brief against this run's figures, or fall back to code. */
export function composeDashboardNarrative(
  brief: ExecutiveBrief | null | undefined,
  figures: NarrativeFigures,
): DashboardNarrative {
  if (!brief || !brief.headline_finding?.trim()) return composeFallback(figures)

  const beats: ResolvedBeat[] = []
  for (const beat of brief.narrative) {
    const figure = figureFor(beat.metric, figures)
    if (!figure) continue // uncomputable this run — drop it
    beats.push({ metric: beat.metric, ...splitFigure(beat.text, figure) })
  }
  // Every figure the model chose was uncomputable — the model prose no longer
  // matches the data, so compose from scratch instead.
  if (beats.length === 0) return composeFallback(figures)
  return { headline: brief.headline_finding.trim(), beats, fallback: false }
}
