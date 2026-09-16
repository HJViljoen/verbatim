import Link from 'next/link'
import type { Block } from '@/lib/blocks/types'
import { BlockFrame } from '@/components/blocks/frame'
import { EMAIL, FONT } from '@/lib/email/theme'
import type { WeeklyData } from '@/lib/pages/weekly'
import { periodNounFor, weeklyRuleFor } from '@/lib/reports/weekly'

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
    return (
      <BlockFrame
        title={weeklyCoverage.title}
        question={weeklyCoverage.question}
        mode={mode}
        footer={email
          ? <a href={href} style={{ color: EMAIL.ink }}>The record →</a>
          : <Link href={href} className="hover:underline">The record →</Link>}
      >
        <div>
          <div
            style={email ? { fontFamily: FONT.mono, fontSize: 11.5, color: EMAIL.ink2, lineHeight: 1.5 } : undefined}
            className={email ? undefined : 'font-mono text-[11.5px] leading-relaxed text-secondary-foreground'}
          >
            {c.line}
          </div>
          {c.lines.map((l, i) => (
            <div
              key={i}
              style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 4 } : undefined}
              className={email ? undefined : 'mt-1 text-[11.5px] text-muted-foreground'}
            >
              {l}
            </div>
          ))}
          <div
            style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 10, fontStyle: 'italic' } : undefined}
            className={email ? undefined : 'mt-2.5 text-[11.5px] italic text-muted-foreground'}
          >
            {weeklyRuleFor(periodNounFor(data.window))}
          </div>
        </div>
      </BlockFrame>
    )
  },

  // NO FIGURES. Every number in the record is already printed by the block that
  // rests on it — the same call WP11 made on OV6, and the reason the budget
  // counts readings rather than digits.

  emptyState() {
    // NEVER EMPTY. The record always has something to say, even if what it says
    // is that nothing has been recorded: that IS the coverage.
    return null
  },
}
