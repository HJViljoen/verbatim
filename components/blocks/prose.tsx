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
  body, figures, mode = 'app', model = false, className, size = 'body',
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
   * How loud the sentence is (Block D wave 2, E-monthly — ADDITIVE, default
   * unchanged).
   *
   * `body` is 13.5px sans, which is what every caller gets today. `hero` is
   * the SERIF lead: the one sentence a surface is about, at the design
   * system's hero size (17px on a page, 23px in the 600px email, where the
   * MonthlyReport artboard sets it). P0 item 2 is that the pages' biggest
   * sentences must print at hero scale and none of them does; this is the
   * knob for the sentences that reach the reader through `TokenProse` rather
   * than through a `Tile`.
   */
  size?: 'body' | 'hero'
}) {
  const parts = substituteFigures(body, proseFigures(figures))
  if (parts.length === 0) return null
  const hero = size === 'hero'
  // A FIGURE IN A HERO SENTENCE TAKES THE SENTENCE'S FACE. Mono inside 13.5px
  // sans is a deliberate signal — code's number, in code's typeface — and at
  // 23px serif it is the opposite: tabular mono sets "1,388" as "1 , 388" and
  // "9.4%" as "9 . 4%", so the one sentence the artefact is about reads as
  // machine output. The artboard sets its figures in the sentence's own face at
  // weight 600, which says the same thing without breaking the line.
  const children: ReactNode[] = parts.map((p, i) =>
    'text' in p
      ? <span key={i}>{p.text}</span>
      : hero
        ? <span key={i} data-copy="figure" style={mode === 'email' ? { fontWeight: 600 } : undefined} className={mode === 'email' ? undefined : 'font-semibold'}>{p.figure}</span>
        : <span key={i} data-copy="figure" style={mode === 'email' ? { fontFamily: FONT.mono, color: EMAIL.ink } : undefined} className={mode === 'email' ? undefined : 'font-mono tabular-nums'}>{p.figure}</span>,
  )
  if (mode === 'email') {
    return (
      <div
        {...(model ? { 'data-copy': 'prose' } : {})}
        style={hero
          ? { fontFamily: FONT.serif, fontSize: 23, fontWeight: 500, lineHeight: 1.34, letterSpacing: '-.01em', color: EMAIL.ink }
          : { fontFamily: FONT.sans, fontSize: 13.5, lineHeight: 1.5, color: EMAIL.ink }}
      >
        {children}
      </div>
    )
  }
  return (
    <p
      {...(model ? { 'data-copy': 'prose' } : {})}
      className={className ?? (hero ? 'm-0 font-serif text-[17px] font-medium leading-[1.35] tracking-[-0.005em]' : 'm-0 text-[13.5px] leading-relaxed')}
    >
      {children}
    </p>
  )
}
