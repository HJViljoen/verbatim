import type { ReactNode } from 'react'

import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { openLink } from '@/components/blocks/open-link'
import { MakerMark, RULE, SCALE } from '@/components/pages/overview/market'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, longMonth } from '@/lib/format'
import { levelText } from '@/lib/reading/level'
import { voiceSurfaceHref, type VoiceSurfaceData } from '@/lib/pages/voice-surface'
import { ACCOUNT_FLOOR, ACCOUNT_ROWS, type WhereAccount, type WhereBlock } from '@/lib/pages/voice-surface-where'

// C6 · Where your market talks (market-first WP3.8, plan §2.4 C6; key
// `voice.where`, new, deploy 5), as the approved preview draws it: one
// sentence on how many accounts the category's videos came from and how much
// of the month's comments the largest holds; the accounts at 3 videos or more
// by videos, each with how many of the months read it was seen in; and, beside
// them, the accounts set aside as off-topic, named with how they were found.
//
// AN ACCOUNT NAME IS ITS OWNER'S WORDS, marked as a quote (the copy contract's
// `quote`, as This week's rival posts mark an account): a channel may call
// itself anything.
//
// THE HEADER IS THE TITLE ALONE AND THE FOOTER A LINK ALONE (25 Sep rulings).

const figure = 'font-mono font-semibold tabular-nums text-foreground'

/** A count in the sentence, as its own figure node. */
function N({ value, mode }: { value: number; mode: RenderMode }) {
  return (
    <span data-copy="figure" className={mode === 'email' ? undefined : figure} style={mode === 'email' ? { fontFamily: FONT.mono, fontWeight: 600, color: EMAIL.ink } : undefined}>
      {fmtInt(value)}
    </span>
  )
}

/** "469 accounts behind the category’s September videos; 19 of them with 3
 *  or more videos. The largest holds 4% of 15,792 comments in September." One
 *  base a sentence: the accounts, then the comments. */
function Lead({ w, mode }: { w: WhereBlock; mode: RenderMode }) {
  const month = longMonth(w.month)
  const largest = w.largest ? levelText(w.largest.comments, w.comments) : null
  const email = mode === 'email'
  return (
    <p className={email ? undefined : 'm-0 max-w-[620px] text-[15px] leading-[1.6] text-secondary-foreground [text-wrap:pretty]'} style={email ? { fontFamily: FONT.sans, fontSize: 14, lineHeight: 1.6, color: EMAIL.ink2, margin: 0 } : undefined}>
      <N value={w.accounts} mode={mode} /> {w.accounts === 1 ? 'account' : 'accounts'} behind the category’s {month} videos;{' '}
      {w.atFloor > 0
        ? <><N value={w.atFloor} mode={mode} /> of them with {ACCOUNT_FLOOR} or more videos.</>
        : <>none with {ACCOUNT_FLOOR} or more.</>}
      {largest && w.largest ? (
        <>
          {' '}The largest holds{' '}
          <span data-copy="level">
            {largest.kind === 'share'
              ? <><span data-copy="figure" className={email ? undefined : figure}>{largest.text}</span> of <N value={w.comments} mode={mode} /></>
              : <><N value={w.largest.comments} mode={mode} /> of <N value={w.comments} mode={mode} /></>}
          </span>{' '}
          {/* THE CATEGORY'S COMMENTS, SAID (finish-list item 9): the 20,782 are
              the category's 814 videos' comments, not the market's 21,468. */}
          category comments in {month}.
        </>
      ) : null}
    </p>
  )
}

/** The "Seen in" column's base: "months, of the last 3" (finish-list item 9).
 *  It read "months read", which beside "2 of 3" said this workspace had read
 *  three months, where Reports and the record count four: it is a look-back
 *  over the reading month and the two before it, not the months held. */
export function seenHead(w: WhereBlock): string {
  const of = w.rows.find((r) => r.seen)?.seen?.of ?? null
  return of == null ? 'months' : `months, of the last ${fmtInt(of)}`
}

