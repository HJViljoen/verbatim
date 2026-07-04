// Curated accent + semantic colour helpers for the data pages.
// The class strings are written out in full (never interpolated) so Tailwind v4
// detects them and generates the utilities. Tokens live in app/globals.css.

/** Soft category chips — a muted multi-hue set, cycled for Donezo-style variety. */
export const ACCENT_TINTS = [
  'bg-pine/10 text-pine',
  'bg-clay/10 text-clay',
  'bg-ochre/10 text-ochre',
  'bg-plum/10 text-plum',
  'bg-slate/10 text-slate',
] as const

/** Solid fills of the same hues, same order — for dots, meters, share bars. */
export const ACCENT_SOLIDS = ['bg-pine', 'bg-clay', 'bg-ochre', 'bg-plum', 'bg-slate'] as const

const wrap = (i: number, len: number) => ((i % len) + len) % len

/** Stable hue index for a named category — same label always maps to the same hue. */
function hashIndex(key: string, len: number): number {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return wrap(h, len)
}

/** Accent tint by position (wraps; safe for negative indices). */
export const accentTint = (i: number) => ACCENT_TINTS[wrap(i, ACCENT_TINTS.length)]
/** Solid accent by position (wraps). */
export const accentSolid = (i: number) => ACCENT_SOLIDS[wrap(i, ACCENT_SOLIDS.length)]

/** Soft chip for a named category — stable hue per label. */
export const categoryTint = (key: string) => ACCENT_TINTS[hashIndex(key, ACCENT_TINTS.length)]
/** Solid dot/swatch for a named category — same hue as categoryTint(key). */
export const categorySolid = (key: string) => ACCENT_SOLIDS[hashIndex(key, ACCENT_SOLIDS.length)]

/** Semantic status → soft badge (positive / neutral / mixed / negative). */
export const SENTIMENT_BADGE: Record<string, string> = {
  positive: 'bg-positive/12 text-positive',
  neutral: 'bg-muted text-muted-foreground',
  mixed: 'bg-warning/15 text-warning',
  negative: 'bg-negative/12 text-negative',
}

/** Impact / priority level → soft badge (high stands out, low/medium sit back). */
export const levelBadge = (level?: string | null) =>
  level === 'high' ? 'bg-warning/15 text-warning' : 'bg-muted text-muted-foreground'

/** Prevalence tier → soft badge (tier assigned by lib/calibration.ts, never the model). */
export const PREVALENCE_BADGE: Record<string, string> = {
  dominant: 'bg-primary/12 text-primary',
  widespread: 'bg-pine/10 text-pine',
  recurring: 'bg-muted text-muted-foreground',
  early_signal: 'bg-warning/15 text-warning',
}

/** Calibrated sentiment tier → soft badge, coloured by valence. */
export const SENTIMENT_TIER_BADGE: Record<string, string> = {
  strongly_positive: 'bg-positive/12 text-positive',
  leaning_positive: 'bg-positive/12 text-positive',
  balanced: 'bg-muted text-muted-foreground',
  polarized: 'bg-warning/15 text-warning',
  leaning_negative: 'bg-negative/12 text-negative',
  strongly_negative: 'bg-negative/12 text-negative',
}

/** Deep→pale green for a 0–100 data value (bars, meters). */
export function greenForPct(pct: number): string {
  if (pct >= 80) return 'var(--chart-1)'
  if (pct >= 60) return 'var(--primary)'
  if (pct >= 40) return 'var(--chart-2)'
  if (pct >= 20) return 'var(--chart-5)'
  return 'var(--chart-3)'
}
