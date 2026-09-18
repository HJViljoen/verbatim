import type { ReactNode } from 'react'
import Link from 'next/link'
import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BlockQuote } from '@/components/blocks/quote'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, shortDate } from '@/lib/format'
import { forSalesEmpty, groupingLine, type ForSalesData, type SalesGroup, type SalesQuote } from '@/lib/blocks/for-sales'
import type { FigureTable } from '@/lib/reading/verdicts'

// WR4 · For sales (design §3 WR section 4; the artboard's counted rows).
//
// THE SECOND IMPLEMENTATION IS GONE (block D wave 2). WP15 and WP17 both built
// "For sales" in the same week and the merge left both standing, each with its
// own DATA: WP15's counted groups of videos over THIS UPDATE'S WINDOW, and this
// artefact's flat list of four quotes over THE MONTH with no count anywhere.
// Its own header said what to do about it — "WP19 closes it by making
// `WeeklyData.sales` a `ForSalesData`" — and that is what has happened:
// `lib/pages/week.ts:buildSales` is called once per artefact, so the page and
// the report cannot tell a salesperson two different things about one week.
//
// THE MARKUP IS STILL THIS ARTEFACT'S, AND DELIBERATELY. `forSalesBlock`
// (components/blocks/for-sales.tsx) draws the same data as a ranked bar chart
// with quote rails, which is what the ThisWeek artboard asks for at page width.
// The WeeklyReport artboard asks for something else at 600: counted ROWS — a
// title, a mono 16/600 figure at the right end, a mono denominator under it —
// and one shaded card of a customer's own words. One reading, two renderings,
// and the rendering is what a mock is for.
//
// WHERE THE MOCK'S ROWS BREAK A RULE (mock-gap §6):
//
//   · "Switching signals, both toward Sealand" (D14). NOTHING anywhere on this
//     branch records which way a switch points — searched for `toward` across
//     lib, components and app. The count is printed and the row says the
//     direction is not resolved, rather than inventing the half a salesperson
//     would act on;
//   · "96 videos this week" with no denominator (D10/D8). `ForSalesData.videos`
//     is the n every count here is against, and where it is null — every
//     workspace until M3 is applied — `NO_DENOMINATOR` says so once instead of
//     four counts floating free;
//   · "videos this month · asked under their content" on the rival row (D8).
//     The rival count is the UPDATE's, off the same window as the row above it;
//     it is labelled that way and not as a month;
//   · the selling-point card's "On-screen text on the same video" has no field
//     on any reading surface — OCR is a pipeline input and nothing prints it
//     beside a quote — so the card carries the quote and its provenance.

const NO_DENOMINATOR =
  'The number of videos dated inside this update’s window is not recorded for this workspace yet, so these counts have nothing to be a share of.'

/**
 * The artboard's counted row: a title, a mono 16/600 figure at the right end, a
 * mono denominator under it, and an optional green link.
 *
 * THE MARKERS ARE REAL NOW, AND THEY USED NOT TO BE. This docblock said "the
 * figure is marked a level when it has its 'of N' and a bare figure when it
 * does not — which is rule (b) made visible rather than asserted", and the row
 * carried no `data-copy` at all: the block printed four counts at 16px and
 * `assertCopyContract` had nothing to check rule (b) against, so the contract
 * passed vacuously over the one block on the artefact that is nothing but
 * counts. The figure is `data-copy="figure"` always, and the line under it is
 * `data-copy="level"` exactly when the caller passes a denominator with it —
 * so a `denominatorOf` that stops printing its "of N" fails the block's own
 * render test instead of going quiet.
 */
