import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { overviewChange } from '@/components/pages/overview/change'
import type { RenderMode } from '@/lib/blocks/types'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, longMonth, shortDate } from '@/lib/format'
import { changeLead, type ChangeBlock, type LedgerLine } from '@/lib/pages/overview-market'
import { proseFigures } from '@/lib/prose/figures'
import { substituteFigures } from '@/lib/reports/cover'
import type { FigureTable } from '@/lib/reading/verdicts'
import { Inner, SubHead } from './email'
import { redress, type WeeklyBlock } from './section'

// WR6 · What changed, and what is ours (market-first WP3.7, plan §2.9; the
// approved preview's WeeklyReport): the front page's refusal sentence through
// the front page's own function (`changeLead`, WP1.8's one figure), the dated
// list of our changes made in the reading month (Settings › What we changed's
// own lines, each with how much of the month it brought in), and the first
// pair read the same way. No "How sound is this reading?" (25 Sep rulings),
// no footer (the preview draws none on this card).

export const WEEKLY_CHANGE_TITLE = overviewChange.title

/** The front page's refusal sentence: its clause before the colon in ink at
 *  600, its figures in mono; the words untouched. */
function Lead({ body, figures, email }: { body: string; figures: FigureTable; email: boolean }) {
  const words = (text: string) =>
    substituteFigures(text, proseFigures(figures)).map((p, i) =>
      'text' in p
        ? <span key={i}>{p.text}</span>
        : <span key={i} data-copy="figure" className={email ? undefined : 'font-mono font-semibold tabular-nums text-foreground'} style={email ? { fontFamily: FONT.mono, fontWeight: 600, color: EMAIL.ink, fontVariantNumeric: 'tabular-nums' } : undefined}>{p.figure}</span>,
    )
  const cut = body.indexOf(': ')
  const bold = cut > 0 && !body.slice(0, cut).includes('[[')
  return bold
    ? <><strong style={email ? { fontWeight: 600, color: EMAIL.ink } : undefined} className={email ? undefined : 'font-semibold text-foreground'}>{body.slice(0, cut + 1)}</strong> {words(body.slice(cut + 2))}</>
    : <>{words(body)}</>
}

/** The changes that bring videos in, because they add what we search: the
 *  only ones a video can have "come from" (the preview draws the clause on
 *  search changes alone). A relevance, filing or marking change's reach is
 *  Settings › What we changed's figure, never "came from" (WP3.7 check). */
const BRINGS_VIDEOS_IN: readonly LedgerLine['surface'][] = ['terms', 'subreddits', 'rivals', 'handles']

/** "182 of September's 654 videos came from them" where the change adds what
 *  we search and its reach in the month was measured and touched any. One
 *  denominator. */
function reachClause(line: LedgerLine, month: string): string | null {
  if (!BRINGS_VIDEOS_IN.includes(line.surface)) return null
  const m = (line.months ?? []).find((x) => x.month === month) ?? (line.reach?.month === month ? line.reach : null)
  if (!m || !(m.touched > 0)) return null
  return `${fmtInt(m.touched)} of ${longMonth(month)}’s ${fmtInt(m.of)} videos came from ${m.touched === 1 ? 'it' : 'them'}`
}

/** The dated list by day, oldest first, as the approved preview draws it: one
 *  row a day, the day's changes in one line ("5 search terms added; 9
 *  exclusions added: 33 of September's 654 videos came from them; 4 rivals
 *  added"), each change's own reach after its words. */
export function changeDays(lines: readonly LedgerLine[], month: string): { day: string; parts: { words: string; reach: string | null }[] }[] {
  const byDay = new Map<string, { words: string; reach: string | null }[]>()
  const ordered = [...lines].sort((a, b) => Date.parse(a.date) - Date.parse(b.date) || a.changeId.localeCompare(b.changeId))
  for (const l of ordered) {
    const day = l.date.slice(0, 10)
    const list = byDay.get(day) ?? []
    const words = l.words.replace(/\.$/, '')
    list.push({ words: list.length === 0 ? words : `${words.charAt(0).toLowerCase()}${words.slice(1)}`, reach: reachClause(l, month) })
    byDay.set(day, list)
  }
  return [...byDay.entries()].map(([day, parts]) => ({ day, parts }))
}

