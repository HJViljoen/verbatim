import type { Block, RenderMode } from '@/lib/blocks/types'
import { openLink } from '@/components/blocks/open-link'
import { BlockEmpty, BlockFrame, FigureCell } from '@/components/blocks/frame'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, longMonth } from '@/lib/format'
import type { FigureTable } from '@/lib/reading/verdicts'
import type { OwnPostCensus } from '@/lib/reading/own-posts'
import type { SubjectsData } from '@/lib/pages/subjects'

// The mock's second rail tile — "Your own posts" (`subjects.ownposts.*`, three
// elements mock-gap called MISSING, built here for the first time).
//
// THE THIRD CLOCK, AND IT SAYS SO (D9). Every other figure on this page is
// dated by the COMMENT; a census of what you published is dated by
// `videos.upload_date`, which is a different calendar. `OwnPostCensus.basis`
// carries that sentence and the tile prints it under the figures rather than
// beside the month in the header, where it would read as a caption on the
// month instead of on the count. mock-gap's deviation 6 is exactly this: an
// upload-dated count under a comment-dated month heading mixes two datings,
// and the fix is to name the clock, not to drop the tile.
//
// AND THE HOOKS ARE NOT A PARTITION (D4). The mock draws "on-screen text 5 ·
// spoken 2 · caption only 2" against a census of nine and invites the reader
// to add them up; on the fixture they sum to five of nine, and on the live
// tenant to five of seventeen, because the classifier names a hook on some
// posts and not others. Every row therefore carries its own "of N" through
// `FigureCell`, which is the same shape the kinds tile uses one tile over and
// for the same reason.

/** One labelled count with its own denominator — a hook style, a format. */
function CountRow({ label, k, n, mode }: { label: string; k: number; n: number; mode: RenderMode }) {
  const email = mode === 'email'
  if (email) {
    return (
      <tr>
        <td style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink2, padding: '2px 0' }}>{label}</td>
        <td align="right" style={{ padding: '2px 0' }}>
          <FigureCell value={fmtInt(k)} of={`of ${fmtInt(n)}`} align="right" mode={mode} />
        </td>
      </tr>
    )
  }
  return (
    <div className="flex items-baseline justify-between gap-2 text-[12.5px] text-secondary-foreground">
      <span className="min-w-0 truncate">{label}</span>
      <FigureCell value={fmtInt(k)} of={`of ${fmtInt(n)}`} align="right" />
    </div>
  )
}

