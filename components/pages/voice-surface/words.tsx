import type { ReactNode } from 'react'

import type { Block, QuoteRef, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { openLink } from '@/components/blocks/open-link'
import { BlockQuote } from '@/components/blocks/quote'
import { MakerMark } from '@/components/pages/overview/market'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, longMonth, platformLabel, shortDate } from '@/lib/format'
import type { VoiceSurfaceData } from '@/lib/pages/voice-surface'
import type { WordsKind, WordsQuote } from '@/lib/pages/voice-surface-words'

// C5 · The market's words (market-first WP3.8, plan §2.4 C5; key `voice.words`,
// new, deploy 5), as the approved preview draws it: one card per kind, biggest
// first, three across on a wide page, each with the kind's videos in the
// market and up to three real quotes from the board's themes.
//
// A QUOTE CARRIES ITS THEME, PLATFORM, DATE AND LIKES, never who wrote it (the
// page's privacy line). One under a maker's video is marked, as the preview
// marks it; the likes are printed because they broke the tie, never because
// they chose the quote (plan §4.0).
//
// THE HEADER IS THE TITLE ALONE AND THE FOOTER A LINK ALONE (25 Sep rulings).
// What the bank is drawn from is Settings › How to read's to say, never a
// note under the cards.

/** "More colors and variants wanted · TikTok · 19 Sep · 78 likes". The theme
 *  is Pass B's words, marked as such; the rest is code's. */
function Cite({ q, mode }: { q: WordsQuote; mode: RenderMode }) {
  const rest = [
    q.platform ? platformLabel(q.platform) : null,
    q.date ? shortDate(q.date) : null,
  ].filter(Boolean).join(' · ')
  const words = (
    <>
      <span data-copy="subject" data-slot="pass_b_theme">{q.theme}</span>
      {rest ? ` · ${rest}` : null}
      {q.likes && q.likes > 0 ? <> · <span data-copy="figure">{fmtInt(q.likes)} {q.likes === 1 ? 'like' : 'likes'}</span></> : null}
    </>
  )
  if (!q.href || mode === 'print') return words
  return <a href={q.href} rel="noreferrer" target="_blank" style={mode === 'email' ? { color: EMAIL.muted } : undefined}>{words}</a>
}

function Quote({ q, mode }: { q: WordsQuote; mode: RenderMode }) {
  const maker = q.maker ? (
    mode === 'email'
      ? <div style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.ink2, marginTop: 2 }}>under a maker’s video</div>
      : (
          <span className="inline-flex items-center gap-2 text-[13px] text-secondary-foreground">
            <MakerMark />under a maker’s video
          </span>
        )
  ) : null
  if (mode === 'email') {
    return (
      <div style={{ marginTop: 8 }}>
        <BlockQuote quote={q.quote} cite={<Cite q={q} mode={mode} />} mode={mode} />
        {maker}
      </div>
    )
  }
  return (
    <figure className="m-0 flex min-w-0 flex-col gap-2">
      <BlockQuote quote={q.quote} cite={<Cite q={q} mode={mode} />} mode={mode} ground="inner" />
      {maker}
    </figure>
  )
}

/** A card with nothing to quote says so in one line (decision B 2). */
const NONE = 'No comment of this kind from a theme at 10 or more can be quoted.'

function Card({ k, mode }: { k: WordsKind; mode: RenderMode }) {
  const count = <><span data-copy="figure" className={mode === 'email' ? undefined : 'font-medium tabular-nums text-secondary-foreground'}>{fmtInt(k.videos)}</span> videos</>
  if (mode === 'email') {
    return (
      <div style={{ padding: '10px 0', borderTop: `1px solid ${EMAIL.hairline}` }}>
        <div style={{ fontFamily: FONT.sans, fontSize: 13, fontWeight: 600, color: EMAIL.ink }}>
          {k.label} <span style={{ fontFamily: FONT.mono, fontWeight: 400, color: EMAIL.muted }}>{count}</span>
        </div>
        {k.quotes.length > 0
          ? k.quotes.map((q) => <Quote key={q.quote.ref} q={q} mode={mode} />)
          : <BlockEmpty mode={mode}>{NONE}</BlockEmpty>}
      </div>
    )
  }
  return (
    <div className="flex min-w-0 flex-col gap-5 rounded-md bg-inner p-6">
      <div className="flex items-baseline justify-between gap-4 border-b border-border/60 pb-3">
        <h3 className="m-0 text-[15px] font-semibold text-foreground">{k.label}</h3>
        <span className="whitespace-nowrap font-mono text-[13px] text-muted-foreground">{count}</span>
      </div>
      {k.quotes.length > 0
        ? k.quotes.map((q) => <Quote key={q.quote.ref} q={q} mode={mode} />)
        : <p className="m-0 font-mono text-[13px] leading-[1.6] text-muted-foreground">{NONE}</p>}
    </div>
  )
}

/** The footer's one link: to Ask, by the preview's words. */
function footerLink(mode: RenderMode, appUrl: string): ReactNode {
  return openLink(mode, `${appUrl}/dashboard/agent`, 'Ask your market a question →')
}

export const voiceWords: Block<VoiceSurfaceData> = {
  key: 'voice.words',
  title: 'The market’s words',
  question: 'What does your market say, in its own words?',

  render(data, mode = 'app', ctx) {
    const empty = voiceWords.emptyState(data)
    const footer = footerLink(mode, ctx.appUrl)
    if (empty || !data.words) {
      return (
        <BlockFrame title={voiceWords.title} mode={mode} footer={footer} roomy>
          <BlockEmpty mode={mode}>{empty}</BlockEmpty>
        </BlockFrame>
      )
    }
    const cards = data.words.kinds.map((k) => <Card key={k.kind} k={k} mode={mode} />)
    return (
      <BlockFrame title={voiceWords.title} mode={mode} footer={footer} roomy>
        {mode === 'email'
          ? <div>{cards}</div>
          // Three across where the block has the room, two on a tablet, one
          // on a phone: the tile's width decides, not the window's.
          : <div className="@container"><div className="grid min-w-0 grid-cols-1 gap-6 @min-[640px]:grid-cols-2 @min-[960px]:grid-cols-3">{cards}</div></div>}
      </BlockFrame>
    )
  },

  quotes(data): QuoteRef[] {
    return (data.words?.kinds ?? []).flatMap((k) => k.quotes.map((q) => q.quote.ref))
  },

  emptyState(data) {
    const month = longMonth(data.month)
    if (!data.words) return `The market’s words for ${month} are not read yet.`
    if (data.words.kinds.length === 0) return `No kind of comment reached 10 videos in ${month} yet.`
    return null
  },
}
