import type { RenderMode } from '@/lib/blocks/types'
import { glossaryRule } from '@/lib/calibration'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt } from '@/lib/format'
import type { GateTier } from '@/lib/curation'

// The evidence word, in three modes (Phase 1 WP14).
//
// A SCORE IS NEVER SHOWN; the tier is. `gateTier` turns a confidence score and
// a grounding count into one of three words (lib/curation.ts) and this prints
// the word — the same rule the parked Market page keeps, with one difference
// that matters: the parked chip renders NOTHING for `archive`, and MK1's own
// gate is "a conclusion below the evidence bar is LABELLED, not hidden". A
// blank where a label belongs is the reader having to guess which of the two
// it is.

const LABEL: Record<GateTier, string> = {
  confirmed: 'Strong evidence',
  early_signal: 'Early signal',
  archive: 'Below the evidence bar',
}

const TONE: Record<GateTier, { app: string; bg: string; fg: string }> = {
  confirmed: { app: 'bg-accent text-accent-foreground', bg: EMAIL.greenTint, fg: EMAIL.up },
  early_signal: { app: 'bg-warning/15 text-warning', bg: EMAIL.inner, fg: EMAIL.ink2 },
  archive: { app: 'bg-inner text-muted-foreground', bg: EMAIL.inner, fg: EMAIL.muted },
}

const TIP: Record<GateTier, string> = {
  confirmed: glossaryRule('strong_evidence'),
  early_signal: glossaryRule('early_signal'),
  archive: 'Below the evidence bar: it is shown, labelled, and not counted as a finding.',
}

export function TierChip({ tier, mode = 'app' }: { tier: GateTier; mode?: RenderMode }) {
  if (mode === 'email') {
    return (
      <span style={{ display: 'inline-block', fontFamily: FONT.sans, fontSize: 10.5, fontWeight: 600, padding: '1px 8px', borderRadius: 10, background: TONE[tier].bg, color: TONE[tier].fg }}>
        {LABEL[tier]}
      </span>
    )
  }
  return (
    <span title={TIP[tier]} className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-px text-[10.5px] font-medium ${TONE[tier].app}`}>
      {LABEL[tier]}
    </span>
  )
}

export const tierLabel = (tier: GateTier): string => LABEL[tier]

/**
 * MK1's meta line, in the chips' own words.
 *
 * It read "5 confirmed · 1 early · 0 below the bar" — `confirmed` is the
 * internal `GateTier` key, and `early` and `below the bar` are two more
 * abbreviations of words the chips beside them spell out in full. Three
 * vocabularies for three tiers on one block. `tierLabel` was exported for
 * exactly this and had no caller.
 */
export function tierMetaLine(counts: { confirmed: number; early: number; archive: number }): string {
  const say = (n: number, tier: GateTier) => `${fmtInt(n)} ${LABEL[tier].toLowerCase()}`
  return [say(counts.confirmed, 'confirmed'), say(counts.early, 'early_signal'), say(counts.archive, 'archive')].join(' · ')
}
