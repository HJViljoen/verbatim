import type { ReactNode } from 'react'

import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { openLink } from '@/components/blocks/open-link'
import { CalibrationTag } from '@/components/blocks/calibration-tag'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, longMonth, shortDate } from '@/lib/format'
import { surface } from '@/lib/nav'
import type { FigureTable } from '@/lib/reading/verdicts'
import { JUDGE_NOT_CHECKED } from '@/lib/reading/own-posts'
import {
  QUESTION_CHECKED_SHOWN, QUESTION_WINDOW_MONTHS,
  type MarketSurfaceData, type QuestionsBlock, type QuestionTouch,
} from '@/lib/pages/market-surface'
import { THEME_FLOOR } from '@/lib/pages/overview-market/board'
import { LevelBar, MakerMark, RULE, SCALE } from '@/components/pages/overview/market'

// Y1 · Questions to answer (market-first WP3.6, plan §2.6; the approved
// preview's first block on Your moves).
//
// WHAT YOUR MARKET ASKS, EACH MARKED BY YOUR POSTS. Two tables: the reading
// month's question themes not led by makers, ranked by videos in the category
// (the front page's "Asked" list), and the subjects the market asked about
// most over the last three months. Every row says whether one of your posts
// touched it, which post and on which words, or, where none did, the words
// that were checked, so a "none" can be checked (DF risk 5).
//
// A SUBJECT ROW NOBODY'S WORDS TOUCHED, AND THE JUDGE HAS NOT FILED, READS
// "not checked yet" (WP3.6 done-when 6): the post-and-claim judge is the
// second check, and before MF3 it has filed nothing. The word check still
// prints beside it, so the front page's "none of your 56 posts shared two or
// more of its words" and this row say the same thing about the words.
//
// THE HEADER IS THE TITLE ALONE AND THE FOOTER A LINK ALONE (25 Sep rulings):
// the bases live in the column heads ("of 626", "of your 20"), the calibration
// word is a row tag, and nothing explains itself under the tables.

/** The posts a touched row lists before it counts the rest. */
const POSTS_LISTED = 3

/** Wide from 720px of block; below it the bar goes and the posts cell takes a
 *  line of its own under its row (a container query, the board's rule). */
const COLS = 'grid-cols-[minmax(0,1fr)_56px] gap-x-3 @min-[720px]:grid-cols-[minmax(220px,1.3fr)_minmax(96px,0.8fr)_64px_minmax(240px,1.2fr)] @min-[720px]:gap-x-4'
const WIDE_ONLY = '@max-[720px]:hidden'
const OWN_LINE = '@max-[720px]:col-span-full'

const WORD_SEP = ' · '

/** The words a touch prints: each touching post's, or those checked. */
function wordsOf(t: QuestionTouch): { words: string[]; more: boolean } {
  if (t.matched.length > 0) return { words: [...new Set(t.matched.flatMap((m) => m.words))], more: false }
  return { words: t.checked.slice(0, QUESTION_CHECKED_SHOWN), more: t.checked.length > QUESTION_CHECKED_SHOWN }
}

/** The label words, as the model wrote the label they came from. */
function Words({ words, more }: { words: readonly string[]; more?: boolean }) {
  if (words.length === 0) return null
  return <><span data-copy="subject" data-slot="pass_b_theme">{words.join(WORD_SEP)}</span>{more ? `${WORD_SEP}…` : ''}</>
}

/** One touching post: its day and the words it shared, linked in the app. */
function PostLine({ post, mode }: { post: QuestionTouch['matched'][number]; mode: RenderMode }) {
  const day = post.postedOn ? `your post of ${shortDate(post.postedOn)}` : 'a post of yours'
  const who = mode === 'app' && post.href
    ? <a href={post.href} target="_blank" rel="noreferrer" className="hover:underline">{day}</a>
    : day
  return (
    <span className="block">
      {who}{post.by === 'judge' ? ' (the post check)' : ''}: <Words words={post.words} />
    </span>
  )
}

/** The "Your posts" cell: yes with the posts and words, none with what was
 *  checked, or not checked yet. */
