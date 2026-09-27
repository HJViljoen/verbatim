import type { ReactNode } from 'react'
import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BlockQuote } from '@/components/blocks/quote'
import { openLink } from '@/components/blocks/open-link'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt } from '@/lib/format'
import { forSalesEmpty, type ForSalesData, type SalesGroup, type SalesQuote } from '@/lib/blocks/for-sales'
import type { FigureTable } from '@/lib/reading/verdicts'
import { RULE, SCALE } from '@/components/pages/overview/market'
import { MonthlyLink as WeeklyLink } from '@/components/blocks/monthly/email'

// "For sales" (market-first WP3.7): This week's tile (`week.sales`), drawn the
// way the approved preview draws it. WP3.7 built it as ONE block for This week
// and the weekly's WR4; the weekly stays on deploy 3's template while the
// report redesigns are paused (Heinrich, 27 Sep), so it lives here, with This
// week, and the weekly keeps components/blocks/weekly/sales.tsx as it was:
//
//   · the objections this update heard, counted in videos (the column head
//     says so), largest first;
//   · two of their own voices, dated, from under the videos that carried them;
//   · what they complain about in a brand you track, counted the same way.
//
// NO SWITCHING COUNT (the preview's This week draws none, and its weekly
// holds the line "[count once off-topic talk is set aside]"): the switch reader
// still counts the TV fashion-competition chatter "sustainable fashion" finds,
// which the segments_v1 rule does not catch (plan §2.7, CQ F102), so the count
// waits for the segments v2 judge (WP3.2) rather than print that chatter as a
// market fact. Nor praise, which the preview drops.
//
// THE HEADER IS THE TITLE ALONE AND THE FOOTER A LINK ALONE (25 Sep rulings):
// the window is in the page bar and in the weekly's masthead.

export const SALES_TITLE = 'For sales'

/** How many of their own voices the section prints: the preview's two. */
export const SALES_VOICES = 2

/** The voices: the first of each objection group's, in the groups' order,
 *  up to `SALES_VOICES`. */
export function salesVoices(s: ForSalesData): SalesQuote[] {
  return s.objections.flatMap((g) => g.quotes.slice(0, 1)).slice(0, SALES_VOICES)
}

/** An objection group's label: the insight's own theme (`groupCitations`
 *  groups by it whatever `grouping` says), a model's words read back, so it is
 *  `stored` and names the call that wrote it. */
function Label({ g }: { s: ForSalesData; g: SalesGroup }) {
  return <span data-copy="stored" data-slot="pass_a_audience_insight">{g.label}</span>
}

/** "About brands you track: complaints came up under 4 videos about
 *  Patagonia and 1 about The North Face." */
function RivalLine({ groups, email }: { groups: readonly SalesGroup[]; email: boolean }) {
  const fig = (n: number) => <span data-copy="figure" className={email ? undefined : 'font-mono font-semibold tabular-nums text-foreground'} style={email ? { fontWeight: 600 } : undefined}>{fmtInt(n)}</span>
  return (
    <>
      <strong style={email ? { fontWeight: 600, color: EMAIL.ink } : undefined} className={email ? undefined : 'font-semibold text-foreground'}>About brands you track:</strong>{' '}
      complaints came up under{' '}
      {groups.map((g, i) => (
        <span key={g.id}>
          {i === 0 ? null : i === groups.length - 1 ? ' and ' : ', '}
          {fig(g.videos)}{i === 0 ? (g.videos === 1 ? ' video' : ' videos') : ''} about {g.label}
        </span>
      ))}
      .
    </>
  )
}

