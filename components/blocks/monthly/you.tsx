import type { ReactNode } from 'react'
import type { RenderMode } from '@/lib/blocks/types'
import { TokenProse } from '@/components/blocks/prose'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, longMonth } from '@/lib/format'
import { prevMonth } from '@/lib/reading/month-key'
import { surface } from '@/lib/nav'
import type { MonthlyForYou, MonthlyPublished, MonthlyYou } from '@/lib/reports/monthly-slots'
import { FOR_YOU_SENTENCES as SENTENCES, forYouShown, forYouSentence, forYouWords } from '@/lib/pages/overview-market/foryou'
import { CALIBRATION_TAG } from '@/lib/pages/overview-market/subjects'
import { printsMarket } from '@/lib/subjects/calibration-state'
import { FOR_YOU_NONE } from '@/components/pages/overview/foryou'
import type { FigureTable } from '@/lib/reading/verdicts'
import { T, presentation } from './email-table'
import { Num, SubHead, Table } from './email'
import { slotSection } from './slot'

/**
 * 7 · What it means for you, and what you published (market-first WP2.1; the
 * front page's blocks 7 and 8 in one section, WP2.5's slot, below the
 * expected cut line). Absent until WP2.5 fills the slot.
 *
 * THE FOR-YOU LINES ARE WP2.5's SENTENCES. §4.2's `ForYouBlock` carries each
 * line's `sentenceKey` and its figures, never its words: every sentence is
 * code-written in WP2.5's table (`FOR_YOU_SENTENCES`, `[[token]]` bodies, the
 * front page's own), and a line whose key the table does not hold prints
 * nothing. Each printed line lists the words its posts matched on, or the
 * words checked where none did, so a "none" can be checked (plan WP2.5).
 *
 * WHAT YOU PUBLISHED is the front page's census (`PublishedCensus`): the
 * posts, the followers' own themes and the moves count.
 *
 * THE PAGE'S WORDS, CELL FOR CELL (deploy 3 integration). The slot is filled
 * from the front page's two blocks (`monthlySlotsFrom`), so the section says
 * what the page says where the page says it: "1 post", a month with no
 * reading of your audience as "no reading yet" (never a dropped cell, never
 * 0), and, where nothing lines up, the page's own line (`FOR_YOU_NONE`). The
 * layout is the MonthlyReport artboard's.
 */

/** WP2.5's sentences, by `sentenceKey`, with `[[token]]` figures: the front
 *  page's own table (`lib/pages/overview-market/foryou.ts`), so the monthly
 *  and the page print one sentence. */
export const FOR_YOU_SENTENCES: Readonly<Record<string, string>> = SENTENCES

function ForYou({ f, mode }: { f: MonthlyForYou; mode: RenderMode }) {
  // No line resting on a subject that is not ready (T0a, MR-9; ruling U6),
  // on a copy stored before the rule too.
  const { lines, withheld } = forYouShown(f)
  const email = mode === 'email'
  // Everything it had was withheld: the half is omitted (T0a), never "no
  // subject was asked about".
  if (withheld && lines.length === 0) return null
  // Nothing lines up (Össur at a month with no subject asked about and no
  // lead): the front page's one line, not a silent gap.
  if (lines.length === 0) {
    return (
      <p style={email ? { fontFamily: FONT.sans, fontSize: 15, lineHeight: '24px', color: EMAIL.ink2, margin: 0 } : undefined} className={email ? undefined : 'm-0 text-[15px] text-secondary-foreground'}>
        {FOR_YOU_NONE}
      </p>
    )
  }
  return (
    <>
      {lines.map((l, i) => {
        // The words each matching post shared, or the words checked where
        // none matched, so a "none" can be checked (plan WP2.5).
        const w = forYouWords(l)
        const word = l.calibration ? CALIBRATION_TAG[l.calibration] : null
        return (
          <div key={`${l.kind}-${i}`} style={email ? { marginTop: i === 0 ? 0 : 16 } : undefined} className={email ? undefined : 'flex flex-col gap-1'}>
            {l.label ? (
              <div style={email ? { fontFamily: FONT.sans, fontSize: 15, fontWeight: 600, color: EMAIL.ink } : undefined} className={email ? undefined : 'text-[15px] font-semibold'}>
                {l.labelKind === 'theme' ? <>“<span data-copy="subject" data-slot="pass_b_theme">{l.label}</span>”</> : l.label}
                {word ? <span style={email ? { fontFamily: FONT.mono, fontSize: 12, fontWeight: 400, color: EMAIL.muted } : undefined} className={email ? undefined : 'font-mono text-[12px] font-normal text-muted-foreground'}> · {word}</span> : null}
              </div>
            ) : null}
            <TokenProse body={forYouSentence(l.sentenceKey, f.month) ?? ''} figures={l.figures} mode={mode} size={email ? 15 : 'body'} />
            {w.words.length > 0 ? (
              <div style={email ? { fontFamily: FONT.sans, fontSize: 13, color: EMAIL.muted, marginTop: 4 } : undefined} className={email ? undefined : 'text-[13px] text-muted-foreground'}>
                {w.matched ? `${fmtInt(l.matchedPosts.length)} ${l.matchedPosts.length === 1 ? 'post' : 'posts'} on` : 'Checked:'} {w.words.join(' · ')}{w.more ? ' · …' : ''}
              </div>
            ) : null}
          </div>
        )
      })}
    </>
  )
}

