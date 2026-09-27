import type { ReactNode } from 'react'
import type { Block, BlockContext, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BlockQuote } from '@/components/blocks/quote'
import { openLink } from '@/components/blocks/open-link'
import { WeeklyLink } from '@/components/blocks/weekly/email'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, platformLabel, shortDate } from '@/lib/format'
import { INTENT_ORDER, INTENT_PLURAL, INTENT_LABEL, type Intent } from '@/lib/content-tiles'
import { REPLIES_SHOWN, type RepliesBlock, type ReplyRow, type WeekData } from '@/lib/pages/week'
import type { FigureTable } from '@/lib/reading/verdicts'
import { MakerMark } from '@/components/pages/overview/market'
import { WEEK_ANCHORS } from './came-in'

// "Worth a reply" (market-first WP3.7; the approved preview's This week and
// the weekly's WR5): the comments from the update's own days that somebody can
// answer today, from the same digest the Content page reads, one section over
// one reading on both surfaces.
//
// ON THE PAGE the kinds are tabs ("All 12 · Buying signals 6 · Questions 3 ·
// Objections 3"), links that keep the reader's place (`?reply=`); each row is
// the kind and why it surfaced, the comment and where it was written, and a
// Reply button where a reply can land. IN AN INBOX the counts are one
// sentence, and each row's reply is a link.
//
// THE HEADER IS THE TITLE ALONE AND THE FOOTER A LINK ALONE (25 Sep rulings):
// the window is the page bar's and the masthead's. "Flagged for awareness"
// lives in "Checks on this update" (`week.checks`), as the preview draws it.

export const REPLY_TITLE = 'Worth a reply'

/** The URL param that picks a tab. */
export const REPLY_PARAM = 'reply'

const isIntent = (v: string | undefined): v is Intent => v != null && (INTENT_ORDER as readonly string[]).includes(v) && v !== 'misinformation'

/** The rows a tab shows, and which tab is on. */
export function replyRowsFor(r: RepliesBlock, param: string | undefined): { tab: Intent | 'all'; rows: ReplyRow[] } {
  const tab = isIntent(param) && r.counts.some((c) => c.intent === param) ? param : 'all'
  const rows = tab === 'all' ? r.rows : r.rows.filter((row) => row.intent === tab)
  return { tab, rows: rows.slice(0, REPLIES_SHOWN) }
}

/**
 * Is the "why it surfaced" words saying what the kind already said? The reason
 * is the insight's own Pass A theme, and one of the commonest things a model
 * writes there is the kind itself; a line that restates its row's kind is a
 * line of nothing.
 */
function echoesTheKind(row: ReplyRow): boolean {
  const reason = row.reason.trim().toLowerCase().replace(/[.·]+$/, '')
  return reason === INTENT_LABEL[row.intent].toLowerCase() || reason === INTENT_PLURAL[row.intent].toLowerCase()
}

/** "YouTube · 16 Sep · under @melania beadedbag’s post · 622 likes". */
const citeOf = (row: ReplyRow): string => [platformLabel(row.platform), row.date ? shortDate(row.date) : null, row.context].filter(Boolean).join(' · ')

/** Past this many characters a quote is clamped on the page, with a link to
 *  read it in full where the comment has one. */
const LONG_QUOTE = 220

function Tabs({ r, tab, ctx }: { r: RepliesBlock; tab: Intent | 'all'; ctx: BlockContext }) {
  const href = (v: Intent | 'all') => {
    const q = new URLSearchParams(Object.entries(ctx.params ?? {}).filter((e): e is [string, string] => e[1] != null && e[0] !== REPLY_PARAM))
    if (v !== 'all') q.set(REPLY_PARAM, v)
    const qs = q.toString()
    return `${ctx.appUrl}/dashboard/week${qs ? `?${qs}` : ''}#${WEEK_ANCHORS.reply}`
  }
  const tabs: { v: Intent | 'all'; label: string; n: number }[] = [
    { v: 'all', label: 'All', n: r.total },
    ...r.counts.filter((c) => c.intent !== 'misinformation' && c.count > 0).map((c) => ({ v: c.intent, label: INTENT_PLURAL[c.intent], n: c.count })),
  ]
  return (
    <nav aria-label="Kinds of comment" className="flex w-fit max-w-full flex-wrap gap-1 rounded-md bg-inner p-1">
      {tabs.map((t) => (
        <a
          key={t.v}
          href={href(t.v)}
          aria-current={t.v === tab ? 'page' : undefined}
          className={`inline-flex h-9 items-center gap-2 rounded-[5px] px-3.5 text-[14px] font-medium ${t.v === tab ? 'bg-tile text-foreground shadow-[0_0_0_1px_var(--border)]' : 'text-secondary-foreground hover:text-foreground'}`}
        >
          {t.label}<span data-copy="figure" className="font-mono text-[13px] tabular-nums text-muted-foreground">{fmtInt(t.n)}</span>
        </a>
      ))}
    </nav>
  )
}

