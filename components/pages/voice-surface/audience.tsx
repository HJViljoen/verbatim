import Link from 'next/link'
import type { ReactNode } from 'react'
import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BlockMovement } from '@/components/blocks/movement'
import { fmtInt, fmtPct, fullDate, monthName } from '@/lib/format'
import { EMAIL, FONT } from '@/lib/email/theme'
import type { FigureTable, Verdict } from '@/lib/reading/verdicts'
import type { AudienceOption, VoiceSurfaceData } from '@/lib/pages/voice-surface'
import { audienceFigures, audiencePillLabel } from '@/lib/pages/voice-surface'

// VO1 · Audience and kind (design §3 VO1; ported to the artboard, Block D
// wave 2).
//
// THE PAGE'S SCOPE, PRINTED AS ITS OWN BLOCK. Everything under this one obeys
// the audience, the kind and the platform chosen here, so the choice is a
// reading rather than a control: each option carries the count it would leave,
// and an audience too thin to read is shown WITH its count and marked, never
// hidden. Both tenants' own brands carry that mark today — Össur reads 19
// videos in September and Sealand 3 — and a switch that hid them would hide
// the most important fact about them.
//
// THE AUDIENCE IS A FILTER; THE PLATFORM AND THE KIND ARE NOT. The audience
// switch is a link because the selection lives in the URL, where it can be
// shared, opened in a second tab and frozen into an export's params (the
// horizon control's own rule, WP9). The platform pills were links too, and
// they narrowed `audience.videos` and nothing else — Sealand ?platform=tiktok
// printed "146 videos · 9,397 comments" above rows reading "48 of 437" — and
// the kind pills narrowed the ladder to the row a reader had just clicked. The
// same rule that makes the audience a link deletes those two: this product
// does not print controls that do not work. The platform mix is printed as
// what it is, a reading of the month.
//
// AND THAT RULE IS WHY THERE IS NO "All" PILL. The mock opens the switch with
// one. There is no such audience: `month_denominators` and
// `month_theme_readings` are keyed by `client` · `competitor:<name>` ·
// `industry-other`, and an "All" would have to be a SUM of those rows — which
// is the one arithmetic AGENTS.md names ("denominators do not add"). Every
// figure below this bar would then be a share of a population no row holds.
// The pill would select nothing readable, which is exactly the control this
// block deleted two paragraphs ago.
//
// THE ARTBOARD'S SHAPE, ROW BY ROW. The mock draws this as a filter bar: a
// 104px eyebrow column on the left, the pills in the middle, and the row's own
// basis in mono at the right-hand end, with a hairline between rows. That is
// what `Row` below is, and the right-hand note is the thing the build had
// nowhere to put — each of these rows is a share of a different denominator,
// and until now the block stated one of them, once, in the header.
//
// THIN IS MARKED BY WEIGHT, NOT BY A SENTENCE (the mock, and the density
// argument in mock-gap §7). "Cotopaxi 27 · too thin to compare" beside three
// other pills is a paragraph inside a control. The pill goes quiet instead —
// the muted ink and lighter hairline the mock gives Poler — and the words stay
// where a reader needs them: on the pill's own `title`, and in the ROW'S NOTE
// whenever the thin audience is the one being read, which is the only time the
// fact changes what the page below may say.

/** One pill in the audience switch. The count is on the pill, not in a
 *  tooltip: an audience is chosen by how much of the month it holds. */
