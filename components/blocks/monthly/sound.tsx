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
  const lines = [...r.lines, freezeSentence(r.freezesOn)]
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
      footer={<a href={href} style={{ color: EMAIL.ink }}>the record →</a>}
    >
      {empty ? <BlockEmpty mode="email">{empty}</BlockEmpty> : null}
      <div style={{ fontFamily: FONT.sans, fontSize: 11.5, lineHeight: 1.5, color: EMAIL.muted }}>{lines.join(' ')}</div>
      {footnote.length > 0 ? (
        <div style={{ fontFamily: FONT.sans, fontSize: 11, lineHeight: 1.5, color: EMAIL.muted, marginTop: 8 }}>{footnote.join(' ')}</div>
      ) : null}
    </BlockFrame>
  )
}
