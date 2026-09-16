import type { ReactNode } from 'react'
import Link from 'next/link'
import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BlockQuote } from '@/components/blocks/quote'
import { EMAIL, FONT } from '@/lib/email/theme'
import type { ForSalesBlock, SalesRow } from '@/lib/pages/weekly'

// WR4 · For sales — the customers' own words (design §3 WR section 4).
//
// THE SECOND IMPLEMENTATION, AND THE MERGE LEFT IT STANDING ON PURPOSE (Block B
// merge, 2026-09-16). WP15 and WP17 both built "For sales" in the same week,
// both at components/blocks/for-sales.tsx, each expecting the other to import
// theirs. They are not the same block:
//
//   · WP15's `forSalesBlock` (components/blocks/for-sales.tsx, data in
//     lib/blocks/for-sales.ts) reads THIS UPDATE'S WINDOW and prints grouped
//     counts of VIDEOS — objections, praise, switching, rival complaints —
//     with a denominator on the block and quotes under each group. That is the
//     shape the plan's WP15 section describes, and it calls it "the WR4 block".
//   · This one reads THE MONTH and prints a flat list of four quotes, one per
//     insight kind, with no count anywhere.
//
// Folding this into WP15's would mean re-basing lib/pages/weekly.ts's
// `loadSales` from the month onto the run's window and producing `ForSalesData`
// — a new §4 for an artefact whose current one was verified end to end against
// Sealand. A merge is not the place to invent that, so both stand, each at its
// own path, and WP19 (reports rewired) closes it by making `WeeklyData.sales`
// a `ForSalesData` and registering `forSalesBlock('weekly.sales', (d) =>
// d.sales)`. Until then: if you change what a salesperson is told, change it
// in BOTH, and prefer WP15's as the one the product is heading for.
//
// THE COPY HALF IS CLOSED ALREADY (Block B fix pass). The two blocks asked a
// salesperson two different questions about the same week — this one "What are
// customers pushing back on, and what are they buying on?" and This week's
// "What is being pushed back on, and what can be repeated?" — so both now ask
// this one. WP19 still owns the rest: this prints four uncounted quotes, one
// per kind, where This week prints counts, a denominator caveat and "Grouped by
// theme — the grouping is ours and it can change." Same reading, same week, two
// shapes, until the data half is folded.
//
// SO IT TAKES `{ sales }`, NOT `WeeklyData`. The status note pinned the shape
// as `Block<{ sales: ForSalesBlock }>` and said WP15 should hand it the
// loader's own rows without a translation layer — and the code declared
// `Block<WeeklyData>`, which This week could not satisfy without building the
// whole weekly reading. The render only ever touches `data.sales` and
// `ctx.appUrl`, so the narrower type is the true one, and `WeeklyData`
// structurally satisfies it: the weekly report keeps passing its own reading
// in unchanged.
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
      {/* `kindLabel` is code's word for the kind; `label` is the model's own
          name for what was raised (`pass_b_theme`, policy 'none' — never
          direction-scrubbed at write time), so only the second is marked. */}
      {row.kindLabel} · <span data-copy="subject" data-slot="pass_b_theme">{row.label}</span>
      {row.rival ? ` · under ${row.rival}’s post` : ''}
    </>
  )
  return mode === 'email'
    ? <div style={{ fontFamily: FONT.mono, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.5px', color: EMAIL.faint }}>{words}</div>
    : <div className="font-mono text-[10.5px] uppercase tracking-[0.05em] text-muted-foreground">{words}</div>
}

export const forSales: Block<{ sales: ForSalesBlock }> = {
  key: 'weekly.sales',
  title: 'For sales',
  question: 'What are customers pushing back on, and what are they buying on?',

  render(data, mode = 'app', ctx) {
    const s = data.sales
    // ABSOLUTE IN EVERY MODE (lib/blocks/types.ts, BlockContext.appUrl). Only
    // the email obeyed this, so the PDF's "one link per section" were dead
    // hrefs and the share page's links were relative although its own header
    // claims they "point at the app, absolutely".
    const briefHref = `${ctx.appUrl}${s.briefHref}`
    const voiceHref = `${ctx.appUrl}/dashboard/voice`
    const frame = (children: ReactNode) => (
      <BlockFrame
        title={forSales.title}
        question={forSales.question}
        mode={mode}
        footer={mode === 'email'
          ? <a href={briefHref} style={{ color: EMAIL.ink }}>This is the Sales brief’s short form — open the full brief →</a>
          : <Link href={briefHref} className="hover:underline">This is the Sales brief’s short form — open the full brief →</Link>}
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
        {/* THE LINK, WITHOUT A COUNT. This said "{n} more in their own words",
            where n was the query's LIMIT minus the four printed — so Össur and
            Sealand both printed 116 while their real numbers were 838 and
            1,486. A count nobody counted is not worth a reader's trust; the
            link is what the line was for. */}
        {s.hasMore ? (
          mode === 'email'
            ? <div style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.muted, marginTop: 6 }}><a href={voiceHref} style={{ color: EMAIL.link, textDecoration: 'none' }}>More in their own words →</a></div>
            : <Link href={voiceHref} className="mt-1.5 inline-block text-[12px] font-semibold hover:underline">More in their own words →</Link>
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
