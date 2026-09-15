import type { ReactNode } from 'react'
import type { RenderMode } from '@/lib/blocks/types'
import { EMAIL, FONT } from '@/lib/email/theme'
import { cn } from '@/lib/utils'

/**
 * The block primitives (Phase 1 WP10, decision O).
 *
 * Every visual an Overview / Subjects / Voice / Market / Competitive block uses
 * lives in `components/blocks/` and knows how to be three things. The reason is
 * in `lib/blocks/types.ts`: a block renders ONCE and takes the mode, so the
 * weekly report, the monthly report, the share page and the app page are the
 * same reading rather than four chances to answer one question four ways.
 *
 * THE EMAIL ARM IS NOT "SMALLER". It is `<table>` with inline styles, no
 * classes, no CSS variables, no flex and no grid, because Outlook lays out with
 * Word. Every primitive here delegates that arm to `components/email/
 * primitives.tsx`, which has been under that constraint since Stage 3, rather
 * than growing a second set of email markup beside it.
 *
 * COLOURS CROSS THE BOUNDARY THROUGH `tokenHex`. A caller passes one colour —
 * `var(--you)` — and the email arm resolves it to literal hex. An unknown token
 * resolves to the muted grey, so a new token can never paint an email black.
 *
 * MARKERS ARE THE PRIMITIVE'S JOB, NOT THE BLOCK'S. Each of these stamps its
 * own `data-copy` (figure / level / verdict), so a block that uses them keeps
 * the copy contract by construction and only has to mark its own prose
 * (lib/test/copy-contract.ts).
 */

/**
 * A block's chrome: its heading, the one question it answers, its body and a
 * footer.
 *
 * The question is the mock's own device — every artboard prints one under the
 * block's title — and it is the block's contract with the reader, so it is
 * chrome rather than content and lives here.
 */
export function BlockFrame({
  title, question, mode = 'app', footer, meta, children, className,
}: {
  title: string
  question?: string
  mode?: RenderMode
  /** The line along the bottom: a link deeper on the left, a quiet note right. */
  footer?: ReactNode
  /** The top-right note — "September 2026 · still filling". */
  meta?: ReactNode
  children: ReactNode
  className?: string
}) {
  if (mode === 'email') {
    return (
      <table width="100%" role="presentation" cellPadding={0} cellSpacing={0} border={0} style={{ borderCollapse: 'collapse', borderSpacing: 0, marginTop: 22 }}>
        <tbody>
          <tr>
            <td style={{ padding: '0 0 6px' }}>
              <table width="100%" role="presentation" cellPadding={0} cellSpacing={0} border={0} style={{ borderCollapse: 'collapse', borderSpacing: 0 }}>
                <tbody>
                  <tr>
                    <td style={{ fontFamily: FONT.sans, fontSize: 12, fontWeight: 600, color: EMAIL.muted, textTransform: 'uppercase', letterSpacing: '.6px' }}>{title}</td>
                    {meta ? <td align="right" style={{ fontFamily: FONT.mono, fontSize: 11, color: EMAIL.faint }}>{meta}</td> : null}
                  </tr>
                </tbody>
              </table>
              {question ? <div style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.muted, marginTop: 3 }}>{question}</div> : null}
            </td>
          </tr>
          <tr><td>{children}</td></tr>
          {footer ? (
            <tr>
              <td style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.ink2, paddingTop: 8, borderTop: `1px solid ${EMAIL.hairline}` }}>{footer}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    )
  }

  const big = mode === 'print'
  return (
    <section className={cn('flex min-w-0 flex-col gap-2.5', className)}>
      <header className="flex items-baseline justify-between gap-2">
        <h2 className={cn('m-0 font-semibold uppercase tracking-[0.06em] text-secondary-foreground', big ? 'text-[12px]' : 'text-[10.5px]')}>{title}</h2>
        {meta ? <span className="flex-none whitespace-nowrap font-mono text-[11px] text-muted-foreground">{meta}</span> : null}
      </header>
      {question ? <p className="m-0 text-[12.5px] text-muted-foreground">{question}</p> : null}
      {children}
      {footer ? (
        <footer className="mt-auto flex items-center justify-between gap-2 border-t border-border/70 pt-2 text-[12px] font-medium text-foreground">
          {footer}
        </footer>
      ) : null}
    </section>
  )
}

/**
 * The block's honest empty state — one line, the block's own words.
 *
 * `Block.emptyState(data)` computes the sentence without rendering; this is
 * what prints it. A tile keeps its size, a slide keeps its box, an email keeps
 * its section: the emptiness is information, not a hole.
 */
export function BlockEmpty({ children, mode = 'app' }: { children: ReactNode; mode?: RenderMode }) {
  if (mode === 'email') {
    return <div style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.muted }}>{children}</div>
  }
  return <p className="m-0 text-[12px] text-muted-foreground">{children}</p>
}
