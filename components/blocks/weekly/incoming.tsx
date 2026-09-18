import type { ReactNode } from 'react'
import Link from 'next/link'
import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BlockQuote } from '@/components/blocks/quote'
import { EMAIL, FONT } from '@/lib/email/theme'
import { text } from '@/components/email/primitives'
import { fmtInt, platformLabel, shortDate } from '@/lib/format'
import type { FigureTable } from '@/lib/reading/verdicts'
import type { WeeklyData } from '@/lib/pages/weekly'
import { weeklyPeriod } from '@/lib/reports/weekly'

// WR3 · What came in this week (design §3 WR section 3).
//
// EVERY COUNT HERE IS A COUNT OF OUR COVERAGE, NOT OF THE CONVERSATION, and it
// is stated beside the month so a reader cannot take it for one. That is the
// one shape in which a weekly count is allowed on this artefact.
//
// THE TWO COUNTS ARE DIFFERENT UNITS AND THE LINE SAYS SO. An update gathers by
// when we LOOKED; a month counts by when people WROTE. On Össur today that is
// 618 gathered beside a month of 449, and neither number is inside the other —
// which is why the clause reads "the month so far holds N videos, dated by when
// people wrote" rather than "into N this month".
//
// NO SHARE IS DRAWN OVER IT. There is no percentage in this block and there
// cannot be: a share over one update's ~117 videos clears no floor the product
// has, and drawing one would be the run-indexed reading in a new costume.

/**
 * The artboard's stat row: a mono 21/600 number in a 74px column, a 14px label
 * beside it, a mono sub-line under, and a hairline between rows
 * (`weekly.s3.counts`).
 *
 * THE EMAIL HAD NO BIG-NUMBER TIER AT ALL. `components/email/primitives.tsx`
 * `text.figure` (mono 22/600) has been defined since Stage 3 and no element of
 * this artefact used it, so §3's four counts collapsed into one 12.5px clause
 * and a reader looking for "how much came in" read a sentence.
 *
 * NO "of N" ON THESE, AND THAT IS THE STATEMENT. Every number here is a count
 * of OUR COVERAGE, not a share of anything — an update gathered what it
 * gathered — so there is no denominator being hidden (`FigureCell`'s own rule
 * for an omitted `of`). What each count contributes TO is the sub-line's job,
 * and the first row states it: the month these videos fall into.
 */
function StatRow({
  value, label, note, last = false, mode,
}: {
  value: string
  label: string
  note?: ReactNode
  last?: boolean
  mode: RenderMode
}) {
  if (mode === 'email') {
    return (
      <table width="100%" role="presentation" cellPadding={0} cellSpacing={0} border={0} style={{ borderCollapse: 'collapse', borderSpacing: 0, borderBottom: last ? undefined : `1px solid ${EMAIL.hairline}` }}>
        <tbody>
          <tr>
            <td width={74} style={{ width: 74, padding: '9px 14px 9px 0', verticalAlign: 'top' }}>
              <span data-copy="figure" style={{ ...text.figure, fontSize: 21 }}>{value}</span>
            </td>
            <td style={{ padding: '9px 0', verticalAlign: 'top' }}>
              <div style={{ fontFamily: FONT.sans, fontSize: 14, color: EMAIL.ink2 }}>{label}</div>
              {note ? <div style={{ fontFamily: FONT.mono, fontSize: 11, lineHeight: 1.4, color: EMAIL.muted, marginTop: 3 }}>{note}</div> : null}
            </td>
          </tr>
        </tbody>
      </table>
    )
  }
  return (
    <div className={`flex min-h-[44px] items-baseline gap-3.5 py-2 ${last ? '' : 'border-b border-border/70'}`}>
      <span data-copy="figure" className="w-[74px] flex-none font-mono text-[21px] font-semibold leading-none tracking-[-0.02em] tabular-nums">{value}</span>
      <span className="min-w-0">
        <span className="block text-[14px] text-secondary-foreground">{label}</span>
        {note ? <span className="mt-0.5 block font-mono text-[11px] leading-snug text-muted-foreground">{note}</span> : null}
      </span>
    </div>
  )
}

/** The artboard's tinted inner block with its pill — the one row in §3 a
 *  reader is meant to stop at. Two nesting levels, never a third. */
function NewBlock({ mode, children }: { mode: RenderMode; children: ReactNode }) {
  const pill = mode === 'email'
    ? <span style={{ display: 'inline-block', fontFamily: FONT.sans, fontSize: 10, fontWeight: 500, padding: '2px 7px', borderRadius: 10, whiteSpace: 'nowrap', background: EMAIL.mixed, color: EMAIL.ink }}>New</span>
    : <span className="inline-block flex-none rounded-full bg-mixed px-[7px] py-[2px] text-[10px] font-medium leading-normal">New</span>
  if (mode === 'email') {
    return (
      <table width="100%" role="presentation" cellPadding={0} cellSpacing={0} border={0} style={{ borderCollapse: 'collapse', borderSpacing: 0, background: EMAIL.inner, borderRadius: 6, marginTop: 8 }}>
        <tbody>
          <tr>
            <td width={44} style={{ width: 44, padding: '12px 0 12px 14px', verticalAlign: 'top' }}>{pill}</td>
            <td style={{ padding: '12px 14px 12px 10px', fontFamily: FONT.sans, fontSize: 13.5, lineHeight: 1.5, color: EMAIL.ink2 }}>{children}</td>
          </tr>
        </tbody>
      </table>
    )
  }
  return (
    <div className="mt-2 flex items-start gap-2.5 rounded-md bg-inner px-3.5 py-3">
      <span className="mt-[2px]">{pill}</span>
      <span className="min-w-0 text-[13.5px] leading-relaxed text-secondary-foreground">{children}</span>
    </div>
  )
}

