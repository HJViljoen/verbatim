import type { ReactNode } from 'react'
import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { openLink } from '@/components/blocks/open-link'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, longMonth } from '@/lib/format'
import { surface } from '@/lib/nav'
import { MAKERS_NOT_MEASURED, makerCell } from '@/lib/pages/overview-market'
import { heardAtFloor, monthPhrase, NEW_THEME_FLOOR, regroupedLine, type HeardBlock, type HeardTheme, type WeekData } from '@/lib/pages/week'
import type { FigureTable } from '@/lib/reading/verdicts'
import { InnerLine, LevelBar, MakerMark, RULE, SCALE, shortMonthName } from '@/components/pages/overview/market'

// "Heard for the first time" (market-first WP3.7, `week.heard`, a new stored
// key; the approved preview's This week, its third tile): the themes this
// update first heard that reached the floor in the month, on the category,
// where themes are grouped (decision E), each with where its videos came from
// (the searches first run in the month) and its maker share; the ones led by
// makers or set aside as off-topic grouped on one line (decision F), as the
// front page's board groups them.
//
// A THEME HEARD FOR THE FIRST TIME HAS NO EARLIER MONTH (Conversation's New,
// WP2.4; the deploy-3 rule `loadNewThemes` reads): its month-before cell is
// "·" (the 27 Sep "Aug 0%" ruling) and its flag is New, every row.
//
// THE HEADER IS THE TITLE ALONE AND THE FOOTER A LINK ALONE (25 Sep rulings);
// the column heads carry the month.

export const HEARD_TITLE = 'Heard for the first time'

/** The narrow layout's own width, as the front page's board keys its own
 *  (a container query): the rank and the bar leave, the flag and the makers
 *  tag take a line under their row. Written out for Tailwind's scanner. */
const COLS = 'grid-cols-[minmax(0,1fr)_40px_40px_92px] gap-x-2 @min-[820px]:gap-x-4'
const WIDE = (makers: boolean) => makers
  ? `${COLS} @min-[820px]:grid-cols-[28px_minmax(200px,1.4fr)_minmax(96px,1fr)_56px_56px_72px_96px_minmax(150px,0.7fr)]`
  : `${COLS} @min-[820px]:grid-cols-[28px_minmax(200px,1.4fr)_minmax(96px,1fr)_56px_56px_72px_96px]`
const HIDDEN = '@max-[820px]:hidden'
const OWN_LINE = '@max-[820px]:order-last @max-[820px]:col-span-full'

/** A two-line column head: "Sep" over "videos". */
function Head({ top, under, align = 'right' }: { top: string; under: string; align?: 'left' | 'right' }) {
  return (
    <span className={`flex flex-col leading-[1.35] ${align === 'right' ? 'items-end text-right' : 'items-start'}`}>
      <span className="text-[13px] font-medium text-muted-foreground">{top}</span>
      <span className="whitespace-nowrap font-mono text-[12px] text-muted-foreground">{under}</span>
    </span>
  )
}

const cellOf = (p: HeardTheme['provenance']): string => (p ? fmtInt(p.fromNewSearches) : '·')

/** "1 theme first heard with this update reached 10 videos this month." The
 *  count alone (finish-list item 9): "1 of the 347 themes first heard" read
 *  as noise, and its 347 is every audience's new names, most of them one or
 *  two videos, while the 1 is the category's at the floor, so it was no
 *  base the count sat on. */
export function heardLead(h: HeardBlock, when: string): { level: string | null; rest: string } {
  if (h.regrouped) return { level: null, rest: regroupedLine(h.regrouped) }
  const at = heardAtFloor(h)
  if (h.seen === 0) return { level: null, rest: 'Nothing was heard for the first time with this update.' }
  if (at === 0) {
    return { level: null, rest: `No theme first heard with this update reached ${fmtInt(NEW_THEME_FLOOR)} videos ${when}.` }
  }
  return { level: fmtInt(at), rest: ` ${at === 1 ? 'theme' : 'themes'} first heard with this update reached ${fmtInt(NEW_THEME_FLOOR)} videos ${when}.` }
}

/** "Makers and DIY, grouped: 3 themes, led by handmade craftsmanship (65) and
 *  materials and tools (25)". */