function DayWords({ parts }: { parts: readonly { words: string; reach: string | null }[] }) {
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>{i > 0 ? '; ' : ''}{p.words}{p.reach ? <>: <span data-copy="figure">{p.reach}</span></> : null}</span>
      ))}
    </>
  )
}

/** "The first comparison read the same way: October against November, from
 *  the 6 Dec update, if nothing we search changes." */
function nextWords(block: ChangeBlock): string | null {
  if (!block.next || block.paused) return null
  return `${longMonth(block.next.prevMonth)} against ${longMonth(block.next.month)}, from the ${shortDate(block.next.sameAgeFrom)} update, if nothing we search changes.`
}

function Changes({ lines, month, mode }: { lines: readonly LedgerLine[]; month: string; mode: RenderMode }) {
  if (lines.length === 0) return null
  const title = `What we changed in ${longMonth(month)}`
  if (mode === 'email') {
    return (
      <>
        <SubHead marginTop={28}>{title}</SubHead>
        <table role="presentation" cellPadding={0} cellSpacing={0} style={{ borderCollapse: 'collapse', width: '100%', marginTop: 8 }}>
          <tbody>
            {changeDays(lines, month).map((d) => (
              <tr key={d.day}>
                <td style={{ width: 64, padding: '11px 12px 11px 0', borderTop: `1px solid ${EMAIL.hairline}`, verticalAlign: 'top', fontFamily: FONT.mono, fontSize: 13, lineHeight: '22px', fontWeight: 600, color: EMAIL.ink, whiteSpace: 'nowrap' }}>{shortDate(d.day)}</td>
                <td style={{ padding: '11px 0', borderTop: `1px solid ${EMAIL.hairline}`, verticalAlign: 'top', fontFamily: FONT.sans, fontSize: 15, lineHeight: '22px', color: EMAIL.ink2 }}>
                  <DayWords parts={d.parts} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    )
  }
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h3 className="m-0 text-[15px] font-semibold text-foreground">{title}</h3>
      <div role="table" className="flex min-w-0 flex-col">
        {changeDays(lines, month).map((d) => (
          <div key={d.day} role="row" className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-4 border-t border-border/60 py-3">
            <span className="font-mono text-[13px] font-semibold text-foreground">{shortDate(d.day)}</span>
            <span className="text-[15px] leading-[1.5] text-secondary-foreground"><DayWords parts={d.parts} /></span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Next({ block, mode }: { block: ChangeBlock; mode: RenderMode }) {
  const words = nextWords(block)
  if (!words) return null
  const head = 'The first comparison read the same way:'
  if (mode === 'email') {
    return <Inner marginTop={28}><div style={{ fontFamily: FONT.sans, fontSize: 15, lineHeight: '24px', color: EMAIL.ink2 }}><span style={{ fontWeight: 600, color: EMAIL.ink }}>{head}</span> {words}</div></Inner>
  }
  return null
}

export const weeklyChange: WeeklyBlock = {
  key: 'weekly.change',
  title: WEEKLY_CHANGE_TITLE,

  render(data, mode = 'app', ctx) {
    const block = data.overview.change ?? null
    const empty = weeklyChange.emptyState(data)
    const lines = data.changes ?? []
    if (mode === 'email') {
      const lead = block ? changeLead(block) : null
      return (
        <BlockFrame title={WEEKLY_CHANGE_TITLE} mode={mode} card>
          {empty || !block ? <BlockEmpty mode={mode}>{empty}</BlockEmpty> : (
            <>
              {lead ? <div style={{ fontFamily: FONT.sans, fontSize: 16, lineHeight: '24px', color: EMAIL.ink2 }}><Lead body={lead.body} figures={lead.figures} email /></div> : null}
              <Changes lines={lines} month={data.month} mode={mode} />
              <Next block={block} mode={mode} />
            </>
          )}
        </BlockFrame>
      )
    }
    return redress(overviewChange.render(data.overview, mode, ctx), { title: WEEKLY_CHANGE_TITLE, mode, footer: undefined, extra: <Changes lines={lines} month={data.month} mode={mode} /> })
  },

  figures(data): FigureTable {
    return overviewChange.figures?.(data.overview) ?? {}
  },

  emptyState(data) {
    return overviewChange.emptyState(data.overview)
  },
}

export { reachClause, nextWords }
