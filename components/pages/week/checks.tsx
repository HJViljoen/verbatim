import type { ReactNode } from 'react'
import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockFrame } from '@/components/blocks/frame'
import { BlockQuote } from '@/components/blocks/quote'
import { openLink } from '@/components/blocks/open-link'
import { WHAT_WE_CHANGED_HREF } from '@/components/pages/overview/change'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, longMonth, platformLabel, shortDate } from '@/lib/format'
import type { UnusualBlock, WeekData } from '@/lib/pages/week'
import type { FigureTable } from '@/lib/reading/verdicts'

// "Checks on this update" (market-first WP3.7, `week.checks`, a new stored
// key; the approved preview's This week, its last tile): the three checks that
// answer "is anything off?" side by side, each in a line:
//
//   · Moving now: not drawn at all while its months are refused (decision D,
//     §2.7; T0a: a refused comparison is not shown and not explained);
//   · Unusual this week: the check's own state, and its baseline on
//     comparable months only (WP3.4's rule): how many of three it holds, and
//     the first month its flags can print if nothing we search changes;
//   · Flagged for awareness: claims about this space that do not hold up,
//     quoted, never with a reply link.
//
// It replaces three tiles ("Moving now", "Unusual this week", "Flagged for
// awareness") on the page; their keys stay registered for a stored export.
// THE HEADER IS THE TITLE ALONE AND THE FOOTER A LINK ALONE (25 Sep rulings).

export const CHECKS_TITLE = 'Checks on this update'

/** The unusual-week check's one line, by state. */
export function unusualLine(u: UnusualBlock): string {
  switch (u.state) {
    case 'baseline_forming':
      return 'Not checked with this update: the baseline is forming.'
    case 'not_checked':
      return u.baseline && !u.baseline.ready ? 'Not checked with this update: the baseline is forming.' : (u.note ?? 'Not checked with this update.')
    case 'nothing_unusual':
      return 'Nothing was unusual with this update.'
    case 'flagged':
      return u.flags.length === 1 ? 'One thing was unusual with this update.' : `${fmtInt(Math.max(u.flags.length, u.flaggedCount))} things were unusual with this update.`
    case 'refused':
      return u.note ?? 'Not compared with this update.'
    case 'unreadable':
      return u.note ?? 'The check could not be read with this update.'
  }
}

/** The baseline meter: how many of the months it needs it holds, and when its
 *  flags can first print. The comparable-months count where the page read it,
 *  the check's own count otherwise. Null where it is ready or unknown. */
export function baselineMeter(u: UnusualBlock): { kept: number; required: number; from: string | null } | null {
  if (u.state === 'flagged' || u.state === 'nothing_unusual') return null
  if (u.comparable) {
    if (u.comparable.kept >= u.comparable.required) return null
    return { kept: u.comparable.kept, required: u.comparable.required, from: u.comparable.flagsFrom }
  }
  if (u.baseline && !u.baseline.ready) return { kept: u.baseline.monthsClearing, required: u.baseline.required, from: u.startsWith }
  return null
}

function Column({ title, children, mode }: { title: string; children: ReactNode; mode: RenderMode }) {
  if (mode === 'email') {
    return (
      <div style={{ marginTop: 12 }}>
        <div style={{ fontFamily: FONT.sans, fontSize: 14, fontWeight: 600, color: EMAIL.ink }}>{title}</div>
        <div style={{ fontFamily: FONT.sans, fontSize: 13.5, lineHeight: '21px', color: EMAIL.ink2, marginTop: 4 }}>{children}</div>
      </div>
    )
  }
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <h3 className="m-0 text-[15px] font-semibold text-foreground">{title}</h3>
      <div className="flex min-w-0 flex-col gap-3 text-[15px] leading-[1.55] text-secondary-foreground">{children}</div>
    </div>
  )
}

