import type { RenderMode } from '@/lib/blocks/types'
import { pairChipWords } from '@/lib/calibration'
import { EMAIL, FONT } from '@/lib/email/theme'
import type { VerdictPairNote } from '@/lib/reading/verdicts'

// THE "NOT READ AS A CHANGE" CHIP (market-first decision D; deploy 1 review).
//
// The approved preview prints a refused month pair once per block, as a grey
// pill with the ⊘ mark at the block's foot ("not read as a change: we changed
// our searches in September"), and the 25 Sep rulings keep these chips while
// they take every other footnote away. A block whose rows share one refusal
// (`sharedPairNote`, lib/calibration.ts) prints it here, and its rows print
// the short "not compared". The words are `pairChipWords`: the rows' own
// sentence, lower case, no full stop.
//
// It wraps rather than overflows: the preview's pill is one line at 1440, and
// at 390 the sentence is wider than the column.

/** The chip, from a pair note, in every mode; null where there is none. */
export function PairChip({ note, mode, className }: { note: VerdictPairNote | null | undefined; mode: RenderMode; className?: string }) {
  if (!note) return null
  const words = pairChipWords(note)
  if (mode === 'email') {
    return (
      <div
        data-copy="verdict"
        data-pair-chip=""
        style={{ display: 'inline-block', fontFamily: FONT.sans, fontSize: 12, fontWeight: 500, color: EMAIL.ink2, background: EMAIL.inner, border: `1px solid ${EMAIL.border}`, borderRadius: 6, padding: '4px 10px', marginTop: 8 }}
      >
        {words}
      </div>
    )
  }
  return (
    <span
      data-copy="verdict"
      data-pair-chip=""
      className={`inline-flex max-w-full items-center gap-2 self-start rounded-md bg-muted px-3 py-1.5 text-[13px] font-medium leading-[1.35] text-secondary-foreground ${className ?? ''}`}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-muted-foreground">
        <circle cx="12" cy="12" r="9" />
        <path d="M5.6 5.6l12.8 12.8" />
      </svg>
      <span>{words}</span>
    </span>
  )
}