function Line({ mode, children }: { mode: RenderMode; children: ReactNode }) {
  return mode === 'email'
    ? <div style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, padding: '4px 0', borderTop: `1px solid ${EMAIL.hairline}` }}>{children}</div>
    : <div className="border-t border-border/70 py-1 text-[12.5px]">{children}</div>
}

function Note({ mode, children }: { mode: RenderMode; children: ReactNode }) {
  return mode === 'email'
    ? <div style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, padding: '4px 0' }}>{children}</div>
    : <p className="m-0 py-1 text-[11.5px] text-muted-foreground">{children}</p>
}

export const weeklyIncoming: Block<WeeklyData> = {
  key: 'weekly.incoming',
  title: 'What came in this week',
  question: 'What did this update actually read?',

  render(data, mode = 'app', ctx) {
    const i = data.incoming
    const mix = i.platforms.map((p) => `${platformLabel(p.platform)} ${fmtInt(p.videos)}`).join(' · ')
    const empty = weeklyIncoming.emptyState(data)
    // Absolute in every mode: print goes into a PDF and the share page is read
    // outside the app (lib/blocks/types.ts, BlockContext.appUrl).
    const weekHref = `${ctx.appUrl}/dashboard/week`
    const frame = (children: ReactNode) => (
      <BlockFrame
        // The window's own word: Sealand's "week" is thirty days long, and the
        // masthead beside this heading prints the real dates.
        title={data.section1.check.noun === 'week' ? weeklyIncoming.title : 'What came in this update'}
        question={weeklyIncoming.question}
        mode={mode}
        meta={weeklyPeriod(data.window, data.month)}
        footer={mode === 'email'
          ? <a href={weekHref} style={{ color: EMAIL.ink }}>Open This week →</a>
          : <Link href={weekHref} className="hover:underline">Open This week →</Link>}
      >
        {children}
      </BlockFrame>
    )
    if (empty) return frame(<BlockEmpty mode={mode}>{empty}</BlockEmpty>)

    return frame(
      <div>
        {/* THE FOUR STAT ROWS (weekly.s3.counts). The mock's fourth is
            "2,960 comments"; this artefact holds no comment count for the
            window — `CameInBlock.windowComments` is This week's and comes off
            M3's `window_denominators` — and a number nobody counted is not
            printed. What is counted is printed, at the tier the mock gives it.

            NOT "into N this month". The two counts are different units and a
            comma between them reads as a subset: an update gathers by when we
            LOOKED, and the month counts by when people WROTE, so Össur's 618
            gathered sit beside a month of 449 and neither is inside the
            other. The sub-line says which is which. */}
        <StatRow
          mode={mode}
          value={fmtInt(i.gathered)}
          label={i.gathered === 1 ? 'video gathered' : 'videos gathered'}
          note={i.monthVideos != null ? `the month so far holds ${fmtInt(i.monthVideos)} videos, dated by when people wrote` : null}
        />
        <StatRow
          mode={mode}
          value={i.analysed != null ? fmtInt(i.analysed) : '—'}
          label={i.analysed != null ? 'analysed' : 'how many were analysed is not recorded for this update'}
        />
        {/* THE COUNT IS `newThemesTotal`, NEVER `newThemes.length`. The array
            is the few that get a card below — `NEW_THEMES_SHOWN` = 3 — and
            counting it printed a display cap at mono 21/600: a workspace that
            heard fourteen new themes printed 3. Same rule as `switchingTotal`
            one section over (lib/blocks/for-sales.ts). */}
        <StatRow
          mode={mode}
          value={fmtInt(i.newThemesTotal)}
          label={i.newThemesTotal === 1 ? 'theme heard for the first time' : 'themes heard for the first time'}
          note={i.newThemesTotal === 0
            ? i.newThemesNote
            : i.newThemesTotal > i.newThemes.length
              ? `the ${fmtInt(i.newThemes.length)} largest ${i.newThemes.length === 1 ? 'is' : 'are'} below`
              : null}
        />
        {/* NULL IS NOT ZERO. `quotesTotal` is null where subjects are not
            recorded — there is nothing for a comment to be new ON — and the
            row then carries the reason rather than a count of nothing. */}
        <StatRow
          mode={mode}
          last
          value={i.quotesTotal != null ? fmtInt(i.quotesTotal) : '—'}
          label={i.quotesTotal === 1 ? 'new comment on your subjects' : 'new comments on your subjects'}
          note={i.quotesTotal == null ? i.quotesNote : null}
        />
        {mix ? (
          <div
            style={mode === 'email' ? { fontFamily: FONT.mono, fontSize: 11.5, color: EMAIL.muted, marginTop: 8 } : undefined}
            className={mode === 'email' ? undefined : 'mt-2 font-mono text-[11.5px] text-muted-foreground'}
          >
            {mix}
          </div>
        ) : null}

        {i.newThemes.map((t) => (
          <NewBlock key={t.label} mode={mode}>
            {/* The theme's own name — `pass_b_theme`, never scrubbed. */}
            <strong data-copy="subject" data-slot="pass_b_theme">{t.label}</strong> — heard for the first time in this update, in <span data-copy="figure">{fmtInt(t.videos)}</span> {t.videos === 1 ? 'video' : 'videos'}.
            {/* NOT the mock's "26 of 1,388 category videos · first heard
                September": that denominator is a MONTH figure attached to a
                count of THIS UPDATE, which is two units in one sentence. The
                update's own count is what this loader measured. */}
          </NewBlock>
        ))}

        {i.rivalPosts.length > 0 ? (
          i.rivalPosts.map((p) => (
            <Line key={`${p.platform}:${p.account}:${p.uploadDate ?? ''}`} mode={mode}>
              <strong>{p.rival}</strong> posted on {platformLabel(p.platform)}
              {p.uploadDate ? ` · ${shortDate(p.uploadDate)}` : ''}
              {/* OUR OWN COUNT, NOT THE PLATFORM'S. `commentsRead` counts the
                  comments rows we hold. `videos.comments_count` — what this
                  line used to print — is the platform's current report, which
                  said 106 where we hold 95 and 1 where we hold none. In the
                  section whose printed question is "What did this update
                  actually read?", that is a false claim about our own
                  coverage. Absent means the count could not be read; it is
                  never printed as a zero. */}
              {p.commentsRead != null
                ? <> · <span data-copy="figure">{fmtInt(p.commentsRead)}</span> {p.commentsRead === 1 ? 'comment' : 'comments'} read</>
                : ' · how many of its comments we read is not recorded'}
              {p.href ? (
                mode === 'email'
                  ? <> · <a href={p.href} style={{ color: EMAIL.link, textDecoration: 'none' }}>see the post →</a></>
                  : <> · <a href={p.href} className="font-semibold hover:underline">see the post →</a></>
              ) : null}
            </Line>
          ))
        ) : (
          <Note mode={mode}>{i.rivalPostsNote}</Note>
        )}

        {/* NEW ON YOUR SUBJECTS. The mock prints three quotes here and the
            artefact printed none — the words exist one surface over (This
            week's §4) and reach this one through the same loader, so the two
            cannot disagree about which comments were new. The count line is the
            real total; the quotes below it are the shown few. */}
        {i.quotes.length > 0 ? (
          <div style={mode === 'email' ? { marginTop: 10 } : undefined} className={mode === 'email' ? undefined : 'mt-2 flex min-w-0 flex-col gap-2'}>
            {i.quotesTotal != null ? (
              <Note mode={mode}>
                <span data-copy="figure">{fmtInt(i.quotesTotal)}</span> {i.quotesTotal === 1 ? 'comment' : 'comments'} on your subjects {i.quotesTotal === 1 ? 'was' : 'were'} written in these days; {i.quotes.length === 1 ? 'one is' : <><span data-copy="figure">{fmtInt(i.quotes.length)}</span> are</>} below in full.
              </Note>
            ) : null}
            {i.quotes.map((q, n) => <BlockQuote key={n} quote={q.quote} cite={`${q.subject} · ${q.cite}`} mode={mode} />)}
          </div>
        ) : i.quotesNote && i.quotesTotal != null ? (
          /* ONCE, NOT TWICE. Where `quotesTotal` is null the stat row above
             already carries this exact sentence as its note, and both
             conditions hold together whenever subjects are not recorded — so
             the forming state printed the same thirty words twice, eight lines
             apart. The trailing paragraph speaks only when the row did not. */
          <Note mode={mode}>{i.quotesNote}</Note>
        ) : null}
      </div>,
    )
  },

  figures(data): FigureTable {
    // WHAT WE READ, NOT WHAT WAS SAID. These are coverage counts, declared so
    // the record and this block cannot disagree about them — and deliberately
    // NOT a share, because there is no honest denominator for one update.
    const out: FigureTable = {
      update_videos: { value: data.incoming.gathered, unit: 'videos', label: 'videos this update gathered' },
    }
    if (data.incoming.monthVideos != null) {
      out.month_videos = { value: data.incoming.monthVideos, unit: 'videos', label: 'videos in the month so far' }
    }
    return out
  },

  quotes(data) {
    // REFS ALONE, never the words. A snapshot freezes ids here and resolves
    // the text at render, so an erasure reaches a stored artefact (decision H)
    // and nothing under lib/reports/ ever holds a comment's text.
    return data.incoming.quotes.map((q) => q.quote.ref)
  },

  emptyState(data) {
    return data.incoming.gathered === 0
      ? 'This update gathered nothing — the section is here so the shape of the report does not change.'
      : null
  },
}
