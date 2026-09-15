import Link from 'next/link'
import type { Block } from '@/lib/blocks/types'
import { BlockFrame } from '@/components/blocks/frame'
import { fullDate } from '@/lib/format'
import { EMAIL, FONT } from '@/lib/email/theme'
import type { FigureTable } from '@/lib/reading/verdicts'
import type { OverviewData } from '@/lib/pages/overview'

// OV6 · How sound is this month (design §3 OV6).
//
// THE SAME LINE AS THE PAGE BAR, EXPANDED. The bar prints one sentence
// (`howSoundLine`) and this block prints the record behind it
// (`recordLines`) — both composed in lib/reading/record.ts, so the short form
// and the long form can never come to say different things. One link, to the
// record itself.
//
// THE REFUSALS ARE PART OF IT. "Comparisons refused this month and why" is a
// fact about what the page declined to say, and it is counted over the page's
// OWN verdicts rather than over the corpus: the same month refuses three
// comparisons on Overview and none on a tile that prints only levels
// (lib/reading/record.ts countRefused).

export const overviewRecord: Block<OverviewData> = {
  key: 'overview.record',
  title: 'How sound is this month',
  question: 'What is this reading made of, and what would not compare?',

  render(data, mode = 'app', ctx) {
    const r = data.record
    const email = mode === 'email'
    const href = `${ctx.appUrl}${r.href}`
    const lines = [
      ...r.lines,
      r.refused > 0
        ? `${r.refused} ${r.refused === 1 ? 'comparison was' : 'comparisons were'} refused on this page, each with its reason beside it.`
        : 'Every comparison this page asked for was drawn.',
      `This month stops moving on ${fullDate(r.freezesOn)}; until then every figure above may still change.`,
    ]

    if (email) {
      return (
        <BlockFrame title={overviewRecord.title} mode={mode} footer={<a href={href} style={{ color: EMAIL.ink }}>the record →</a>}>
          <div style={{ fontFamily: FONT.sans, fontSize: 11.5, lineHeight: 1.5, color: EMAIL.muted }}>{lines.join(' ')}</div>
        </BlockFrame>
      )
    }
    return (
      <BlockFrame
        title={overviewRecord.title}
        question={overviewRecord.question}
        mode={mode}
        meta={r.line}
        footer={<Link href={href} className="hover:underline">the record →</Link>}
      >
        <p className="m-0 text-[11.5px] leading-relaxed text-muted-foreground">{lines.join(' ')}</p>
      </BlockFrame>
    )
  },

  // NO FIGURES, DELIBERATELY. Every number in the record is already printed by
  // the block that rests on it — the month's videos on OV0, the shares above —
  // and declaring them again would spend the page's budget twice on one
  // reading. The record's job is provenance, not figures.
  figures(): FigureTable {
    return {}
  },

  emptyState(data) {
    return data.record.lines.length === 0 ? 'Nothing about this reading has been recorded yet.' : null
  },
}