/** One of the census's three cells: a figure and the words under it. */
function Cell({ figure, words, under, mode }: { figure: number; words: string; under: ReactNode; mode: RenderMode }) {
  if (mode === 'email') {
    return (
      <td className="vb-m-col" style={{ width: '33%', verticalAlign: 'top', paddingRight: 12 }}>
        <div style={{ fontFamily: FONT.sans, fontSize: 15, lineHeight: '28px', color: EMAIL.ink2 }}>
          <Num size={24}>{fmtInt(figure)}</Num> {words}
        </div>
        <div style={{ fontFamily: FONT.sans, fontSize: 13, lineHeight: '18px', color: EMAIL.muted, marginTop: 4 }}>{under}</div>
      </td>
    )
  }
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[15px] text-secondary-foreground"><span data-copy="figure" className="font-mono text-[24px] font-semibold tabular-nums text-foreground">{fmtInt(figure)}</span> {words}</span>
      <span className="text-[13px] text-muted-foreground">{under}</span>
    </div>
  )
}

/** A census cell with no figure: the month holds no reading of your
 *  audience, which is not a zero (the front page's `CensusNote` words). */
function Note({ words, under, mode }: { words: string; under: string; mode: RenderMode }) {
  if (mode === 'email') {
    return (
      <td className="vb-m-col" style={{ width: '33%', verticalAlign: 'top', paddingRight: 12 }}>
        <div style={{ fontFamily: FONT.sans, fontSize: 15, lineHeight: '28px', color: EMAIL.muted }}>{words}</div>
        <div style={{ fontFamily: FONT.sans, fontSize: 13, lineHeight: '18px', color: EMAIL.muted, marginTop: 4 }}>{under}</div>
      </td>
    )
  }
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[15px] leading-[36px] text-muted-foreground">{words}</span>
      <span className="text-[13px] text-muted-foreground">{under}</span>
    </div>
  )
}

