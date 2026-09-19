import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockFrame } from '@/components/blocks/frame'
import { BlockMovement } from '@/components/blocks/movement'
import { TokenProse } from '@/components/blocks/prose'
import type { CoverStat, QuarterlyData } from '@/lib/pages/quarterly'
import { QUARTER_PAGE_QUESTION, QUARTER_PAGE_TITLE, quarterLabel } from '@/lib/reports/quarterly'
import { EMAIL, FONT } from '@/lib/email/theme'
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
//
// ---- the port (Block D wave 2) -------------------------------------------------
//
// THE MOCK'S COVER IS A HERO: a 3px × 56px green rule, the title at 58px/600,
// the stamp in mono, the argument at 17px/1.55 over 66ch, and three hairline
// cards on a three-column grid, the whole thing vertically centred inside a 6%
// gutter. That is what this now draws — at 44px rather than 58px, because the
// deck's own `Slide` header already carries the artefact's name on every sheet
// (recorded in `quarterly-deck.tsx`) and two display headings on one sheet is
// the stutter that chrome note exists to avoid.
//
// THE THREE CARDS ARE THE MOCK'S THREE MEASURES AND NONE OF ITS THREE CLAIMS —
// see `buildCover`. A card may carry a `Verdict`, which prints through
// `BlockMovement` and therefore prints a magnitude only where a band was
// cleared; a card whose measure is a refusal sets its value as a WORD and the
// renderer takes it out of the display mono face, because "comparison refused"
// at 38px is a headline about our own bookkeeping.

function StatCard({ stat, mode }: { stat: CoverStat; mode: RenderMode }) {
  const figure = stat.kind === 'figure'
  if (mode === 'email') {
    return (
      <table width="100%" role="presentation" cellPadding={0} cellSpacing={0} border={0} style={{ borderCollapse: 'collapse', borderSpacing: 0, marginTop: 8 }}>
        <tbody>
          <tr>
            <td style={{ border: `1px solid ${EMAIL.border}`, borderRadius: 6, padding: '12px 16px' }}>
              {figure ? (
                <div data-copy="figure" style={{ fontFamily: FONT.mono, fontSize: 28, fontWeight: 500, lineHeight: 1, letterSpacing: '-.02em', color: EMAIL.ink }}>{stat.value}</div>
              ) : (
                <div style={{ fontFamily: FONT.sans, fontSize: 14, fontWeight: 600, color: EMAIL.ink2 }}>{stat.value}</div>
              )}
              {stat.verdict ? <div style={{ marginTop: 6 }}><BlockMovement verdict={stat.verdict} unit="pts" mode={mode} /></div> : null}
              {/* THREE LINES, NOT ONE JOINED STRING. `{label}. {caption}`
                  put a full stop in front of a caption that opens lower case
                  on two of the three cards, and ran two banded differences
                  together on the third. */}
              <div style={{ marginTop: 8, fontFamily: FONT.sans, fontSize: 12, lineHeight: 1.35, color: EMAIL.ink2 }}>{stat.label}</div>
              <div style={{ marginTop: 3, fontFamily: FONT.sans, fontSize: 11.5, lineHeight: 1.35, color: EMAIL.muted }}>{stat.caption}</div>
              {stat.basis ? <div style={{ marginTop: 2, fontFamily: FONT.sans, fontSize: 11.5, lineHeight: 1.35, color: EMAIL.muted }}>{stat.basis}</div> : null}
            </td>
          </tr>
        </tbody>
      </table>
    )
  }
  return (
    <div className="flex min-w-0 flex-col rounded-md border border-border bg-tile px-5 py-4">
      {figure ? (
        <span data-copy="figure" className="font-mono text-[28px] font-medium leading-none tracking-[-0.02em] tabular-nums">{stat.value}</span>
      ) : (
        <span className="text-[15px] font-semibold leading-tight text-secondary-foreground">{stat.value}</span>
      )}
      {stat.verdict ? <span className="mt-1.5"><BlockMovement verdict={stat.verdict} unit="pts" mode={mode} /></span> : null}
      <span className="mt-2 text-[12.5px] leading-[1.35] text-secondary-foreground">{stat.label}</span>
      <span className="mt-1 text-[11.5px] leading-[1.35] text-muted-foreground">{stat.caption}</span>
      {stat.basis ? <span className="mt-0.5 text-[11.5px] leading-[1.35] text-muted-foreground">{stat.basis}</span> : null}
    </div>
  )
}

