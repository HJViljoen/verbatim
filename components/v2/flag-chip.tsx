import { fmtInt } from '@/lib/format'
import { glossaryRule } from '@/lib/calibration'
import type { Verdict } from '@/lib/reading/verdicts'
import { cn } from '@/lib/utils'

/**
 * THE FLAG CHIP (depth v2, T2; plan decision 1).
 *
 * The boards draw an orange chip beside a conversation, a product or a card's
 * eyebrow: "Rising", "3× usual", "New". Two of those three are the weekly
 * movement words AGENTS.md and the copy contract forbid (decisions K/M/U): a
 * week read against a usual week is one comparison, and one comparison never
 * earns a direction word. So the chip keeps its look and loses its free text.
 * It takes a `Verdict`, never a string, and prints only the word code assigns
 * from that verdict (`flagWordOf`), inside a `data-copy="verdict"` node, which
 * is the one place rule (c) allows a movement word to stand.
 *
 * THE WORDS, AND WHAT EARNS EACH ONE:
 *   Growing / Fading     `verdict.direction`, which only `directionWord`
 *                        (lib/reading/bands.ts) fills, from three consecutive
 *                        monthly readings in one clustering regime
 *   Unusual this week    the anomaly check flagged it: a week verdict that
 *                        cleared its band and the Holm threshold
 *                        (`anomalyVerdict`, lib/reading/anomaly.ts)
 *   New / Gone quiet     the reader flags (`READER_FLAGS`, lib/calibration.ts)
 * Anything else, and any refused verdict, prints no chip at all: a chip with
 * nothing earned is the claim the rule exists to stop.
 *
 * Orange fill, ink on it (4.6:1; MASTER §Colour roles: the orange is a fill
 * and never a text colour). A single-line pill, so `rounded-full` is allowed.
 */

/** Every word a flag chip may print, keyed by what earned it. */
export const FLAG_WORDS = {
  growing: 'Growing',
  fading: 'Fading',
  unusual: 'Unusual this week',
  new: 'New',
  gone_quiet: 'Gone quiet',
} as const

export type FlagWord = keyof typeof FLAG_WORDS

/** The word a verdict has earned for a chip, or null for none. Pure. */
export function flagWordOf(verdict: Verdict | null | undefined): FlagWord | null {
  if (!verdict || verdict.state === 'refused') return null
  if (verdict.direction === 'growing' || verdict.direction === 'fading') return verdict.direction
  if (verdict.window.kind === 'week' && verdict.state === 'moved') return 'unusual'
  if (verdict.flags.includes('new')) return 'new'
  if (verdict.flags.includes('gone_quiet')) return 'gone_quiet'
  return null
}

/** The chip's tooltip: the rule behind the word, and for a flagged week the
 *  two sides it was read on. A title is an explanation, never the claim. */
function flagTitle(word: FlagWord, verdict: Verdict): string {
  if (word === 'unusual') {
    const base = verdict.baseline
      ? `, against ${fmtInt(verdict.baseline.k)} of ${fmtInt(verdict.baseline.n)} in the months before`
      : ''
    const band = verdict.bandPts != null ? `, outside a band of ${verdict.bandPts} pts` : ''
    return `${fmtInt(verdict.value.k)} of ${fmtInt(verdict.value.n)} videos this week${base}${band}`
  }
  if (word === 'growing' || word === 'fading') return glossaryRule('direction')
  return glossaryRule(word)
}

const SIZE = {
  md: 'px-2 py-[5px] text-[12px]',
  sm: 'px-1.5 py-[3px] text-[10.5px]',
} as const

export interface FlagChipProps {
  /** The verdict the word is read from. No verdict, or none earned: no chip. */
  verdict: Verdict | null | undefined
  /** `sm` sits inside a product tile on the catalogue shelf. */
  size?: 'md' | 'sm'
  className?: string
}

export function FlagChip({ verdict, size = 'md', className }: FlagChipProps) {
  const word = flagWordOf(verdict)
  if (!word || !verdict) return null
  return (
    <span
      data-copy="verdict"
      data-flag={word}
      title={flagTitle(word, verdict)}
      className={cn(
        'inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-orange font-semibold leading-none text-brand-foreground',
        SIZE[size],
        className,
      )}
    >
      {FLAG_WORDS[word]}
    </span>
  )
}