function Published({ p, mode }: { p: MonthlyPublished; mode: RenderMode }) {
  const month = longMonth(p.month)
  const cells = [
    <Cell key="posts" mode={mode} figure={p.posts} words={p.posts === 1 ? 'post' : 'posts'} under={<>in {month}{p.prevPosts != null ? <> · <span data-copy="figure">{fmtInt(p.prevPosts)}</span> in {longMonth(prevMonth(p.month))}</> : null}</>} />,
    <Cell key="five" mode={mode} figure={p.drewFive} words="drew 5+" under="comments each" />,
    p.withReading != null
      ? <Cell key="reading" mode={mode} figure={p.withReading} words="carry a reading" under={<><span data-copy="figure">{fmtInt(p.readingComments ?? 0)}</span> comments</>} />
      : <Note key="reading" mode={mode} words="no reading yet" under={`nothing under your posts read for ${month}`} />,
  ]
  const moves = p.movesDated === 0 ? 'none dated yet' : <><span data-copy="figure">{fmtInt(p.movesDated)}</span> dated</>
  if (mode === 'email') {
    return (
      <>
        <table width="100%" {...presentation} style={T}><tbody><tr>{cells}</tr></tbody></table>
        {p.followers.length > 0 ? (
          <>
            <SubHead marginTop={24}>Your followers talked most about</SubHead>
            <Table
              marginTop={8}
              columns={[{ head: '' }, { head: 'videos', align: 'right', width: 64 }]}
              rows={p.followers.map((f) => [<span key="l" data-copy="subject" data-slot="pass_b_theme">{f.label}</span>, <Num key="k">{fmtInt(f.k)}</Num>])}
            />
          </>
        ) : null}
        <div style={{ fontFamily: FONT.sans, fontSize: 15, lineHeight: '24px', color: EMAIL.ink2, marginTop: 16 }}>
          <span style={{ fontWeight: 600, color: EMAIL.ink }}>Moves:</span> {moves}
        </div>
      </>
    )
  }
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3" data-print-cols="3">{cells}</div>
      {p.followers.length > 0 ? (
        <div className="flex flex-col">
          <p className="m-0 border-b border-border pb-2.5 text-[15px] font-semibold">Your followers talked most about</p>
          {p.followers.map((f) => (
            <div key={f.label} className="flex min-h-11 items-center justify-between gap-4 border-b border-border/60 text-[15px] last:border-b-0">
              <span data-copy="subject" data-slot="pass_b_theme">{f.label}</span>
              <span data-copy="figure" className="font-mono font-semibold tabular-nums">{fmtInt(f.k)}</span>
            </div>
          ))}
        </div>
      ) : null}
      <p className="m-0 text-[15px] text-secondary-foreground"><span className="font-semibold text-foreground">Moves:</span> {moves}</p>
    </div>
  )
}

function body(v: MonthlyYou, mode: RenderMode): ReactNode {
  const shown = v.foryou ? forYouShown(v.foryou) : null
  const forYou = v.foryou && !(shown?.withheld && shown.lines.length === 0) ? <ForYou f={v.foryou} mode={mode} /> : null
  const published = v.published ? <Published p={v.published} mode={mode} /> : null
  if (mode === 'email') {
    return (
      <>
        {forYou}
        {published ? <><SubHead marginTop={forYou ? 32 : 0}>What you published</SubHead><div style={{ marginTop: 12 }}>{published}</div></> : null}
      </>
    )
  }
  return (
    <div className="flex flex-col gap-8">
      {forYou}
      {published ? <div className="flex flex-col gap-4"><p className="m-0 text-[15px] font-semibold">What you published</p>{published}</div> : null}
    </div>
  )
}

function figures(v: MonthlyYou): FigureTable {
  const out: FigureTable = {}
  // Each line's figures under its own keys: two lines both hold a
  // `foryou_posts`, and they are different numbers (three months, one month).
  for (const [i, l] of (v.foryou?.lines ?? []).entries()) {
    if (!printsMarket(l.calibration)) continue
    for (const [k, f] of Object.entries(l.figures)) out[`${l.kind}_${i}_${k}`] = f
  }
  const p = v.published
  if (p) {
    const month = longMonth(p.month)
    out.you_posts = { value: p.posts, unit: 'videos', label: `your posts in ${month}` }
    out.you_drew_five = { value: p.drewFive, unit: 'videos', label: `your posts in ${month} that drew 5 or more comments` }
    if (p.withReading != null) out.you_with_reading = { value: p.withReading, unit: 'videos', label: `your posts in ${month} that carry a reading` }
    if (p.readingComments != null) out.you_reading_comments = { value: p.readingComments, unit: 'comments', label: `comments on your posts in ${month} that carry a reading` }
  }
  return out
}

export const monthlyYou = slotSection({
  key: 'monthly.you',
  title: 'What it means for you',
  slot: 'you',
  link: () => {
    const page = surface('market')
    return { href: page.href, label: `Open ${page.label} →` }
  },
  stub: 'What your market means for you, and what you published, is read here once it is counted.',
  body: (value, _data, mode) => body(value, mode),
  figures: (value) => figures(value),
})