/** "2 of 3", or "·" where the memory was not read. */
function Seen({ a, mode }: { a: WhereAccount; mode: RenderMode }) {
  if (!a.seen) return <span className={mode === 'email' ? undefined : 'text-muted-foreground'}>·</span>
  return <span data-copy="level"><span data-copy="figure">{fmtInt(a.seen.n)}</span> of <span data-copy="figure">{fmtInt(a.seen.of)}</span></span>
}

/** The list's columns, from 560px of block (a container query): the account,
 *  its videos, the months it was seen in. Under 560px the last column keeps
 *  room for its "months read" head (at 390 a 64px column set it over
 *  "Videos"). Written out in full for Tailwind's scanner. */
const COLS = 'grid grid-cols-[minmax(0,1fr)_44px_84px] gap-x-3 @min-[560px]:grid-cols-[minmax(0,1fr)_64px_144px] @min-[560px]:gap-x-6'

/** An account's name: whole on a phone (it wraps, never cut to "ReBorn
 *  Creati…"), one line with an ellipsis where the list has the preview's
 *  room. */
const NAME = `min-w-0 [overflow-wrap:anywhere] @min-[560px]:truncate ${SCALE.row}`

function Row({ a, w }: { a: WhereAccount; w: WhereBlock }) {
  const largest = w.largest?.key === a.key
  return (
    <div role="row" className={`${COLS} min-h-11 items-center py-2 ${RULE.row} last:border-b-0`}>
      <span role="rowheader" className="flex min-w-0 flex-col gap-0.5">
        <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 @min-[560px]:flex-nowrap">
          <span data-copy="quote" className={NAME}>{a.name}</span>
          {a.maker ? <span className="inline-flex flex-none items-center gap-1.5 whitespace-nowrap text-[13px] text-secondary-foreground"><MakerMark />maker</span> : null}
        </span>
        {largest ? <span className={SCALE.tag}><span data-copy="figure">{fmtInt(a.comments)}</span> comments in {longMonth(w.month)}</span> : null}
      </span>
      <span className={`${SCALE.num} font-semibold`}><span data-copy="figure">{fmtInt(a.videos)}</span></span>
      <span className="text-right font-mono text-[13px] tabular-nums text-muted-foreground"><Seen a={a} mode="app" /></span>
    </div>
  )
}

/**
 * THE FILTER WORKING, SAID ONCE, NAMING NOBODY (a recommended default of 29
 * Sep; finish-list item 9): the set-aside accounts were listed by name with
 * the search that found them ("Mike Ritland, found by 'sealand gear'", "The
 * Poker Academy, found by 'poler'", a search the client never asked for),
 * which read as noise in the client's market rather than noise kept out of
 * it. The count stays; the names and searches are the operator's.
 */
export function asideLine(w: WhereBlock): string | null {
  if (w.setAside.length === 0) return null
  const accounts = w.setAside.length
  const videos = w.setAside.reduce((n, a) => n + a.videos, 0)
  // No claim about how they were found: `foundBy` is null for some.
  return `Set aside as off-topic: ${fmtInt(accounts)} ${accounts === 1 ? 'account' : 'accounts'} with ${fmtInt(videos)} ${videos === 1 ? 'video' : 'videos'} about something else, left out of the list above.`
}

function Aside({ w }: { w: WhereBlock }) {
  const line = asideLine(w)
  if (!line) return null
  return (
    <aside className="flex min-w-0 max-w-[560px] flex-col gap-3 rounded-md bg-inner p-6 xl:max-w-none">
      <p className="m-0 text-[14px] leading-[1.5] text-muted-foreground [text-wrap:pretty]">{line}</p>
    </aside>
  )
}

