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
  // ONE ROW OF FOUR MONTHS, AND THE PAIR'S WORDS ABOVE AND BELOW IT (design
  // pass): a three-row grid, so the read pair and the first comparable pair
  // share one baseline, the bracket's label sits over the dashed pair and its
  // date under it, both centred on it.
  return (
    <div aria-hidden className="grid min-w-0 grid-cols-2 gap-x-3 gap-y-2">
      <span className="col-start-2 rounded-t-[2px] border-x border-t border-foreground/50 px-2 pt-1.5 text-center text-[12px] font-semibold leading-[1.3] text-foreground">the first comparison read the same way</span>
      <div className="col-start-1 flex gap-3">{cell(block.prevMonth, 'read')}{cell(block.month, 'current')}</div>
      <div className="flex gap-3">{cell(next.prevMonth, 'next')}{cell(next.month, 'next')}</div>
      <span className="col-start-2 text-center font-mono text-[12px] text-secondary-foreground">from the {shortDate(next.sameAgeFrom)} update</span>
    </div>
  )
}

/**
 * The block's answer, led by its verdict (design pass; the preview's bold
 * lead-in). The words are the calibrated sentence, untouched: where it opens
 * with a clause and a colon ("Not read as a change: we changed our searches
 * in September"), the clause is set in ink at weight 600 and the rest follows
 * in the sentence's own ink, so the answer is read first.
 */
function LeadSentence({ body, figures, mode }: { body: string; figures: FigureTable; mode: 'app' | 'print' }) {
  const cut = body.indexOf(': ')
  const className = 'm-0 max-w-[60ch] text-[17px] leading-[1.6] text-secondary-foreground [text-wrap:pretty]'
  const figure = 'font-semibold text-foreground'
  if (cut < 0 || body.slice(0, cut).includes('[[')) {
    return <TokenProse body={body} figures={figures} mode={mode} figureFace="mono" figureClassName={figure} className={className} />
  }
  return (
    <div className={`${className} [&>p]:inline`}>
      <strong className="font-semibold text-foreground">{body.slice(0, cut + 1)}</strong>{' '}
      <TokenProse body={body.slice(cut + 2)} figures={figures} mode={mode} figureFace="mono" figureClassName={figure} className="m-0" />
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
      <BlockFrame title={overviewChange.title} mode={mode} footer={footer} roomy>
        <div className="grid grid-cols-1 gap-x-20 gap-y-8 xl:grid-cols-2" data-print-cols="2">
          {lead ? <LeadSentence body={lead.body} figures={lead.figures} mode={mode} /> : <span />}
          <div className="flex min-w-0 flex-col gap-6">
            {next ? <p className="m-0 text-[17px] leading-[1.6] text-secondary-foreground [text-wrap:pretty]">{next}</p> : null}
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