function Meter({ m, mode }: { m: NonNullable<ReturnType<typeof baselineMeter>>; mode: RenderMode }) {
  const label = `${fmtInt(m.kept)} of ${fmtInt(m.required)} months`
  const from = m.from ? `flags from ${longMonth(m.from)}` : null
  if (mode === 'email') {
    return <div style={{ fontFamily: FONT.mono, fontSize: 12, color: EMAIL.muted, marginTop: 4 }}><span data-copy="level">{label}</span>{from ? ` · ${from}` : ''}</div>
  }
  return (
    <div className="flex max-w-[330px] flex-col gap-2">
      <span aria-hidden className="grid grid-cols-3 gap-1">
        {Array.from({ length: m.required }, (_, i) => (
          <span key={i} className={`h-1.5 rounded-[2px] ${i < m.kept ? 'bg-secondary-foreground' : 'bg-border'}`} />
        ))}
      </span>
      <span className="flex items-baseline justify-between gap-4 font-mono text-[12px] text-muted-foreground">
        <span data-copy="level">{label}</span>
        {from ? <span>{from}</span> : null}
      </span>
    </div>
  )
}

export const weekChecks: Block<WeekData> = {
  key: 'week.checks',
  title: CHECKS_TITLE,
  question: 'Is anything in this update off?',

  render(data, mode = 'app', ctx) {
    const footer = openLink(mode, `${ctx.appUrl}${WHAT_WE_CHANGED_HREF}`, 'What we changed, and when →')
    const rising = data.rising
    const u = data.unusual
    const meter = baselineMeter(u)
    const flagged = data.replies.flagged
    // A REFUSED PAIR IS NOT SHOWN AND NOT EXPLAINED (T0a; the one
    // condition): where the months are not compared there is no "Moving now"
    // column at all, and no chip saying why.
    const moving: ReactNode = rising.chip
      ? null
      : rising.rows.length > 0
        ? (
          <ul className={mode === 'email' ? undefined : 'm-0 flex list-none flex-col gap-1 p-0'} style={mode === 'email' ? { margin: 0, paddingLeft: 16 } : undefined}>
            {rising.rows.map((r) => (
              <li key={r.id}><span data-copy="subject" data-slot="pass_b_theme">{r.label}</span> · <span data-copy="level">{fmtInt(r.month.k)} of {fmtInt(r.month.n)}</span></li>
            ))}
          </ul>
        )
        : <span>{rising.unread ?? `Nothing moved clearly in ${longMonth(rising.month)}.`}</span>
    const awareness: ReactNode = data.replies.unread
      ? <span>{data.replies.unread}</span>
      : flagged.length === 0
        ? <span>Nothing in these days was flagged as a claim about this space that does not hold up.</span>
        : flagged.map((row) => (
          <div key={row.id}>
            <BlockQuote quote={row.quote} cite={<>{platformLabel(row.platform)}{row.date ? ` · ${shortDate(row.date)}` : ''}</>} mode={mode} />
          </div>
        ))
    const unusual = (
      <>
        <span>{unusualLine(u)}</span>
        {u.state === 'flagged' && u.flags.length > 0 ? (
          <ul className={mode === 'email' ? undefined : 'm-0 flex list-none flex-col gap-1 p-0'} style={mode === 'email' ? { margin: 0, paddingLeft: 16 } : undefined}>
            {u.flags.map((f) => <li key={`${f.objectKind}:${f.objectId}`}>{f.label} · <span data-copy="level">{fmtInt(f.week.k)} of {fmtInt(f.week.n)}</span></li>)}
          </ul>
        ) : null}
        {meter ? <Meter m={meter} mode={mode} /> : null}
      </>
    )
    return (
      <BlockFrame title={CHECKS_TITLE} mode={mode} footer={footer} roomy card>
        {mode === 'email' ? (
          <div>
            {moving ? <Column title="Moving now" mode={mode}>{moving}</Column> : null}
            <Column title="Unusual this week" mode={mode}>{unusual}</Column>
            <Column title="Flagged for awareness" mode={mode}>{awareness}</Column>
          </div>
        ) : (
          <div className={`grid grid-cols-1 gap-x-12 gap-y-8 ${moving ? 'xl:grid-cols-3' : 'xl:grid-cols-2'}`} data-print-cols={moving ? '3' : '2'}>
            {moving ? <Column title="Moving now" mode={mode}>{moving}</Column> : null}
            <Column title="Unusual this week" mode={mode}>{unusual}</Column>
            <Column title="Flagged for awareness" mode={mode}>{awareness}</Column>
          </div>
        )}
      </BlockFrame>
    )
  },

  figures(): FigureTable {
    // Months and a state, no reading of the conversation: nothing to declare.
    return {}
  },

  quotes(data) {
    return data.replies.flagged.map((r) => r.quote.ref)
  },

  emptyState() {
    return null
  },
}