function TouchCell({ touch, mode }: { touch: QuestionTouch; mode: RenderMode }) {
  const email = mode === 'email'
  const lead = (children: ReactNode) => email
    ? <div style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, fontWeight: 600 }}>{children}</div>
    : <span className="block text-[15px] font-medium leading-[1.4] text-foreground">{children}</span>
  const tail = (children: ReactNode) => email
    ? <div style={{ fontFamily: FONT.mono, fontSize: 11, color: EMAIL.muted, marginTop: 2 }}>{children}</div>
    : <span className={`mt-0.5 block ${SCALE.tag}`}>{children}</span>
  if (touch.state === 'unread' || touch.posts == null) return <>{lead('your posts could not be read')}</>
  // BELOW 720PX THE COLUMN HEAD IS GONE, so the cell names its own base.
  const whose = email ? null : <span className="@min-[720px]:hidden">your posts: </span>
  const { words, more } = wordsOf(touch)
  if (touch.state === 'touched') {
    const listed = touch.matched.slice(0, POSTS_LISTED)
    const rest = touch.matched.length - listed.length
    return (
      <>
        {lead(<>{whose}<span data-copy="level">{fmtInt(touch.matched.length)} of {fmtInt(touch.posts)}</span></>)}
        {tail(<>
          {listed.map((p) => <PostLine key={p.id} post={p} mode={mode} />)}
          {rest > 0 ? <span className="block">and <span data-copy="figure">{fmtInt(rest)}</span> more</span> : null}
        </>)}
      </>
    )
  }
  if (touch.state === 'unchecked') {
    return (
      <>
        {lead(<>{whose}{JUDGE_NOT_CHECKED}</>)}
        {tail(<>
          <span data-copy="level">none of {fmtInt(touch.posts)}</span> shared two of its words
          {words.length > 0 ? <>{WORD_SEP}checked: <Words words={words} more={more} /></> : null}
        </>)}
      </>
    )
  }
  return (
    <>
      {lead(<>{whose}<span data-copy="level">none of {fmtInt(touch.posts)}</span></>)}
      {words.length > 0 ? tail(<>checked: <Words words={words} more={more} /></>) : null}
    </>
  )
}

/** A base is a level's "of N" only where a number follows "of". */
const isLevelBase = (base: string | null): boolean => base != null && /^of \d/.test(base)

/** A column head that carries its base: "Videos / of 626". */
function Head({ top, base, align = 'right' }: { top: string; base: string | null; align?: 'left' | 'right' }) {
  return (
    <span data-copy={isLevelBase(base) ? 'level' : undefined} className={`flex flex-col leading-[1.35] ${align === 'right' ? 'items-end text-right' : 'items-start'}`}>
      <span className="text-[13px] font-medium text-muted-foreground">{top}</span>
      {base ? <span className="whitespace-nowrap font-mono text-[12px] font-normal text-muted-foreground">{base}</span> : null}
    </span>
  )
}

interface Row {
  key: string
  label: ReactNode
  tags: ReactNode
  sub: ReactNode
  videos: number
  touch: QuestionTouch
}

