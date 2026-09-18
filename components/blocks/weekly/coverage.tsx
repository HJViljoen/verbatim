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
//   · THE REDDIT CAP, from `methodLines` — the one of its five lines no
//     reading surface has ever printed, and the one a reader counting Reddit
//     posts most needs. The other four are already on this artefact: coverage
//     and the read-depth basis inside the record's own lines, prepared-by and
//     the privacy sentence in the footer;
//   · AND THE RULE IS NOT REPEATED AT THE FOOT. See the render.

function Sentence({ mode, children }: { mode: RenderMode; children: React.ReactNode }) {
  return mode === 'email'
    ? <div style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 4 }}>{children}</div>
    : <p className="m-0 mt-1 text-[11.5px] text-muted-foreground">{children}</p>
}

export const weeklyCoverage: Block<WeeklyData> = {
  key: 'weekly.coverage',
  title: 'Coverage',
  question: 'How sound is this reading?',

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
        question={weeklyCoverage.question}
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
            <span data-copy="figure">{fmtInt(gathered)}</span> {gathered === 1 ? 'video' : 'videos'} gathered {inPeriod(data.section1.check.noun)} · {c.line}
          </div>
          {c.lines.map((l, i) => <Sentence key={i} mode={mode}>{l}</Sentence>)}
          {data.method ? <Sentence mode={mode}>{data.method.redditCap}</Sentence> : null}
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
