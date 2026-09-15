import type { ReactNode } from 'react'
import Link from 'next/link'
import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BlockQuote } from '@/components/blocks/quote'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt } from '@/lib/format'
import type { SalesRow } from '@/lib/pages/weekly'
import type { WeeklyData } from '@/lib/pages/weekly'

// WR4 · For sales — the customers' own words (design §3 WR section 4).
//
// BUILT HERE RATHER THAN IMPORTED. The plan hands this block to WP15 (This
// week) and says to build it here if that package has not landed — it has not,
// so this is the one, and This week is expected to import `forSales` rather
// than write a second one. The data shape it takes is deliberately the loader's
// `SalesRow`, not the weekly report's own type, so the block can be pointed at
// another surface's rows without a translation layer.
//
// NO FIGURES AND NO VERDICT ON THIS BLOCK, on purpose. It is quotation, not
// measurement: four things a customer actually said, original first and the
// English underneath where the words were not English. Declaring a count of
// objections as a figure would invite a model to cite "12 objections this week",
// which is a weekly reading of the conversation and the one thing this artefact
// may not print.

function Rail({ mode, children }: { mode: RenderMode; children: ReactNode }) {
  return mode === 'email'
    ? <div style={{ borderTop: `1px solid ${EMAIL.hairline}`, padding: '8px 0' }}>{children}</div>
    : <div className="border-t border-border/70 py-2">{children}</div>
}

function Head({ row, mode }: { row: SalesRow; mode: RenderMode }) {
  const words = (
    <>
      {row.kindLabel} · {row.label}
      {row.rival ? ` · under ${row.rival}’s post` : ''}
    </>
  )
  return mode === 'email'
    ? <div style={{ fontFamily: FONT.mono, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.5px', color: EMAIL.faint }}>{words}</div>
    : <div className="font-mono text-[10.5px] uppercase tracking-[0.05em] text-muted-foreground">{words}</div>
}

export const forSales: Block<WeeklyData> = {
  key: 'weekly.sales',
  title: 'For sales',
  question: 'What are customers pushing back on, and what are they buying on?',

  render(data, mode = 'app', ctx) {
    const s = data.sales
    const frame = (children: ReactNode) => (
      <BlockFrame
        title={forSales.title}
        question={forSales.question}
        mode={mode}
        footer={mode === 'email'
          ? <a href={`${ctx.appUrl}${s.briefHref}`} style={{ color: EMAIL.ink }}>This is the Sales brief’s short form — open the full brief →</a>
          : <Link href={s.briefHref} className="hover:underline">This is the Sales brief’s short form — open the full brief →</Link>}
      >
        {children}
      </BlockFrame>
    )
    const empty = forSales.emptyState(data)
    // THE SECTION IS PRINTED EVEN WHEN IT IS EMPTY (design §3 WR Gates):
    // "sections 4 and 5 print their empty states rather than being dropped, so
    // the artefact has the same shape every week."
    if (empty) return frame(<BlockEmpty mode={mode}>{empty}</BlockEmpty>)

    return frame(
      <div>
        {s.rows.map((r, i) => (
          <Rail key={`${r.kind}:${r.quote.ref}:${i}`} mode={mode}>
            <Head row={r} mode={mode} />
            <BlockQuote
              quote={r.quote}
              mode={mode}
              cite={r.href
                ? mode === 'email'
                  ? <a href={r.href} style={{ color: EMAIL.link, textDecoration: 'none' }}>{r.cite} →</a>
                  : <a href={r.href} className="hover:underline">{r.cite} →</a>
                : r.cite}
            />
          </Rail>
        ))}
        {s.more > 0 ? (
          mode === 'email'
            ? <div style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.muted, marginTop: 6 }}><a href={`${ctx.appUrl}/dashboard/voice`} style={{ color: EMAIL.link, textDecoration: 'none' }}>{fmtInt(s.more)} more in their own words →</a></div>
            : <Link href="/dashboard/voice" className="mt-1.5 inline-block text-[12px] font-semibold hover:underline">{fmtInt(s.more)} more in their own words →</Link>
        ) : null}
        {s.note
          ? mode === 'email'
            ? <div style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 6 }}>{s.note}</div>
            : <p className="m-0 mt-1.5 text-[11.5px] text-muted-foreground">{s.note}</p>
          : null}
      </div>,
    )
  },

  quotes(data) {
    return data.sales.rows.map((r) => r.quote.ref)
  },

  emptyState(data) {
    return data.sales.rows.length === 0
      ? data.sales.note ?? 'Nothing a customer said this month was an objection, a complaint, a switching signal or a selling point we could quote.'
      : null
  },
}
