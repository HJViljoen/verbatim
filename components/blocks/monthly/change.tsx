import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { BlockFrame } from '@/components/blocks/frame'
import { overviewChange, WHAT_WE_CHANGED_HREF } from '@/components/pages/overview/change'
import { shortMonthName } from '@/components/pages/overview/market'
import { substituteFigures } from '@/lib/reports/cover'
import { proseFigures } from '@/lib/prose/figures'
import { EMAIL, FONT } from '@/lib/email/theme'
import { shortDate } from '@/lib/format'
import { changeLead, searchChangesLine, type ChangeBlock, type CheckLine } from '@/lib/pages/overview-market'
import { isFilled } from '@/lib/reports/monthly-slots'
import type { FigureTable } from '@/lib/reading/verdicts'
import { T, presentation } from './email-table'
import { sectionFooter, type MonthlyBlock } from './adapt'
import { Inner } from './email'

/**
 * 9 · What changed, and what is ours (market-first WP2.1; the front page's
 * block 10, plan §2.2).
 *
 * THE REFUSAL IS THE FRONT PAGE'S SENTENCE, THROUGH THE FRONT PAGE'S FUNCTION.
 * `changeLead` composes the block's first line, and where a measured pair row
 * refuses on what we search it is `measuredSearchSentence`: "Not a change we
 * can stand behind yet: {measured} of September's videos came from searches
 * we added in September (read with the {date} update)", WP1.8's one figure.
 * The monthly calls it and never words it itself, so the figure and its words
 * change in one place (lib/pages/overview-market/change.ts).
 *
 * THE RE-CHECK IS WP2.3's SLOT. Until WP2.3 fills it, the section prints the
 * refusal and the first pair read the same way, and nothing where the
 * re-check will go (plan WP2.1, "Depends on": the refusal only). The footer is
 * the link to the dated list of our changes, never a note (25 Sep rulings).
 */

export const MONTHLY_CHANGE_TITLE = overviewChange.title

/** The lead sentence, its clause before the colon in ink at 600 (the
 *  preview's bold lead-in), its figures in mono. The words are untouched. */
function Lead({ body, figures }: { body: string; figures: FigureTable }) {
  const words = (text: string) =>
    substituteFigures(text, proseFigures(figures)).map((p, i) =>
      'text' in p
        ? <span key={i}>{p.text}</span>
        : <span key={i} data-copy="figure" style={{ fontFamily: FONT.mono, fontWeight: 600, color: EMAIL.ink, fontVariantNumeric: 'tabular-nums' }}>{p.figure}</span>,
    )
  const cut = body.indexOf(': ')
  const bold = cut > 0 && !body.slice(0, cut).includes('[[')
  return (
    <div style={{ fontFamily: FONT.sans, fontSize: 16, lineHeight: '24px', color: EMAIL.ink2 }}>
      {bold ? <><span style={{ fontWeight: 600, color: EMAIL.ink }}>{body.slice(0, cut + 1)}</span> {words(body.slice(cut + 2))}</> : words(body)}
    </div>
  )
}

/** WP2.3's check lines, once its slot is filled: each outcome sentence as
 *  code wrote it, under "Re-checked" and its "provisional" tag. */
function Checks({ checks, mode }: { checks: readonly CheckLine[]; mode: 'app' | 'print' | 'email' }) {
  if (checks.length === 0) return null
  if (mode === 'email') {
    return (
      <Inner>
        <div style={{ fontFamily: FONT.sans, fontSize: 15, lineHeight: '22px', fontWeight: 600, color: EMAIL.ink }}>
          Re-checked&nbsp;&nbsp;<span style={{ fontFamily: FONT.mono, fontSize: 12, fontWeight: 400, color: EMAIL.muted }}>provisional</span>
        </div>
        {checks.map((c) => (
          <div key={`${c.objectKind}:${c.objectId}:${c.population}`} style={{ fontFamily: FONT.sans, fontSize: 15, lineHeight: '24px', color: EMAIL.ink2, marginTop: 8 }}>{c.sentence}</div>
        ))}
      </Inner>
    )
  }
  return (
    <div className="flex flex-col gap-2 rounded-md bg-inner p-6">
      <p className="m-0 text-[15px] font-semibold">Re-checked <span className="ml-1.5 font-mono text-[12px] font-normal text-muted-foreground">provisional</span></p>
      {checks.map((c) => (
        <p key={`${c.objectKind}:${c.objectId}:${c.population}`} className="m-0 max-w-[76ch] text-[15px] leading-[1.6] text-secondary-foreground">{c.sentence}</p>
      ))}
    </div>
  )
}

