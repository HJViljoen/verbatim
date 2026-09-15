import Link from 'next/link'
import type { Block } from '@/lib/blocks/types'
import { BlockFrame } from '@/components/blocks/frame'
import { REFUSED_WHY } from '@/components/delta-badge'
import { fmtInt, fullDate } from '@/lib/format'
import { EMAIL, FONT } from '@/lib/email/theme'
import type { Refusal } from '@/lib/reading/record'
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

/**
 * Why each comparison this page did not draw was not drawn, in one sentence.
 *
 * OV6 SAID IT AND DID NOT DO IT. The block printed "N comparisons were refused
 * on this page, each with its reason beside it" while the reason lived only in
 * the badge's `title` attribute — a hover tooltip, invisible in print, and
 * dropped altogether by BlockMovement's email arm, which prints the word
 * alone. So the sentence was true on screen for a mouse and false on paper and
 * in the inbox, on the block that is the page's guarantee. The reasons are
 * printed here, in every mode, which is also what the design asks OV6 for:
 * "comparisons refused this month and why".
 *
 * The four refusal reasons are the badge's own words (REFUSED_WHY) so the
 * tooltip and the paragraph cannot come to say different things; the two other
 * non-answers get theirs here, where the only surface that prints them is.
 */
const NOT_DRAWN_WHY: Record<string, string> = {
  too_little_data: 'too little was read on one side or both',
  baseline_forming: 'there are not enough months behind it yet',
  refused: 'our record of what changed does not reach across it',
}

export function refusedSentence(refusals: readonly Refusal[]): string {
  if (refusals.length === 0) return 'Every comparison this page asked for was drawn.'
  const counts = new Map<string, number>()
  for (const r of refusals) {
    const why = (r.state === 'refused' && r.reason ? REFUSED_WHY[r.reason] : NOT_DRAWN_WHY[r.state]) ?? NOT_DRAWN_WHY.refused
    counts.set(why, (counts.get(why) ?? 0) + 1)
  }
  const head =
    refusals.length === 1
      ? '1 comparison was refused on this page'
      : `${fmtInt(refusals.length)} comparisons were refused on this page`
  const reasons = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  if (reasons.length === 1 && refusals.length === 1) return `${head}, because ${reasons[0][0]}.`
  const parts = reasons.map(([why, n]) => `${fmtInt(n)} because ${why}`)
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
  return `${head}: ${list}.`
}

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
      refusedSentence(r.refusals),
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