function GroupLine({ words, group, mode, link }: { words: string; group: NonNullable<HeardBlock['makers']>; mode: RenderMode; link: ReactNode }) {
  return (
    <InnerLine mode={mode}>
      {mode === 'email' ? null : <span className="mr-2 inline-flex align-[-1px] text-muted-foreground"><MakerMark /></span>}
      <strong className="font-semibold text-foreground">{words}:</strong>{' '}
      <span data-copy="figure" className="font-mono font-semibold tabular-nums text-foreground">{fmtInt(group.count)}</span>{' '}
      {group.count === 1 ? 'theme' : 'themes'}
      {group.lead.length > 0 ? ', led by ' : ''}
      {group.lead.map((t, i) => (
        <span key={t.registryId}>
          {i > 0 ? ' and ' : ''}
          <span data-copy="subject" data-slot="pass_b_theme">{t.label}</span>{' '}
          (<span data-copy="figure" className="font-mono font-semibold tabular-nums text-foreground">{fmtInt(t.k)}</span>)
        </span>
      ))}
      {link ? <>{' '}{link}</> : null}
    </InnerLine>
  )
}

export function HeardTable({ h, mode }: { h: HeardBlock; mode: RenderMode }) {
  const month = shortMonthName(h.month)
  const prev = shortMonthName(h.prevMonth)
  const makers = h.segments === 'measured'
  const max = Math.max(1, ...h.rows.map((t) => t.k))
  if (mode === 'email') {
    const cell = { fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, padding: '6px 10px 6px 0', borderTop: `1px solid ${EMAIL.hairline}`, verticalAlign: 'top' as const }
    const num = { ...cell, fontFamily: FONT.mono, textAlign: 'right' as const }
    const head = { ...cell, borderTop: 0, color: EMAIL.muted, fontSize: 11 }
    return (
      <table role="presentation" cellPadding={0} cellSpacing={0} style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={{ ...head, textAlign: 'left' }}>Theme</th>
            <th style={{ ...head, textAlign: 'right' }}>Videos</th>
            <th style={{ ...head, textAlign: 'right' }}>From searches added in {month}</th>
          </tr>
        </thead>
        <tbody>
          {h.rows.map((t) => {
            const words = makers ? makerCell(t.makerShare) : null
            return (
              <tr key={t.registryId}>
                <td style={cell}>
                  <span data-copy="subject" data-slot="pass_b_theme">{t.label}</span>
                  {words && words !== MAKERS_NOT_MEASURED ? <div style={{ fontSize: 11.5, color: EMAIL.muted, marginTop: 2 }}>{words}</div> : null}
                </td>
                <td style={num}><span data-copy="figure">{fmtInt(t.k)}</span></td>
                <td style={{ ...num, color: EMAIL.ink2 }}><span data-copy="figure">{cellOf(t.provenance)}</span></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    )
  }
  const cols = WIDE(makers)
  return (
    <div className="@container">
      <div role="table" className="flex min-w-0 flex-col">
        <div role="row" className={`grid ${cols} items-end ${RULE.head}`}>
          <span role="columnheader" className={HIDDEN} />
          <span role="columnheader" className={SCALE.head}>Theme</span>
          <span role="columnheader" className={HIDDEN}>
            <span aria-hidden className="flex items-center gap-4 whitespace-nowrap text-[13px] font-medium text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-4 rounded-[2px] bg-foreground" />{longMonth(h.month)}</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-3.5 w-[2px] rounded-[1px] bg-cat" />{longMonth(h.prevMonth)}</span>
            </span>
          </span>
          <span role="columnheader"><Head top={month} under="videos" /></span>
          <span role="columnheader"><Head top={prev} under="videos" /></span>
          <span role="columnheader" className={HIDDEN} />
          <span role="columnheader"><Head top="From searches" under={`added in ${month}`} /></span>
          {makers ? <span role="columnheader" className={`${HIDDEN} ${SCALE.head}`}>Makers</span> : null}
        </div>
        {h.rows.map((t, i) => {
          const words = makers ? makerCell(t.makerShare) : null
          const unmeasured = words === MAKERS_NOT_MEASURED
          return (
            <div key={t.registryId} role="row" className={`grid ${cols} min-h-11 items-center py-1.5 ${RULE.row}`}>
              <span className={`${HIDDEN} font-mono text-[13px] tabular-nums text-muted-foreground`}>{i + 1}</span>
              <span role="rowheader" className={`min-w-0 [text-wrap:pretty] ${SCALE.row}`}>
                <span data-copy="subject" data-slot="pass_b_theme">{t.label}</span>
              </span>
              <span className={`block ${HIDDEN}`}><LevelBar share={t.k} prevShare={null} axis={max * 1.08} /></span>
              <span className={`${SCALE.num} font-semibold`}><span data-copy="figure">{fmtInt(t.k)}</span></span>
              <span className={SCALE.prev}>·</span>
              <span className={`text-[13px] font-medium text-foreground ${OWN_LINE}`}>New</span>
              <span className={SCALE.prev}><span data-copy="figure">{cellOf(t.provenance)}</span></span>
              {makers ? (
                <span className={`inline-flex min-w-0 items-center gap-2 text-[13px] text-secondary-foreground ${OWN_LINE}`}>
                  {unmeasured ? <span className={SCALE.tag}><span className="@min-[820px]:hidden">makers </span>{words}</span> : words ? <><MakerMark /><span className="truncate">{words}</span></> : null}
                </span>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export const weekHeard: Block<WeekData> = {
  key: 'week.heard',
  title: HEARD_TITLE,
  question: 'Which themes did this update hear for the first time?',

  render(data, mode = 'app', ctx) {
    const h = data.heard ?? null
    const voice = surface('voice')
    const footer = openLink(mode, `${ctx.appUrl}${voice.href}`, `All themes on ${voice.label} →`)
    const empty = weekHeard.emptyState(data)
    if (!h || (empty && h.rows.length === 0 && !h.makers && !h.setAside)) {
      return (
        <BlockFrame title={HEARD_TITLE} mode={mode} footer={footer} roomy card>
          <BlockEmpty mode={mode}>{empty ?? HEARD_UNREAD}</BlockEmpty>
        </BlockFrame>
      )
    }
    const lead = heardLead(h, monthPhrase(h.month, data.readingAt))
    const email = mode === 'email'
    const show = (count: number) => openLink(mode, `${ctx.appUrl}${voice.href}`, `Show the ${fmtInt(count)} →`)
    return (
      <BlockFrame title={HEARD_TITLE} mode={mode} footer={footer} roomy card>
        <div className={email ? undefined : 'flex min-w-0 flex-col gap-6'}>
          <p className={email ? undefined : 'm-0 max-w-[720px] text-[16px] font-semibold leading-[1.55] text-foreground [text-wrap:pretty]'} style={email ? { fontFamily: FONT.sans, fontSize: 14, fontWeight: 600, color: EMAIL.ink, margin: '0 0 8px' } : undefined}>
            {/* "2 themes": a count, marked as code's figure. */}
            {lead.level ? <span data-copy="figure">{lead.level}</span> : null}{lead.rest}
          </p>
          {h.rows.length > 0 ? <HeardTable h={h} mode={mode} /> : null}
          {h.makers || h.setAside ? (
            <div className={email ? undefined : 'flex flex-col gap-2'}>
              {h.makers ? <GroupLine words="Makers and DIY, grouped" group={h.makers} mode={mode} link={mode === 'app' ? show(h.makers.count) : null} /> : null}
              {h.setAside ? <GroupLine words="Set aside as off-topic" group={h.setAside} mode={mode} link={null} /> : null}
            </div>
          ) : null}
        </div>
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    const h = data.heard
    if (!h || h.regrouped) return {}
    const month = longMonth(h.month)
    const out: FigureTable = {}
    for (const t of h.rows) {
      const id = t.registryId.replace(/[^a-z0-9]+/gi, '_').toLowerCase()
      out[`heard_t_${id}_videos`] = { value: t.k, unit: 'videos', label: `${t.label}: videos in ${month}` }
      if (t.provenance) out[`heard_t_${id}_new_searches`] = { value: t.provenance.fromNewSearches, unit: 'videos', label: `${t.label}: videos from searches added in ${month}` }
    }
    return out
  },

  emptyState(data) {
    const h = data.heard
    if (!h) return HEARD_UNREAD
    if (h.regrouped) return regroupedLine(h.regrouped)
    if (heardAtFloor(h) === 0) return heardLead(h, monthPhrase(h.month, data.readingAt)).rest
    return null
  },
}

/** A copy stored before WP3.7, or a read that failed: said, never a zero. */
export const HEARD_UNREAD = 'The themes this update heard for the first time are not counted here yet.'
