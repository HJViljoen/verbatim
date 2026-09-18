import Link from 'next/link'
import type { Block } from '@/lib/blocks/types'
import { BlockFrame } from '@/components/blocks/frame'
import { TileColumns } from '@/components/shell/page-grid'
import { fullDate } from '@/lib/format'
import { EMAIL, FONT } from '@/lib/email/theme'
import type { FigureTable } from '@/lib/reading/verdicts'
import type { OverviewData } from '@/lib/pages/overview'

// OV6 · How sound is this month (design §3 OV6; ported to `Main.dc.html` §6 in
// Block D wave 2).
//
// THE SAME LINE AS THE PAGE BAR, EXPANDED. The bar prints one sentence
// (`howSoundLine`) and this block prints the record behind it (`recordLines`) —
// both composed in lib/reading/record.ts, so the short form and the long form
// can never come to say different things. One link, to the record itself.
//
// THE REFUSALS ARE PART OF IT. "Comparisons refused this month and why" is a
// fact about what the page declined to say, and it is counted over the page's
// OWN verdicts rather than over the corpus: the same month refuses three
// comparisons on Overview and none on a tile that prints only levels
// (lib/reading/record.ts countRefused).
//
// AND THE METHOD IS THE SECOND COLUMN (`main.coverage.para1` / `.para2`).
// `methodLines` (wave 1) is the ONE composer for the five facts every surface
// was composing separately — coverage, read depth, language, the Reddit cap and
// the privacy line — and D15 is the reason it is bound here rather than
// re-derived: two of those five are NOT about the month this block is a reading
// of. Read depth is all-time by construction and the language share is about
// what was said on camera, not about the comments a reader sees. Each sentence
// carries its own basis, in `methodLines`' own words.

/**
 * The two paragraphs the artboard sets side by side.
 *
 * LEFT is what was READ into this month — the record's own lines, which carry
 * the updates, the videos, the discards and the freeze. RIGHT is how it was
 * read and what it would not say — the method footnote plus the sentence naming
 * when this month stops moving. The split is the artboard's and it is also the
 * honest one: the left column is about the CORPUS and the right is about the
 * INSTRUMENT, and they are on different clocks.
 */
export function recordColumns(data: OverviewData): { read: string[]; method: string[] } {
  const r = data.record
  return {
    read: [...r.lines],
    method: [
      ...(data.method?.lines ?? []),
      `This month stops moving on ${fullDate(r.freezesOn)}; until then every figure above may still change.`,
    ],
  }
}

export const overviewRecord: Block<OverviewData> = {
  key: 'overview.record',
  title: 'How sound is this month',
  question: 'What is this reading made of, and what would not compare?',

  render(data, mode = 'app', ctx) {
    const r = data.record
    const email = mode === 'email'
    const href = `${ctx.appUrl}${r.href}`
    const { read, method } = recordColumns(data)

    if (email) {
      return (
        <BlockFrame title={overviewRecord.title} mode={mode} footer={<a href={href} style={{ color: EMAIL.ink }}>the record →</a>}>
          <div style={{ fontFamily: FONT.sans, fontSize: 11.5, lineHeight: 1.5, color: EMAIL.muted }}>{[...read, ...method].join(' ')}</div>
        </BlockFrame>
      )
    }
    return (
      <BlockFrame
        title={overviewRecord.title}
        question={overviewRecord.question}
        mode={mode}
        // NO META HERE, AND THAT IS THE FIX (design review Blocker 2 / High 3,
        // code review I3). This passed `r.line` — the ~180-character soundness
        // sentence — and `BlockFrame` renders meta as `flex-none
        // whitespace-nowrap` inside a tile that is `overflow-hidden`: it can
        // neither wrap nor shrink, so it overran the tile and was CUT
        // mid-clause ("…27% of what was said on camera" at 1440, "…(TikTok 38%
        // · YouTube 29%" at 1024), and the h2 beside it was squeezed into five
        // stacked words down the tile's left edge. A coverage line truncated
        // mid-clause is the exact failure this block exists to prevent.
        //
        // The sentence is not lost: it leads the soundness band at the top of
        // the page, where it wraps, and `lines` below is the record BEHIND it —
        // the same facts at length. Printing it here as well was the second of
        // its two appearances (High 4).
        // "the record →" BESIDE THE EYEBROW, which is where the artboard puts
        // it (`main.coverage.header`): this block has no onward page of its own
        // — it IS the record — so the link belongs in the header rather than in
        // the footer rail every other block uses to send a reader deeper.
        footer={<Link href={href} className="hover:underline">the record →</Link>}
      >
        {/* TWO COLUMNS OF MONO (`main.coverage.para1` / `.para2`). The artboard
            sets them at 9.5px, which is the smallest type on the page and
            deliberately so: this is the block a reader consults rather than
            reads, and it has to fit beside the reading it is about. */}
        {/* THE SOUNDNESS SENTENCE, ON PAPER ONLY. In the app it leads the
            band at the top of the page and printing it again here was the
            second of three appearances; a print sheet and a PNG carry no page
            bar, so there it leads this block instead — in the BODY, where it
            wraps, and never as the `whitespace-nowrap` meta that was cut
            mid-clause. */}
        {mode === 'print' ? (
          <p className="m-0 font-mono text-[10px] leading-[1.45] text-secondary-foreground">How sound is this: {r.line}</p>
        ) : null}
        <TileColumns of={2}>
          <p className="m-0 font-mono text-[9.5px] leading-[1.45] tabular-nums text-muted-foreground">
            <span className="text-secondary-foreground">What was read: </span>{read.join(' ')}
          </p>
          <p className="m-0 font-mono text-[9.5px] leading-[1.45] tabular-nums text-muted-foreground xl:pl-4">
            <span className="text-secondary-foreground">How it was read, and what would not compare: </span>{method.join(' ')}
          </p>
        </TileColumns>
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
