import type { ReactNode } from 'react'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import type { Block, RenderMode } from '@/lib/blocks/types'
import { fmtInt } from '@/lib/format'
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

function Numbers({ rows, caveat, mode }: { rows: readonly NumberRow[]; caveat: string; mode: RenderMode }) {
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
        {/* THE CAVEAT TRAVELS WITH THE CARD (design review 10). It used to be
            a paragraph in the print arm's left column and nowhere at all in
            the email arm, which printed neither it nor the label rule. */}
        <div style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.muted, marginTop: 8 }}>{caveat}</div>
      </div>
    )
  }
  return (
    /* `self-start`, THE ARTBOARD'S OWN `align-self:start`: the card ends where
       its rows end instead of stretching to the height of the prose column
       beside it and printing a third of a page of bordered white. */
    <div className="flex flex-col gap-2.5 self-start rounded-md border border-border bg-tile px-4 py-3">
      <Eyebrow>This brief in numbers</Eyebrow>
      <dl className="m-0 grid grid-cols-[130px_1fr] gap-x-4 gap-y-2">
        {rows.map((r) => (
          <div key={r.label} className="contents">
            <dt className="pt-[3px] font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground">{r.label}</dt>
            {/* NOT MARKED AS A `level`. These are the record's own sentences —
                a count with the population it counts named inside the words —
                and rule (b) reads a level node's whole text for an "of N" it
                would not find in "27% of what was said on camera". The figures
                this block publishes are in `figures()`, where a model may name
                them and a budget can count them. */}
            <dd className="m-0 text-[14.5px] leading-[1.4] text-foreground">{r.value}</dd>
          </div>
        ))}
      </dl>
      {/* THE ARTBOARD'S OWN CARD FOOTER — a ruled caveat under the rows
          (design review 10). The card ended at 59% of a 482px body beside a
          prose column running its full height, and the artboard's card carries
          eight rows AND this caveat to about 90%. The Reddit cap is the caveat
          that belongs to the NUMBERS — it is why an engagement figure has the
          denominator it has — and it was a paragraph in the left column, which
          is the column that had room to spare. */}
      <p className="m-0 border-t border-border pt-2.5 text-[12.5px] leading-[1.45] text-muted-foreground">{caveat}</p>
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
        // THE THIN ARM SUPPRESSES THE HEADER THE FILLED ARM DOES (design
        // review 4) — see `contentMake`'s copy of this comment.
        <BlockFrame title={contentRecord.title} question={contentRecord.question} mode={mode} header={mode !== 'print'}>
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
            <Numbers rows={r.numbers} caveat={r.reddit} mode={mode} />
            {/* NO `redditCap` IN THIS LIST — see the note on the app/print arm
                below. The caveat under the numbers card IS the Reddit cap. */}
            {[r.method?.basis, r.method?.language, r.method?.privacy]
              .filter((l): l is string => !!l)
              .map((l, i) => (
                <div key={i} style={{ fontFamily: FONT.mono, fontSize: 10.5, color: EMAIL.muted, marginTop: 6 }}>{l}</div>
              ))}
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
        header={mode !== 'print'}
        meta={r.monthStatus === 'frozen' ? `${r.monthLabel} · frozen` : `${r.monthLabel} · still filling`}
        // ONE CREDIT AND ONE DATE ON A SHEET (design review 13). The deck
        // stamps every slide "Created by Össur with Verbatim · 28 Sep 2026"
        // (components/print/report-deck.tsx `DeckFooter`), and this printed
        // "Prepared by Verbatim · 18 Sep 2026" one line above it — two stamps
        // with two dates, both true (the second is the document's date, the
        // first `readingAt`) and read as a mistake. On a slide the deck's stamp
        // is the credit; in the app and in an email there is no deck, so the
        // block keeps its own.
        footerNote={mode === 'print' ? undefined : r.method?.preparedBy}
      >
        <div className="grid min-w-0 gap-x-12 gap-y-4 lg:grid-cols-[7fr_5fr]">
          <div className="flex min-w-0 flex-col gap-2">
            <Eyebrow>How this brief was made</Eyebrow>
            {/* AS CLOSE TO THE ARTBOARD'S SCALE AS THIRTEEN SENTENCES FIT
                (design review 12). This was 12.5px / 1.45 against the
                artboard's 15.5 / 1.55 — type shrunk to fit on a slide that had
                40px of room left over. Measured in the browser at 1123 × 631,
                with the slide unconstrained so the natural height is the one
                read: 15.5 / 1.55 runs the column 21px PAST the sheet even after
                the measure was widened, because the mock's method slide carries
                about eight sentences and `recordLines` carries thirteen and
                drops none of them. 14.5 / 1.5 fits with 37px to spare.
                The `max-w` went from 66ch to 76ch in the same breath: 66ch is
                the ARTBOARD's cap at the ARTBOARD's size, about 550px of line,
                and 66ch of 14.5px type is 80px narrower than that — a cap that
                re-wraps the column tighter every time the type gets smaller,
                which is the opposite of what a measure is for. The numbers card
                beside it is the artboard's exactly: 130px label column, 14.5px
                values. */}
            {r.paragraphs.map((l, i) => (
              <p key={i} className="m-0 max-w-[76ch] text-[14.5px] leading-[1.5] text-foreground">{l}</p>
            ))}
            <p className="m-0 max-w-[76ch] text-[14px] leading-[1.5] text-muted-foreground">{r.labels}</p>
            {tail.length > 0 ? (
              <div className="mt-auto flex flex-col gap-0.5">
                {tail.map((l, i) => (
                  <p key={i} className="m-0 font-mono text-[11px] leading-[1.5] text-muted-foreground">{l}</p>
                ))}
              </div>
            ) : null}
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            <Numbers rows={r.numbers} caveat={r.reddit} mode={mode} />
            {/* THE METHOD FOOTNOTE, WHICH THIS SHEET IS NOW THE ONLY HOME FOR
                (fix pass, reports-25). The content brief printed TWO
                consecutive "How this brief was made" sheets — this one and the
                deck's `MethodPage` — with the same eyebrow, the same
                `grid-cols-[7fr_5fr]` and a numbers card each, disagreeing about
                Videos. `CONTENT_MAP` drops the second, which is the artboard's
                own shape; what only the second printed was `methodLines` —
                the basis, the language note, the Reddit cap and PRIVACY_LINE —
                and a client PDF may not lose those. `r.method` has been on this
                slide's data since it was built and only `preparedBy` was read
                off it. It sits under the numbers card, in the column that
                stopped at 59% of the body. */}
            {/* AND `redditCap` IS NOT IN THIS LIST, because `content` put the
                same sentence where the artboard wants it. Both packages moved
                REDDIT_CAP_LINE onto this one sheet from different directions:
                `reports` brought the whole of `methodLines` here when
                `CONTENT_MAP` dropped the deck's second method page, and
                `content` made the cap the ruled caveat inside the numbers card
                it qualifies. Kept together unfiltered, the sheet printed the
                identical sentence twice — 12.5px inside the card and 10px in
                the footnote under it — which is reports-18's own defect class
                on the sheet reports-25 had just made the only method sheet.
                `lib/pages/content-brief.ts:124` says this field is "printed
                once under the card"; the card's caveat is that printing. */}
            {r.method && (
              <div className="flex flex-col gap-1">
                {[r.method.basis, r.method.language, r.method.privacy]
                  .filter((l): l is string => !!l)
                  .map((l, i) => (
                    <p key={i} className="m-0 font-mono text-[10px] leading-[1.45] text-muted-foreground">{l}</p>
                  ))}
              </div>
            )}
          </div>
        </div>
      </BlockFrame>
    )
  },

  /**
   * THE FIGURES A MODEL MAY NAME, PREFIXED. Key collisions across the three
   * block registries are zero and must stay zero (AGENTS.md).
   *
   * ONE FIGURE, AND IT ROUND-TRIPS. `content_themes_per_video` used to be
   * published here, recovered by regex from a rendered sentence and declared
   * `unit: 'videos'` — which sends it through `proseFigures`' count arm, so a
   * `[[content_themes_per_video]]` substituted into brief prose printed "2"
   * while the numbers card two inches away printed "2.37 themes per analysed
   * video" (code review 4). That is the split the two `FigureTable`s and the
   * single `proseFigures` crossing exist to prevent.
   *
   * It is not published at all rather than published wrong: the measured units
   * are `videos · comments · pts · pct` and a RATE is none of them, so there is
   * no way to declare it that prints what the card prints. Adding a unit is a
   * change to `lib/reading/verdicts.ts` and to every consumer that switches on
   * one (`lib/reports/sent-figures.ts`, `lib/reports/monthly.ts`), which is a
   * bigger change than this block may make. The card still prints the number;
   * only the citable token is gone.
   *
   * What IS published is the one figure whose printed form is exactly the
   * card's: the videos this reading covered, a count through `fmtInt` on both
   * sides — and `index.test.tsx` asserts that round trip for every key.
   */
  figures(data): FigureTable {
    const out: FigureTable = {}
    const r = data.record
    if (r.videosRead != null) {
      out.content_record_videos = {
        value: r.videosRead,
        unit: 'videos',
        label: `${fmtInt(r.videosRead)} videos carried conversation in this reading`,
      }
    }
    return out
  },

  quotes: () => [],

  emptyState(data) {
    return data.record.empty
  },
}