/** One month's cell on the pair strip. */
function MonthCell({ month }: { month: string }) {
  return (
    <td style={{ width: '48%', padding: '12px 16px', borderRadius: 6, background: EMAIL.inner, fontFamily: FONT.sans, fontSize: 15, lineHeight: '22px', fontWeight: 600, color: EMAIL.ink }}>
      {shortMonthName(month)}
    </td>
  )
}

function PairColumn({ title, rule, months, foot }: { title: string; rule: string; months: [string, string]; foot: string | null }) {
  return (
    <td className="vb-m-col" style={{ width: '50%', verticalAlign: 'top', paddingRight: 12 }}>
      <div style={{ fontFamily: FONT.sans, fontSize: 13, lineHeight: '18px', fontWeight: 600, color: EMAIL.ink2 }}>{title}</div>
      <div style={{ height: 2, marginTop: 8, borderRadius: 1, background: rule, fontSize: 0, lineHeight: 0 }}>&nbsp;</div>
      <table width="100%" {...presentation} style={{ ...T, borderCollapse: 'separate', marginTop: 8 }}>
        <tbody><tr><MonthCell month={months[0]} /><td style={{ width: 8, fontSize: 0, lineHeight: 0 }}>&nbsp;</td><MonthCell month={months[1]} /></tr></tbody>
      </table>
      {foot ? <div style={{ marginTop: 8, fontFamily: FONT.sans, fontSize: 13, lineHeight: '20px', color: EMAIL.muted }}>{foot}</div> : null}
    </td>
  )
}

/** The two pairs, as the email artboard draws them: the pair this section
 *  reads, not read as a change, with our search-change days under it; and the
 *  first pair read the same way, with the update it is read from. */
function Pairs({ block }: { block: ChangeBlock }) {
  const refused = block.pair && block.pair.mode !== 'comparable' && block.prevMonth
  const next = block.next && !block.paused ? block.next : null
  if (!refused && !next) return null
  const key = searchChangesLine(block.searchChanges ?? [])
  return (
    <table width="100%" {...presentation} style={{ ...T, marginTop: 32 }}>
      <tbody>
        <tr>
          {refused && block.prevMonth ? (
            <PairColumn
              title="Not read as a change"
              rule={EMAIL.neutralSeg}
              months={[block.prevMonth, block.month]}
              foot={key ? `${key.charAt(0).toUpperCase()}${key.slice(1)}` : null}
            />
          ) : null}
          {next ? (
            <PairColumn
              title="The first comparison read the same way"
              rule={EMAIL.ink}
              months={[next.prevMonth, next.month]}
              foot={`From the ${shortDate(next.sameAgeFrom)} update, if nothing we search changes`}
            />
          ) : null}
        </tr>
      </tbody>
    </table>
  )
}

function changeEmail(block: ChangeBlock, checks: readonly CheckLine[] | null): ReactNode {
  const lead = changeLead(block)
  return (
    <>
      {lead ? <Lead body={lead.body} figures={lead.figures} /> : null}
      {checks ? <Checks checks={checks} mode="email" /> : null}
      <Pairs block={block} />
    </>
  )
}

export const monthlyChange: MonthlyBlock = {
  key: 'monthly.change',
  title: MONTHLY_CHANGE_TITLE,
  ...(overviewChange.question ? { question: overviewChange.question } : {}),

  render(data, mode, ctx) {
    const footer = sectionFooter(mode, ctx, { href: WHAT_WE_CHANGED_HREF, label: 'What we changed, and when →' })
    const slot = data.slots?.change
    const checks = isFilled(slot) ? slot.value.checks : null
    const block = data.overview.change ?? null
    const empty = monthlyChange.emptyState(data)
    if (mode === 'email' && block && !empty) {
      return <BlockFrame title={MONTHLY_CHANGE_TITLE} mode={mode} card footer={footer}>{changeEmail(block, checks)}</BlockFrame>
    }
    const el = overviewChange.render(data.overview, mode, ctx)
    const props = { title: MONTHLY_CHANGE_TITLE, footer, ...(mode === 'email' ? { card: true } : {}) }
    if (!isValidElement(el) || el.type !== BlockFrame) return <BlockFrame mode={mode} {...props}>{el}</BlockFrame>
    const frame = el as ReactElement<{ children?: ReactNode; title?: string; footer?: ReactNode; card?: boolean }>
    // WP2.3's lines follow the refusal and the first pair, inside the page's
    // own frame, once its slot is filled.
    const children = checks && checks.length > 0 && mode !== 'email'
      ? <>{frame.props.children}<Checks checks={checks} mode={mode} /></>
      : frame.props.children
    return cloneElement(frame, props, children)
  },

  figures(data) {
    return overviewChange.figures?.(data.overview) ?? {}
  },

  emptyState(data) {
    return overviewChange.emptyState(data.overview)
  },
}