function EmailWhere({ w }: { w: WhereBlock }) {
  const cell = { fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, padding: '4px 10px 4px 0', borderTop: `1px solid ${EMAIL.hairline}`, verticalAlign: 'top' as const }
  const num = { ...cell, fontFamily: FONT.mono, textAlign: 'right' as const }
  const head = { ...cell, borderTop: 0, color: EMAIL.muted, fontSize: 11 }
  return (
    <div>
      <Lead w={w} mode="email" />
      {w.rows.length > 0 ? (
        <table role="presentation" cellPadding={0} cellSpacing={0} style={{ borderCollapse: 'collapse', width: '100%', marginTop: 10 }}>
          <thead>
            <tr>
              <th style={{ ...head, textAlign: 'left' }}>Account</th>
              <th style={{ ...head, textAlign: 'right' }}>Videos</th>
              <th style={{ ...head, textAlign: 'right' }}>Seen in, {seenHead(w)}</th>
            </tr>
          </thead>
          <tbody>
            {w.rows.map((a) => (
              <tr key={a.key}>
                <td style={cell}><span data-copy="quote">{a.name}</span>{a.maker ? <span style={{ color: EMAIL.muted }}> · maker</span> : null}</td>
                <td style={num}><span data-copy="figure">{fmtInt(a.videos)}</span></td>
                <td style={{ ...num, color: EMAIL.muted }}><Seen a={a} mode="email" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {asideLine(w) ? (
        <div style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink2, marginTop: 10 }}>{asideLine(w)}</div>
      ) : null}
    </div>
  )
}

/** The footer's one link: every account at the floor, or back to the first
 *  ten. None where the first ten are all there is. */
function footerLink(data: VoiceSurfaceData, mode: RenderMode, appUrl: string): ReactNode {
  const w = data.where
  if (!w || w.listed <= ACCOUNT_ROWS) return null
  if (w.expanded) return openLink(mode, `${appUrl}${voiceSurfaceHref(data.params, { accounts: null })}#where`, `The ${fmtInt(ACCOUNT_ROWS)} with the most videos →`)
  return openLink(mode, `${appUrl}${voiceSurfaceHref(data.params, { accounts: 'all' })}#where`, `All ${fmtInt(w.atFloor)} accounts →`)
}

export const voiceWhere: Block<VoiceSurfaceData> = {
  key: 'voice.where',
  title: 'Where your market talks',
  question: 'Which accounts carry your market’s conversation, month after month?',

  render(data, mode = 'app', ctx) {
    const w = data.where
    const empty = voiceWhere.emptyState(data)
    if (empty || !w) {
      return (
        <BlockFrame title={voiceWhere.title} mode={mode} roomy>
          <BlockEmpty mode={mode}>{empty}</BlockEmpty>
        </BlockFrame>
      )
    }
    const footer = footerLink(data, mode, ctx.appUrl)
    if (mode === 'email') {
      return <BlockFrame title={voiceWhere.title} mode={mode} footer={footer}><EmailWhere w={w} /></BlockFrame>
    }
    const table = w.rows.length > 0 ? (
      <div role="table" className="flex min-w-0 flex-col @container">
        <div role="row" className={`${COLS} items-end ${RULE.head}`}>
          <span role="columnheader" className={SCALE.head}>Account</span>
          <span role="columnheader" className={`text-right ${SCALE.head}`}>Videos</span>
          <span role="columnheader" className={`flex flex-col items-end text-right ${SCALE.head}`}>
            Seen in
            <span className="whitespace-nowrap font-mono text-[12px] font-normal">{seenHead(w)}</span>
          </span>
        </div>
        {w.rows.map((a) => <Row key={a.key} a={a} w={w} />)}
      </div>
    ) : null
    return (
      <BlockFrame title={voiceWhere.title} mode={mode} footer={footer} roomy>
        <div id="where" className="grid min-w-0 scroll-mt-6 grid-cols-1 items-start gap-8 xl:grid-cols-[minmax(0,1fr)_304px] xl:gap-x-[88px]">
          <div className="flex min-w-0 flex-col gap-5">
            <Lead w={w} mode={mode} />
            {table}
          </div>
          <Aside w={w} />
        </div>
      </BlockFrame>
    )
  },

  emptyState(data) {
    const month = longMonth(data.month)
    if (!data.where) return `Where your market talks in ${month} is not read yet.`
    if (data.where.accounts === 0) return `No category video carries a comment dated in ${month} yet.`
    return null
  },
}