function Row({ row, mode }: { row: ReplyRow; mode: RenderMode }) {
  const echo = echoesTheKind(row)
  const long = row.quote.text.length > LONG_QUOTE && !row.quote.english
  if (mode === 'email') {
    return (
      <div style={{ borderTop: `1px solid ${EMAIL.hairline}`, padding: '16px 0 12px' }}>
        <table role="presentation" cellPadding={0} cellSpacing={0} style={{ borderCollapse: 'collapse', width: '100%' }}>
          <tbody>
            <tr>
              <td style={{ fontFamily: FONT.sans, fontSize: 14, lineHeight: '20px', color: EMAIL.ink }}>
                <span style={{ fontWeight: 600 }}>{INTENT_LABEL[row.intent]}</span>
                {echo ? null : <>{'  '}<span data-copy="stored" data-slot="pass_a_audience_insight" style={{ fontSize: 13, color: EMAIL.muted, marginLeft: 8 }}>{row.reason}</span></>}
              </td>
              {row.href ? <td align="right" style={{ whiteSpace: 'nowrap' }}><WeeklyLink href={row.href} label="Reply →" /></td> : null}
            </tr>
          </tbody>
        </table>
        <BlockQuote quote={row.quote} cite={citeOf(row)} mode="email" />
      </div>
    )
  }
  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-3 border-t border-border/70 py-6 first:border-t-0 xl:grid-cols-[160px_minmax(0,1fr)_auto]">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-[14px] font-semibold text-foreground">{INTENT_LABEL[row.intent]}</span>
        {echo ? null : <span data-copy="stored" data-slot="pass_a_audience_insight" className="text-[13px] leading-[1.4] text-muted-foreground">{row.reason}</span>}
      </div>
      <div className="flex min-w-0 max-w-[720px] flex-col gap-2">
        {/* A TRANSLATED COMMENT PRINTS IN ITS OWN WORDS, THE ENGLISH BENEATH,
            with the machine's label between (the quote rule, §4.0): the
            shared quote renderer does that, and is not clamped. */}
        {row.quote.english
          ? <BlockQuote quote={row.quote} mode={mode} ground="inner" />
          : <p data-copy="quote" className={`m-0 font-serif text-[15px] italic leading-[1.55] text-foreground [text-wrap:pretty] ${long && mode === 'app' ? 'line-clamp-3' : ''}`}>“{row.quote.text}”</p>}
        <p className="m-0 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[12px] leading-[1.5] text-muted-foreground">
          <span>{citeOf(row)}</span>
          {long && mode === 'app' && row.href ? <a href={row.href} target="_blank" rel="noopener noreferrer" className="font-sans text-[13px] font-medium text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground">Read in full</a> : null}
          {row.maker ? <span className="inline-flex items-center gap-2 font-sans text-[13px] text-secondary-foreground"><MakerMark />a maker’s own post</span> : null}
        </p>
      </div>
      {mode === 'app' && row.href ? (
        <a
          href={row.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-11 items-center gap-2 self-start justify-self-start rounded-md border border-border px-4 text-[14px] font-medium text-foreground hover:bg-inner xl:justify-self-end"
        >
          Reply<span aria-hidden>→</span>
        </a>
      ) : <span />}
    </div>
  )
}

/** "12 comments are worth a reply: 6 buying signals, 3 questions and 3
 *  objections." The weekly's lead (WR5). */
