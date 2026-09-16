import type { ReactNode } from 'react'
import type { Block } from '@/lib/blocks/types'
import { BlockFrame } from '@/components/blocks/frame'
import type { QuarterlyData } from '@/lib/pages/quarterly'
import { QUARTER_PAGE_QUESTION, QUARTER_PAGE_TITLE, quarterLabel } from '@/lib/reports/quarterly'
import { Level, Note, Row } from './parts'

// QR8 · What we could not settle (mock page 8).
//
// THE LAST PAGE IS THE PRODUCT'S CHARACTER. Everywhere else a reading that did
// not clear its band is a quiet badge beside a row; here it is the subject of
// the page, with its count, its band and the reason it went undrawn. "Where the
// count is too thin, we say so rather than round it into a verdict" is the
// mock's own line and it is printed.
//
// THE ITEMS ARE READ OFF THE VERDICTS THE OTHER SEVEN PAGES DREW —
// `unsettledItems` filters the same list the interpretation argued from, so a
// comparison cannot be confident on page 2 and unsettled here, or unsettled
// here and silently absent from page 3.
//
// AND IT SAYS WHEN IT SETTLES. A reader told only that something is unsettled
// asks support when; a reader told "the first quarter-on-quarter verdict lands
// once six readings stand behind it" waits.

export const quarterlyUnsettled: Block<QuarterlyData> = {
  key: 'quarterly.unsettled',
  title: QUARTER_PAGE_TITLE.unsettled,
  question: QUARTER_PAGE_QUESTION.unsettled,

  render(data, mode = 'app') {
    const u = data.unsettled
    const frame = (children: ReactNode) => (
      <BlockFrame
        title={quarterlyUnsettled.title}
        question={quarterlyUnsettled.question}
        mode={mode}
        meta={quarterLabel(data.quarter, false)}
      >
        {children}
      </BlockFrame>
    )

    return frame(
      <div>
        <Note mode={mode} tone="body">
          Where the count is too thin, we say so rather than round it into a verdict.
        </Note>

        {/* WHAT WAS NEVER ASKED COMES FIRST, and it is not the same claim as
            a comparison that was drawn. An empty list on a workspace whose
            quarter half cannot be read at all printed "Every comparison this
            quarter asked for was drawn." five pages after one saying the
            quarter-on-quarter reading is not recorded. */}
        {u.notAsked ? <Note mode={mode}>{u.notAsked}</Note> : null}

        {u.items.length > 0 ? (
          u.items.map((item, n) => (
            <Row
              key={`${item.title}-${n}`}
              mode={mode}
              label={item.title}
              aside={<Level mode={mode} word="not settled" of={item.why} />}
            >
              {item.body}
            </Row>
          ))
        ) : u.notAsked ? null : (
          <Note mode={mode}>Every comparison this quarter asked for was drawn.</Note>
        )}

        {u.waiting.length > 0 ? (
          <div className={mode === 'email' ? undefined : 'mt-3'}>
            <Note mode={mode} tone="body">Also waiting on a reading</Note>
            {u.waiting.map((line, n) => (
              <Row key={n} mode={mode}>{line}</Row>
            ))}
          </div>
        ) : null}

        {u.heldBack.length > 0 ? (
          <div className={mode === 'email' ? undefined : 'mt-3'}>
            <Note mode={mode} tone="body">Held back</Note>
            {u.heldBack.map((line, n) => (
              <Row key={n} mode={mode}>{line}</Row>
            ))}
          </div>
        ) : null}

        <div className={mode === 'email' ? undefined : 'mt-3'}>
          <Note mode={mode} tone="body">When this settles</Note>
          <Note mode={mode}>{u.settles}</Note>
        </div>
      </div>
    )
  },

  emptyState() {
    // NEVER EMPTY. A quarter that settled everything says so, and that sentence
    // is the most valuable one on the page.
    return null
  },
}
