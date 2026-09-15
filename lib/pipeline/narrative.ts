import { FIGURE_RE, MAGNITUDE_RE, tidy } from '../prose/scrub'

import type { ExecutiveBrief, BriefMetric } from './schemas'

// Write-time validator for Pass D-a's executive_brief (2026-07-18). The brief is
// the one place the model authors number-framing prose, under a strict contract:
// it drops a `[[n]]` token where a figure belongs and the dashboard substitutes
// the authoritative value at render. This module is the belt-and-suspenders for
// that contract — the model is a reasoning model with no temperature, so it will
// occasionally type a literal number or a banned magnitude word despite the
// prompt (precedent: T# leaks → stripThemeRefs). validateBrief scrubs both,
// re-anchors a mistyped figure to a `[[n]]` token so placement survives, and
// flags leaks for ai_call_log. Render (lib/dashboard-narrative.ts) owns the
// actual figures and the fallback; this only guarantees clean stored prose.

/** The literal placeholder the model must leave where a figure goes. */
export const FIGURE_TOKEN = '[[n]]'

// The banned magnitude set, the figure pattern and the tidy-up now live with
// the other scrubber (lib/prose/scrub.ts), so the three near-copies of this
// loop are one. Re-exported because eleven files import them from here.
export { FIGURE_RE, MAGNITUDE_RE, MAGNITUDE_WORDS, tidy } from '../prose/scrub'

interface Scrubbed {
  text: string
  leaked: boolean
}

/** Strip the banned magnitude words; report whether any were present. Uses
 *  replace-and-compare, never `.test()` — the regexes are `g`-flagged and
 *  module-shared, so `.test()` would carry `lastIndex` between calls. */
function stripMagnitude(text: string): Scrubbed {
  const out = text.replace(MAGNITUDE_RE, '')
  return { text: out, leaked: out !== text }
}

/** Beat prose: strip magnitude words; ensure exactly one `[[n]]` — re-anchoring
 *  a mistyped figure to the token so the render still knows where to bold. */
function scrubBeat(raw: string): Scrubbed {
  const mag = stripMagnitude(raw)
  let leaked = mag.leaked
  let text = mag.text

  if (text.includes(FIGURE_TOKEN)) {
    // Keep the first token, drop any extras and any stray literal figure — on
    // BOTH sides of the token. A number the model typed *before* the token is
    // just as much a leak as one after it (and would otherwise render verbatim).
    const [head, ...rest] = text.split(FIGURE_TOKEN)
    const stripFigures = (s: string) => s.replace(FIGURE_RE, (m) => (m.trim() ? ((leaked = true), '') : m))
    text = `${stripFigures(head)}${FIGURE_TOKEN}${stripFigures(rest.join(' '))}`
  } else {
    // Model typed the number instead of the token — re-anchor placement to the
    // first figure it wrote, strip the rest.
    let anchored = false
    text = text.replace(FIGURE_RE, (m) => {
      if (!m.trim()) return m
      leaked = true
      if (!anchored) { anchored = true; return FIGURE_TOKEN }
      return ''
    })
  }
  return { text: tidy(text), leaked }
}

/** Headline: no figures, no token, no magnitude words — a clean claim. */
function scrubHeadline(raw: string): Scrubbed {
  const detokenised = raw.split(FIGURE_TOKEN).join(' ')
  let leaked = detokenised !== raw
  const mag = stripMagnitude(detokenised)
  leaked ||= mag.leaked
  const stripped = mag.text.replace(FIGURE_RE, (m) => (m.trim() ? '' : m))
  leaked ||= stripped !== mag.text
  return { text: tidy(stripped), leaked }
}

export interface ValidatedBrief {
  /** Sanitised brief, or null when it isn't structurally usable (empty headline
   *  or no beats survive) — the caller stores null and render falls back. */
  brief: ExecutiveBrief | null
  /** The model leaked a number or magnitude word we had to scrub. */
  leaked: boolean
  /** Beats dropped (empty after scrub, or a duplicate metric). */
  dropped: number
}

/** Sanitise + structurally validate a raw executive_brief. Keeps at most one
 *  beat per metric (first wins), caps at three, scrubs every string. */
export function validateBrief(raw: ExecutiveBrief | null | undefined): ValidatedBrief {
  if (!raw || typeof raw.headline_finding !== 'string' || !Array.isArray(raw.narrative)) {
    return { brief: null, leaked: false, dropped: 0 }
  }
  let leaked = false
  let dropped = 0

  const headline = scrubHeadline(raw.headline_finding)
  leaked ||= headline.leaked

  const seen = new Set<BriefMetric>()
  const beats: ExecutiveBrief['narrative'] = []
  for (const beat of raw.narrative) {
    if (!beat || seen.has(beat.metric)) { dropped++; continue }
    const scrubbed = scrubBeat(beat.text ?? '')
    leaked ||= scrubbed.leaked
    // A beat with no surviving prose around its token is noise.
    if (!scrubbed.text || scrubbed.text === FIGURE_TOKEN) { dropped++; continue }
    seen.add(beat.metric)
    beats.push({ metric: beat.metric, text: scrubbed.text })
    if (beats.length >= 3) break
  }

  if (!headline.text || beats.length === 0) return { brief: null, leaked, dropped }
  return { brief: { headline_finding: headline.text, narrative: beats }, leaked, dropped }
}
