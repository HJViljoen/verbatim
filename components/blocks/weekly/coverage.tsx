import Link from 'next/link'
import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockFrame } from '@/components/blocks/frame'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt } from '@/lib/format'
import type { WeeklyData } from '@/lib/pages/weekly'
import { inPeriod } from '@/lib/reports/weekly'

// WR6 · Coverage, in one line (design §3 WR section 6).
//
// THE RECORD, AND THE RULE. The line is `lib/reading/record.ts`'s, composed
// once for the page bar, OV6 and this — so the artefact, the front page and the
// settings record cannot disagree about how sound the month is. The rule that
// keeps the whole report honest is printed here rather than held in a comment,
// because the design asks for it ON the artefact, and the foot of the artefact
// is where a reader who has just read six sections of numbers is standing.
//
// EVERY REFUSAL IS ALREADY IN `lines`. WP11's record block says the comparisons
// this reading refused and why, once, in the record that composes every other
// line — so this block adds nothing to it and re-words nothing of it.
//
// WHAT WAVE 2 ADDED (the artboard's §6):
//
//   · THIS UPDATE'S OWN VIDEOS LEAD THE LINE. The mock opens with "312 videos ·
//     2,960 comments this week" and the record line began with the month, so
//     the one figure a reader of a weekly email wants first was not on the
//     line at all. The comment count is NOT here: no field on this artefact
//     holds one for the window (`CameInBlock.windowComments` is This week's,
//     off M3), and the videos clause says which of the two clocks it is on;
//   · "the record →" MOVES TO THE HEADER, opposite the label, where the mock
//     puts it — `BlockFrame`'s `meta` slot — instead of the block's footer;
//   · THE LINK GRID IS THE DOCUMENT'S, not this block's. The mock draws it
//     inside §6 and immediately above the buttons, which are the document's
//     own; it is a map OF the artefact, so it is composed where the stored
//     arrangement is known (`weeklyLinks`, lib/reports/weekly.ts) and drawn by
//     components/email/weekly.tsx. A link to a section a stored arrangement
//     dropped is a promise about a report that was not sent;
//   · AND THE RULE IS NOT REPEATED AT THE FOOT. See the render.
//
// WHAT WAVE 3 TOOK BACK OUT: EVERYTHING BUT THE LINE.
//
// The header says "Coverage, in one line" and the block printed `c.line` AND
// every sentence of `recordLines` under it — six on the fixture — AND the
// Reddit cap under those: eight blocks of text under a heading that promises
// one. The artboard's §6 is the mono line and the link grid, nothing else, and
// mock-gap §5 names this exactly ("adds four-to-five extra record lines").
//
// NOTHING IS LOST, BECAUSE THE DOOR IS IN THE HEADER. "the record →" sits
// opposite the label and opens the page whose whole job is those sentences —
// every one of them, with the rows and the bases the email had no room for.
// The Reddit cap goes back to `methodLines`' other four, all of which are
// reachable the same way.
//
// AND THE REFUSALS COME ONTO THE LINE, which is where the artboard puts them
// ("· 2 comparisons refused"). A refusal is a real answer and it stays
// printed; the REASONS are behind the link with the rest of the record. The
// count is this artefact's own (`CoverageBlock.refused`), not Overview's.
//
// IT ALSO ENDS TWO THIRDS OF A DUPLICATION. `record.ts` states the platform
// mix inside `line` and again inside `lines` (`lib`-5), and the email footer
// states a third, different and correct one for this update's own videos —
// three sets of percentages for four platforms, ten lines apart, with nothing
// saying why. Two of the three are now gone from this artefact.

export const weeklyCoverage: Block<WeeklyData> = {
  key: 'weekly.coverage',
  title: 'Coverage',

  render(data, mode = 'app', ctx) {
    const c = data.coverage
    const email = mode === 'email'
    // Absolute in every mode: this link is drawn on paper and on a share page
    // as well as in the app (lib/blocks/types.ts, BlockContext.appUrl).
    const href = `${ctx.appUrl}${c.href}`
    const gathered = data.incoming.gathered
    return (
      <BlockFrame
        title={weeklyCoverage.title}
        mode={mode}
        meta={email
          ? <a href={href} style={{ color: EMAIL.link, textDecoration: 'none', fontFamily: FONT.sans, fontSize: 12, fontWeight: 600 }}>the record →</a>
          : <Link href={href} className="text-[12px] font-semibold hover:underline">the record →</Link>}
      >
        <div>
          <div
            style={email ? { fontFamily: FONT.mono, fontSize: 11.5, color: EMAIL.ink2, lineHeight: 1.75 } : undefined}
            className={email ? undefined : 'font-mono text-[11.5px] leading-loose text-secondary-foreground'}
          >
            <span data-copy="figure">{fmtInt(gathered)}</span> {gathered === 1 ? 'video' : 'videos'} found {inPeriod(data.section1.check.noun)} · {c.line}
            {/* THE REFUSALS, ON THE LINE — the artboard's own closing clause.
                Null is not zero: a stored artefact frozen before the field
                existed cannot say the number, and it says nothing rather than
                claiming none were refused. Zero is printed as nothing too, for
                the ordinary reason a "0 comparisons refused" is noise. */}
            {c.refused != null && c.refused > 0
              ? <> · <span data-copy="figure">{fmtInt(c.refused)}</span> {c.refused === 1 ? 'comparison' : 'comparisons'} refused</>
              : null}
          </div>
          {/* THE RULE IS NOT REPRINTED HERE. It was drawn under the masthead
              and again at the foot of this block — the same 26 italic words
              twice in one 640px email, and seven times in the print deck's
              page footers beside it. `lib/reports/weekly.ts` already called it
              the most-printed string in the artefact, and the artboard carries
              it in neither position. DESIGN.md: "Italic is semantic, never
              decorative." It stays where a reader meets their first number —
              the masthead in the email and on the share page, every sheet
              footer on paper — and this block, which is about how sound the
              reading is, says that in the record's own lines. */}
        </div>
      </BlockFrame>
    )
  },

  // NO FIGURES. Every number in the record is already printed by the block that
  // rests on it — the same call WP11 made on OV6, and the reason the budget
  // counts readings rather than digits. The videos count that now leads the
  // line is WR3's `update_videos`, declared there.

  emptyState() {
    // NEVER EMPTY. The record always has something to say, even if what it says
    // is that nothing has been recorded: that IS the coverage.
    return null
  },
}
