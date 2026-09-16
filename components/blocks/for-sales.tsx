import Link from 'next/link'
import type { Block } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BlockQuote } from '@/components/blocks/quote'
import { BlockRanked, type BlockRankedRow } from '@/components/blocks/bars'
import { BlockStat } from '@/components/blocks/stat'
import { forSalesEmpty, groupingLine, type ForSalesData, type SalesGroup, type SalesQuote } from '@/lib/blocks/for-sales'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt } from '@/lib/format'
import type { FigureTable } from '@/lib/reading/verdicts'

/**
 * "For sales this week" — the block, once, for both artefacts that carry it
 * (Phase 1 WP15; the mock's ThisWeek §7 and the weekly report's WR4).
 *
 * A FACTORY, NOT A BLOCK, because `Block<D>` is typed on the page's whole data
 * and This week's `WeekData` is not the weekly report's. `forSalesBlock(key,
 * pick)` takes the one function that finds the section inside a page's data and
 * hands back a block the page can put in its own list — so WP17 writes
 * `forSalesBlock('weekly.sales', (d) => d.sales)` and gets the same markup,
 * the same empty sentence and the same figures rather than a second
 * implementation that drifts from this one within a month.
 *
 * WHAT IT PRINTS, AND WHAT IT REFUSES TO. Counts of VIDEOS with the customers'
 * own words under them, and no score anywhere: "96 videos carried this
 * objection" is a measurement a salesperson can act on and "objection pressure:
 * high" is a number somebody made up. The n is on the block, once, because a
 * count without its denominator is the thing the copy contract's rule (b)
 * exists to stop.
 */
export function forSalesBlock<D>(key: string, pick: (data: D) => ForSalesData): Block<D> {
  const block: Block<D> = {
    key,
    title: 'For sales',
    question: 'What is being pushed back on, and what can be repeated?',

    render(data, mode = 'app', ctx) {
      const d = pick(data)
      const email = mode === 'email'
      const empty = forSalesEmpty(d)
      const href = `${ctx.appUrl}${d.brief.href}`
      const of = d.videos != null ? `of ${fmtInt(d.videos)} videos this update` : 'this update'

      return (
        <BlockFrame
          title={block.title}
          question={block.question}
          mode={mode}
          meta={d.videos != null ? `${fmtInt(d.videos)} videos this update` : undefined}
          footer={email
            ? <a href={href} style={{ color: EMAIL.ink }}>{d.brief.label}</a>
            : <Link href={href} className="hover:underline">{d.brief.label}</Link>}
        >
          {empty ? <BlockEmpty mode={mode}>{empty}</BlockEmpty> : null}

          {d.objections.length > 0 ? (
            <Section title="The objections this update heard" mode={mode}>
              <BlockRanked mode={mode} rows={rank(d.objections, d.videos)} />
              {d.videos == null ? <Note mode={mode}>{NO_DENOMINATOR}</Note> : null}
              <Note mode={mode}>{groupingLine(d.grouping)}</Note>
              <Note mode={mode}>Grounded answers to these sit in the sales brief.</Note>
              <Quotes quotes={d.objections[0]?.quotes ?? []} mode={mode} />
            </Section>
          ) : null}

          {d.praise.length > 0 ? (
            <Section title="A selling point, in their words" mode={mode}>
              <Quotes quotes={d.praise} mode={mode} />
            </Section>
          ) : null}

          {d.switching.length > 0 ? (
            <Section title="Switching signals" mode={mode}>
              {/* THE COUNT IS `switchingTotal`, NEVER `switching.length`. That
                  array is capped at `SALES_SWITCHING_SHOWN` before it gets
                  here, so counting it printed the CAP as a measurement: both
                  tenants read "2 comments · someone said they were moving
                  between brands" in a production render and always would have,
                  whether the real number was 2 or 200. Where the total is
                  unknown no stat is drawn at all — the quotes stand on their
                  own, and a number nobody measured does not. */}
              {d.switchingTotal != null ? (
                <BlockStat
                  mode={mode}
                  size="sm"
                  value={fmtInt(d.switchingTotal)}
                  unit={d.switchingTotal === 1 ? 'comment' : 'comments'}
                  base={`someone said they were moving between brands — ${of}${
                    d.switchingTotal > d.switching.length ? ` · ${fmtInt(d.switching.length)} below` : ''
                  }`}
                />
              ) : null}
              <Quotes quotes={d.switching} mode={mode} />
            </Section>
          ) : null}

          {d.rivalComplaints.length > 0 ? (
            <Section title="What they complain about in a rival" mode={mode}>
              <BlockRanked mode={mode} rows={rank(d.rivalComplaints, d.videos)} />
              <Note mode={mode}>Counted under videos about that rival, never under yours.</Note>
              {d.videos == null && d.objections.length === 0 ? <Note mode={mode}>{NO_DENOMINATOR}</Note> : null}
            </Section>
          ) : null}
        </BlockFrame>
      )
    },

    figures(data): FigureTable {
      const d = pick(data)
      const out: FigureTable = {}
      if (d.videos != null) {
        out.sales_videos = { value: d.videos, unit: 'videos', label: 'videos this update covered' }
      }
      d.objections.forEach((g, i) => {
        out[`objection_${i + 1}_videos`] = { value: g.videos, unit: 'videos', label: `${g.label} — videos carrying it` }
      })
      if (d.switchingTotal != null) {
        out.switching_comments = { value: d.switchingTotal, unit: 'comments', label: 'comments naming a switch' }
      }
      return out
    },

    quotes(data) {
      const d = pick(data)
      return [
        ...d.objections.flatMap((g) => g.quotes.map((q) => q.quote.ref)),
        ...d.praise.map((q) => q.quote.ref),
        ...d.switching.map((q) => q.quote.ref),
        ...d.rivalComplaints.flatMap((g) => g.quotes.map((q) => q.quote.ref)),
      ]
    },

    emptyState(data) {
      return forSalesEmpty(pick(data))
    },
  }
  return block
}

