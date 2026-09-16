import type { ReactNode } from 'react'
import Link from 'next/link'
import type { Block, QuoteRef, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { TokenProse } from '@/components/blocks/prose'
import { INTERPRETATION_LABEL } from '@/lib/prose/interpret'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fullDate, shortDate } from '@/lib/format'
import type { FigureTable } from '@/lib/reading/verdicts'
import { briefStaleLine, type BriefLink, type MonthlyData } from '@/lib/pages/monthly'
import type { LedgerRow } from '@/lib/pages/overview'

/**
 * MR7 · What to decide before the next reading (Phase 1 WP18; the mock's
 * section 7, new in Heinrich's revision 6).
 *
 * THE ONE LABELLED SLOT ON THE ARTEFACT, AND IT IS HERE. Everywhere else in
 * this product the model describes and code rates; in three places the model is
 * allowed to say why and so what, and each carries the word *Interpretation* on
 * the page, set apart from the record (design §7, item 9). The monthly report's
 * slot is `interpretation_monthly`, and revision 6 puts the decision at the END
 * of the report rather than in its first paragraph, so the slot travels with
 * it. That is why section 1 prints the code sentence alone: one paragraph
 * printed twice on one artefact, under two headings, is worse than either
 * placement.
 *
 * WHAT IT IS ALLOWED TO ARGUE FROM. The verdicts code issued and the figures
 * code computed, and nothing else. It never earns a direction word (three
 * readings do that) and it never holds a quote's words. When the model is
 * unavailable, refuses, or writes nothing that survives the two scrubbers, the
 * product writes the slot itself out of the same verdicts AND SAYS SO on the
 * page — a reader who cannot tell our sentence from the model's cannot
 * calibrate either.
 *
 * THE STANDING ADVICE IS ITS METADATA, not a second block. The mock draws one
 * serif headline and one metadata line under it — "Advice #1 · first raised in
 * July · Working on it since 2 Sep" — which is exactly OV1's ledger row, moved
 * here with the slot it belongs to. The title is a model's words read back out
 * of a column, so it carries the `stored` kind and names the slot that wrote it
 * (the exemption WP14 argued for the same string on Market).
 *
 * AND IT CARRIES A DATE. "Before the next reading" is a deadline or it is
 * nothing: the next monthly reading lands on the first of next month, and the
 * block says which day that is.
 */
export const monthlyDecide: Block<MonthlyData> = {
  key: 'monthly.decide',
  title: 'What to decide before the next reading',
  question: 'What does this month actually ask of us?',

  render(data, mode = 'app', ctx) {
    const d = data.decide
    const email = mode === 'email'
    const href = `${ctx.appUrl}${d.href}`

    const empty = monthlyDecide.emptyState(data)
    const frame = (children: ReactNode) => (
      <BlockFrame
        title={monthlyDecide.title}
        question={monthlyDecide.question}
        mode={mode}
        meta={`next reading ${shortDate(d.nextReading)}`}
        footer={email
          ? <a href={href} style={{ color: EMAIL.ink }}>Open Market →</a>
          : <Link href={href} className="hover:underline">Open Market →</Link>}
      >
        {children}
      </BlockFrame>
    )
    if (empty) return frame(<BlockEmpty mode={mode}>{empty}</BlockEmpty>)

    const ledger = d.ledger ? <Ledger row={d.ledger} mode={mode} appUrl={ctx.appUrl} /> : null

    const read = d.interpretation.sentences.length > 0 ? (
      <div className={email ? undefined : 'flex flex-col gap-1'}>
        <span
          className={email ? undefined : 'text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground'}
          style={email ? { fontFamily: FONT.sans, fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.6px', color: EMAIL.muted } : undefined}
        >
          Our read · {INTERPRETATION_LABEL}
        </span>
        <TokenProse body={d.interpretation.sentences.join(' ')} figures={d.figures} mode={mode} model />
        {d.interpretation.note ? (
          <span
            className={email ? undefined : 'text-[11px] text-muted-foreground'}
            style={email ? { fontFamily: FONT.sans, fontSize: 11, color: EMAIL.muted } : undefined}
          >
            {d.interpretation.note}
          </span>
        ) : null}
      </div>
    ) : null

    const deadline = email ? (
      <div style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 8 }}>
        The next reading of this is {fullDate(d.nextReading)}.
      </div>
    ) : (
      <p className="m-0 text-[11.5px] text-muted-foreground">The next reading of this is {fullDate(d.nextReading)}.</p>
    )

    return frame(
      <div className={email ? undefined : 'flex flex-col gap-3'}>
        {ledger}
        {read}
        {deadline}
        {data.brief ? <Brief brief={data.brief} mode={mode} appUrl={ctx.appUrl} /> : null}
      </div>,
    )
  },

  figures(data): FigureTable {
    // THE SLOT'S OWN TABLE, AND NOT A NEW READING. The interpretation cites
    // `[[token]]`s that section 1 already declared; re-declaring them here would
    // put the same number in the artefact's figure table twice under one key —
    // which `mergeFigures` resolves silently and `figureConflicts` would then
    // have nothing to report. The tokens a sentence cites are substituted from
    // `d.figures`, which is section 1's table, handed here by the loader.
    void data
    return {}
  },

  quotes(data): QuoteRef[] {
    return data.decide.interpretation.quotes.map((q) => q.ref)
  },

  emptyState(data) {
    const d = data.decide
    if (d.interpretation.sentences.length > 0 || d.ledger) return null
    return 'Nothing this month asks for a decision. Here is where you stand.'
  },
}

