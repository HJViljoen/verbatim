import type { ReactNode } from 'react'
import type { BlockContext } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { overviewRecord } from '@/components/pages/overview/record'
import { EMAIL, FONT } from '@/lib/email/theme'
import { freezeSentence } from '@/lib/reading/record'
import type { OverviewData } from '@/lib/pages/overview'

/**
 * MR8 · How sound is this month, in the EMAIL (Block D wave 2, E-monthly; the
 * artboard's section 8).
 *
 * THE RECORD PARAGRAPH IS OVERVIEW'S, WORD FOR WORD — `recordLines` composes
 * it and this arm joins the same array in the same order, so the page and the
 * artefact cannot come to state one reading's provenance two ways. Two things
 * are added, and both are things the record paragraph demonstrably does not
 * carry on this artefact:
 *
 *   · THE METHOD FOOTNOTE (`methodLines`, wave 1). The artboard writes "27% not
 *     in English — Afrikaans 14%, German 6% · speech read on 71% of videos ·
 *     on-screen text on 64%" inside the month's coverage line, which is two
 *     errors in one clause (D15/D4): read depth is `all_time_non_reddit` BY
 *     CONSTRUCTION, and the language share is about what was said ON CAMERA,
 *     not about the comments a reader sees. `methodLines` states each figure
 *     with its own basis in the open, which is what it was written for, and
 *     the per-language breakdown has no field and is not printed.
 *   · the Reddit clause, which has never been printed on any reading surface.
 *
 * WHY IT DRAWS ITS OWN FRAME. Only to carry `accent` — the artboards' ruled
 * mono eyebrow — which the page's block does not pass. Nothing else here is
 * this artefact's.
 */
export function monthlySoundEmail(data: OverviewData, ctx: BlockContext): ReactNode {
  const r = data.record
  const method = data.method
  const href = `${ctx.appUrl}${r.href}`
  const empty = overviewRecord.emptyState(data)
  // THE FREEZE SENTENCE IS CALLED, NOT COPIED (the fix pass, review finding
  // [Minor]). It was the same template string written out again here, so the
  // first time Overview re-worded its own line the page and the artefact would
  // have stated one reading two ways — silently, which is the one thing
  // `fromOverview` exists to prevent. `freezeSentence` is the composer both
  // read, and the test below asserts this arm's text against Overview's own
  // rendered text.
  const freeze = freezeSentence(r.freezesOn)
  // THE BASIS TRAVELS WITH THE FIGURE, so these three are a SEPARATE paragraph
  // from the month's own record and not appended to it: one is about the month
  // and three are not, and a five-fact line with only one of them dated is the
  // defect `lib/reading/method.ts` was written to end.
  const footnote = method ? [method.basis, method.language, method.redditCap].filter(Boolean) as string[] : []
  return (
    <BlockFrame
      title={overviewRecord.title}
      question={overviewRecord.question}
      mode="email"
      accent
      // THE LINK IS IN THE HEAD, WHERE THE ARTBOARD PUTS IT (the wave-3
      // review, finding [Minor]). Passed as the frame's FOOTER it rendered
      // bottom-left in a plain underline, and §8's head was the only one on
      // the page with nothing on its right — while the artboard draws "the
      // record →" top-right of the section head, green 12/600, opposite the
      // mono eyebrow. Deviation 18 explains why there is no second footer
      // BUTTON, which is the right call and unchanged; nothing recorded that
      // the link had left the header. `meta` is the frame's top-right slot and
      // it takes a node, so the link carries its own type and colour — the
      // cell's mono 11 faint is the shared primitive's and belongs to the
      // counts and ranges the other seven sections put there.
      meta={<a href={href} style={{ fontFamily: FONT.sans, fontSize: 12, fontWeight: 600, color: EMAIL.link, textDecoration: 'none' }}>the record →</a>}
    >
      {empty ? <BlockEmpty mode="email">{empty}</BlockEmpty> : null}
      {r.lines.map((line, i) => <Fact key={line} line={line} colour={EMAIL.ink2} gap={i === 0 ? 4 : 9} />)}
      {/* AND THE CAVEAT CLOSES THE SECTION WITH SPACE ROUND IT. "This month
          stops moving on 31 Oct 2026; until then every figure above may still
          change" is the one sentence on this artefact that tells a reader the
          numbers they have just read are not final; inside the joined
          paragraph it was the tail of a five-fact block. */}
      <Fact line={freeze} colour={EMAIL.ink2} gap={14} />
      {footnote.map((line, i) => <Fact key={line} line={line} size={12.5} colour={EMAIL.muted} gap={i === 0 ? 14 : 8} />)}
    </BlockFrame>
  )
}

/**
 * One fact, as its own paragraph, led by the figure it is about.
 *
 * THE ARTBOARD'S STRUCTURE, WHICH THE JOIN LOST (the wave-3 review, finding
 * [Important]). §8 was `lines.join(' ')` at 11.5 and `footnote.join(' ')` at
 * 11, both wholly in the muted grey: a five-line paragraph carrying twelve
 * facts and then a seven-line one, with nothing marking where any of them
 * begins. The artboard sets the section as separated divs at 13.5/1.55 in
 * `#45494D`, each led by a bold `#26292C` figure ("4 updates · …", "27% not in
 * English — …"), and Heinrich's ruling is that the mock's layout stays. The
 * section carrying this artefact's single most important caveat — "this month
 * stops moving on 31 Oct 2026; until then every figure above may still change"
 * — was set in the smallest, lightest type on the page.
 *
 * THE LEAD IS THE SENTENCE'S OWN FIGURE AND IS NEVER REWORDED. The composers
 * (`recordLines`, `methodLines`) own every word of these lines; this takes the
 * leading figure and the word it counts — "3 updates", "2,359 videos",
 * "2 comparisons" — and sets that run in the ink. A figure followed by a
 * function word leads on the figure alone ("27%", never "27% of"), and a
 * sentence that does not open on a figure gets no bold lead ("Nothing about
 * what we track changed…"): a bold run that is not a quantity is decoration,
 * and this is the section that can least afford any.
 *
 * THE FOOTNOTE KEEPS ITS OWN TIER, and it is the COLOUR that carries the
 * difference rather than the size. `basis` / `language` / `redditCap` are the
 * three facts whose basis is not this month at all — which is why they are a
 * separate paragraph group in the first place — so at 12.5 muted they still
 * read as the footnote they are, and they are no longer the 11px the review
 * measured.
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
const FUNCTION_WORDS = new Set(['of', 'in', 'on', 'to', 'for', 'and', 'or', 'a', 'an', 'the', 'is', 'was', 'were', 'has', 'have'])

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
