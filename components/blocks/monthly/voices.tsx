import type { ReactNode } from 'react'
import Link from 'next/link'
import type { Block, QuoteRef, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BlockQuote } from '@/components/blocks/quote'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt } from '@/lib/format'
import { hasQuote } from '@/lib/renderables/quotes-freeze'
import type { FigureTable } from '@/lib/reading/verdicts'
import type { MonthlyData, SubjectVoiceRow } from '@/lib/pages/monthly'
import { presentation, T } from './email-table'

/**
 * MR6 · One voice per subject (Phase 1 WP18; the mock's section 6, new in
 * Heinrich's revision 6).
 *
 * WHY IT IS ONE PER SUBJECT AND NOT SIX ON ONE. Subjects' own SU2 prints six
 * voices on the subject a reader has SELECTED, which is right for a page where
 * the reader is choosing. An artefact chooses nothing: it is read once, in
 * order, by somebody who did not ask a question, so it gives each of the five
 * to eight subjects one sentence somebody actually wrote. The mock draws it as
 * a 2 × 3 grid, one quote per cell.
 *
 * THE WORDS ARE NOT OURS AND ARE NOT FROZEN. A quote travels as a ref with
 * `text: ''` inside a snapshot and resolves at render
 * (lib/renderables/quotes-freeze.ts) — which is what makes an erasure reach a
 * stored artefact. A quote whose words no longer resolve says "counted, not
 * quotable", because the reading it was evidence for still happened.
 *
 * AND A SUBJECT WITH NO VOICE KEEPS ITS ROW. Three different silences — nobody
 * said anything, what was said could not be quoted, and the subject is not
 * counted yet — read very differently to a client, and the loader tells them
 * apart (`voiceNote`). Dropping the row would tell all three as one.
 */
export const monthlyVoices: Block<MonthlyData> = {
  key: 'monthly.voices',
  title: 'One voice per subject',
  question: 'What does this month actually sound like?',

  render(data, mode = 'app', ctx) {
    const v = data.voices
    const email = mode === 'email'
    const href = `${ctx.appUrl}${v.href}`
    const frame = (children: ReactNode) => (
      <BlockFrame
        title={monthlyVoices.title}
        question={monthlyVoices.question}
        mode={mode}
        meta={v.rows.length > 0 ? `${fmtInt(v.rows.length)} named` : undefined}
        footer={email
          ? <a href={href} style={{ color: EMAIL.ink }}>Open Subjects →</a>
          : <Link href={href} className="hover:underline">Open Subjects →</Link>}
      >
        {children}
      </BlockFrame>
    )

    const empty = monthlyVoices.emptyState(data)
    if (empty) return frame(<BlockEmpty mode={mode}>{empty}</BlockEmpty>)

    // TWO COLUMNS IN THE EMAIL TOO (Block D wave 2, E-monthly). The artboard
    // draws a 2 x 3 grid and the app/print arms already do; the email arm
    // queued six quotes down one column, which is the difference between a set
    // a reader scans and a list they stop reading at the third. An email has no
    // grid, so the rows are paired into a two-cell table — and an odd last row
    // keeps its own cell rather than stretching across both, so the left column
    // stays a column.
    if (email) {
      const pairs: SubjectVoiceRow[][] = []
      for (let i = 0; i < v.rows.length; i += 2) pairs.push(v.rows.slice(i, i + 2))
      return frame(
        <table width="100%" {...presentation} style={{ ...T, tableLayout: 'fixed' }}>
          <tbody>
            {pairs.map((pair) => (
              <tr key={pair[0].subjectId}>
                {[0, 1].map((i) => (
                  <td key={i} width="50%" style={{ verticalAlign: 'top', paddingRight: i === 0 ? 12 : 0, paddingLeft: i === 0 ? 0 : 12 }}>
                    {pair[i] ? <Row row={pair[i]} mode={mode} appUrl={ctx.appUrl} /> : null}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>,
      )
    }
    // TWO COLUMNS ON SCREEN AND PAPER, one on a phone — the mock's grid, which
    // is what makes six quotes read as a set rather than as a queue.
    return frame(
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {v.rows.map((r) => <Row key={r.subjectId} row={r} mode={mode} appUrl={ctx.appUrl} />)}
      </div>,
    )
  },

  figures(): FigureTable {
    // A QUOTE IS NOT A FIGURE. This section prints no reading of the month at
    // all — it prints what the month sounded like — so it declares nothing, and
    // costs the artefact's number budget nothing.
    return {}
  },

  quotes(data): QuoteRef[] {
    // `r.voice?.quote.ref` threw on a withdrawn comment: the voice wrapper
    // survives resolution with `quote: null`, so the optional chain passes and
    // the `.ref` does not.
    return data.voices.rows.map((r) => (hasQuote(r.voice) ? r.voice.quote.ref : null)).filter((ref): ref is string => Boolean(ref))
  },

  emptyState(data) {
    const v = data.voices
    if (v.note) return v.note
    if (v.rows.length === 0) return 'No subject has been confirmed yet, so there is nothing to hear one voice on.'
    return null
  },
}

function Row({ row, mode, appUrl }: { row: SubjectVoiceRow; mode: RenderMode; appUrl: string }) {
  const email = mode === 'email'
  const href = `${appUrl}${row.href}`
  const name = email ? (
    <div style={{ fontFamily: FONT.sans, fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.6px', color: EMAIL.muted }}>
      {row.subject}
    </div>
  ) : (
    <Link href={href} className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground hover:underline">
      {row.subject}
    </Link>
  )

  // A VOICE WHOSE WORDS WERE WITHDRAWN IS STILL A VOICE ROW, and it keeps its
  // cell: `BlockQuote` says "counted, not quotable — this comment has since
  // been removed" over a quote with no words, which is the whole point of the
  // ref spine. What it must NOT fall through to is `row.note`, which says why
  // this subject was never quoted and would be a different claim. The quote
  // reaching here as null is `resolveQuotes` nulling a FIELD rather than
  // dropping an array member; BlockQuote takes it.
  const body = row.voice ? (
    <BlockQuote
      quote={row.voice.quote}
      mode={mode}
      cite={row.voice.href
        ? <a href={row.voice.href} rel="noreferrer" target="_blank" style={email ? { color: EMAIL.muted } : undefined}>{row.voice.cite}</a>
        : row.voice.cite}
    />
  ) : email ? (
    <div style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.muted, marginTop: 2 }}>{row.note}</div>
  ) : (
    <p className="m-0 text-[12px] text-muted-foreground">{row.note}</p>
  )

  return email ? (
    <div style={{ borderTop: `1px solid ${EMAIL.hairline}`, paddingTop: 12, marginTop: 14 }}>{name}{body}</div>
  ) : (
    <div className="flex min-w-0 flex-col gap-1.5">{name}{body}</div>
  )
}
