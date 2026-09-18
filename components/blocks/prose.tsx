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
  body, figures, mode = 'app', model = false, className, size,
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
  className?: string
  /**
   * The email arm's font size, in px. Optional and defaulting to the body
   * scale, so nothing that does not pass it changes.
   *
   * WHY A PROP AND NOT A WRAPPER. The email arm sets `fontSize` on its own
   * element (a client reads no stylesheet, so every rule is inline and nothing
   * inherits past an explicit one), and the artboards run a HERO line — the
   * page's one sentence at 17.5px — through the same token substitution as
   * body copy. A caller that wants the hero scale has no way to ask for it
   * from outside. The app and print arms take `className`, as they already do.
   */
  size?: number
}) {
  const parts = substituteFigures(body, proseFigures(figures))
  if (parts.length === 0) return null
  const children: ReactNode[] = parts.map((p, i) =>
    'text' in p
      ? <span key={i}>{p.text}</span>
      : <span key={i} data-copy="figure" style={mode === 'email' ? { fontFamily: FONT.mono, color: EMAIL.ink } : undefined} className={mode === 'email' ? undefined : 'font-mono tabular-nums'}>{p.figure}</span>,
  )
  if (mode === 'email') {
    return (
      <div {...(model ? { 'data-copy': 'prose' } : {})} style={{ fontFamily: FONT.sans, fontSize: size ?? 13.5, lineHeight: 1.5, color: EMAIL.ink }}>
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
