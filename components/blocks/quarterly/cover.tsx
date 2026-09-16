import type { Block } from '@/lib/blocks/types'
import { BlockFrame } from '@/components/blocks/frame'
import { BlockStat } from '@/components/blocks/stat'
import { TokenProse } from '@/components/blocks/prose'
import type { QuarterlyData } from '@/lib/pages/quarterly'
import { QUARTER_PAGE_QUESTION, QUARTER_PAGE_TITLE, quarterLabel } from '@/lib/reports/quarterly'
import { Note } from './parts'

// QR1 · The cover (design item 14, mock QuarterlyReview page 1).
//
// THE PARAGRAPH IS CODE'S, NOT A MODEL's. Page 2 is the one place on this
// artefact a model may argue, and it carries the word *Interpretation* for that
// reason. A cover is read by people who never reach page 2 — often people the
// workspace forwarded it to — so it states what was counted and nothing else,
// with every number as a `[[token]]` the surface substitutes here.
//
// THE RULE IS CHROME, NOT A PAGE. `QUARTERLY_RULE` is printed by the deck's
// footer (on every sheet, because a PDF has no masthead to scroll back to), by
// the share page's header and by the email's masthead. The first cut printed it
// here as well, which put it twice on one sheet and twice on one screen — read
// in the browser, where it was obvious and in markup it was not.
//
// THE STAMP CARRIES THE GATE. "your 3rd monthly reading, the quarter view needs
// 6" is on the first page, above the fold, because a quarterly review whose own
// half is held back is a different document from one whose is not, and the
// reader must not have to reach page 8 to learn which they are holding.

export const quarterlyCover: Block<QuarterlyData> = {
  key: 'quarterly.cover',
  title: QUARTER_PAGE_TITLE.cover,
  question: QUARTER_PAGE_QUESTION.cover,

  render(data, mode = 'app') {
    const c = data.cover
    return (
      <BlockFrame
        title={`${quarterlyCover.title} · ${quarterLabel(data.quarter)}`}
        question={quarterlyCover.question}
        mode={mode}
        meta={c.stamp}
      >
        <div>
          <TokenProse body={c.body} figures={c.figures} mode={mode} />
          <div className={mode === 'email' ? undefined : 'mt-3 flex flex-wrap gap-6'}>
            {c.stats.map((s) => (
              // `base`, NOT `level`. A level is a CALIBRATED WORD with its
              // evidence, and rule (b) requires the "of N" inside it for
              // exactly that reason. These three carry a figure's own label and
              // the line under it — "videos in September", "September, 18 days
              // in" — which is a caption and not a verdict, and marking it as a
              // level would make the contract demand a denominator of a
              // sentence that is not a share of anything.
              <BlockStat
                key={s.token}
                value={s.value}
                mode={mode}
                base={<>{s.label} · {s.caption}</>}
              />
            ))}
          </div>
          <Note mode={mode}>{c.corpus}</Note>
        </div>
      </BlockFrame>
    )
  },

  figures(data) {
    return data.cover.figures
  },

  emptyState() {
    // NEVER EMPTY. A quarter with nothing in it is still a quarter, and the
    // cover's job is to say which one and how much stands behind it.
    return null
  },
}
