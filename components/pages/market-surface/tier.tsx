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
 * MK1's meta line - the mock's "4 above the bar / of 9 concluded".
 *
 * ONE NUMBER ABOVE, AGAINST THE TOTAL CONCLUDED. This read "1 strong evidence
 * / 1 early signal / 1 below the evidence bar": three counts of three tiers,
 * each spelled out again on the chip of every row beneath it, and none of them
 * saying how many conclusions this update actually reached. The mock asks the
 * question a reader of this block has - how much of what we concluded cleared
 * the bar - and the chips go on telling them which tier each row is.
 *
 * "Above the bar" IS THE BLOCK'S OWN WORD, not a new one: the third chip reads
 * "Below the evidence bar", so the line above the rows and the labels on them
 * stay one vocabulary. `tierLabel` keeps its caller in the chip.
 *
 * `total` is every conclusion the update reached, drawn or not
 * (`ConclusionsBlock.total`) - the rows are capped at `CONCLUSIONS_SHOWN`, and
 * a denominator counting only the drawn ones would shrink the day a prompt
 * change made twenty.
 */
export function tierMetaLine(counts: { confirmed: number; early: number; archive: number }, total: number): string {
  const above = counts.confirmed + counts.early
  return `${fmtInt(above)} above the bar · of ${fmtInt(total)} concluded`
}
