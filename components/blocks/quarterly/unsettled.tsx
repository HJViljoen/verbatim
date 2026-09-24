import type { ReactNode } from 'react'
import type { Block } from '@/lib/blocks/types'
import { BlockFrame, FigureCell } from '@/components/blocks/frame'
import { fmtInt, fmtPct, fullDate } from '@/lib/format'
import { PRIVACY_LINE } from '@/lib/reading/method'
import type { QuarterlyData } from '@/lib/pages/quarterly'
import { QUARTER_PAGE_QUESTION, QUARTER_PAGE_TITLE, quarterLabel } from '@/lib/reports/quarterly'
import { Card, Chip, Column, Columns, Eyebrow, Note, Row, State, TableRow } from './parts'

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
        {u.itemsMore > 0 ? (
          <Note mode={mode}>
            <span data-copy="figure">{u.itemsMore}</span> more were drawn and did not clear their band; each carries its
            badge on the page that measured it.
          </Note>
        ) : null}

        {/* `qr.p8.waiting` · THE ARTBOARD'S SHAPE: a headline and a badge per
            wait, so a reader scans named open questions rather than three
            unheaded paragraphs in a row. The words are ours where the honesty
            rules refuse the mock's; the layout is the mock's, which is what
            "the mock is the spec" governs. The badge is a STATE — what is
            missing — and never a direction: "gone quiet" belongs on page 4,
            inside a verdict node, with the register's own flag behind it. */}
        {u.waiting.length > 0 ? (
          <div className={email ? undefined : 'mt-2 flex flex-col gap-1'}>
            <Eyebrow mode={mode}>Also waiting on a reading</Eyebrow>
            {u.waiting.map((w, n) => (
              <Row
                key={n}
                mode={mode}
                label={w.line ? w.title : undefined}
                aside={<Chip tone="muted" mode={mode}>{w.why}</Chip>}
              >
                {w.line ?? w.title}
              </Row>
            ))}
            {/* THE COUNT OF WHAT DID NOT FIT. A sheet is a fixed box and this
                list is not bounded, so it ran off the bottom in silence on a
                workspace whose comparisons mostly could not be drawn — the one
                failure mode this artefact is arranged to avoid. */}
            {u.waitingMore > 0 ? (
              <Note mode={mode}>
                <span data-copy="figure">{u.waitingMore}</span> more are waiting on a reading; each is named on the page
                that measured it.
              </Note>
            ) : null}
          </div>
        ) : null}

{/* WHEN THIS SETTLES, ON THE LEFT. The artboard stacks this under "Held
            back" in the right column; measured, that column stood 465px tall
            against a 422px grid while this one sat at 255 and left a third of
            the sheet blank, and the last page lost its own privacy line off
            the bottom. The section moves, the sheet keeps every row, and the
            two columns are within 60px of each other. */}
          <div className={email ? undefined : 'flex flex-col gap-1'}>
            <Eyebrow mode={mode}>When this settles</Eyebrow>
            <Note mode={mode}>{u.settles}</Note>
          </div>
      </Column>
    )

    const right = (
      <Column mode={mode} gap={6}>
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

        {/* THE DATED LOG, BESIDE THE RECORD IT BELONGS TO. It sat under "When
            this settles" on the left; measured, that column ran to 531px
            against a 409px grid on a workspace whose comparisons mostly could
            not be drawn, while this one sat at 318. The log is a record fact,
            like the gate share above it, and the sentence about when the
            quarter settles stands on its own on the left. */}
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

      </Column>
    )

    // THE WIDE COLUMN IS THE SIDE WITH THE ROWS, AND WHICH SIDE THAT IS
    // DEPENDS ON THE QUARTER.
    //
    // A fixed 7 / 5 was right for exactly one of the seven states this deck is
    // drawn over. On a quarter whose comparisons mostly could not be drawn the
    // left column carries three unsettled items and two waits and needs the
    // width — measured, 466px against the right's 472. On a quarter that
    // settled nearly everything the left carries two rule sentences and three
    // waits and stands at 318px, while the right — "Held back", the term yield
    // and the dated change log, none of which get shorter — runs to 472 in the
    // NARROW column. So the sheet the page is named after ended at 57% of its
    // height while the record beside it ran to the bottom, and the previous fix
    // pass moved the change log right without moving the split that made it
    // the crowded side.
    //
    // Two items is the line: `unsettledItems` caps at four, and a page with two
    // or more of them plus its waits is a left column with a list on it.
    const itemsLead = u.items.length >= 2
    return frame(
      <Columns weights={itemsLead ? [6, 6] : [4, 8]} mode={mode}>
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