function AudiencePill({ option, mode }: { option: AudienceOption; mode: RenderMode }) {
  const label = audiencePillLabel(option.audience, option.label)
  const quiet = !option.observed || option.thin
  const count = option.observed
    ? <span data-copy="figure" className={mode === 'email' ? undefined : 'font-mono text-[11px] tabular-nums text-muted-foreground'}>{fmtInt(option.videos ?? 0)}</span>
    : <span className={mode === 'email' ? undefined : 'font-mono text-[10px] text-muted-foreground'}>not observed</span>
  // D14: a "since" date on this pill would be a start date, and the product
  // holds no such thing. What it holds is the day the rival left the tracked
  // set, which is what the pill says instead.
  // IN THE PAGE'S OWN DATE FORMAT. This printed `retiredAt.slice(0, 10)` —
  // "tracked to 2026-09-09" — on a page that says "Sep 2026", "14 Sep" and
  // "first heard July 2026" everywhere else, and whose own theme block carries
  // a comment condemning exactly that pattern. The year is kept: a retired
  // rival's last day can be years before the month being read.
  const retired = option.retiredAt ? (
    <span className={mode === 'email' ? undefined : 'font-mono text-[10px] text-muted-foreground'} style={mode === 'email' ? { color: EMAIL.muted } : undefined}>
      tracked to {fullDate(option.retiredAt)}
    </span>
  ) : null

  if (mode === 'email') {
    return (
      <span style={{ fontFamily: FONT.sans, fontSize: 12, color: option.selected ? EMAIL.ink : EMAIL.muted, marginRight: 10 }}>
        {option.label} {count}
        {option.thin && option.observed ? <span style={{ color: EMAIL.muted }}> · too thin to compare</span> : null}
        {retired ? <> · {retired}</> : null}
      </span>
    )
  }
  return (
    <Link
      href={option.href}
      aria-current={option.selected ? 'true' : undefined}
      title={option.thin && option.observed ? 'too thin to compare' : undefined}
      className={`inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[12px] ring-1 transition-colors ${
        option.selected
          ? 'bg-inner font-medium text-foreground ring-border'
          : quiet
            ? 'font-normal text-muted-foreground ring-border/50 hover:ring-border'
            : 'font-medium text-secondary-foreground ring-border hover:bg-inner'
      }`}
    >
      {/* TWO STATES, NOT A RUN-ON. "Poler not observed tracked to 9 Sep 2026"
          reads as one clause and is two facts: nothing was read for this rival
          this month, and it left the tracked set on that day. */}
      {label} {count}
      {/* THIN, IN WORDS, FOR EVERY READER. The mark is the pill's WEIGHT (the
          mock's density argument) and the words were on `title` alone, which
          reaches neither a keyboard nor a touch screen — so for a thin
          audience nobody has selected, the one fact that decides what the page
          below may claim was mouse-only. `sr-only` keeps the mock's density
          and gives the words back. */}
      {option.thin && option.observed ? <span className="sr-only"> · too thin to compare</span> : null}
      {retired ? <> · {retired}</> : null}
    </Link>
  )
}

/** One row of the filter bar: its label, its content, and the basis of the
 *  figures in it. The note is `flex-none` at the right-hand end, exactly as the
 *  artboard has it, because it is metadata and the eye should skip it until it
 *  wants it. */