export const quarterlyCover: Block<QuarterlyData> = {
  key: 'quarterly.cover',
  title: QUARTER_PAGE_TITLE.cover,
  question: QUARTER_PAGE_QUESTION.cover,

  render(data, mode = 'app') {
    const c = data.cover
    if (mode === 'email') {
      return (
        <BlockFrame
          title={`${quarterlyCover.title} · ${quarterLabel(data.quarter)}`}
          question={quarterlyCover.question}
          mode={mode}
          meta={c.stamp}
          // THE MIX, AND NOT THE COUNTS. `c.corpus` is the platform mix alone
          // now; the counts it used to carry are page 2's, beside the argument
          // that rests on them, and were printing verbatim on both sheets.
          footerNote={c.corpus || undefined}
        >
          <div>
            <TokenProse body={c.body} figures={c.figures} mode={mode} />
            {c.stats.map((s) => <StatCard key={s.token} stat={s} mode={mode} />)}
          </div>
        </BlockFrame>
      )
    }
    // THE HERO WAS DESIGNED FOR THE SHEET, AND THE SHEET IS NOT THE ONLY
    // SURFACE. On paper the cover owns its slide inside the artboard's 6%
    // gutter. On the share page the same markup sits inside a card that
    // already has its own `px-6 md:px-8` and under the shell's own 30px
    // `<h1>` — so it drew a second gutter inside a gutter and a SECOND h1,
    // larger than the outer one, on one document. The heading is an `h2`
    // everywhere (the print deck's `Slide` carries the artefact's own h1 too)
    // and the hero's scale and gutter are the print arm's.
    const hero = mode === 'print'
    return (
      <section className={`flex min-h-0 flex-1 flex-col justify-center ${hero ? 'gap-6 px-[6%]' : 'gap-4'}`}>
        <span aria-hidden className="inline-block h-[3px] w-14 flex-none rounded-full bg-primary" />
        <h2 className={`m-0 max-w-[16ch] font-semibold leading-[1.05] tracking-[-0.025em] [text-wrap:balance] ${hero ? 'text-[44px]' : 'text-[26px]'}`}>
          {quarterlyCover.title}
        </h2>
        <p className="m-0 font-mono text-[12.5px] leading-[1.5] text-muted-foreground">
          {quarterLabel(data.quarter)} against {quarterLabel(data.prior, false)} · {data.brand}
          <br />
          {c.stamp}
        </p>
        <div className={`max-w-[66ch] leading-[1.55] ${hero ? 'text-[16px]' : 'text-[14px]'}`}>
          <TokenProse body={c.body} figures={c.figures} mode={mode} />
        </div>
        <div className="grid max-w-[860px] grid-cols-1 gap-4 lg:grid-cols-3">
          {c.stats.map((s) => <StatCard key={s.token} stat={s} mode={mode} />)}
        </div>
        {/* THE MIX THE CORPUS WAS READ ON — the artboard's `qr.p1.footer`,
            and page 1's alone. The counts that used to close this line
            ("4,147 category videos read in Q3 2026 · 3 updates in September")
            printed again, verbatim, as the first line of the card beside the
            argument on the very next sheet. They are page 2's now
            (`ReadPage.meta`); this sheet keeps the mix and its stamp. Nothing
            prints where no mix was recorded: a guessed list is the one thing
            this line may not be. */}
        {c.corpus ? <Note mode={mode}>{c.corpus}</Note> : null}
      </section>
    )
  },

  figures(data) {
    return data.cover.figures
  },

  // THE CARDS' OWN COMPARISONS, DECLARED. Two of the three may carry a
  // `Verdict`, and a block declares what it drew.
  //
  // NOT BECAUSE `confidenceOf` READS THIS LIST — it does not, and the first cut
  // of this comment said it did. `confidenceOf` is called once, in
  // `buildRead` (lib/pages/quarterly.ts), over the list `composeQuarterly`
  // built from `overview.sentence.verdicts` and the quarter's own steps; the
  // cards are drawn FROM that list, so the confidence word already counts
  // them. What this answer reaches is `blockAnswers`, which feeds the digest
  // and the summary composition — and those must not be told a comparison was
  // printed here that was not, nor miss one that was.
  verdicts(data) {
    return data.cover.stats.map((s) => s.verdict).filter((v): v is NonNullable<typeof v> => v != null)
  },

  emptyState() {
    // NEVER EMPTY. A quarter with nothing in it is still a quarter, and the
    // cover's job is to say which one and how much stands behind it.
    return null
  },
}