function CountedRow({
  title, value, of, denominated, link, last = false, mode, children,
}: {
  title: ReactNode
  value: string
  /** The denominator line under the figure, or the basis where there is none. */
  of: string
  /** True when `of` carries a real "of N" — then it is the level node. */
  denominated: boolean
  link?: { href: string; label: ReactNode } | null
  last?: boolean
  mode: RenderMode
  children?: ReactNode
}) {
  const figure = <span data-copy="figure" style={mode === 'email' ? { fontFamily: FONT.mono, fontSize: 16, fontWeight: 600, color: EMAIL.ink } : undefined} className={mode === 'email' ? undefined : 'font-mono text-[16px] font-semibold tabular-nums'}>{value}</span>
  const copy = denominated ? ({ 'data-copy': 'level' } as const) : {}
  if (mode === 'email') {
    return (
      <table width="100%" role="presentation" cellPadding={0} cellSpacing={0} border={0} style={{ borderCollapse: 'collapse', borderSpacing: 0, borderBottom: last ? undefined : `1px solid ${EMAIL.hairline}` }}>
        <tbody>
          <tr>
            <td style={{ padding: '11px 0', verticalAlign: 'top' }}>
              <table width="100%" role="presentation" cellPadding={0} cellSpacing={0} border={0} style={{ borderCollapse: 'collapse', borderSpacing: 0 }}>
                <tbody>
                  <tr>
                    <td style={{ fontFamily: FONT.sans, fontSize: 14, color: EMAIL.ink }}>{title}</td>
                    <td align="right" style={{ whiteSpace: 'nowrap', paddingLeft: 14 }}>{figure}</td>
                  </tr>
                </tbody>
              </table>
              <div {...copy} style={{ fontFamily: FONT.mono, fontSize: 11, color: EMAIL.muted, marginTop: 5 }}>{of}</div>
              {link ? <div style={{ marginTop: 5 }}><a href={link.href} style={{ fontFamily: FONT.sans, fontSize: 12, fontWeight: 500, color: EMAIL.link, textDecoration: 'none' }}>{link.label} →</a></div> : null}
              {children}
            </td>
          </tr>
        </tbody>
      </table>
    )
  }
  return (
    <div className={`flex min-h-[44px] flex-col gap-1.5 py-2.5 ${last ? '' : 'border-b border-border/70'}`}>
      <div className="flex items-baseline justify-between gap-3.5">
        <span className="min-w-0 text-[14px]">{title}</span>
        <span className="flex-none">{figure}</span>
      </div>
      <span {...copy} className="font-mono text-[11px] text-muted-foreground">{of}</span>
      {link ? <Link href={link.href} className="text-[12px] font-medium hover:underline">{link.label} →</Link> : null}
      {children}
    </div>
  )
}

