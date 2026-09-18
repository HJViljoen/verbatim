import type { ReactNode } from 'react'
import type { Block } from '@/lib/blocks/types'
import { BlockFrame, FigureCell } from '@/components/blocks/frame'
import { fmtInt, fmtPct, fullDate } from '@/lib/format'
import { PRIVACY_LINE } from '@/lib/reading/method'
import type { QuarterlyData } from '@/lib/pages/quarterly'
import { QUARTER_PAGE_QUESTION, QUARTER_PAGE_TITLE, quarterLabel } from '@/lib/reports/quarterly'
import { Card, Column, Columns, Eyebrow, Note, Row, State, TableRow } from './parts'

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
// once six readings stand behind it" waits. `qr.p8.settles` keeps that sentence
// and does NOT gain the mock's "Next update: 4 October" — no next-delivery date
// is carried on this artefact, and D14 is that we do not print state we do not
// hold. A test in this package's suite fails the build if a promised calendar
// date appears.
//
// ---- the port (Block D wave 2) -------------------------------------------------
//
// THE ARTBOARD'S TWO COLUMNS. Left: the unsettled items and the waits. Right: a
// "Held back" card and a "When this settles" block carrying the dated change
// log the deck has only ever printed as a count.
//
// `qr.p8.searchplan` · `MethodPage.searchPlan` — what each search term brought
// back inside this quarter, on the GATHER's clock, which is the one figure in
// the product honestly on it. It renders on Settings › Record and nowhere else
// until now.
//
// `qr.p8.changelog` · `MethodPage.changeLog` — the dated log. `deckChangeLogView`
// lists RECORDED rows only: a reconstructed row is a label worked out
// afterwards, not a record of an act, and a deck listing inference beside
// record would be the worse of the two claims printed as the better.

export const quarterlyUnsettled: Block<QuarterlyData> = {
  key: 'quarterly.unsettled',
  title: QUARTER_PAGE_TITLE.unsettled,
  question: QUARTER_PAGE_QUESTION.unsettled,

  render(data, mode = 'app') {
    const u = data.unsettled
    const m = data.method
    const email = mode === 'email'
    const frame = (children: ReactNode) => (
      <BlockFrame
        title={quarterlyUnsettled.title}
        question={quarterlyUnsettled.question}
        mode={mode}
        meta={quarterLabel(data.quarter, false)}
        // `qr.p8.footer` · the privacy sentence on the last page, composed once
        // for every surface (`lib/reading/method.ts`). The slide's own footer
        // slot is spent on the artefact-wide rule, which is on every sheet
        // because a PDF has no masthead to scroll back to.
        footerNote={PRIVACY_LINE}
      >
        {children}
      </BlockFrame>
    )

    const left = (
      <Column mode={mode} gap={8}>
        <Eyebrow mode={mode}>Not settled this quarter</Eyebrow>
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
              aside={<State mode={mode} word="not settled" why={item.why} />}
            >
              {item.body}
            </Row>
          ))
        ) : u.notAsked ? null : (
          <Note mode={mode}>Every comparison this quarter asked for was drawn.</Note>
        )}

        {u.waiting.length > 0 ? (
          <div className={email ? undefined : 'mt-2 flex flex-col gap-1'}>
            <Eyebrow mode={mode}>Also waiting on a reading</Eyebrow>
            {u.waiting.map((line, n) => (
              <Row key={n} mode={mode}>{line}</Row>
            ))}
          </div>
        ) : null}
      </Column>
    )

    const right = (
      <Column mode={mode} gap={10}>
        <Card mode={mode}>
          <Eyebrow mode={mode}>Held back</Eyebrow>
          {u.heldBack.length > 0 ? (
            u.heldBack.map((line, n) => <Note key={n} mode={mode}>{line}</Note>)
          ) : (
            <Note mode={mode}>Nothing was held back from this quarter’s reading.</Note>
          )}
          {/* `qr.p8.searchplan` · the term yield, on the GATHER's clock — which
              `SearchPlan.basis` states, because it is the one figure in this
              product honestly dated by when we looked rather than by when a
              comment was written. */}
          {m.searchPlan ? (
            <>
              <Note mode={mode} tone="body">What each search term brought back</Note>
              {m.searchPlan.rows.slice(0, 6).map((term) => (
                <TableRow
                  key={term.keyword}
                  mode={mode}
                  template="minmax(0,3fr) minmax(0,2fr)"
                  cells={[
                    term.keyword,
                    <FigureCell
                      key="yield"
                      mode={mode}
                      value={term.keptPct == null ? '—' : fmtPct(term.keptPct, 0)}
                      of={`${fmtInt(term.kept)} of ${fmtInt(term.found)} kept`}
                    />,
                  ]}
                />
              ))}
              {m.searchPlan.showing ? <Note mode={mode}>{m.searchPlan.showing}</Note> : null}
              {m.searchPlan.noYield > 0 ? (
                <Note mode={mode}>
                  <span data-copy="figure">{fmtInt(m.searchPlan.noYield)}</span> of the terms found something and kept
                  nothing — worth reviewing, because a term pulling in the wrong videos costs money to gather.
                </Note>
              ) : null}
              <Note mode={mode}>{m.searchPlan.basis}</Note>
            </>
          ) : (
            <Note mode={mode}>What each search term brought back is not recorded for this workspace.</Note>
          )}
        </Card>

        <div className={email ? undefined : 'flex flex-col gap-1'}>
          <Eyebrow mode={mode}>When this settles</Eyebrow>
          <Note mode={mode}>{u.settles}</Note>
          {/* `qr.p8.changelog` · the dated log. Page 7 prints the COUNT of
              changes inside the window; this is what those changes were. */}
          {m.changeLog ? (
            <>
              {m.changeLog.rows.map((row, n) => (
                <Row key={row.id ?? n} mode={mode}>
                  <span className={email ? undefined : 'font-mono text-[10.5px] text-muted-foreground'}>{fullDate(row.on)}</span>{' '}
                  {row.what} — {row.said}
                  {/* WHO, AS A ROLE. `ClientChange.who` is `actorWords`'
                      output, which is what identity resolved to and never a
                      name a browser claimed (lib/config-log.ts). */}
                  <Note mode={mode}>{row.who}{row.breaks ? ` · ${row.breaks}` : ''}</Note>
                </Row>
              ))}
              {m.changeLog.showing ? <Note mode={mode}>{m.changeLog.showing}</Note> : null}
              {m.changeLog.affectsRecorded ? null : (
                <Note mode={mode}>What each change broke is not recorded for this workspace, so only the change is listed.</Note>
              )}
              {m.changeLog.rows.length === 0 ? (
                <Note mode={mode}>Nothing that was logged changed what we track inside this quarter.</Note>
              ) : null}
            </>
          ) : (
            <Note mode={mode}>
              The change log could not be read for this workspace, which is not the same as nothing having changed.
            </Note>
          )}
        </div>
      </Column>
    )

    return frame(
      <Columns weights={[7, 5]} mode={mode}>
        {left}
        {right}
      </Columns>,
    )
  },

  emptyState() {
    // NEVER EMPTY. A quarter that settled everything says so, and that sentence
    // is the most valuable one on the page.
    return null
  },
}
