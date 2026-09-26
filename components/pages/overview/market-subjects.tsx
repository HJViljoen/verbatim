import type { RenderMode } from '@/lib/blocks/types'
import { BlockFrame } from '@/components/blocks/frame'
import { openLink } from '@/components/blocks/open-link'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, longMonth, shortDate } from '@/lib/format'
import { surface } from '@/lib/nav'
import { byMarketSize, CALIBRATION_TAG, marketLevel } from '@/lib/pages/overview-market'
import type { OverviewData, SubjectRow } from '@/lib/pages/overview'
import type { FigureTable } from '@/lib/reading/verdicts'
import { BarLegend, BaseHead, InnerLine, LevelBar, barAxis } from './market'

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

/** A row's tag: its calibration word, or when it is first read. */
function rowTag(r: SubjectRow, nextUpdate: string | null): string | null {
  if (r.calibration === 'failed') return CALIBRATION_TAG.failed
  if (r.market?.k == null) return nextUpdate ? `first reading with the ${shortDate(nextUpdate)} update` : 'not read yet'
  return CALIBRATION_TAG[r.calibration ?? 'provisional']
}

/** Whether a row prints figures at all. */
const printsFigures = (r: SubjectRow): boolean => r.calibration !== 'failed' && r.market?.k != null

const token = (id: string, suffix: 'k' | 'share' | 'prev'): string => `market_subject_${id.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}_${suffix}`

export function marketSubjectsFigures(data: OverviewData): FigureTable {
  const out: FigureTable = {}
  const month = longMonth(data.month)
  const n = data.subjects.market?.n ?? null
  const prevN = data.subjects.market?.prev?.n ?? null
  for (const r of data.subjects.rows) {
    if (!printsFigures(r)) continue
    const k = r.market?.k as number
    out[token(r.id, 'k')] = { value: k, unit: 'videos', label: `videos on ${r.label} in your market in ${month}` }
    if (n != null && marketLevel(k, n)?.kind === 'share') out[token(r.id, 'share')] = { value: Math.round((k / n) * 100), unit: 'pct', label: `${r.label}'s share of your market in ${month}` }
    const pk = r.marketPrev?.k ?? null
    if (pk != null && prevN != null && marketLevel(pk, prevN)?.kind === 'share') {
      out[token(r.id, 'prev')] = { value: Math.round((pk / prevN) * 100), unit: 'pct', label: `${r.label}'s share of your market the month before` }
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
      <BlockFrame title={MARKET_SUBJECTS_TITLE} mode={mode} footer={footer}>
        <InnerLine mode={mode}>{line}</InnerLine>
      </BlockFrame>
    )
  }
  const rows = [...b.rows].sort(byMarketSize)
  const n = b.market?.n ?? null
  const prev = b.market?.prev ?? null
  const next = data.reading?.nextUpdate ?? null
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
              <th style={{ ...num, borderTop: 0, color: EMAIL.muted, fontSize: 11 }}>Videos</th>
              <th style={{ ...num, borderTop: 0 }}><BaseHead month={data.month} n={n} mode={mode} /></th>
              {prev ? <th style={{ ...num, borderTop: 0 }}><BaseHead month={prev.month} n={prev.n} mode={mode} /></th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const tag = rowTag(r, next)
              const figures = printsFigures(r)
              return (
                <tr key={r.id}>
                  <td style={c}>{r.label}{tag ? <span style={{ fontFamily: FONT.mono, fontSize: 11, color: EMAIL.muted }}> · {tag}</span> : null}</td>
                  <td style={num}>{figures ? <span data-copy="figure">{fmtInt(r.market?.k as number)}</span> : null}</td>
                  <td style={num}>{figures ? <span data-copy="figure">{share(r.market?.k, n)}</span> : null}</td>
                  {prev ? <td style={{ ...num, color: EMAIL.muted }}>{figures ? <span data-copy="figure">{share(r.marketPrev?.k, prev.n)}</span> : null}</td> : null}
                </tr>
              )
            })}
          </tbody>
        </table>
      </BlockFrame>
    )
  }
  const cols = 'grid-cols-[minmax(150px,1.4fr)_minmax(64px,1fr)_52px_52px_52px]'
  return (
    <BlockFrame title={MARKET_SUBJECTS_TITLE} mode={mode} footer={footer}>
      <div className="-mx-1 overflow-x-auto px-1">
        <div className="min-w-[480px]" role="table">
          <div role="row" className={`grid ${cols} items-end gap-x-4 border-b border-border pb-2.5`}>
            <span role="columnheader" className="text-[12px] font-medium text-muted-foreground">Subject</span>
            <span role="columnheader"><BarLegend month={data.month} prevMonth={prev?.month ?? null} /></span>
            <span role="columnheader" className="text-right text-[12px] font-medium text-muted-foreground">Videos</span>
            <span role="columnheader"><BaseHead month={data.month} n={n} mode={mode} /></span>
            <span role="columnheader">{prev ? <BaseHead month={prev.month} n={prev.n} mode={mode} /> : null}</span>
          </div>
          {rows.map((r) => {
            const tag = rowTag(r, next)
            const figures = printsFigures(r)
            const k = r.market?.k ?? null
            const under = figures && k != null && marketLevel(k, n)?.kind === 'count'
            return (
              <div key={r.id} role="row" className={`grid ${cols} min-h-12 items-center gap-x-4 border-b border-border/60 py-1.5`}>
                <span role="rowheader" className="flex min-w-0 flex-col">
                  <span className="truncate text-[14px]">{r.label}</span>
                  {tag ? <span className="font-mono text-[11.5px] text-muted-foreground">{tag}</span> : null}
                </span>
                {figures && !under ? (
                  <LevelBar share={n ? (k as number) / n : null} prevShare={prev?.n && r.marketPrev?.k != null ? r.marketPrev.k / prev.n : null} axis={axis} />
                ) : under ? <span className="text-[12px] text-muted-foreground">under 10, a count only</span> : <span />}
                <span className="text-right font-mono text-[14px] font-semibold tabular-nums">{figures ? <span data-copy="figure">{fmtInt(k as number)}</span> : null}</span>
                <span className="text-right font-mono text-[14px] tabular-nums">{figures ? <span data-copy="figure">{share(k, n)}</span> : null}</span>
                <span className="text-right font-mono text-[14px] tabular-nums text-muted-foreground">{figures && prev ? <span data-copy="figure">{share(r.marketPrev?.k, prev.n)}</span> : null}</span>
              </div>
            )
          })}
        </div>
      </div>
    </BlockFrame>
  )
}
