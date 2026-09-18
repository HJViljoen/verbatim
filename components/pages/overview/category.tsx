import type { ReactNode } from 'react'
import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockCalendar } from '@/components/blocks/calendar'
import { openLink } from '@/components/blocks/open-link'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BlockMovement } from '@/components/blocks/movement'
import { BlockProportion } from '@/components/blocks/bars'
import type { CalendarRule, CalendarSeries } from '@/lib/charts/calendar'
import { fmtInt, fmtPct, monthName } from '@/lib/format'
import { EMAIL, FONT } from '@/lib/email/theme'
import { PANEL_EXCLUDES_NOTE } from '@/lib/reading/attention'
import type { FigureTable, Verdict } from '@/lib/reading/verdicts'
import type { CategoryBlock, Mover, OverviewData } from '@/lib/pages/overview'
import { DirectionWord } from './subjects'

// OV3 · What the category is saying (design §3 OV3). Four lines: what kind of
// thing is being said, what grew and what faded, the mood, and the attention
// under a fixed panel.
//
// EVERY ONE OF THE FOUR CAN BE ABSENT, AND SAYS SO IN ITS OWN WORDS. Three of
// them read `month_kind_readings` / `month_audience_stats`, which land with M5;
// the movers read the theme months, which are seeded. A line with no reading
// prints the sentence naming what is not recorded, never a zero — "nobody asked
// a question this month" and "we have no reading of questions this month" are
// different sentences (lib/reading/kinds.ts).

const MOOD_COLOR: Record<string, string> = {
  positive: 'var(--positive)',
  mixed: 'var(--mixed)',
  neutral: 'var(--neutral-seg)',
  negative: 'var(--negative)',
}

/** One line of the block, with its own heading — so a line that is absent is
 *  visibly absent rather than silently missing. */
