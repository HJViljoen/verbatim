import type { RenderMode } from '@/lib/blocks/types'
import { BlockFrame } from '@/components/blocks/frame'
import { openLink } from '@/components/blocks/open-link'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, longMonth } from '@/lib/format'
import { surface } from '@/lib/nav'
import { byMarketSize, CALIBRATION_TAG, makerWords, marketLevel } from '@/lib/pages/overview-market'
import type { OverviewData, SubjectRow } from '@/lib/pages/overview'
import type { FigureTable } from '@/lib/reading/verdicts'
import { NO_READING_YET } from '@/lib/subjects/read-in'
import { printsMarket } from '@/lib/subjects/calibration-state'
import { BarLegend, BaseHead, InnerLine, LevelBar, MakerMark, PHONE_COLS, PHONE_HIDDEN, PHONE_OWN_LINE, RULE, SCALE, barAxis } from './market'

// "The market by subject" (market-first WP1.6, plan §2.2 block 6): each
// subject's market rows (the pooled side, decision E), ranked by size, with
// its calibration word as a row tag (decision C). A subject being
// re-described prints no figure; a subject never read says when it is first
// read. No coverage line and no origin note under the block (25 Sep rulings):
// origins print on the Subjects rail.

export const MARKET_SUBJECTS_TITLE = 'The market by subject'

const share = (k: number | null | undefined, n: number | null | undefined): string => {
  const l = marketLevel(k ?? null, n ?? null)
  return l?.kind === 'share' ? l.text : '·'
}

/** The month before's cell: its share, or its count where it is under the
 *  floor (plan §2.2's print, "Price … 23 (4%)  5": a measured August under 10
 *  prints as a count with no share), and a dot only where there is no reading. */
export const prevCell = (k: number | null | undefined, n: number | null | undefined): string => marketLevel(k ?? null, n ?? null)?.text ?? '·'

/** The row's word for a month-before cell that prints a count in a share
 *  column: "August under 10, a count" (finish-list item 9: Price's August "7"
 *  read as 7%). Null where the cell prints a share or nothing. */
export function prevCountTag(k: number | null | undefined, prev: { month: string; n: number | null } | null): string | null {
  if (!prev || k == null) return null
  return marketLevel(k, prev.n ?? null)?.kind === 'count' ? `${longMonth(prev.month)} under 10, a count` : null
}

/**
 * A row's tag: its calibration word, or that it has no reading yet.
 *
 * NOT "FIRST READING WITH THE {DATE} UPDATE". §2.2's print says that of
 * Buying & delivery because its membership was judged on Fri 25 and the 27 Sep
 * run writes its first rows; the page cannot see whether a subject's
 * membership has been judged, and a subject named after the back-read with no
 * membership is read by no update. So the row says what is true of every such
 * subject, and promises no date.
 *
 * THE SAME WORDS AS EVERY OTHER SURFACE (default M-a): a subject the month was
 * not read for prints `unreadWords` (the row's `unread`), which the Subjects
 * rail and pane and This week print too; a row with no market figure for any
 * other reason keeps "no reading yet".
 */
export function rowTag(r: SubjectRow): string | null {
  // A subject that is not ready is its name alone (T0a, ruling U6): no tag,
  // no figure.
  if (!printsMarket(r.calibration)) return null
  if (r.unread) return r.unread
  if (r.market?.k == null) return NO_READING_YET
  return CALIBRATION_TAG[r.calibration ?? 'ready']
}

/**
 * The month before, as the block prints it beside this month, or null.
 *
 * THE ONE CONDITION (T0a, OV-45). The loader leaves the month before out
 * wherever the market pair is refused (`withMarketSides`), so no column,
 * tick, legend entry or count tag names it. A copy stored before that rule
 * still carries it, and the kinds block on the same page is judged on the
 * same market pair: where that block (or the size headline) carries the
 * pair's refusal, the month before is not printed here either.
 */
export function subjectsPrev(data: Pick<OverviewData, 'subjects' | 'category' | 'sentence'>): { month: string; n: number | null } | null {
  const refused = data.category?.market?.chip != null || data.sentence?.chip != null
  return refused ? null : data.subjects.market?.prev ?? null
}

/** Whether a row prints figures at all: only a ready subject's (T0a, OV-42;
 *  `printsMarket`), and never a figure nobody read. */
export const printsFigures = (r: SubjectRow): boolean => printsMarket(r.calibration) && r.market?.k != null