/**
 * The sentence for a ranked count with nothing to be a count OF.
 *
 * `d.videos` is null wherever the windowed read is not available — which is
 * every workspace until M3 is applied — and a bare "Brand controversy 3" is the
 * score rule (b) exists to stop. Named here rather than dropped, because
 * printing three counts with no denominator anywhere and saying nothing about
 * it is how a page stops being readable without looking broken.
 */
const NO_DENOMINATOR =
  'The number of videos this update covered is not recorded for this workspace yet, so these counts have nothing to be a share of.'

/**
 * Bars relative to the largest group, never to the denominator: a ranked list
 * is about order and relative size, and scaling four objections against every
 * video of the update would draw four invisible stubs.
 *
 * THE COUNT CARRIES ITS DENOMINATOR AND IS MARKED AS THE LEVEL IT IS. A bare
 * `fmtInt(g.videos)` marked `data-copy="figure"` by `BlockRanked` passed the
 * copy contract while printing exactly what rule (b) forbids — my production
 * render of Össur read "Brand controversy 3 · Brand association controversy 2"
 * with no "of N" on any row and no n on the block. Marking it a level is what
 * makes the rule apply; where there is no denominator to print, the count stays
 * unmarked and `NO_DENOMINATOR` says why.
 */
function rank(groups: readonly SalesGroup[], of: number | null): BlockRankedRow[] {
  const max = Math.max(1, ...groups.map((g) => g.videos))
  return groups.map((g) => ({
    label: g.label,
    pct: (g.videos / max) * 100,
    color: 'var(--cat)',
    count: of != null
      ? <span data-copy="level">{fmtInt(g.videos)} of {fmtInt(of)} videos</span>
      : fmtInt(g.videos),
  }))
}

function Section({ title, mode, children }: { title: string; mode: 'app' | 'print' | 'email'; children: React.ReactNode }) {
  if (mode === 'email') {
    return (
      <div style={{ marginTop: 10 }}>
        <div style={{ fontFamily: FONT.sans, fontSize: 11, fontWeight: 600, color: EMAIL.muted, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>{title}</div>
        {children}
      </div>
    )
  }
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h3 className="m-0 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">{title}</h3>
      {children}
    </div>
  )
}

function Note({ mode, children }: { mode: 'app' | 'print' | 'email'; children: React.ReactNode }) {
  if (mode === 'email') {
    return <div style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 3 }}>{children}</div>
  }
  return <p className="m-0 text-[11.5px] text-muted-foreground">{children}</p>
}

function Quotes({ quotes, mode }: { quotes: readonly SalesQuote[]; mode: 'app' | 'print' | 'email' }) {
  if (quotes.length === 0) return null
  if (mode === 'email') {
    return <div>{quotes.map((q, i) => <BlockQuote key={i} quote={q.quote} cite={q.cite} mode={mode} />)}</div>
  }
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      {quotes.map((q, i) => <BlockQuote key={i} quote={q.quote} cite={q.cite} mode={mode} />)}
    </div>
  )
}
