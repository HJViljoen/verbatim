import type { ReactNode } from 'react'
import type { RenderMode } from '@/lib/blocks/types'
import { substituteFigures } from '@/lib/reports/cover'
import type { FigureTable as ReadingFigures } from '@/lib/reading/verdicts'
import { proseFigures } from '@/lib/prose/figures'
import { EMAIL, FONT } from '@/lib/email/theme'

// Prose with the numbers written in at render (Phase 1 WP11; moved under
// components/blocks in WP15, when This week's interpretation became the second
// surface to print a model's sentence with figure tokens in it).
//
// EVERY SENTENCE ON A READING PAGE THAT CARRIES A FIGURE CARRIES IT AS A TOKEN.
// `[[share_now]]` travels in the string and the value is substituted here, from
// the reading layer's own figure table — which is what lets the same sentence
// be written by code (OV1's headline) or by a model (the interpretation) under
// one rule: a model never sees a value, so it cannot round one, and code's
// number is marked `data-copy="figure"` so the copy contract can tell the two
// apart inside one paragraph (lib/test/copy-contract.ts, rule (a)).
//
// A sentence citing a key the table does not hold is DROPPED WHOLE, by
// `substituteFigures` — the cover's rule since Stage 2, and the reason a
// missing figure can never reach a reader as an empty gap.

export function TokenProse({
  body, figures, mode = 'app', model = false, figureFace = 'mono', className,
}: {
  /** The sentence(s), with `[[key]]` placeholders. */
  body: string
  /** The reading layer's measured figures; converted once, here. */
  figures: ReadingFigures
  mode?: RenderMode
  /** True when a MODEL wrote these words — the node is marked as prose and the
   *  contract then checks it for digits the model typed itself. Code's own
   *  sentences are not marked: they are allowed their numbers, and marking them
   *  would claim a provenance they do not have. */
  model?: boolean
  /**
   * The face a substituted figure is set in (Block D wave 2, design review F6).
   *
   * MONO IS THE DEFAULT AND IT IS A SIGNAL: a figure in a model's paragraph is
   * code's number, and setting it in the mono face says so at a glance. But a
   * mono glyph is one advance wide whatever it is, so a DECIMAL POINT inside a
   * sans sentence gets a digit's worth of air on both sides: This week's §1
   * interpretation read "Objections ran at 13 . 7% of this update against
   * 3 . 5%", six lines under a claim line that sets the same two numbers in
   * sans and reads correctly — one page printing one figure two ways.
   *
   * `inherit` keeps the sentence's own face and marks the figure by WEIGHT
   * instead, which survives a decimal point. The marker (`data-copy="figure"`)
   * is unchanged either way, so the contract reads the two identically; this
   * is only what a reader sees. Opt-in, because every other surface's prose
   * was laid out against the mono face.
   */
  figureFace?: 'mono' | 'inherit'
  className?: string
}) {
  const parts = substituteFigures(body, proseFigures(figures))
  if (parts.length === 0) return null
  const children: ReactNode[] = parts.map((p, i) =>
    'text' in p
      ? <span key={i}>{p.text}</span>
      : (
        <span
          key={i}
          data-copy="figure"
          style={mode === 'email'
            ? (figureFace === 'mono' ? { fontFamily: FONT.mono, color: EMAIL.ink } : { fontWeight: 600, color: EMAIL.ink })
            : undefined}
          className={mode === 'email' ? undefined : (figureFace === 'mono' ? 'font-mono tabular-nums' : 'font-semibold tabular-nums')}
        >
          {p.figure}
        </span>
      ),
  )
  if (mode === 'email') {
    return (
      <div {...(model ? { 'data-copy': 'prose' } : {})} style={{ fontFamily: FONT.sans, fontSize: 13.5, lineHeight: 1.5, color: EMAIL.ink }}>
        {children}
      </div>
    )
  }
  return (
    <p {...(model ? { 'data-copy': 'prose' } : {})} className={className ?? 'm-0 text-[13.5px] leading-relaxed'}>
      {children}
    </p>
  )
}