/** A row's maker tag, as the Subjects rail prints it (plan §2.2 block 6: at a
 *  fifth or more, "over a third makers" in the approved preview), or null
 *  under a fifth, not measured, or with no figure. */
export const rowMakers = (r: SubjectRow): string | null => (printsFigures(r) ? makerWords(r.makerShare ?? null) : null)

const token = (id: string, suffix: 'k' | 'share' | 'prev'): string => `market_subject_${id.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}_${suffix}`

export function marketSubjectsFigures(data: OverviewData): FigureTable {
  const out: FigureTable = {}
  const month = longMonth(data.month)
  const n = data.subjects.market?.n ?? null
  const prevN = subjectsPrev(data)?.n ?? null
  for (const r of data.subjects.rows) {
    if (!printsFigures(r)) continue
    const k = r.market?.k as number
    out[token(r.id, 'k')] = { value: k, unit: 'videos', label: `videos on ${r.label} in your market in ${month}` }
    if (n != null && marketLevel(k, n)?.kind === 'share') out[token(r.id, 'share')] = { value: Math.round((k / n) * 100), unit: 'pct', label: `${r.label}'s share of your market in ${month}` }
    const pk = r.marketPrev?.k ?? null
    const prevLevel = pk != null && prevN != null ? marketLevel(pk, prevN) : null
    if (prevLevel?.kind === 'share') {
      out[token(r.id, 'prev')] = { value: Math.round(((pk as number) / (prevN as number)) * 100), unit: 'pct', label: `${r.label}'s share of your market the month before` }
    } else if (prevLevel?.kind === 'count') {
      out[token(r.id, 'prev')] = { value: pk as number, unit: 'videos', label: `videos on ${r.label} in your market the month before` }
    }
  }
  return out
}

/** The one line in place of rows: no subject named, or none recorded. */
export function marketSubjectsLine(data: OverviewData): string | null {
  const b = data.subjects
  if (b.state === 'not_recorded') return 'Subjects are not recorded for this workspace yet.'
  if (b.state === 'ready' && b.rows.length > 0) return null
  return 'No subjects named yet'
}

