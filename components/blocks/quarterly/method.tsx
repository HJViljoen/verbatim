import type { ReactNode } from 'react'
import type { Block } from '@/lib/blocks/types'
import { BlockFrame } from '@/components/blocks/frame'
import { fmtInt, shortDate } from '@/lib/format'
import type { QuarterlyData } from '@/lib/pages/quarterly'
import { QUARTER_PAGE_QUESTION, QUARTER_PAGE_TITLE, QUARTERLY_RULE, quarterLabel } from '@/lib/reports/quarterly'
import { Figure, Note, Row, Rule } from './parts'

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

export const quarterlyMethod: Block<QuarterlyData> = {
  key: 'quarterly.method',
  title: QUARTER_PAGE_TITLE.method,
  question: QUARTER_PAGE_QUESTION.method,

  render(data, mode = 'app') {
    const m = data.method
    const frame = (children: ReactNode) => (
      <BlockFrame
        title={quarterlyMethod.title}
        question={quarterlyMethod.question}
        mode={mode}
        meta={quarterLabel(data.quarter)}
      >
        {children}
      </BlockFrame>
    )

    return frame(
      <div>
        <Note mode={mode} tone="body">{m.line}</Note>
        {m.lines.map((line, n) => (
          <Note key={n} mode={mode}>{line}</Note>
        ))}

        <div className={mode === 'email' ? undefined : 'mt-3'}>
          <Note mode={mode} tone="body">This quarter in numbers</Note>
          {m.numbers.map((row) => (
            <Row key={row.label} mode={mode} label={row.label}>
              <Figure mode={mode} value={row.value} />
              {row.note ? ` · ${row.note}` : null}
            </Row>
          ))}
          <Row mode={mode} label="The unit">{m.unit}</Row>
        </div>

        <div className={mode === 'email' ? undefined : 'mt-3'}>
          <Note mode={mode} tone="body">The unusual-week check</Note>
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
        <Rule mode={mode}>{QUARTERLY_RULE}</Rule>
      </div>
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