function EmailLead({ r }: { r: RepliesBlock }) {
  const parts = r.counts.filter((c) => c.intent !== 'misinformation' && c.count > 0)
  const b = (n: number) => <span data-copy="figure" style={{ fontFamily: FONT.mono, fontWeight: 600, color: EMAIL.ink }}>{fmtInt(n)}</span>
  return (
    <div style={{ fontFamily: FONT.sans, fontSize: 15, lineHeight: '24px', color: EMAIL.ink2, marginBottom: 8 }}>
      {b(r.total)} {r.total === 1 ? 'comment is' : 'comments are'} worth a reply{parts.length > 0 ? ':' : '.'}
      {parts.length > 0 ? (
        <div>
          {parts.map((c, i) => (
            <span key={c.intent}>
              {i === 0 ? null : i === parts.length - 1 ? ' and ' : ', '}
              {b(c.count)} {(c.count === 1 ? INTENT_LABEL[c.intent] : INTENT_PLURAL[c.intent]).toLowerCase()}
            </span>
          ))}
          .
        </div>
      ) : null}
    </div>
  )
}

/**
 * The section, under a surface's key: `week.reply` on This week (tabs; "Open
 * all 12 →"), `weekly.content` in the weekly (the count sentence; "Open all 12
 * on This week →").
 */
export function repliesSection<D>(key: string, pick: (data: D) => RepliesBlock, surface: 'page' | 'weekly'): Block<D> {
  const block: Block<D> = {
    key,
    title: REPLY_TITLE,
    question: 'Which comments from these days can somebody answer today?',

    render(data, mode = 'app', ctx) {
      const r = pick(data)
      const empty = block.emptyState(data)
      const all = surface === 'page' ? `${ctx.appUrl}/dashboard/videos?detail=replies` : `${ctx.appUrl}/dashboard/week#${WEEK_ANCHORS.reply}`
      const words = surface === 'page' ? `Open all ${fmtInt(r.total)} →` : `Open all ${fmtInt(r.total)} on This week →`
      const footer: ReactNode = r.rows.length === 0 ? undefined : mode === 'email' ? <WeeklyLink href={all} label={words} /> : openLink(mode, all, words)
      if (empty) return <BlockFrame title={REPLY_TITLE} mode={mode} footer={footer} roomy card><BlockEmpty mode={mode}>{empty}</BlockEmpty></BlockFrame>
      const { tab, rows } = replyRowsFor(r, mode === 'app' ? ctx.params?.[REPLY_PARAM] : undefined)
      return (
        <BlockFrame title={REPLY_TITLE} mode={mode} footer={footer} roomy card>
          {mode === 'email' ? (
            <div>
              <EmailLead r={r} />
              {rows.map((row) => <Row key={row.id} row={row} mode={mode} />)}
            </div>
          ) : (
            <div className="flex min-w-0 flex-col gap-4">
              {mode === 'app' ? <Tabs r={r} tab={tab} ctx={ctx} /> : null}
              <div className="flex min-w-0 flex-col">{rows.map((row) => <Row key={row.id} row={row} mode={mode} />)}</div>
            </div>
          )}
        </BlockFrame>
      )
    },

    figures(data): FigureTable {
      const r = pick(data)
      if (r.rows.length === 0) return {}
      const out: FigureTable = { reply_picked: { value: r.total, unit: 'comments', label: 'comments picked as worth a reply' } }
      for (const c of r.counts) {
        if (c.intent === 'misinformation' || c.count === 0) continue
        out[`reply_${c.intent}`] = { value: c.count, unit: 'comments', label: `${INTENT_PLURAL[c.intent].toLowerCase()} picked as worth a reply` }
      }
      return out
    },

    quotes(data) {
      return pick(data).rows.slice(0, REPLIES_SHOWN).map((row) => row.quote.ref)
    },

    emptyState(data) {
      const r = pick(data)
      if (r.unread) return r.unread
      if (r.rows.length > 0) return null
      return 'Nothing in the days this update covered reads as a question, an objection or somebody ready to buy.'
    },
  }
  return block
}

export const weekReply = repliesSection<WeekData>('week.reply', (d) => d.replies, 'page')
