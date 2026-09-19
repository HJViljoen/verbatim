import type { ReactNode } from 'react'
import type { Block } from '@/lib/blocks/types'
import { BlockFrame, FigureCell } from '@/components/blocks/frame'
import { fmtInt, shortDate } from '@/lib/format'
import type { QuarterlyData } from '@/lib/pages/quarterly'
import { QUARTER_PAGE_QUESTION, QUARTER_PAGE_TITLE, quarterLabel } from '@/lib/reports/quarterly'
import { Card, Column, Columns, DefList, Eyebrow, Figure, Note, Row, Rule } from './parts'

// QR7 · Coverage and method (mock page 7).
//
// THE RECORD IS `lib/reading/record.ts`'s, over THE QUARTER'S OWN WINDOW.
// Overview composes the same lines over a month, the page bar over a month, the
// settings record over whatever the reader asked for — one composer, so the
// artefact and the page cannot disagree about how sound a reading is. What is
// quarterly here is the window it is asked about, and nothing else.
//
// THE QUARTER'S ANOMALY CHECKS, AND WHAT EACH ONE TURNED OUT TO BE. The WP asks
// for the flags AND their outcome, which is the part that makes a flag worth
// printing three months later: a week that ran unlike its baseline either
// showed up in the month's own reading or it did not, and `flagOutcome` says
// which off the verdicts this artefact already drew. A check that has never run
// says so; it never reads as a quiet quarter.
//
// ---- the port (Block D wave 2) -------------------------------------------------
//
// THE ARTBOARD'S 7fr / 5fr AND ITS `<dl>`. Left: the method paragraphs at
// reading width. Right: a hairline card holding "This quarter in numbers" as a
// label/value list — the shape design-system.md §5 specifies for a method page.
//
// `qr.p7.numbers` · EIGHT ROWS, NOT FOUR. Sources, Held back, Languages and the
// refusals were prose ABOVE the table and are rows in it now (`methodNumbers`),
// with the same figures and the same basis sentences. The Videos row still
// degrades to the month in hand without M3 and says so: a quarter counted as a
// sum of three months double-counts every thread that spans two, which measured
// at +38.7% over twelve months (D1).
//
// The row labelled "Comments" is deliberately NOT the mock's "Conversations"
// (D5): `lib/calibration.ts` fixes a conversation as one video and the comments
// it sparked, so under a Videos row of 7,059 the mock's label calls 11,840
// comments 11,840 conversations.

/** An ordered list of sentences as FOUR paragraphs, in order, as evenly as the
 *  count allows — the artboard's four. Fewer than four sentences gives one
 *  paragraph each and no empty ones. */
function inFour(lines: readonly string[]): string[][] {
  if (lines.length === 0) return []
  const groups = Math.min(4, lines.length)
  const out: string[][] = []
  let taken = 0
  for (let g = 0; g < groups; g++) {
    // The remainder goes to the EARLIEST paragraphs, so the last one is never
    // the long one and never a widow.
    const size = Math.ceil((lines.length - taken) / (groups - g))
    out.push(lines.slice(taken, taken + size))
    taken += size
  }
  return out
}

