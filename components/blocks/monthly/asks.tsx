import type { ReactNode } from 'react'
import { BlockQuote } from '@/components/blocks/quote'
import { overviewAsks } from '@/components/pages/overview/asks'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, longMonth } from '@/lib/format'
import { surface } from '@/lib/nav'
import { hasQuote } from '@/lib/renderables/quotes-freeze'
import { ASK_TITLES } from '@/lib/pages/overview-market'
import type { OverviewData } from '@/lib/pages/overview'
import type { MonthlyData } from '@/lib/pages/monthly'
import { fromFrontPage } from './adapt'
import { Inner, Num, Table } from './email'

/**
 * 5 · What your market asked, complained about and wished for (market-first
 * WP2.1; the front page's block 5): three short lists of themes not led by
 * makers, each counted in its own videos, and one quote under each list from
 * one of its themes' own evidence, dated in the month. The page's block in the
 * app and on paper; the artboard's lists and quote blocks in an inbox.
 */

/** What a list with nothing at the floor says: the page's words. */
const NOTHING: Record<string, string> = {
  question: 'No question reached 10 videos',
  pain_point: 'No complaint reached 10 videos',
  feature_request: 'No wish reached 10 videos',
}

function asksEmail(data: MonthlyData): ReactNode {
  const asks = data.overview.asks
  if (!asks) return null
  const month = longMonth(asks.month)
  return (
    <>
      {asks.lists.map((list, i) => {
        const quoted = list.rows.find((r) => hasQuote(r))
        return (
          <div key={list.kind} style={{ marginTop: i === 0 ? 0 : 24 }}>
            {list.rows.length === 0 ? (
              <>
                <div style={{ fontFamily: FONT.sans, fontSize: 15, lineHeight: '22px', fontWeight: 600, color: EMAIL.ink }}>{ASK_TITLES[list.kind]}</div>
                <div style={{ fontFamily: FONT.sans, fontSize: 15, lineHeight: '24px', color: EMAIL.muted, marginTop: 8 }}>{NOTHING[list.kind]} in {month}.</div>
              </>
            ) : (
              <Table
                columns={[
                  { head: <span style={{ fontSize: 15, lineHeight: '22px', fontWeight: 600, color: EMAIL.ink }}>{ASK_TITLES[list.kind]}</span> },
                  { head: 'videos', align: 'right', width: 64 },
                ]}
                rows={list.rows.map((r) => [
                  <span key="l" data-copy="subject" data-slot="pass_b_theme">{r.label}</span>,
                  <Num key="k">{fmtInt(r.k)}</Num>,
                ])}
              />
            )}
            {quoted?.quote ? (
              <Inner marginTop={12}>
                <BlockQuote
                  quote={quoted.quote}
                  cite={<>on “<span data-copy="subject" data-slot="pass_b_theme">{quoted.label}</span>” · a comment · {month}</>}
                  mode="email"
                />
              </Inner>
            ) : null}
          </div>
        )
      })}
    </>
  )
}

/** A withdrawn comment nulls its quote where it stands; the lists keep their
 *  rows and lose only the words. */
function withResolvedQuotes(o: OverviewData): OverviewData {
  if (!o.asks) return o
  return {
    ...o,
    asks: { ...o.asks, lists: o.asks.lists.map((l) => ({ ...l, rows: l.rows.map((r) => (r.quote && !hasQuote(r) ? { ...r, quote: null } : r)) })) },
  }
}

export const monthlyAsks = fromFrontPage({
  key: 'monthly.asks',
  title: overviewAsks.title,
  block: overviewAsks,
  link: () => {
    const page = surface('voice')
    return { href: page.href, label: `Open ${page.label} →` }
  },
  email: asksEmail,
  project: withResolvedQuotes,
})