/** The mock's shaded card: the customers' own words, with their provenance. */
function WordsCard({ quotes, mode }: { quotes: readonly SalesQuote[]; mode: RenderMode }) {
  if (quotes.length === 0) return null
  const label = 'In the customers’ words'
  if (mode === 'email') {
    return (
      <div style={{ background: EMAIL.inner, borderRadius: 6, padding: '14px 16px', marginTop: 14 }}>
        <div style={{ fontFamily: FONT.sans, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.6px', color: EMAIL.muted }}>{label}</div>
        {quotes.map((q, i) => <BlockQuote key={i} quote={q.quote} cite={q.cite} mode={mode} />)}
      </div>
    )
  }
  return (
    <div className="mt-3.5 flex min-w-0 flex-col gap-2 rounded-md bg-inner px-4 py-3.5">
      <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{label}</span>
      {quotes.map((q, i) => <BlockQuote key={i} quote={q.quote} cite={q.cite} mode={mode} />)}
    </div>
  )
}

function Note({ mode, children }: { mode: RenderMode; children: ReactNode }) {
  return mode === 'email'
    ? <div style={{ fontFamily: FONT.sans, fontSize: 11.5, lineHeight: 1.5, color: EMAIL.muted, marginTop: 8 }}>{children}</div>
    : <p className="m-0 mt-2 text-[11.5px] leading-relaxed text-muted-foreground">{children}</p>
}

/**
 * "videos carrying it · of 655 videos dated in the window", or the basis alone
 * when there is no denominator.
 *
 * "DATED IN THE WINDOW", NOT "THIS UPDATE". `ForSalesData.videos` is
 * `window_denominators` summed over the update's window — videos dated by the
 * COMMENT — while WR3's "271 videos gathered" three inches up is dated by when
 * we LOOKED. Both said "this update" and a reader had no way to tell that they
 * are different measures of different things, which is exactly the confusion
 * the two-clocks note in WR3 exists to prevent.
 */
const denominatorOf = (videos: number | null, what: string): string =>
  videos == null ? what : `${what} · of ${fmtInt(videos)} videos dated in the window`

/** "2 more objections — is it really recycled and zips" — the objections the
 *  block counted and did not give a row of their own, NAMED in the link rather
 *  than hidden behind "more".
 *
 *  THE COUNT IS `objectionsTotal`, NEVER THE SLICE. `objections` arrives capped
 *  at `SALES_GROUPS_SHOWN` = 3, so `groups.slice(1).length` said "2 more
 *  objections" on every tenant with three or more groups whatever the real
 *  number was — the `switching.length` rule, one field over. Where the total is
 *  larger than what can be named, the link says "including" rather than
 *  promising that the names ARE the remainder.
 *
 *  THE NAMES ARE RETURNED SEPARATELY because they are a model's words when the
 *  grouping is a theme, and the caller has to mark them: rule (c) sweeps
 *  unmarked markup, and "Concerns about declining quality" is a real label off
 *  the register (components/blocks/theme-label.test.tsx). */
function nameRest(groups: readonly SalesGroup[], total: number | null): { head: string; names: string } | null {
  const named = groups.slice(1)
  if (named.length === 0) return null
  const rest = Math.max(named.length, (total ?? groups.length) - 1)
  const names = named.map((g) => g.label.toLowerCase())
  const head = rest === 1 ? 'One more objection' : `${fmtInt(rest)} more objections`
  return {
    head: `${head}${rest > named.length ? ', including' : ''} —`,
    names: names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`,
  }
}

export const forSales: Block<{ sales: ForSalesData }> = {
  key: 'weekly.sales',
  title: 'For sales',
  question: 'What are customers pushing back on, and what are they buying on?',

  render(data, mode = 'app', ctx) {
    const s = data.sales
    // ABSOLUTE IN EVERY MODE (lib/blocks/types.ts, BlockContext.appUrl). Only
    // the email obeyed this, so the PDF's "one link per section" were dead
    // hrefs and the share page's links were relative although its own header
    // claims they "point at the app, absolutely".
    const briefHref = `${ctx.appUrl}${s.brief.href}`
    const frame = (children: ReactNode) => (
      <BlockFrame
        title={forSales.title}
        question={forSales.question}
        mode={mode}
        meta={s.videos != null ? `${fmtInt(s.videos)} videos in the window` : undefined}
        footer={mode === 'email'
          ? <a href={briefHref} style={{ color: EMAIL.ink }}>{s.brief.label}</a>
          : <Link href={briefHref} className="hover:underline">{s.brief.label}</Link>}
        footerNote={s.window ? `${shortDate(s.window.from)} – ${shortDate(s.window.to)}` : undefined}
      >
        {children}
      </BlockFrame>
    )
    const empty = forSales.emptyState(data)
    // THE SECTION IS PRINTED EVEN WHEN IT IS EMPTY (design §3 WR Gates):
    // "sections 4 and 5 print their empty states rather than being dropped, so
    // the artefact has the same shape every week."
    if (empty) return frame(<BlockEmpty mode={mode}>{empty}</BlockEmpty>)

    const top = s.objections[0] ?? null
    const rival = s.rivalComplaints[0] ?? null
    const rest = nameRest(s.objections, s.objectionsTotal)
    // WHOSE WORDS THE HEADING IS. A group is keyed by a SUBJECT the client
    // named or by a THEME a model wrote (`SalesGrouping`), and only the second
    // is model prose — marking a client's own subject `pass_b_theme` would
    // claim a provenance it does not have (the thirteen words: a subject is
    // theirs, a theme is ours).
    const named = (label: string) => (s.grouping === 'theme'
      ? <span data-copy="subject" data-slot="pass_b_theme">{label}</span>
      : <>{label}</>)
    return frame(
      <div>
        {top ? (
          <CountedRow
            mode={mode}
            title={<>They object to {named(top.label.toLowerCase())}</>}
            value={fmtInt(top.videos)}
            of={denominatorOf(s.videos, 'videos carrying it')}
            denominated={s.videos != null}
            link={rest ? { href: briefHref, label: <>{rest.head} {named(rest.names)}</> } : null}
            last={!rival && s.switchingTotal == null}
          />
        ) : null}

        {rival ? (
          <CountedRow
            mode={mode}
            title={<>They complain about {rival.label}</>}
            value={fmtInt(rival.videos)}
            // A SUBSET, AND THE ROW SAYS SO. `rivalComplaints` is the objection
            // citations whose audience is `competitor:*` — drawn from the same
            // pool as the row above, not beside it — so two adjacent counts
            // over one n invited a reader to add them together.
            of={denominatorOf(s.videos, 'videos under that rival’s content, never under yours — and inside the count above')}
            denominated={s.videos != null}
            last={s.switchingTotal == null}
          />
        ) : null}

        {s.switchingTotal != null ? (
          <CountedRow
            mode={mode}
            last
            title="Someone said they were moving between brands"
            value={fmtInt(s.switchingTotal)}
            // D14: the mock says "both toward Sealand · 7 toward, 5 away", and
            // nothing on this branch records which way a switch points. The
            // "N below" clause is true because the card below now DRAWS them.
            of={`comments this update${s.switching.length > 0 && s.switchingTotal > s.switching.length ? ` · ${fmtInt(s.switching.length)} below` : ''} · which way they point is not recorded`}
            // A COUNT OF COMMENTS, NOT A SHARE OF THE VIDEO DENOMINATOR. Every
            // other row here counts videos; this one counts comments, and
            // `videos` is not its n (FigureCell's rule for an omitted "of").
            denominated={false}
          />
        ) : null}

        {/* AND THE SWITCHING WORDS ARE IN IT. The row promised "· 1 below" and
            the card was handed praise and the top objection only, so the
            clause pointed at nothing. They are the one row whose DIRECTION the
            product refuses to resolve, which makes the commenter's own
            sentence the most useful thing §4 can hand a salesperson. */}
        <WordsCard quotes={[...s.praise, ...(top?.quotes.slice(0, 1) ?? []), ...s.switching]} mode={mode} />

        {s.videos == null ? <Note mode={mode}>{NO_DENOMINATOR}</Note> : null}
        <Note mode={mode}>{groupingLine(s.grouping)}</Note>
      </div>,
    )
  },

  figures(data): FigureTable {
    // THE SAME TOKENS `forSalesBlock` DECLARES, because it is the same reading:
    // a snapshot of either artefact freezes one set of keys.
    const s = data.sales
    const out: FigureTable = {}
    if (s.videos != null) out.sales_videos = { value: s.videos, unit: 'videos', label: 'videos this update covered' }
    s.objections.forEach((g, i) => {
      out[`objection_${i + 1}_videos`] = { value: g.videos, unit: 'videos', label: `${g.label} — videos carrying it` }
    })
    if (s.switchingTotal != null) {
      out.switching_comments = { value: s.switchingTotal, unit: 'comments', label: 'comments naming a switch' }
    }
    return out
  },

  quotes(data) {
    // WHAT IS DRAWN, AND ONLY THAT. A snapshot freezes the refs a render will
    // resolve; declaring a quote this artefact does not print would freeze a
    // voice nobody reads here.
    const s = data.sales
    return [
      ...s.praise.map((q) => q.quote.ref),
      ...(s.objections[0]?.quotes.slice(0, 1) ?? []).map((q) => q.quote.ref),
      ...s.switching.map((q) => q.quote.ref),
    ]
  },

  emptyState(data) {
    return forSalesEmpty(data.sales)
  },
}
