import type { ReactNode } from 'react'

import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { openLink } from '@/components/blocks/open-link'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt } from '@/lib/format'
import { surface } from '@/lib/nav'
import type { FigureTable } from '@/lib/reading/verdicts'
import type { MarketSurfaceData } from '@/lib/pages/market-surface'
import { headlineParts, marketLine as readLine, supportParts, type LinePart } from '@/lib/pages/market-line'

// In one line: Your moves' hero (the approved preview's first block, WP3.6
// wave 2). The sentence is `lib/pages/market-line.ts`'s; this draws it at the
// preview's weight: the answer at 28px (22px on a phone), the counts behind it
// at 17px with each figure in the mono, and a footer that is a link alone
// (25 Sep rulings).

const FIGURE = 'font-mono font-semibold tabular-nums text-foreground'

/** One part, as the node the copy contract reads it as. */
function Part({ part, mode }: { part: LinePart; mode: RenderMode }): ReactNode {
  const email = mode === 'email'
  if (typeof part === 'string') return part
  if ('figure' in part) {
    return (
      <span data-copy="figure" className={email ? undefined : FIGURE} style={email ? { fontFamily: FONT.mono, fontWeight: 600, color: EMAIL.ink } : undefined}>
        {fmtInt(part.figure)}
      </span>
    )
  }
  // A theme's words are the model's label, trimmed to its topic.
  if ('topic' in part) return <span data-copy="subject" data-slot="pass_b_theme">{part.topic}</span>
  // A move's title is the client's own words.
  return <span data-copy="quote">{part.own}</span>
}

const drawn = (list: readonly LinePart[], mode: RenderMode) => list.map((p, i) => <Part key={i} part={p} mode={mode} />)

export const marketLine: Block<MarketSurfaceData> = {
  key: 'market.line',
  title: 'In one line',
  question: 'What did your market ask most, and where do your moves stand?',

  render(data, mode = 'app', ctx) {
    const email = mode === 'email'
    const line = readLine(data)
    const voice = surface('voice')
    if (!line) {
      return (
        <BlockFrame title={marketLine.title} mode={mode} roomy>
          <BlockEmpty mode={mode}>{marketLine.emptyState(data)}</BlockEmpty>
        </BlockFrame>
      )
    }
    const support = supportParts(line)
    return (
      <BlockFrame title={marketLine.title} mode={mode} roomy footer={openLink(mode, `${ctx.appUrl}${voice.href}`, `Open ${voice.label} →`)}>
        <div className={email ? undefined : 'flex min-w-0 flex-col gap-4 pt-1'}>
          <p
            className={email ? undefined : 'm-0 max-w-[780px] text-[22px] font-medium leading-[1.3] tracking-[-0.02em] text-foreground [text-wrap:balance] sm:text-[28px]'}
            style={email ? { fontFamily: FONT.sans, fontSize: 20, fontWeight: 500, lineHeight: 1.3, color: EMAIL.ink, margin: 0 } : undefined}
          >
            {drawn(headlineParts(line), mode)}
          </p>
          {support.length > 0 ? (
            <p
              className={email ? undefined : 'm-0 max-w-[640px] text-[17px] leading-[1.6] text-secondary-foreground [text-wrap:pretty]'}
              style={email ? { fontFamily: FONT.sans, fontSize: 14, lineHeight: 1.6, color: EMAIL.ink2, margin: '8px 0 0' } : undefined}
            >
              {drawn(support, mode)}
            </p>
          ) : null}
        </div>
      </BlockFrame>
    )
  },

  // NO FIGURES OF ITS OWN. Every count here is one a block under it prints:
  // the question themes' videos (`market.questions`, which declares them) and
  // your claims by subject (`market.sayhear`'s line over its claims). The
  // hero restates them, so declaring them here would count them twice.
  figures(): FigureTable {
    return {}
  },

  emptyState(data) {
    return data.questions ? null : 'In one line is read on this page as it is built today, not on this copy.'
  },
}