function Line({ label, mode, children }: { label: string; mode: RenderMode; children: ReactNode }) {
  if (mode === 'email') {
    return (
      <div style={{ paddingTop: 6 }}>
        <div style={{ fontFamily: FONT.sans, fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.6px', color: EMAIL.muted }}>{label}</div>
        <div style={{ marginTop: 2 }}>{children}</div>
      </div>
    )
  }
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

/** "Sep 2026 against Aug 2026", from the verdict of a row that is printed. */
function moversBasis(c: OverviewData['category']): string | null {
  for (const m of [...c.growing, ...c.fading]) {
    const v = m.verdict
    if (v?.window?.from && v.basis?.from) return `${monthName(v.window.from)} against ${monthName(v.basis.from)}`
  }
  return null
}

function MoverRow({ mover, mode }: { mover: Mover; mode: RenderMode }) {
  const body = (
    <>
      {/* THE THEME'S OWN NAME, so `subject` and not bare markup: PROSE_POLICY
          marks `pass_b_theme` 'none' (lib/prose/scrub.ts), so a theme's label
          is never direction-scrubbed at write time and the product's own
          register carries "Concerns about declining quality" and "Technology
          should improve access". Rule (c) sweeps unmarked markup, so an
          unmarked label fails the contract on whichever theme happens to rank
          — the word is about the thing, not about a reading of it. */}
      <span data-copy="subject" data-slot="pass_b_theme" className={mode === 'email' ? undefined : 'min-w-0 flex-1 truncate'}>{mover.label}</span>
      <span data-copy="figure" className={mode === 'email' ? undefined : 'font-mono tabular-nums'}>
        {mover.pct == null ? '—' : fmtPct(mover.pct)} {fmtInt(mover.k)} of {fmtInt(mover.n)}
      </span>
      <BlockMovement verdict={mover.verdict} unit="pts" mode={mode} />
      <DirectionWord direction={mover.direction} mode={mode} />
      {mover.isNew ? (
        // "New" is a FLAG on a row, not a direction claim, and it is stated
        // only where the row's own months support it (design §3 VO2).
        <span data-copy="verdict" className={mode === 'email' ? undefined : 'text-[11px] text-muted-foreground'}>first heard this month</span>
      ) : null}
    </>
  )
  return mode === 'email'
    ? <div style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, padding: '2px 0' }}>{body}</div>
    : <div className="flex items-center gap-2 text-[12.5px]">{body}</div>
}

/** The attention line's chart: panel comments by month. Not a share — the panel
 *  is a fixed set of accounts and the figure is the comment count under their
 *  videos, so there is no denominator and the floor is turned off. */
function attentionSeries(c: CategoryBlock, month: string): CalendarSeries | null {
  if (!c.attention || c.attention.months.length === 0) return null
  return {
    label: c.label,
    color: 'var(--cat)',
    excludes: PANEL_EXCLUDES_NOTE,
    points: c.attention.months.map((m) => ({
      month: m.month,
      value: m.comments,
      state: m.month === month ? ('filling' as const) : ('read' as const),
      k: null,
      n: null,
    })),
  }
}

/**
 * The axis rule at the panel's re-freeze.
 *
 * THE MOCK'S "−18% since June" IS THE CLAIM THIS REPLACES. June and September
 * were read over two different sets of accounts — the panel re-froze on
 * 3 September — so a percentage across that line compares two populations and
 * calls it a change in attention. The rule DRAWS the break instead: the reader
 * sees where the basis moved and can weigh the two stretches themselves, which
 * is the same answer decision U gives for a tracking change.
 *
 * Drawn only where the freeze falls inside the drawn axis and something is
 * drawn before it. A rule on the first month of the axis marks a break with
 * nothing on the other side of it.
 */
export function panelRule(c: CategoryBlock): CalendarRule[] {
  const at = c.attention?.panel?.frozen_at
  if (!at || !c.attention) return []
  const month = `${at.slice(0, 7)}-01`
  const i = c.attention.axis.indexOf(month)
  if (i <= 0) return []
  return [{ month, kind: 'clustering_changed', label: 'panel re-frozen', at: at.slice(0, 10) }]
}

export const overviewCategory: Block<OverviewData> = {
  key: 'overview.category',
  title: 'What the category is saying',
  question: 'What is this category talking about, and how does it feel about it?',

  render(data, mode = 'app', ctx) {
    const c = data.category
    const email = mode === 'email'
    const href = `${ctx.appUrl}/dashboard/voice`
    const series = attentionSeries(c, data.month)

    const kinds = c.kinds.length > 0 ? (
      <>
        <div className={email ? undefined : 'flex flex-wrap items-center gap-x-5 gap-y-1.5'}>
          {c.kinds.map((k) => (
            <span key={k.kind} className={email ? undefined : 'flex items-center gap-1.5 text-[12.5px]'} style={email ? { fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, marginRight: 10 } : undefined}>
              {k.label}{' '}
              <span data-copy="figure" className={email ? undefined : 'font-mono tabular-nums'}>
                {k.pct == null ? '—' : fmtPct(k.pct)} {fmtInt(k.videos)} of {fmtInt(k.denominator)}
              </span>
              <BlockMovement verdict={c.kindVerdicts[k.kind] ?? null} unit="pts" mode={mode} />
            </span>
          ))}
        </div>
        {c.reddit && c.reddit.pct != null ? (
          <p className={email ? undefined : 'm-0 text-[11.5px] text-muted-foreground'} style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted } : undefined}>
            Reddit carried <span data-copy="figure">{fmtInt(c.reddit.reddit)} of {fmtInt(c.reddit.videos)}</span> of the question-and-objection videos
            {c.reddit.exact ? '' : ' (a video carrying both is counted in each)'}.
          </p>
        ) : null}
      </>
    ) : (
      <BlockEmpty mode={mode}>{c.kindsNote ?? 'No kind carried a reading this month.'}</BlockEmpty>
    )

    const movers = c.growing.length > 0 || c.fading.length > 0 ? (
      <div className={email ? undefined : 'flex flex-col gap-1'}>
        {c.growing.map((m) => <MoverRow key={m.id} mover={m} mode={mode} />)}
        {c.fading.map((m) => <MoverRow key={m.id} mover={m} mode={mode} />)}
      </div>
    ) : (
      <BlockEmpty mode={mode}>{c.moversNote ?? 'Nothing moved clearly this month.'}</BlockEmpty>
    )

    const mood = c.mood ? (
      <>
        <BlockProportion
          mode={mode}
          of="videos"
          segments={c.mood.shares
            .filter((s) => s.pct != null)
            .map((s) => ({ label: s.label, count: s.videos, pct: s.pct as number, color: MOOD_COLOR[s.mood] ?? 'var(--neutral-seg)' }))}
        />
        <p className={email ? undefined : 'm-0 flex flex-wrap items-center gap-2 text-[11.5px] text-muted-foreground'} style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 4 } : undefined}>
          <span data-copy="figure">of {fmtInt(c.mood.judged)} judged</span>
          <BlockMovement verdict={c.mood.verdict} unit="pts" mode={mode} />
          {c.mood.framingPct != null ? (
            <span>
              <span data-copy="figure">{fmtPct(c.mood.framingPct)}</span> of what was judged at all was judged on the video’s own framing instead
            </span>
          ) : null}
        </p>
      </>
    ) : (
      <BlockEmpty mode={mode}>{c.moodNote ?? 'Nothing in this month has been judged yet.'}</BlockEmpty>
    )

    // GONE QUIET IS A FLAG, NOT A DIRECTION. One of the two READER_FLAGS
    // (lib/calibration.ts), off the register's own dormancy rule — so it
    // carries no verdict, no change and no word for which way anything went.
    // "Last heard" is a month, which is a fact about the record.
    const quiet = c.quiet.length > 0 ? (
      <div className={email ? undefined : 'flex flex-col gap-1'}>
        {c.quiet.map((q) => (
          <div key={q.id} className={email ? undefined : 'flex items-center gap-2 text-[12.5px]'} style={email ? { fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, padding: '2px 0' } : undefined}>
            <span data-copy="subject" data-slot="pass_b_theme" className={email ? undefined : 'min-w-0 flex-1 truncate'}>{q.label}</span>
            <span data-copy="verdict" className={email ? undefined : 'text-[11px] text-muted-foreground'}>
              gone quiet{q.lastHeard ? ` · last heard ${monthName(q.lastHeard)}` : ''}
            </span>
          </div>
        ))}
      </div>
    ) : (
      <BlockEmpty mode={mode}>{c.quietNote ?? 'Nothing this page has drawn has stopped being said.'}</BlockEmpty>
    )

    const attention = series ? (
      <>
        <BlockCalendar
          rules={panelRule(c)}
          blockKey={overviewCategory.key}
          // THE ATTENTION LINE KEEPS ITS OWN AXIS, generated as a calendar
          // (lib/pages/overview.ts): the panel is read month by month whatever
          // horizon the page is on, and drawing it on a one-month axis would
          // leave a single dot where the question is whether attention is
          // going anywhere. The months it carries a READING in are not that
          // axis — the chart positions by index, so a June reading and a
          // September one drawn on two adjacent slots close the gap and
          // misdate every point after it.
          axis={c.attention?.axis ?? data.axis}
          series={[series]}
          mode={mode}
          ctx={ctx}
          format={(v) => fmtInt(v)}
          label={`${c.label}, comments under a fixed panel’s videos, by month`}
          caption={c.attention?.panel ? `a fixed panel, frozen ${c.attention.panel.frozen_at.slice(0, 10)}` : undefined}
        />
        {/* THE PANEL'S SIZE AND THE BANDED STEP, which are the two things the
            line has never said. A comment count is a number about a SET, and a
            set with no size is not a measurement — `AttentionPanel
            .account_count` has been built since the panel shipped and drawn
            nowhere. The step beside it is the verdict `verdicts()` has
            declared since WP11 and the loader hard-coded null; where the two
            months sit either side of the re-freeze it prints the refusal, which
            is the honest form of the mock's "−18% since June". */}
        <p className={email ? undefined : 'm-0 flex flex-wrap items-center gap-2 text-[11.5px] text-muted-foreground'} style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 4 } : undefined}>
          {c.attention?.accountCount != null ? (
            <span><span data-copy="figure">{fmtInt(c.attention.accountCount)}</span> accounts in the panel</span>
          ) : null}
          <BlockMovement verdict={c.attention?.verdict ?? null} unit="pts" mode={mode} />
        </p>
      </>
    ) : (
      <BlockEmpty mode={mode}>{c.attentionNote ?? 'Attention is not read for this workspace yet.'}</BlockEmpty>
    )

    return (
      <BlockFrame
        title={overviewCategory.title}
        question={overviewCategory.question}
        mode={mode}
        meta={c.denominator != null ? `${fmtInt(c.denominator)} category videos this month` : undefined}
        footer={openLink(mode, href, 'Open Voice →')}
      >
        <div className={email ? undefined : 'flex flex-col gap-3'}>
          <Line label="Kind of thing said" mode={mode}>{kinds}</Line>
          {/* NOT "Growing / fading", which the mock prints as two headings.
              Both are direction words, and a heading is not a verdict: rule (c)
              of the copy contract refuses them outside a node that carries a
              band, and it is right to — a heading that says "growing" makes the
              claim before any row has earned it. The rows say it, each inside
              its own verdict node, where the reading is. */}
          {/* AND WHAT IT MOVED AGAINST. Voice states its basis in the block
              meta ("Sep 2026 against Aug 2026") and This week's §3 prints its
              own; OV3 printed "▲ 5.3 pts" with nothing saying what the two
              sides were, so a reader who opens Overview and This week in one
              session sees one theme move by two different amounts with only
              one page saying why. Taken off a printed row's own verdict, so
              the heading can never describe a comparison the block did not
              draw. */}
          <Line label={`What moved most${moversBasis(c) ? ` · ${moversBasis(c)}` : ''}`} mode={mode}>{movers}</Line>
          <Line label="Mood" mode={mode}>{mood}</Line>
          <Line label="Attention" mode={mode}>{attention}</Line>
          {/* "No longer being said", not "Gone quiet" — VO2's and the
              monthly movers' own heading, for the reason they both give: the
              FLAG is a direction word and rule (c) lets it appear only inside
              a verdict node, which is right, because it is earned by the
              register's own dormancy rule. A heading has no reading behind
              it, so it carries no direction word at all. */}
          <Line label="No longer being said" mode={mode}>{quiet}</Line>
        </div>
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    const c = data.category
    const out: FigureTable = {}
    if (c.denominator != null) {
      out.category_videos = { value: c.denominator, unit: 'videos', label: 'videos read for the category this month' }
    }
    for (const k of c.kinds) {
      if (k.pct == null) continue
      out[`kind_${k.kind}_share`] = { value: k.pct, unit: 'pct', label: `${k.label.toLowerCase()}, share of the month` }
    }
    if (c.mood) {
      const negative = c.mood.shares.find((s) => s.mood === 'negative')
      if (negative?.pct != null) out.mood_negative_share = { value: negative.pct, unit: 'pct', label: 'the negative share of what was judged' }
    }
    if (c.attention && c.attention.months.length > 0) {
      const last = c.attention.months[c.attention.months.length - 1]
      out.attention_comments = { value: last.comments, unit: 'comments', label: 'comments under the panel’s videos this month' }
      out.attention_videos = { value: last.videos, unit: 'videos', label: 'videos the panel posted this month' }
    }
    // THE PANEL'S SIZE IS NOT PUBLISHED AS A FIGURE, and that is deliberate.
    // It is a count of ACCOUNTS, and `FigureTable.unit` has four values, none
    // of which is that (lib/reading/verdicts.ts). `sent-figures.ts` derives the
    // permanent record's `measure` straight off the unit — anything that is not
    // 'comments' is filed as 'videos' — and `sent_figures` has no UPDATE grant,
    // so the moment this block joins an artefact's set, "214 videos" would be
    // written down forever. The unit cannot simply be widened either: the
    // column carries `check (measure in ('videos','comments'))`
    // (20260918098000_sent_figures.sql), so a fifth unit is a migration, not an
    // edit. The panel's size is RENDERED — it is the denominator the comment
    // count needs and the reader sees it beside the line — and prose that wants
    // to name it can take it from the verdict's own `n`, which carries its
    // population in words.
    //
    // The banded step, where one was drawn. `verdicts()` already declares the
    // verdict itself; this is the magnitude a sentence may substitute, and it
    // exists only where the comparison MOVED — `no_clear_change` answers too,
    // and it answers with no magnitude to publish.
    if (c.attention?.verdict?.state === 'moved' && c.attention.verdict.changePts != null) {
      out.attention_change = { value: c.attention.verdict.changePts, unit: 'pts', label: 'the panel’s share of attention, against the month before' }
      if (c.attention.verdict.bandPts != null) {
        out.attention_band = { value: c.attention.verdict.bandPts, unit: 'pts', label: 'the band that step cleared' }
      }
    }
    return out
  },

  verdicts(data): Verdict[] {
    const c = data.category
    return [
      ...Object.values(c.kindVerdicts).filter((v): v is Verdict => v != null),
      ...c.growing.map((m) => m.verdict),
      ...c.fading.map((m) => m.verdict),
      ...(c.mood?.verdict ? [c.mood.verdict] : []),
      ...(c.attention?.verdict ? [c.attention.verdict] : []),
    ]
  },

  emptyState(data) {
    const c = data.category
    const nothing = c.kinds.length === 0 && c.growing.length === 0 && c.fading.length === 0 && !c.mood && !c.attention
    return nothing ? 'Nothing about this category has been read into this month yet.' : null
  },
}
