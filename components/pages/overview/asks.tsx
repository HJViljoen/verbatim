import type { Block, QuoteRef } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BlockQuote } from '@/components/blocks/quote'
import { openLink } from '@/components/blocks/open-link'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, longMonth } from '@/lib/format'
import { surface } from '@/lib/nav'
import type { FigureTable } from '@/lib/reading/verdicts'
import { ASK_TITLES, themeToken, type AsksBlock } from '@/lib/pages/overview-market'
import type { OverviewData } from '@/lib/pages/overview'
import { isMarketPage } from './market'

// "What your market asked, complained about and wished for" (market-first
// WP1.6, plan §2.2 block 5): three short lists of themes not led by makers, by
// kind, each theme counted in its own videos, and one quote under each list:
// the evidence of one of its themes' own insights, of that kind, dated in the
// month, never from the video's own account (the loader applies the rule).
//
// NO ALL-VIDEOS COUNT IN THE HEADERS (§4.2 `AsksBlock`): each list counts its
// own themes, so the column head says "videos" and nothing else.

/** What a list with nothing at the floor says, inside its column. */
const NOTHING: Record<string, string> = {
  question: 'No question reached 10 videos',
  pain_point: 'No complaint reached 10 videos',
  feature_request: 'No wish reached 10 videos',
}

function List({ list, month, mode }: { list: AsksBlock['lists'][number]; month: string; mode: 'app' | 'print' | 'email' }) {
  const quote = list.rows.find((r) => r.quote)?.quote ?? null
  const cite = `a comment · ${longMonth(month)}`
  if (mode === 'email') {
    return (
      <div style={{ marginTop: 10 }}>
        <div style={{ fontFamily: FONT.sans, fontSize: 13, fontWeight: 600, color: EMAIL.ink }}>{ASK_TITLES[list.kind]}</div>
        {list.rows.length === 0 ? (
          <div style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.muted }}>{NOTHING[list.kind]} in {longMonth(month)}.</div>
        ) : list.rows.map((r) => (
          <div key={r.registryId} style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, borderTop: `1px solid ${EMAIL.hairline}`, padding: '3px 0' }}>
            <span data-copy="subject" data-slot="pass_b_theme">{r.label}</span> · <span data-copy="figure">{fmtInt(r.k)}</span> videos
          </div>
        ))}
        {quote ? <BlockQuote quote={quote} cite={cite} mode={mode} /> : null}
      </div>
    )
  }
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col">
        <div className="flex items-baseline justify-between border-b border-border pb-2">
          <span className="text-[14px] font-semibold">{ASK_TITLES[list.kind]}</span>
          <span className="text-[12px] text-muted-foreground">videos</span>
        </div>
        {list.rows.length === 0 ? (
          <p className="m-0 py-2.5 text-[13px] text-muted-foreground">{NOTHING[list.kind]} in {longMonth(month)}.</p>
        ) : list.rows.map((r) => (
          <div key={r.registryId} className="flex min-h-11 items-center justify-between gap-3 border-b border-border/60 last:border-b-0">
            <span className="min-w-0 truncate text-[14px]" title={r.label}><span data-copy="subject" data-slot="pass_b_theme">{r.label}</span></span>
            <span className="font-mono text-[14px] font-semibold tabular-nums"><span data-copy="figure">{fmtInt(r.k)}</span></span>
          </div>
        ))}
      </div>
      {quote ? (
        <div className="rounded-md bg-inner px-5 py-4">
          <BlockQuote quote={quote} cite={cite} mode={mode} />
        </div>
      ) : null}
    </div>
  )
}

export const overviewAsks: Block<OverviewData> = {
  key: 'overview.asks',
  title: 'What your market asked, complained about and wished for',
  question: 'What did your market ask for, complain about and wish for?',

  render(data, mode = 'app', ctx) {
    const asks = data.asks ?? null
    const voice = surface('voice')
    const footer = openLink(mode, `${ctx.appUrl}${voice.href}`, `Open ${voice.label} →`)
    const empty = overviewAsks.emptyState(data)
    return (
      <BlockFrame title={overviewAsks.title} mode={mode} footer={footer}>
        {empty || !asks ? (
          <BlockEmpty mode={mode}>{empty}</BlockEmpty>
        ) : mode === 'email' ? (
          <div>{asks.lists.map((l) => <List key={l.kind} list={l} month={asks.month} mode={mode} />)}</div>
        ) : (
          <div className="grid grid-cols-1 gap-x-12 gap-y-8 xl:grid-cols-3" data-print-cols="3">
            {asks.lists.map((l) => <List key={l.kind} list={l} month={asks.month} mode={mode} />)}
          </div>
        )}
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    const out: FigureTable = {}
    for (const l of data.asks?.lists ?? []) {
      for (const r of l.rows) out[themeToken(r.registryId, 'k')] = { value: r.k, unit: 'videos', label: `videos on ${r.label} in ${longMonth(data.asks?.month ?? data.month)}` }
    }
    return out
  },

  quotes(data): QuoteRef[] {
    return (data.asks?.lists ?? []).flatMap((l) => {
      const q = l.rows.find((r) => r.quote)?.quote
      return q ? [q.ref] : []
    })
  },

  emptyState(data) {
    if (!isMarketPage(data) || !data.asks) return 'What your market asked, complained about and wished for is read on the front page as it is built today, not on this copy.'
    return null
  },
}