/** The standing advice — the mock's serif headline and its metadata line. */
function Ledger({ row, mode, appUrl }: { row: LedgerRow; mode: RenderMode; appUrl: string }) {
  const email = mode === 'email'
  const meta = ledgerMeta(row)
  if (email) {
    return (
      <div style={{ borderLeft: `2px solid ${EMAIL.border}`, paddingLeft: 12 }}>
        <div style={{ fontFamily: FONT.serif, fontSize: 17, lineHeight: 1.3, color: EMAIL.ink }}>
          <span data-copy="stored" data-slot="pass_d_b_recommendation">{row.title}</span>
        </div>
        <div style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 4 }}>{meta}</div>
      </div>
    )
  }
  return (
    <div className="flex min-w-0 flex-col gap-1 border-l-2 border-border pl-3">
      <Link
        data-copy="stored"
        data-slot="pass_d_b_recommendation"
        href={`${appUrl}${row.href}`}
        className="font-serif text-[17px] leading-[1.3] underline-offset-2 hover:underline"
      >
        {row.title}
      </Link>
      <span className="text-[11.5px] text-muted-foreground">{meta}</span>
    </div>
  )
}

/**
 * The Marketing brief, ATTACHED BY LINK.
 *
 * No second build: a brief is several model calls over minutes, and this report
 * already holds its numbers. The line says whether the link opens without an
 * account, because this artefact is emailed to a list that may include people
 * who have none, and it says when the brief was built, because a report sent on
 * 1 October must not offer September's document as this month's companion.
 */
function Brief({ brief, mode, appUrl }: { brief: BriefLink; mode: RenderMode; appUrl: string }) {
  const email = mode === 'email'
  const href = brief.href.startsWith('http') ? brief.href : `${appUrl}${brief.href}`
  const tail = brief.stale ? ` ${briefStaleLine(brief)}` : ''
  const lead = brief.public ? 'The brief is attached, one link per block.' : 'The brief is in the workspace.'
  if (email) {
    return (
      <div style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.muted, marginTop: 8 }}>
        {lead} <a href={href} style={{ color: EMAIL.ink }}>{brief.title} →</a>{tail}
      </div>
    )
  }
  return (
    <p className="m-0 text-[12px] text-muted-foreground">
      {lead}{' '}
      <Link href={href} className="underline underline-offset-2">{brief.title} →</Link>
      {tail}
    </p>
  )
}

/** "first raised 3 months ago · you marked it Working on it on 2 Sep" — with
 *  the age absent until a lineage has been kept for two updates, because a
 *  recommendation dated from its newest copy is not an age. OV1's own line. */
function ledgerMeta(l: LedgerRow): string {
  const parts: string[] = []
  if (l.monthsOld != null && l.monthsOld > 0) parts.push(`first raised ${l.monthsOld} ${l.monthsOld === 1 ? 'month' : 'months'} ago`)
  parts.push(
    l.decidedAt
      ? `you marked it ${l.statusLabel} on ${shortDate(l.decidedAt)}`
      : `no decision recorded — it stands at ${l.statusLabel}`,
  )
  return parts.join(' · ')
}
