import type { ReactNode } from 'react'
import type { RenderMode } from '@/lib/blocks/types'
import { StatValue } from '@/components/charts/stat'
import { EMAIL, FONT } from '@/lib/email/theme'

// A counted figure, in three modes (Phase 1 WP10). See components/blocks/frame.tsx
// for why these exist and what the email arm is allowed to be.

/**
 * A number, its unit, an optional calibrated level, and what it is measured
 * against.
 *
 * TWO RULES ARE ENFORCED HERE RATHER THAN ASKED FOR.
 *
 * (1) The figure is marked `data-copy="figure"`, so a block may set a stat
 *     inside a sentence of model prose and still keep rule (a) — the model's
 *     words are checked bare, and code's number is code's.
 *
 * (2) A LEVEL CANNOT BE PRINTED WITHOUT ITS DENOMINATOR. `level` is not a
 *     string, it is `{ word, of }`, and the two are rendered together. A
 *     calibrated word on its own is a score, and this product shows no scores:
 *     "Dominant" is unreadable, "Dominant · 21 of 36 videos" is a
 *     measurement (lib/calibration.ts; copy contract rule (b)). The noun in
 *     that example is deliberate: this is the stat every Phase 1 reading
 *     surface uses, and a reading surface counts VIDEOS (the thirteen words).
 *     `conversations` is the legacy, run-scoped unit and stays on the pages
 *     that still compute it. Making the denominator a separate, optional prop
 *     would make the rule breakable by forgetting, which is exactly how it was
 *     broken before.
 */
export function BlockStat({
  value, unit, level, base, wrapBase = false, aside, mode = 'app', size = 'md',
}: {
  value: ReactNode
  unit?: string
  /** A calibrated word and the evidence under it. Both, or neither.
   *
   *  `word` is a node and not a string because the word is not always code's:
   *  This week's risers put the THEME'S OWN NAME in this slot, and a theme's
   *  label is the model's words (`pass_b_theme` policy 'none'), so that caller
   *  passes `<span data-copy="subject">`. Rule (b) reads the level node's whole
   *  text, marked descendants included, so the "of N" is still enforced. */
  level?: { word: ReactNode; of: string }
  /** What the figure is measured against, in words ("since last update").
   *
   *  ONE LINE, CLIPPED, unless the caller says otherwise — see `wrapBase`. */
  base?: ReactNode
  /**
   *  Let `base` WRAP instead of being clipped to one line (Block D wave 2,
   *  code review C5).
   *
   *  `base` renders inside `truncate`, which is right for the short bases this
   *  stat was written for ("since last update") and wrong for a base that
   *  carries a denominator. This week's switching stat states "someone said
   *  they were moving between brands — of 205 videos this update · 1 below" in
   *  a 378px column: the string needs 447px, so the rendered sentence ended
   *  "— of 205 …" and the reader lost the very basis the block's own comment
   *  defends printing. A number without its basis is a measurement nobody
   *  made, and a clip is a silent way to make one.
   *
   *  Opt-in rather than the default because every other caller's tile height
   *  was set against a one-line base; a caller whose base carries an "of N"
   *  asks for the wrap. */
  wrapBase?: boolean
  /** Something on the same line — a sparkline, a badge. Screen and paper only;
   *  an email drops it, because an email cannot lay two things side by side
   *  without another table and it is never worth one. */
  aside?: ReactNode
  mode?: RenderMode
  size?: 'sm' | 'md' | 'lg'
}) {
  if (mode === 'email') {
    return (
      <div>
        <span data-copy="figure" style={{ fontFamily: FONT.mono, fontSize: size === 'lg' ? 26 : size === 'sm' ? 18 : 22, fontWeight: 600, lineHeight: '1', color: EMAIL.ink, letterSpacing: '-.02em' }}>{value}</span>
        {unit ? <span style={{ fontFamily: FONT.sans, fontSize: 12, fontWeight: 500, color: EMAIL.muted, marginLeft: 4 }}>{unit}</span> : null}
        {level ? (
          <div data-copy="level" style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.ink2, marginTop: 3 }}>{level.word} · {level.of}</div>
        ) : null}
        {base ? <div style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 3 }}>{base}</div> : null}
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="flex items-center gap-2.5">
        <span data-copy="figure"><StatValue unit={unit} size={size}>{value}</StatValue></span>
        {aside}
      </span>
      {level ? (
        <span data-copy="level" className="text-[12px] text-secondary-foreground">{level.word} · {level.of}</span>
      ) : null}
      {base ? (
        <span className={wrapBase ? 'text-[11.5px] text-muted-foreground [text-wrap:pretty]' : 'truncate text-[11.5px] text-muted-foreground'}>{base}</span>
      ) : null}
    </div>
  )
}