export const quarterlyMethod: Block<QuarterlyData> = {
  key: 'quarterly.method',
  title: QUARTER_PAGE_TITLE.method,
  question: QUARTER_PAGE_QUESTION.method,

  render(data, mode = 'app') {
    const m = data.method
    const email = mode === 'email'
    const frame = (children: ReactNode) => (
      <BlockFrame
        title={quarterlyMethod.title}
        question={quarterlyMethod.question}
        mode={mode}
        meta={quarterLabel(data.quarter)}
        footerNote={m.method?.preparedBy}
      >
        {children}
      </BlockFrame>
    )

    const left = (
      <Column mode={mode} gap={6}>
        <Eyebrow mode={mode}>How this review was made</Eyebrow>
        <Note mode={mode} tone="body">{m.line}</Note>
        {/* FOUR PARAGRAPHS, WHICH IS WHAT THE ARTBOARD SETS — not thirteen
            free-standing lines a pixel apart, which is what this read as: a
            log, in a 674px column, each entry one line long with 100px of
            unused measure beside it.

            NOTHING IS REGROUPED AND NOTHING IS REWORDED. `recordLines` emits
            its sentences in one fixed thematic order — what was delivered,
            what was gathered, how deeply it was read, what changed, what we
            could and could not say — and they are divided into four IN THAT
            ORDER, as evenly as the count allows. A paragraph here is a
            typographic grouping of an ordered list, not a claim that these
            three facts belong together; every sentence still stands on its
            own and still says its own basis. It is also SHORTER than the
            stack it replaces: the same words set as prose lose twelve
            inter-note margins and nine short last lines. */}
        <div className={email ? undefined : 'flex flex-col gap-2'}>
          {inFour(m.lines).map((para, n) => (
            <Note key={n} mode={mode}>{para.join(' ')}</Note>
          ))}
        </div>

        <div className={email ? undefined : 'mt-1.5 flex flex-col gap-[3px]'}>
          <Eyebrow mode={mode}>The unusual-week check</Eyebrow>
          {m.flagsNote ? (
            <Note mode={mode}>{m.flagsNote}</Note>
          ) : (
            <Note mode={mode}>
              <Figure mode={mode} value={fmtInt(m.checks.ran)} /> checks ran inside this quarter;{' '}
              <Figure mode={mode} value={fmtInt(m.checks.flagged)} /> of them raised something.
            </Note>
          )}
          {m.flags.map((flag, n) => (
            <Row
              key={`${flag.label}-${flag.weekStart}-${n}`}
              mode={mode}
              // `anomaly_flags.label` is plain words and never an id; for a
              // theme object those words are the registry's, which is the
              // model's, so the slot is named rather than the marker alone.
              label={<span data-copy="subject" data-slot="pass_b_theme">{flag.label}</span>}
            >
              {shortDate(flag.weekStart)}–{shortDate(flag.weekEnd)} ·{' '}
              <Figure mode={mode} value={`${fmtInt(flag.k)} of ${fmtInt(flag.n)}`} /> {flag.denominator}
              <br />
              What it turned out to be: {flag.outcome}.
            </Row>
          ))}
        </div>

        {m.refusedLine ? <Note mode={mode}>{m.refusedLine}</Note> : null}
      </Column>
    )

    const right = (
      <Column mode={mode} gap={10}>
        <Card mode={mode}>
          <Eyebrow mode={mode}>This quarter in numbers</Eyebrow>
          <DefList
            mode={mode}
            rows={[
              ...m.numbers.map((row) => ({
                label: row.label,
                value: (
                  <>
                    <FigureCell mode={mode} value={row.value} />
                    {row.note ? <Note mode={mode}>{row.note}</Note> : null}
                  </>
                ),
              })),
              { label: 'The unit', value: m.unit },
            ]}
          />
        </Card>
        {/* NOT `QUARTERLY_RULE` — the deck footer, the share header and the
            email masthead all carry that, and this page would be the second
            copy on the same sheet. The mock's own closing line says the thing
            this page is actually about. */}
        <Rule mode={mode}>Every label on this page is assigned by a fixed rule from counted data.</Rule>
      </Column>
    )

    return frame(
      <Columns weights={[1.7, 1]} mode={mode}>
        {left}
        {right}
      </Columns>,
    )
  },

  // NO FIGURES. Every number in the record is already declared by the block
  // that rests on it — the call WP11 made on OV6 and WP17 on WR6, and the
  // reason a figure budget counts readings rather than digits.

  emptyState() {
    // NEVER EMPTY. The record always has something to say, even when what it
    // says is that nothing has been recorded: that IS the coverage.
    return null
  },
}
