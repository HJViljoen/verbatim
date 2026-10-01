import type { ReactNode } from 'react'
import { overviewCategory } from '@/components/pages/overview/category'
import { MARKET_KINDS_TITLE } from '@/components/pages/overview/market-kinds'
import { barAxis, shortMonthName } from '@/components/pages/overview/market'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt } from '@/lib/format'
import { kindsPrev, marketLevel, type MarketKinds } from '@/lib/pages/overview-market'
import type { MonthlyData } from '@/lib/pages/monthly'
import { T, presentation } from './email-table'
import { fromFrontPage } from './adapt'
import { Bar, Num, RowLabel, SubHead, Table } from './email'

/**
 * 4 · What people did in the comments (market-first WP2.1; the front page's
 * block 4): every kind and the four moods as levels on the market's base, the
 * month before beside each, and the one chip. The page's block in the app and
 * on paper; the artboard's table and mood strip in an inbox. The artboard's
 * section has no footer link, and neither does this one. Each kind's maker
 * share arrives as a row tag with WP2.3, never as a note under the section.
 */

/** A level cell: a share at 100 videos and 10 of its own, else a dot (the
 *  page's `cell`, the column head carries the "of N"). */
const cell = (k: number | null, n: number | null): string => {
  const l = marketLevel(k, n)
  return l?.kind === 'share' ? l.text : '·'
}

const MOOD_HEX: Record<string, string> = {
  positive: EMAIL.green,
  mixed: EMAIL.mixed,
  neutral: EMAIL.neutralSeg,
  negative: EMAIL.down,
}

function Mood({ m }: { m: MarketKinds }) {
  if (m.mood.length === 0) return null
  const total = m.mood.reduce((n, r) => n + (r.k ?? 0), 0)
  // No month before beside a refused market pair (T0a, MR-7).
  const prev = kindsPrev(m)
  return (
    <>
      <SubHead marginTop={24}>
        Mood <span data-copy="level" style={{ fontFamily: FONT.mono, fontSize: 12, fontWeight: 400, color: EMAIL.muted }}>of {m.judged == null ? '·' : fmtInt(m.judged)}</span>
      </SubHead>
      {total > 0 ? (
        <table width="100%" {...presentation} style={{ ...T, marginTop: 10 }}>
          <tbody>
            <tr>
              {m.mood.filter((r) => (r.k ?? 0) > 0).map((r) => (
                <td key={r.mood} aria-hidden style={{ width: `${((r.k ?? 0) / total) * 100}%`, height: 8, background: MOOD_HEX[r.mood] ?? EMAIL.cat, fontSize: 0, lineHeight: 0 }}>&nbsp;</td>
              ))}
            </tr>
          </tbody>
        </table>
      ) : null}
      <table width="100%" {...presentation} style={{ ...T, marginTop: 12 }}>
        <tbody>
          <tr>
            {m.mood.map((r) => (
              <td key={r.mood} style={{ width: '25%', verticalAlign: 'top', paddingRight: 8, fontFamily: FONT.sans }}>
                <div style={{ fontSize: 13, lineHeight: '18px', color: EMAIL.ink2 }}>
                  <span aria-hidden style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: MOOD_HEX[r.mood] ?? EMAIL.cat, marginRight: 6 }} />
                  {r.label}
                </div>
                <div style={{ marginTop: 4 }}>
                  <Num size={15}>{r.k == null ? '·' : fmtInt(r.k)}</Num>{' '}
                  <Num size={13} prev>{cell(r.k, m.judged)}</Num>
                </div>
                {prev ? (
                  <div style={{ fontSize: 12, lineHeight: '16px', color: EMAIL.muted, marginTop: 2 }}>
                    {shortMonthName(prev.month)} <Num size={12} prev>{cell(r.prevK, prev.judged)}</Num>
                  </div>
                ) : null}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </>
  )
}

function kindsEmail(data: MonthlyData): ReactNode {
  const m = data.overview.category.market
  if (!m) return null
  // No month before beside a refused market pair, and no chip (T0a, MR-7).
  const prev = kindsPrev(m)
  const axis = barAxis(m.kinds.map((r) => (r.k != null && m.n ? r.k / m.n : null)))
  return (
    <>
      <Table
        columns={[
          { head: 'Kind' },
          { head: '', width: 88, className: 'vb-m-bar' },
          { head: 'Videos', align: 'right', width: 56 },
          { head: <span data-copy="level">{shortMonthName(m.month)}<br />of {m.n == null ? '·' : fmtInt(m.n)}</span>, align: 'right', width: 56 },
          ...(prev ? [{ head: <span data-copy="level">{shortMonthName(prev.month)}<br />of {prev.n == null ? '·' : fmtInt(prev.n)}</span>, align: 'right' as const, width: 56 }] : []),
        ]}
        rows={m.kinds.map((r) => {
          const under = r.k != null && marketLevel(r.k, m.n)?.kind === 'count'
          return [
            <RowLabel key="l" tag={under ? <>under 10, a count only{prev && r.prevK != null ? <> · {shortMonthName(prev.month)} <Num size={13} prev>{fmtInt(r.prevK)}</Num></> : null}</> : null}>{r.label}</RowLabel>,
            <div key="b" style={{ paddingTop: 8 }}>{under ? null : <Bar share={r.k != null && m.n ? r.k / m.n : null} axis={axis} />}</div>,
            <Num key="k">{r.k == null ? '·' : fmtInt(r.k)}</Num>,
            <Num key="s" weight={400}>{cell(r.k, m.n)}</Num>,
            ...(prev ? [<Num key="p" prev>{cell(r.prevK, prev.n)}</Num>] : []),
          ]
        })}
      />
      <Mood m={m} />
    </>
  )
}

export const monthlyKinds = fromFrontPage({
  key: 'monthly.kinds',
  title: MARKET_KINDS_TITLE,
  block: overviewCategory,
  link: null,
  email: kindsEmail,
})
