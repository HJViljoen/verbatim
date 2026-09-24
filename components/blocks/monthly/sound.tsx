import type { ReactNode } from 'react'
import type { BlockContext } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { overviewRecord } from '@/components/pages/overview/record'
import { EMAIL, FONT } from '@/lib/email/theme'
import { monthlySoundLines, type MonthlySoundFigures } from '@/lib/reports/monthly'
import type { OverviewData } from '@/lib/pages/overview'

/**
 * MR8 · How sound is this month, in the EMAIL (Block D wave 2, E-monthly; the
 * artboard's section 8).
 *
 * THREE SENTENCES, AS THE MOCK DREW THEM (copy de-clutter 2026-09-24, ruling
 * B). The section used to print the whole record paragraph (`recordLines`),
 * the freeze sentence and three method footnotes: about fourteen sentences,
 * stating the freeze three more times than the eyebrow and the read depth
 * twice. The artboard's budget is three lines, and the record page is where
 * the rest is written down, one link away:
 *
 *   1. what was read      "4 updates · 11,840 comments read · 2,359 videos
 *                          analysed, against a trailing median of 2,240."
 *   2. how it was read    "27% not in English · speech read on 71% of videos
 *                          · on-screen text on 64%."
 *   3. what changed       "1 tracking change · 2 comparisons refused · your
 *                          3rd monthly reading, and the quarter view needs 6."
 *
 * The figures come off `record.sound` (`monthlySoundFigures`, composed by the
 * Overview loader from the same `RecordInputs` the record reads). A snapshot
 * frozen before that field existed carries the bar alone, and the sentences
 * fall back to what the bar holds: a clause with no figure behind it is
 * dropped, never printed as a zero.
 */
export function monthlySoundEmail(data: OverviewData, ctx: BlockContext): ReactNode {
  const r = data.record
  const href = `${ctx.appUrl}${r.href}`
  const empty = overviewRecord.emptyState(data)
  const lines = empty ? [] : monthlySoundLines(soundFiguresOf(data))
  return (
    <BlockFrame
      title={overviewRecord.title}
      question={overviewRecord.question}
      mode="email"
      accent
      // THE LINK IS IN THE HEAD, WHERE THE ARTBOARD PUTS IT: top-right of the
      // section head, green 12/600, opposite the mono eyebrow.
      meta={<a href={href} style={{ fontFamily: FONT.sans, fontSize: 12, fontWeight: 600, color: EMAIL.link, textDecoration: 'none' }}>the record →</a>}
    >
      {empty ? <BlockEmpty mode="email">{empty}</BlockEmpty> : null}
      {lines.map((line, i) => <Fact key={line} line={line} colour={EMAIL.ink2} gap={i === 0 ? 4 : 9} />)}
    </BlockFrame>
  )
}

/** The section's figures: the loader's own, or the bar's where a frozen
 *  snapshot predates them. */
export function soundFiguresOf(data: OverviewData): MonthlySoundFigures {
  const stored = (data.record as OverviewData['record'] & { sound?: MonthlySoundFigures | null }).sound
  if (stored) return stored
  const bar = data.bar
  return {
    updates: bar.updates,
    comments: null,
    videos: bar.videos,
    trailingMedian: bar.expected,
    notEnglishPct: null,
    speechPct: null,
    onScreenPct: null,
    trackingChanges: null,
    refused: null,
    readings: typeof bar.readings === 'number' ? bar.readings : null,
  }
}

/**
 * One sentence, as its own paragraph, led by the figure it opens on: separated
 * divs at 13.5/1.55 in `#45494D`, each led by a bold `#26292C` figure, as the
 * artboard sets them. A split, never a re-wording.
 */
function Fact({ line, size = 13.5, colour, gap }: {
  line: string
  size?: number
  colour: string
  gap: number
}) {
  const [figure, rest] = splitLead(line)
  return (
    <div style={{ fontFamily: FONT.sans, fontSize: size, lineHeight: 1.55, color: colour, marginTop: gap }}>
      {figure ? <span style={{ fontWeight: 600, color: EMAIL.ink }}>{figure}</span> : null}
      {rest}
    </div>
  )
}

/** The words a figure may not take into its bold lead: "27% of what was said"
 *  leads on "27%", never on "27% of". */
const FUNCTION_WORDS = new Set(['of', 'not', 'in', 'on', 'to', 'for', 'and', 'or', 'a', 'an', 'the', 'is', 'was', 'were', 'has', 'have'])

/** The leading figure — with the word it counts, where that word counts it —
 *  and the rest of the sentence. A split, never a re-wording: the two halves
 *  concatenate back to the composer's own string. */
export function splitLead(line: string): [string | null, string] {
  const figure = /^\d[\d,.]*%?/.exec(line)
  if (!figure) return [null, line]
  const after = line.slice(figure[0].length)
  const word = /^\s+([^\s.,;:—·]+)/.exec(after)
  if (!word || FUNCTION_WORDS.has(word[1].toLowerCase())) return [figure[0], after]
  const lead = line.slice(0, figure[0].length + word[0].length)
  return [lead, line.slice(lead.length)]
}
