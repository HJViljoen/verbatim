import type { Block } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { openLink } from '@/components/blocks/open-link'
import { TokenProse } from '@/components/blocks/prose'
import { EMAIL, FONT } from '@/lib/email/theme'
import { longMonth, shortDate } from '@/lib/format'
import type { FigureTable } from '@/lib/reading/verdicts'
import { changeLead, nextPairLine, type ChangeBlock } from '@/lib/pages/overview-market'
import type { OverviewData } from '@/lib/pages/overview'
import { cn } from '@/lib/utils'
import { isMarketPage, shortMonthName } from './market'

// "What changed, and what is ours" (market-first WP1.6, plan §2.2 block 10):
// at most two lines at deploy 2, the refusal with its measured reach read with
// its update, and the first pair of months read the same way. Its footer is
// the link to the dated list of our changes (Settings › What we changed), and
// nothing else (25 Sep rulings).

/** Where the dated list is: Settings › The record, at its first section. */
export const WHAT_WE_CHANGED_HREF = '/dashboard/settings/record#what-we-changed'

/**
 * The preview's month strip: the pair the page reads, solid, and the first
 * pair read the same way, dashed, with the date it is read from. Drawn only
 * where there is a next pair; decoration beside the two sentences, which say
 * the same in words.
 */
function MonthStrip({ block }: { block: ChangeBlock }) {
  const next = block.next
  // No update is promised to a paused tenant, in words or in the strip.
  if (!next || !block.prevMonth || block.paused) return null
  const cell = (month: string, kind: 'read' | 'current' | 'next') => (
    <span
      key={`${kind}-${month}`}
      className={cn(
        'flex h-10 min-w-0 flex-1 items-center rounded-md px-3 text-[13px] font-medium',
        kind === 'next' ? 'border border-dashed border-border text-muted-foreground' : 'bg-inner text-foreground',
      )}
    >
      {shortMonthName(month)}
    </span>
  )
  return (
    <div aria-hidden className="flex min-w-0 flex-col gap-2">
      <div className="flex items-end gap-3">
        <div className="flex flex-1 gap-3">{cell(block.prevMonth, 'read')}{cell(block.month, 'current')}</div>
        <div className="flex flex-1 flex-col gap-1.5">
          <span className="border-x border-t border-foreground/60 pt-1 text-center text-[12px] font-semibold text-foreground">the first comparison read the same way</span>
          <div className="flex gap-3">{cell(next.prevMonth, 'next')}{cell(next.month, 'next')}</div>
        </div>
      </div>
      <span className="self-end font-mono text-[12px] text-secondary-foreground">from the {shortDate(next.sameAgeFrom)} update</span>
    </div>
  )
}

export const overviewChange: Block<OverviewData> = {
  key: 'overview.change',
  title: 'What changed, and what is ours',
  question: 'What changed, and which changes were ours?',

  render(data, mode = 'app', ctx) {
    const block = data.change ?? null
    const footer = openLink(mode, `${ctx.appUrl}${WHAT_WE_CHANGED_HREF}`, 'What we changed, and when →')
    const empty = overviewChange.emptyState(data)
    if (empty || !block) {
      return <BlockFrame title={overviewChange.title} mode={mode} footer={footer}><BlockEmpty mode={mode}>{empty}</BlockEmpty></BlockFrame>
    }
    const lead = changeLead(block)
    const next = nextPairLine(block)
    if (mode === 'email') {
      return (
        <BlockFrame title={overviewChange.title} mode={mode} footer={footer}>
          {lead ? <div style={{ fontFamily: FONT.sans, fontSize: 13.5, color: EMAIL.ink }}><TokenProse body={lead.body} figures={lead.figures} mode={mode} /></div> : null}
          {next ? <div style={{ fontFamily: FONT.sans, fontSize: 13, color: EMAIL.ink2, marginTop: 6 }}>{next}</div> : null}
        </BlockFrame>
      )
    }
    return (
      <BlockFrame title={overviewChange.title} mode={mode} footer={footer}>
        <div className="grid grid-cols-1 gap-x-12 gap-y-6 xl:grid-cols-2" data-print-cols="2">
          {lead ? (
            <TokenProse body={lead.body} figures={lead.figures} mode={mode} figureFace="inherit" className="m-0 max-w-[60ch] text-[16px] leading-[1.6] [text-wrap:pretty]" />
          ) : <span />}
          <div className="flex min-w-0 flex-col gap-5">
            {next ? <p className="m-0 text-[16px] leading-[1.6] text-foreground [text-wrap:pretty]">{next}</p> : null}
            <MonthStrip block={block} />
          </div>
        </div>
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    return data.change ? changeLead(data.change)?.figures ?? {} : {}
  },

  emptyState(data) {
    if (!isMarketPage(data) || !data.change) return `What changed in ${longMonth(data.month)}, and what is ours, is read on the front page as it is built today, not on this copy.`
    return null
  },
}
