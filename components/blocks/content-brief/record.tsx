import type { ReactNode } from 'react'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import type { Block, RenderMode } from '@/lib/blocks/types'
import { EMAIL, FONT } from '@/lib/email/theme'
import type { FigureTable } from '@/lib/reading/verdicts'
import type { ContentBriefData, NumberRow } from '@/lib/pages/content-brief'

// The content brief's page 5 — "The record behind this brief" (Block D wave 2,
// package E-content; artboard ContentBrief.dc.html slide 5).
//
// WHY THIS IS A SECTION AND NOT MORE PARAGRAPHS ON THE METHOD PAGE. The mock's
// method slide prints eleven figures the deck's own `MethodPage` does not —
// the update dates, the trailing median, the read-depth shares, the gate share,
// themes per video, the Reddit cap, the tracking change and the refusals — and
// every one of them is already returned by `loadRecordInputs` and thrown away.
// `MethodPage` is one component shared by all four briefs and is owned by
// another package this wave, so the figures land here, in the brief's own
// section, immediately before it. When the deck's card can take eight rows,
// this block's `numbers` are what it should take.
//
// D15 · EVERY FIGURE CARRIES ITS BASIS. Three clocks meet on this slide and the
// sentences name them: the delivery record and the instrument are RUN-dated
// (`recordLines` says "on the most recent update"), the read-depth and language
// shares are ALL-TIME and say so in their own words, and the coverage is the
// reading's window. A card that printed the five under one month heading would
// be the defect `methodLines` was written to end.
//
// D14 · NO PROMISED DATE AND NO "TRACKING SINCE". The mock's footer says
// "Tracking since 6 Apr" and "next update lands 4 October". `DeliveryRecord`
// carries EARLIEST EVIDENCE, not a start date, and nothing in this product
// promises a calendar date for a future update — so the line printed is
// `deliveryRecord`'s own ("23 updates since 6 Apr 2026 · longest gap 35 days ·
// last on 27 Sep 2026"), which says what happened and promises nothing.

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
      <span className="inline-block h-[2px] w-4 rounded-full bg-primary" aria-hidden />
      <span>{children}</span>
    </p>
  )
}

function Numbers({ rows, mode }: { rows: readonly NumberRow[]; mode: RenderMode }) {
  if (rows.length === 0) return null
  if (mode === 'email') {
    return (
      <div>
        {rows.map((r) => (
          <div key={r.label} style={{ marginTop: 6 }}>
            <div style={{ fontFamily: FONT.mono, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.6px', color: EMAIL.muted }}>{r.label}</div>
            <div style={{ fontFamily: FONT.sans, fontSize: 13, color: EMAIL.ink, marginTop: 2 }}>{r.value}</div>
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2.5 rounded-md border border-border bg-tile px-4 py-3">
      <Eyebrow>This brief in numbers</Eyebrow>
      <dl className="m-0 grid grid-cols-[120px_1fr] gap-x-4 gap-y-1.5">
        {rows.map((r) => (
          <div key={r.label} className="contents">
            <dt className="pt-[3px] font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground">{r.label}</dt>
            {/* NOT MARKED AS A `level`. These are the record's own sentences —
                a count with the population it counts named inside the words —
                and rule (b) reads a level node's whole text for an "of N" it
                would not find in "27% of what was said on camera". The figures
                this block publishes are in `figures()`, where a model may name
                them and a budget can count them. */}
            <dd className="m-0 text-[13.5px] leading-[1.35] text-foreground">{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export const contentRecord: Block<ContentBriefData> = {
  key: 'content.record',
  title: 'The record behind this brief',
  question: 'What was read, over what, and what was held back?',

  render(data, mode = 'app') {
    const r = data.record
    const empty = contentRecord.emptyState(data)
    if (empty) {
      return (
        <BlockFrame title={contentRecord.title} question={contentRecord.question} mode={mode}>
          <BlockEmpty mode={mode}>{empty}</BlockEmpty>
        </BlockFrame>
      )
    }
    const tail = [r.delivery, r.counter].filter((x): x is string => !!x)

    if (mode === 'email') {
      return (
        <BlockFrame title={contentRecord.title} question={contentRecord.question} mode={mode} meta={r.monthLabel}>
          <div>
            {r.lines.map((l, i) => (
              <div key={i} style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink2, marginTop: 4 }}>{l}</div>
            ))}
            <Numbers rows={r.numbers} mode={mode} />
            {tail.map((l, i) => (
              <div key={i} style={{ fontFamily: FONT.mono, fontSize: 11, color: EMAIL.muted, marginTop: 6 }}>{l}</div>
            ))}
          </div>
        </BlockFrame>
      )
    }

    return (
      <BlockFrame
        title={contentRecord.title}
        question={contentRecord.question}
        mode={mode}
        heading={mode !== 'print'}
        meta={r.monthStatus === 'frozen' ? `${r.monthLabel} · frozen` : `${r.monthLabel} · still filling`}
        footerNote={r.method?.preparedBy}
      >
        <div className="grid min-w-0 gap-x-12 gap-y-4 md:grid-cols-[7fr_5fr]">
          <div className="flex min-w-0 flex-col gap-2">
            <Eyebrow>How this brief was made</Eyebrow>
            {r.paragraphs.map((l, i) => (
              <p key={i} className="m-0 max-w-[70ch] text-[12.5px] leading-[1.45] text-foreground">{l}</p>
            ))}
            <p className="m-0 max-w-[70ch] text-[12px] leading-[1.4] text-muted-foreground">{r.labels}</p>
            <p className="m-0 max-w-[70ch] text-[12px] leading-[1.4] text-muted-foreground">{r.reddit}</p>
            {tail.length > 0 ? (
              <div className="mt-auto flex flex-col gap-0.5">
                {tail.map((l, i) => (
                  <p key={i} className="m-0 font-mono text-[11px] leading-[1.5] text-muted-foreground">{l}</p>
                ))}
              </div>
            ) : null}
          </div>
          <Numbers rows={r.numbers} mode={mode} />
        </div>
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    const out: FigureTable = {}
    const r = data.record
    const rows = r.numbers
    const find = (label: string) => rows.find((x) => x.label === label)
    // THE FIGURES A MODEL MAY NAME, PREFIXED. Key collisions across the three
    // block registries are zero and must stay zero (AGENTS.md), and the record
    // publishes shapes other surfaces also count.
    if (find('Themes per video')) {
      const n = Number((find('Themes per video')!.value.match(/^[\d.]+/) ?? ['0'])[0])
      if (Number.isFinite(n) && n > 0) out.content_themes_per_video = { value: n, unit: 'videos', label: `${n} themes per analysed video` }
    }
    return out
  },

  quotes: () => [],

  emptyState(data) {
    return data.record.empty
  },
}