function Table({ title, videosBase, postsBase, rows, max, mode }: {
  title: string
  videosBase: string | null
  postsBase: string | null
  rows: readonly Row[]
  max: number
  mode: RenderMode
}) {
  if (mode === 'email') {
    const cell = { fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, padding: '5px 10px 5px 0', borderTop: `1px solid ${EMAIL.hairline}`, verticalAlign: 'top' as const }
    const num = { ...cell, fontFamily: FONT.mono, textAlign: 'right' as const }
    return (
      <table role="presentation" cellPadding={0} cellSpacing={0} style={{ borderCollapse: 'collapse', width: '100%', marginTop: 8 }}>
        <thead>
          <tr>
            <th style={{ ...cell, borderTop: 0, textAlign: 'left', fontWeight: 600 }}>{title}</th>
            <th style={{ ...num, borderTop: 0, color: EMAIL.muted, fontSize: 11 }}><span data-copy={isLevelBase(videosBase) ? 'level' : undefined}>Videos{videosBase ? ` ${videosBase}` : ''}</span></th>
            <th style={{ ...cell, borderTop: 0, textAlign: 'left', color: EMAIL.muted, fontSize: 11 }}><span>Your posts{postsBase ? ` ${postsBase}` : ''}</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td style={cell}>{r.label}{r.tags}{r.sub ? <div style={{ fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 2 }}>{r.sub}</div> : null}</td>
              <td style={num}><span data-copy="figure">{fmtInt(r.videos)}</span></td>
              <td style={cell}><TouchCell touch={r.touch} mode={mode} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }
  return (
    <div className="@container" role="table">
      <div role="row" className={`grid ${COLS} items-end ${RULE.head}`}>
        <span role="columnheader" className="text-[15px] font-semibold leading-[1.35] text-foreground">{title}</span>
        <span role="columnheader" className={WIDE_ONLY} />
        <span role="columnheader"><Head top="Videos" base={videosBase} /></span>
        <span role="columnheader" className={WIDE_ONLY}><Head top="Your posts" base={postsBase ? `${postsBase}${WORD_SEP}words matched` : null} align="left" /></span>
      </div>
      {rows.map((r) => (
        <div key={r.key} role="row" className={`grid ${COLS} items-start py-2.5 ${RULE.row}`}>
          <span role="rowheader" className={`min-w-0 [text-wrap:pretty] ${SCALE.row}`}>
            {r.label}{r.tags}
            {r.sub ? <span className="mt-0.5 block text-[13px] leading-[1.4] text-secondary-foreground">{r.sub}</span> : null}
          </span>
          <span className={`block pt-2 ${WIDE_ONLY}`}><LevelBar share={max > 0 ? r.videos / max : null} prevShare={null} axis={1} /></span>
          <span className={`${SCALE.num} font-semibold`}><span data-copy="figure">{fmtInt(r.videos)}</span></span>
          <span className={`min-w-0 ${OWN_LINE}`}><TouchCell touch={r.touch} mode={mode} /></span>
        </div>
      ))}
    </div>
  )
}

function Questions({ q, mode }: { q: QuestionsBlock; mode: RenderMode }) {
  const email = mode === 'email'
  const tag = (children: ReactNode) => email
    ? <span style={{ fontFamily: FONT.mono, fontSize: 11, color: EMAIL.muted }}> {children}</span>
    : <span className={`ml-2 inline-flex items-center gap-1.5 align-baseline ${SCALE.tag}`}>{children}</span>
  const themeRows: Row[] = q.themes.map((t) => ({
    key: t.registryId,
    label: <span data-copy="subject" data-slot="pass_b_theme">{t.label}</span>,
    tags: t.makers ? tag(<>{email ? null : <MakerMark />}{t.makers}</>) : null,
    sub: null,
    videos: t.videos,
    touch: t.touch,
  }))
  const subjectRows: Row[] = q.subjects.map((s) => ({
    key: s.subjectId,
    label: <span>{s.name}</span>,
    tags: s.calibration === 'provisional'
      ? email ? <>{' '}<CalibrationTag calibration="provisional" mode={mode} /></> : tag(<CalibrationTag calibration="provisional" mode={mode} />)
      : null,
    sub: s.groups.length > 0 ? (
      <>
        {s.groups.map((g, i) => (
          <span key={g.label}>
            {i > 0 ? WORD_SEP : ''}<span data-copy="subject" data-slot="pass_b_theme">{g.label}</span>{' '}
            <span data-copy="figure" className={email ? undefined : 'font-mono font-semibold tabular-nums text-foreground'}>{fmtInt(g.videos)}</span>
          </span>
        ))}
        {s.moreGroups > 0 ? `${WORD_SEP}…` : null}
      </>
    ) : null,
    videos: s.videos,
    touch: s.touch,
  }))
  const max = Math.max(0, ...themeRows.map((r) => r.videos), ...subjectRows.map((r) => r.videos))
  const posts = (n: number | null) => (n == null ? null : `of your ${fmtInt(n)}`)
  return (
    <div className={email ? undefined : 'flex min-w-0 flex-col gap-8'}>
      {themeRows.length > 0 ? (
        <Table
          title={`In ${longMonth(q.month)}`}
          videosBase={q.n != null ? `of ${fmtInt(q.n)}` : null}
          postsBase={posts(q.monthPosts)}
          rows={themeRows}
          max={max}
          mode={mode}
        />
      ) : (
        <BlockEmpty mode={mode}>No question theme reached {fmtInt(THEME_FLOOR)} videos in {longMonth(q.month)}.</BlockEmpty>
      )}
      {subjectRows.length > 0 ? (
        <Table
          title={`Over the last ${QUESTION_WINDOW_MONTHS} months, by subject`}
          videosBase="asking"
          postsBase={posts(q.windowPosts)}
          rows={subjectRows}
          max={max}
          mode={mode}
        />
      ) : null}
    </div>
  )
}

export const marketQuestions: Block<MarketSurfaceData> = {
  key: 'market.questions',
  title: 'Questions to answer',
  question: 'What does your market ask, and have your posts touched it?',

  render(data, mode = 'app', ctx) {
    const q = data.questions ?? null
    const subjects = surface('subjects')
    const footer = openLink(mode, `${ctx.appUrl}${subjects.href}`, `Open ${subjects.label} →`)
    const empty = marketQuestions.emptyState(data)
    return (
      <BlockFrame title={marketQuestions.title} mode={mode} roomy footer={q && !q.empty ? footer : undefined}>
        {empty || !q ? <BlockEmpty mode={mode}>{empty}</BlockEmpty> : <Questions q={q} mode={mode} />}
      </BlockFrame>
    )
  },

  /** Each row's videos, by position: the counts this block states. */
  figures(data): FigureTable {
    const q = data.questions
    if (!q) return {}
    const out: FigureTable = {}
    q.themes.forEach((t, i) => { out[`questions_theme_${i + 1}`] = { value: t.videos, unit: 'videos', label: `${longMonth(q.month)} videos asking: ${t.label}` } })
    q.subjects.forEach((s, i) => { out[`questions_subject_${i + 1}`] = { value: s.videos, unit: 'videos', label: `videos asking about ${s.name}, last ${QUESTION_WINDOW_MONTHS} months` } })
    return out
  },

  emptyState(data) {
    if (!data.questions) return 'Questions to answer are read on this page as it is built today, not on this copy.'
    return data.questions.empty
  },
}