function Row({ label, note, mode, children }: { label: string; note?: ReactNode; mode: RenderMode; children: ReactNode }) {
  if (mode === 'email') {
    return (
      <div style={{ paddingTop: 6 }}>
        <div style={{ fontFamily: FONT.sans, fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.6px', color: EMAIL.muted }}>{label}</div>
        <div style={{ marginTop: 2 }}>{children}</div>
        {note ? <div style={{ fontFamily: FONT.mono, fontSize: 11, color: EMAIL.muted, marginTop: 2 }}>{note}</div> : null}
      </div>
    )
  }
  return (
    <div className="flex min-w-0 flex-col gap-1.5 border-t border-border/70 pt-2 first:border-0 first:pt-0 xl:flex-row xl:items-center xl:gap-3">
      {/* A HEADING, NOT A STYLED SPAN — the filter bar's four rows are four
          sections of the block and were unreachable to heading navigation. */}
      {/* THE 104px COLUMN IS PART OF THE ROW, so it goes when the row does.
          `w-[104px] flex-none` was unconditional under a parent that only
          becomes a row at `xl:`; below 1280 the heading was a 104px box in a
          stacked column and three of the four labels wrapped mid-phrase
          ("WHERE IT WAS / SAID"), four wasted lines on the block the page
          opens with. No overflow, so nothing checking for one caught it. */}
      <h3 className="m-0 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground xl:w-[104px] xl:flex-none">{label}</h3>
      <div className="min-w-0 flex-1">{children}</div>
      {note ? <span className="flex-none whitespace-nowrap font-mono text-[11px] tabular-nums text-muted-foreground">{note}</span> : null}
    </div>
  )
}

export const voiceAudience: Block<VoiceSurfaceData> = {
  key: 'voice.audience',
  title: 'Whose audience, and what kind of thing',
  question: 'Whose conversation is this, and what are they doing in it?',

  render(data, mode = 'app', ctx) {
    const a = data.audience
    const email = mode === 'email'
    const href = `${ctx.appUrl}/dashboard/competitive`
    // The mock's own words. NOT "1,388 the category videos": the audience's
    // prose label is a noun phrase with its own article, and inlining it into
    // a count makes one. "in this audience" says the same thing and says it
    // the way the artboard does — the audience's NAME is on the selected pill
    // two inches to the left.
    const of = a.videos != null ? `${fmtInt(a.videos)} videos in this audience · ${monthName(data.month)}` : null

    const kinds = a.kinds.length > 0 ? (
      <div className={email ? undefined : 'flex flex-wrap items-center gap-x-4 gap-y-1'}>
        {a.kinds.map((k) => (
          // NOT A PILL, BECAUSE IT IS NOT A CONTROL. These wore the audience
          // pills' exact chrome — same height, radius, ring token, size and
          // weight, in the same bar — and did nothing: a keyboard user tabbing
          // the bar found the top row focusable and the next row silently not.
          // The kind FILTER was deleted two paragraphs up on the rule that this
          // product does not print controls that do not work; the same rule
          // takes the appearance of one. So a kind reads as what it is, a
          // reading of the month — the label with its share and count beside
          // it, spaced like the platform mix on the row above rather than
          // boxed.
          <span
            key={k.kind}
            className={email ? undefined : 'inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] text-secondary-foreground'}
            style={email ? { fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, marginRight: 10 } : undefined}
          >
            {k.label}{' '}
            {/* THE "of N" TRAVELS WITH THE SHARE, INSIDE THE PILL. The mock
                prints "questions 34%" and D4 / D10 refuse it: a kind is an
                independent share of ONE denominator — the ten of them sum to
                175% on Össur and 228% on Sealand — so a bare 34% beside five
                others reads as a partition it is not. The row's note names the
                denominator once; the pill names the count it rests on. */}
            <span data-copy="figure" className={email ? undefined : 'font-mono text-[11px] font-normal tabular-nums text-muted-foreground'}>
              {k.pct == null ? '—' : fmtPct(k.pct)} {fmtInt(k.videos)} of {fmtInt(k.denominator)}
            </span>
            <BlockMovement verdict={a.kindVerdicts[k.kind] ?? null} unit="pts" mode={mode} />
          </span>
        ))}
      </div>
    ) : (
      <BlockEmpty mode={mode}>{a.kindsNote ?? 'No kind carried a reading this month.'}</BlockEmpty>
    )

    return (
      <BlockFrame
        title={voiceAudience.title}
        // NO QUESTION LINE ON THE FILTER BAR (mock-gap §7, and the same call
        // VO3 makes). The artboard's bar has neither a heading nor a question;
        // it is the page's scope, drawn as four dense rows. The question is
        // still the block's contract and is still declared on the object — the
        // print and email spines and the block catalogue read it — but on the
        // screen it is a 12.5px line pushing the rows the block exists for
        // further down a bar the artboard draws in 105px.
        mode={mode}
        meta={a.videos != null ? `${fmtInt(a.videos)} videos · ${fmtInt(a.comments ?? 0)} comments` : undefined}
        footer={email
          ? <a href={href} style={{ color: EMAIL.ink }}>Open Competitive →</a>
          : <Link href={href} className="hover:underline">Compare the audiences on Competitive →</Link>}
      >
        <div className={email ? undefined : 'flex flex-col gap-2'}>
          <Row
            label="Audience"
            mode={mode}
            // The thin mark, in words, exactly where it changes what the page
            // may claim: on the audience being READ. The pills mark it by
            // weight; this says what the weight means.
            note={of ? <>{of}{a.thin ? ' · too thin to compare' : ''}</> : undefined}
          >
            <div className={email ? undefined : 'flex flex-wrap items-center gap-1.5'}>
              {a.options.map((o) => <AudiencePill key={o.audience} option={o} mode={mode} />)}
            </div>
          </Row>

          {/* NO NOTE ON THIS ROW, AND NONE ON THE NEXT. The right-hand basis
              is here because each row is a share of a DIFFERENT denominator —
              and these two are not. The platform mix divides the same
              population the row above names ("1,388 videos in this audience ·
              Sep 2026", printed identically), and every kind pill carries its
              own "of N" inside it, which is what D4 / D10 require of a kind
              share. Printing the same string three times down one bar is how a
              reader learns to stop reading the column. */}
          {a.platformMix.length > 0 ? (
            <Row label="Where it was said" mode={mode}>
              {/* A PLATFORM THE MONTH DID NOT CARRY IS ABSENT, not a 0% row.
                  Össur's own brand read no Reddit thread at all in September,
                  and "Reddit 0" would be a reading of a platform nobody
                  posted on. */}
              <div className={email ? undefined : 'flex flex-wrap items-center gap-x-4 gap-y-1'}>
                {a.platformMix.map((p) => (
                  <span key={p.platform} className={email ? undefined : 'text-[12px]'} style={email ? { fontFamily: FONT.sans, fontSize: 12, color: EMAIL.ink, marginRight: 10 } : undefined}>
                    {p.label}{' '}
                    <span data-copy="figure" className={email ? undefined : 'font-mono tabular-nums text-muted-foreground'}>
                      {p.pct == null ? '—' : fmtPct(p.pct)} {fmtInt(p.videos)}
                    </span>
                  </span>
                ))}
              </div>
            </Row>
          ) : null}

          <Row label="Kind of thing said" mode={mode}>
            {kinds}
            {a.reddit && a.reddit.pct != null ? (
              <p className={email ? undefined : 'm-0 mt-1.5 text-[11.5px] text-muted-foreground'} style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted } : undefined}>
                Reddit carried <span data-copy="figure">{fmtInt(a.reddit.reddit)} of {fmtInt(a.reddit.videos)}</span> of the question-and-objection videos
                {a.reddit.exact ? '' : ' (a video carrying both is counted in each)'}.
              </p>
            ) : null}
          </Row>

          <Row label="Argued, not just said" mode={mode}>
            {a.replies ? (
              <p className={email ? undefined : 'm-0 text-[12.5px]'} style={email ? { fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink } : undefined}>
                <span data-copy="figure">{a.replies.pct == null ? '—' : fmtPct(a.replies.pct)}</span> of this month’s comments were replies to another comment —{' '}
                {/* THE TRAILING CLAUSE IS SUPPRESSED WHEN IT REPEATS THE NUMBER BEFORE
                    IT. Rendered on production: "7.1% ... - 835 of 11,712, 835
                    of them on Reddit." A reader who does not compare the two
                    digits reads two populations, and the note under this line
                    already says every reply we can see is a Reddit reply. */}
                <span data-copy="figure">{fmtInt(a.replies.replies)} of {fmtInt(a.replies.comments)}</span>{a.replies.reddit != null && a.replies.reddit !== a.replies.replies ? (
                  <>, <span data-copy="figure">{fmtInt(a.replies.reddit)}</span> of them on Reddit</>
                ) : null}.
              </p>
            ) : (
              <BlockEmpty mode={mode}>{a.repliesNote ?? 'How much of this month was argued is not readable here.'}</BlockEmpty>
            )}
            {a.replies && a.repliesNote ? (
              <p className={email ? undefined : 'm-0 mt-1 text-[11px] text-muted-foreground'} style={email ? { fontFamily: FONT.sans, fontSize: 11, color: EMAIL.muted } : undefined}>
                {a.repliesNote}
              </p>
            ) : null}
          </Row>
        </div>
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    return audienceFigures(data.audience)
  },

  verdicts(data): Verdict[] {
    return Object.values(data.audience.kindVerdicts).filter((v): v is Verdict => v != null)
  },

  emptyState(data) {
    const a = data.audience
    if (a.videos == null && a.kinds.length === 0 && !a.replies) {
      return 'Nothing has been read into this month for any audience yet.'
    }
    return null
  },
}