export function renderMarketSubjects(data: OverviewData, mode: RenderMode, appUrl: string) {
  const b = data.subjects
  const nav = surface('subjects')
  const footer = openLink(mode, `${appUrl}${nav.href}`, `Open ${nav.label} →`)
  const line = marketSubjectsLine(data)
  if (line) {
    return (
      <BlockFrame title={MARKET_SUBJECTS_TITLE} mode={mode} footer={footer} roomy>
        <InnerLine mode={mode}>{line}</InnerLine>
      </BlockFrame>
    )
  }
  const rows = [...b.rows].sort(byMarketSize)
  const n = b.market?.n ?? null
  const prev = subjectsPrev(data)
  // No row prints a figure (every subject still being checked, T0a ruling U6):
  // the figure columns' heads go with the figures, so no "of N" heads nothing.
  const heads = rows.some(printsFigures)
  const axis = barAxis(rows.flatMap((r) => [
    printsFigures(r) && n ? (r.market?.k as number) / n : null,
    printsFigures(r) && prev?.n && r.marketPrev?.k != null ? r.marketPrev.k / prev.n : null,
  ]))

  if (mode === 'email') {
    const c = { fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, padding: '4px 10px 4px 0', borderTop: `1px solid ${EMAIL.hairline}`, verticalAlign: 'top' as const }
    const num = { ...c, fontFamily: FONT.mono, textAlign: 'right' as const }
    return (
      <BlockFrame title={MARKET_SUBJECTS_TITLE} mode={mode} footer={footer}>
        <table role="presentation" cellPadding={0} cellSpacing={0} style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={{ ...c, borderTop: 0, textAlign: 'left', color: EMAIL.muted, fontSize: 11 }}>Subject</th>
              <th style={{ ...num, borderTop: 0, color: EMAIL.muted, fontSize: 11 }}>{heads ? 'Videos' : null}</th>
              <th style={{ ...num, borderTop: 0 }}>{heads ? <BaseHead month={data.month} n={n} mode={mode} /> : null}</th>
              {prev ? <th style={{ ...num, borderTop: 0 }}>{heads ? <BaseHead month={prev.month} n={prev.n} mode={mode} /> : null}</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const figures = printsFigures(r)
              const tag = [rowTag(r), rowMakers(r), figures ? prevCountTag(r.marketPrev?.k, prev) : null].filter(Boolean).join(' · ')
              return (
                <tr key={r.id}>
                  <td style={c}>{r.label}{tag ? <span style={{ fontFamily: FONT.mono, fontSize: 11, color: EMAIL.muted }}> · {tag}</span> : null}</td>
                  <td style={num}>{figures ? <span data-copy="figure">{fmtInt(r.market?.k as number)}</span> : null}</td>
                  <td style={num}>{figures ? <span data-copy="figure">{share(r.market?.k, n)}</span> : null}</td>
                  {prev ? <td style={{ ...num, color: EMAIL.muted }}>{figures ? <span data-copy="figure">{prevCell(r.marketPrev?.k, prev.n)}</span> : null}</td> : null}
                </tr>
              )
            })}
          </tbody>
        </table>
      </BlockFrame>
    )
  }
  // THE PREVIEW'S COLUMNS (Main.dc.html's subjects table: 288 · 1fr · 64 ·
  // 56 · 56; d3 polish): the subject up to 288px, the bar the rest, then
  // "Videos" and the two levels. The legend says "Sep" and "Aug", as the
  // preview's narrower tile does.
  // In a narrow block the label and the three figure columns only
  // (`PHONE_COLS`, a container query on the table's wrapper).
  const cols = `${PHONE_COLS} @min-[600px]:grid-cols-[minmax(200px,288px)_minmax(96px,1fr)_64px_56px_56px]`
  const hidden = PHONE_HIDDEN
  return (
    <BlockFrame title={MARKET_SUBJECTS_TITLE} mode={mode} footer={footer} roomy>
      <div className="-mx-1 overflow-x-auto px-1 @container">
        <div className="@min-[600px]:min-w-[560px]" role="table">
          <div role="row" className={`grid ${cols} items-end ${RULE.head}`}>
            <span role="columnheader" className={SCALE.head}>Subject</span>
            <span role="columnheader" className={hidden}>{heads ? <BarLegend month={data.month} prevMonth={prev?.month ?? null} short /> : null}</span>
            <span role="columnheader" className={`text-right ${SCALE.head}`}>{heads ? 'Videos' : null}</span>
            <span role="columnheader">{heads ? <BaseHead month={data.month} n={n} mode={mode} /> : null}</span>
            <span role="columnheader">{heads && prev ? <BaseHead month={prev.month} n={prev.n} mode={mode} /> : null}</span>
          </div>
          {rows.map((r) => {
            const figures = printsFigures(r)
            const tag = [rowTag(r), figures ? prevCountTag(r.marketPrev?.k, prev) : null].filter(Boolean).join(' · ') || null
            const makers = rowMakers(r)
            const k = r.market?.k ?? null
            const under = figures && k != null && marketLevel(k, n)?.kind === 'count'
            return (
              <div key={r.id} role="row" className={`grid ${cols} min-h-12 items-center py-2 ${RULE.row}`}>
                <span role="rowheader" className="flex min-w-0 flex-col gap-0.5">
                  <span className={`[text-wrap:pretty] ${SCALE.row}`}>{r.label}</span>
                  {tag || makers ? (
                    <span className={`flex flex-wrap items-center gap-x-2 ${SCALE.tag}`}>
                      {tag ? <span>{tag}</span> : null}
                      {tag && makers ? <span aria-hidden className="max-sm:hidden">·</span> : null}
                      {/* The tag wraps inside its own column on a phone rather
                          than running under the figures beside it (d3 polish:
                          "about a third makers103" at 390). */}
                      {makers ? <span className="inline-flex min-w-0 items-center gap-1.5 @min-[600px]:whitespace-nowrap"><MakerMark />{makers}</span> : null}
                    </span>
                  ) : null}
                </span>
                {figures && !under ? (
                  <span className={`block ${hidden}`}>
                    <LevelBar share={n ? (k as number) / n : null} prevShare={prev?.n && r.marketPrev?.k != null ? r.marketPrev.k / prev.n : null} axis={axis} />
                  </span>
                ) : under ? <span className={`text-[13px] text-muted-foreground ${PHONE_OWN_LINE}`}>under 10, a count only</span> : <span className={hidden} />}
                <span className={`${SCALE.num} font-semibold`}>{figures ? <span data-copy="figure">{fmtInt(k as number)}</span> : null}</span>
                <span className={SCALE.num}>{figures ? <span data-copy="figure">{share(k, n)}</span> : null}</span>
                <span className={SCALE.prev}>{figures && prev ? <span data-copy="figure">{prevCell(r.marketPrev?.k, prev.n)}</span> : null}</span>
              </div>
            )
          })}
        </div>
      </div>
    </BlockFrame>
  )
}