/** A small eyebrow inside the tile — the mock's "SUBJECTS MATCHED" / "HOOKS". */
function Group({ label, children, mode }: { label: string; children: React.ReactNode; mode: RenderMode }) {
  const email = mode === 'email'
  return (
    <div className={email ? undefined : 'flex min-w-0 flex-col gap-1.5'} style={email ? { paddingTop: 8 } : undefined}>
      <span
        className={email ? undefined : 'text-[10.5px] font-semibold uppercase tracking-[0.06em] text-secondary-foreground'}
        style={email ? { fontFamily: FONT.sans, fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.6px', color: EMAIL.muted, display: 'block' } : undefined}
      >
        {label}
      </span>
      {children}
    </div>
  )
}

export const subjectsOwnPosts: Block<SubjectsData> = {
  key: 'subjects.ownposts',
  title: 'Your own posts',
  question: 'What did we publish, and what was it about?',

  render(data, mode = 'app', ctx) {
    const c = data.ownPosts
    const empty = subjectsOwnPosts.emptyState(data)
    const email = mode === 'email'
    const footer = openLink(mode, `${ctx.appUrl}/dashboard/market`, 'Open your moves →')

    if (!c || empty) {
      return (
        <BlockFrame title={subjectsOwnPosts.title} question={subjectsOwnPosts.question} mode={mode} footer={footer}>
          <BlockEmpty mode={mode}>{empty ?? 'Nothing has been published in this month.'}</BlockEmpty>
        </BlockFrame>
      )
    }

    const hooks = c.hooks.slice(0, 3)
    return (
      <BlockFrame
        title={subjectsOwnPosts.title}
        question={subjectsOwnPosts.question}
        mode={mode}
        meta={longMonth(c.month)}
        footer={footer}
        truncateFooter
        // "n = 9" — the mock's own footer note, and the denominator every
        // figure in this tile is a share of.
        footerNote={`n = ${fmtInt(c.published.k)}`}
      >
        <div className={email ? undefined : 'flex min-w-0 flex-col gap-1'}>
          <span className={email ? undefined : 'inline-flex items-baseline gap-1.5'}>
            <span data-copy="figure" className={email ? undefined : 'font-mono text-[24px] font-semibold leading-none tracking-[-0.03em] tabular-nums'} style={email ? { fontFamily: FONT.mono, fontSize: 24, fontWeight: 600, color: EMAIL.ink } : undefined}>
              {fmtInt(c.published.k)}
            </span>{' '}
            <span className={email ? undefined : 'text-[12px] font-medium text-muted-foreground'} style={email ? { fontFamily: FONT.sans, fontSize: 12, color: EMAIL.muted } : undefined}>
              posts published
            </span>
          </span>
          <span data-copy="level" className={email ? undefined : 'text-[11.5px] text-muted-foreground'} style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, display: 'block' } : undefined}>
            {fmtInt(c.overFloor.k)} of {fmtInt(c.overFloor.n)} cleared the {fmtInt(c.commentFloor)}-comment floor
          </span>
          {/* THE CLOCK, BESIDE THE FIGURE (D9). Not in the header: a header
              note reads as a caption on the month, and the thing that needs
              saying is what the COUNT is dated by. */}
          <span className={email ? undefined : 'font-mono text-[10.5px] text-muted-foreground'} style={email ? { fontFamily: FONT.mono, fontSize: 10.5, color: EMAIL.faint, display: 'block' } : undefined}>
            dated by the day you posted · {c.basis}
          </span>
        </div>

        {c.subjects.length > 0 ? (
          <Group label="Subjects matched" mode={mode}>
            <span className={email ? undefined : 'flex flex-wrap gap-1'}>
              {c.subjects.map((s) => (
                <span
                  key={s.subjectId}
                  data-copy="level"
                  className={email ? undefined : 'inline-block rounded-full bg-tile px-2 py-0.5 text-[12px] font-medium text-secondary-foreground ring-1 ring-border'}
                  style={email ? { fontFamily: FONT.sans, fontSize: 12, color: EMAIL.ink2, paddingRight: 8 } : undefined}
                >
                  {s.label} <span className={email ? undefined : 'font-mono text-[10.5px] tabular-nums text-muted-foreground'}>{fmtInt(s.value.k)} of {fmtInt(s.value.n)}</span>
                </span>
              ))}
            </span>
          </Group>
        ) : c.subjectsNote ? (
          <Group label="Subjects matched" mode={mode}>
            <BlockEmpty mode={mode}>{c.subjectsNote}</BlockEmpty>
          </Group>
        ) : null}

        {hooks.length > 0 ? (
          <Group label="Hooks" mode={mode}>
            {email ? (
              <table width="100%" role="presentation" cellPadding={0} cellSpacing={0} border={0} style={{ borderCollapse: 'collapse' }}>
                <tbody>{hooks.map((h) => <CountRow key={h.label} label={h.label} k={h.value.k} n={h.value.n} mode={mode} />)}</tbody>
              </table>
            ) : (
              <div className="flex flex-col gap-1">
                {hooks.map((h) => <CountRow key={h.label} label={h.label} k={h.value.k} n={h.value.n} mode={mode} />)}
              </div>
            )}
          </Group>
        ) : null}

        {c.claimsNote ? <BlockEmpty mode={mode}>{c.claimsNote}</BlockEmpty> : null}
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    const c = data.ownPosts
    if (!c) return {}
    return {
      // A post IS a video — `videos.is_client` — and `videos` is the unit the
      // figure table has for one. The LABEL says which videos they are.
      own_posts_published: { value: c.published.k, unit: 'videos', label: `posts you published in ${longMonth(c.month)}` },
      own_posts_over_floor: { value: c.overFloor.k, unit: 'videos', label: `those posts with at least ${c.commentFloor} comments` },
    }
  },

  emptyState(data) {
    const c: OwnPostCensus | null = data.ownPosts
    if (!c) return 'What you published is not recorded for this workspace yet.'
    return c.unread
  },
}
