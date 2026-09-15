import type { ReactNode } from 'react'
import Link from 'next/link'
import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { EMAIL, FONT } from '@/lib/email/theme'
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
    const frame = (children: ReactNode) => (
      <BlockFrame
        title={weeklyIncoming.title}
        question={weeklyIncoming.question}
        mode={mode}
        meta={weeklyPeriod(data.window, data.month)}
        footer={mode === 'email'
          ? <a href={`${ctx.appUrl}/dashboard/week`} style={{ color: EMAIL.ink }}>Open This week →</a>
          : <Link href="/dashboard/week" className="hover:underline">Open This week →</Link>}
      >
        {children}
      </BlockFrame>
    )
    if (empty) return frame(<BlockEmpty mode={mode}>{empty}</BlockEmpty>)

    return frame(
      <div>
        <Line mode={mode}>
          <span data-copy="figure">{fmtInt(i.gathered)}</span> videos gathered
          {i.analysed != null ? <> · <span data-copy="figure">{fmtInt(i.analysed)}</span> analysed</> : ' · how many were analysed is not recorded for this update'}
          {/* NOT "into N this month". The two counts are different units and a
              comma between them reads as a subset: an update gathers by when we
              LOOKED, and the month counts by when people WROTE, so Össur's 618
              gathered sit beside a month of 449 and neither is inside the
              other. The clause says which is which. */}
          {i.monthVideos != null ? <> · the month so far holds <span data-copy="figure">{fmtInt(i.monthVideos)}</span> videos, dated by when people wrote</> : null}
          {mix ? <div style={mode === 'email' ? { fontFamily: FONT.mono, fontSize: 11.5, color: EMAIL.muted, marginTop: 2 } : undefined} className={mode === 'email' ? undefined : 'mt-0.5 font-mono text-[11.5px] text-muted-foreground'}>{mix}</div> : null}
        </Line>

        {i.newThemes.length > 0 ? (
          i.newThemes.map((t) => (
            <Line key={t.label} mode={mode}>
              <strong>{t.label}</strong> — heard for the first time in this update, in <span data-copy="figure">{fmtInt(t.videos)}</span> {t.videos === 1 ? 'video' : 'videos'}
            </Line>
          ))
        ) : (
          <Note mode={mode}>{i.newThemesNote}</Note>
        )}

        {i.rivalPosts.length > 0 ? (
          i.rivalPosts.map((p) => (
            <Line key={`${p.platform}:${p.account}:${p.uploadDate ?? ''}`} mode={mode}>
              <strong>{p.rival}</strong> posted on {platformLabel(p.platform)}
              {p.uploadDate ? ` · ${shortDate(p.uploadDate)}` : ''} · <span data-copy="figure">{fmtInt(p.comments)}</span> {p.comments === 1 ? 'comment' : 'comments'} read
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

  emptyState(data) {
    return data.incoming.gathered === 0
      ? 'This update gathered nothing — the section is here so the shape of the report does not change.'
      : null
  },
}