function Email({ s, voices }: { s: ForSalesData; voices: SalesQuote[] }) {
  const cell = { fontFamily: FONT.sans, fontSize: 14, color: EMAIL.ink, padding: '10px 0', borderTop: `1px solid ${EMAIL.hairline}` }
  const head = { ...cell, borderTop: 0, fontSize: 11, fontWeight: 600, color: EMAIL.muted, padding: '0 0 8px' }
  return (
    <div>
      {s.objections.length > 0 ? (
        <table role="presentation" cellPadding={0} cellSpacing={0} style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead><tr><th style={{ ...head, textAlign: 'left' }}>Objections with this update</th><th style={{ ...head, textAlign: 'right' }}>Videos</th></tr></thead>
          <tbody>
            {s.objections.map((g) => (
              <tr key={g.id}>
                <td style={cell}><Label s={s} g={g} /></td>
                <td style={{ ...cell, fontFamily: FONT.mono, fontWeight: 600, textAlign: 'right' }}><span data-copy="figure">{fmtInt(g.videos)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {voices.map((v, i) => (
        <div key={v.quote.ref ?? i} style={{ borderTop: i > 0 ? `1px solid ${EMAIL.hairline}` : undefined, padding: '14px 0 4px' }}>
          <div style={{ fontFamily: FONT.sans, fontSize: 14, fontWeight: 600, color: EMAIL.ink }}>Objection</div>
          <BlockQuote quote={v.quote} cite={v.cite} mode="email" />
        </div>
      ))}
      {s.rivalComplaints.length > 0 ? (
        <div style={{ background: EMAIL.inner, borderRadius: 6, padding: '16px 20px', marginTop: 14, fontFamily: FONT.sans, fontSize: 14, lineHeight: '22px', color: EMAIL.ink2 }}>
          <RivalLine groups={s.rivalComplaints} email />
        </div>
      ) : null}
    </div>
  )
}

function App({ s, voices, mode }: { s: ForSalesData; voices: SalesQuote[]; mode: RenderMode }) {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      {s.objections.length > 0 ? (
        <div role="table" className="flex min-w-0 flex-col">
          <div role="row" className={`grid grid-cols-[minmax(0,1fr)_64px] items-end gap-x-3 ${RULE.head}`}>
            <span role="columnheader" className={SCALE.head}>Objection</span>
            <span role="columnheader" className={`text-right ${SCALE.head}`}>Videos</span>
          </div>
          {s.objections.map((g) => (
            <div key={g.id} role="row" className={`grid grid-cols-[minmax(0,1fr)_64px] min-h-11 items-center gap-x-3 py-1.5 ${RULE.row}`}>
              <span role="rowheader" className={`min-w-0 ${SCALE.row}`}><Label s={s} g={g} /></span>
              <span className={`${SCALE.num} font-semibold`}><span data-copy="figure">{fmtInt(g.videos)}</span></span>
            </div>
          ))}
        </div>
      ) : null}
      {voices.length > 0 ? (
        <div className="flex min-w-0 flex-col gap-3">
          {voices.map((v, i) => (
            <div key={v.quote.ref ?? i} className="rounded-md bg-inner px-6 py-5">
              <BlockQuote quote={v.quote} cite={v.cite} mode={mode} ground="inner" />
            </div>
          ))}
        </div>
      ) : null}
      {s.rivalComplaints.length > 0 ? (
        <div role="table" className="flex min-w-0 flex-col">
          <div role="row" className="grid grid-cols-[minmax(0,1fr)_64px] items-end gap-x-3 pb-1">
            <span role="columnheader" className="text-[15px] font-semibold text-foreground">What they complain about in a rival</span>
            <span role="columnheader" className="text-right font-mono text-[12px] text-muted-foreground">videos</span>
          </div>
          {s.rivalComplaints.map((g, i) => (
            <div key={g.id} role="row" className={`grid grid-cols-[minmax(0,1fr)_64px] min-h-11 items-center gap-x-3 py-1.5 ${i < s.rivalComplaints.length - 1 ? RULE.row : ''}`}>
              <span role="rowheader" className={`inline-flex min-w-0 items-center gap-3 ${SCALE.row}`}>
                <span aria-hidden className="size-2 shrink-0 rounded-[2px] bg-comp" />{g.label}
              </span>
              <span className={`${SCALE.num} font-semibold`}><span data-copy="figure">{fmtInt(g.videos)}</span></span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** The section, under a surface's key: `week.sales` on This week and
 *  `weekly.sales` in the weekly, whose card draws no footer (the preview's). */
export function salesSection<D>(key: string, pick: (data: D) => ForSalesData, opts: { footer?: boolean } = {}): Block<D> {
  const block: Block<D> = {
    key,
    title: SALES_TITLE,
    question: 'What stood between this update’s buyers and a yes?',

    render(data, mode = 'app', ctx) {
      const s = pick(data)
      const href = `${ctx.appUrl}${s.brief.href}`
      const footer: ReactNode = opts.footer === false ? undefined : mode === 'email' ? <WeeklyLink href={href} label="Open the sales brief →" /> : openLink(mode, href, 'Open the sales brief →')
      const empty = block.emptyState(data)
      if (empty) {
        return <BlockFrame title={SALES_TITLE} mode={mode} footer={footer} roomy card><BlockEmpty mode={mode}>{empty}</BlockEmpty></BlockFrame>
      }
      const voices = salesVoices(s)
      return (
        <BlockFrame title={SALES_TITLE} mode={mode} footer={footer} roomy card>
          {mode === 'email' ? <Email s={s} voices={voices} /> : <App s={s} voices={voices} mode={mode} />}
        </BlockFrame>
      )
    },

    figures(data): FigureTable {
      const s = pick(data)
      const out: FigureTable = {}
      s.objections.forEach((g, i) => {
        out[`objection_${i + 1}_videos`] = { value: g.videos, unit: 'videos', label: `${g.label}: videos carrying it this update` }
      })
      s.rivalComplaints.forEach((g, i) => {
        out[`rival_complaint_${i + 1}_videos`] = { value: g.videos, unit: 'videos', label: `${g.label}: videos about them carrying a complaint this update` }
      })
      return out
    },

    quotes(data) {
      return salesVoices(pick(data)).map((q) => q.quote.ref)
    },

    emptyState(data) {
      const s = pick(data)
      const empty = forSalesEmpty(s)
      if (empty) return empty
      // Only praise or switching, which the section no longer prints.
      if (s.objections.length === 0 && s.rivalComplaints.length === 0) return 'Nothing this update read was an objection worth taking to a customer.'
      return null
    },
  }
  return block
}
