/* eslint-disable @next/next/no-img-element -- an email carries a plain <img>, never next/image */
import type { ReactNode } from 'react'
import type { BlockContext, RenderMode } from '@/lib/blocks/types'
import { CalendarLine } from '@/components/charts/calendar-line'
import type { CalendarBand, CalendarRule, CalendarSeries } from '@/lib/charts/calendar'
import { STATE_SHORT } from '@/lib/charts/calendar'
import { monthName } from '@/lib/format'
import { EMAIL, FONT, tokenHex } from '@/lib/email/theme'

// The calendar line, in three modes (Phase 1 WP10). See components/blocks/frame.tsx.

/**
 * The month-by-month line: an SVG on screen and on paper, a PICTURE or a TABLE
 * in an email.
 *
 * WHY AN EMAIL DOES NOT GET THE SVG. Inline SVG is dropped by Outlook and by
 * several webmail clients, and a chart that renders as nothing is worse than no
 * chart — the section would look broken rather than absent. So the runner
 * renders this block's key as a PNG in the PDF's browser session and attaches
 * it inline (`EMAIL_IMAGE_TILES`, lib/email/digest.tsx, lib/schedules/run.ts),
 * and `ctx.image(key)` hands back the `cid:` URL.
 *
 * AND WHEN IT RENDERED NONE, THE BLOCK SAYS IT IN WORDS. A missing image falls
 * back to a small table of the months and their readings — the same numbers the
 * line draws, in the one layout every client renders. That is the house rule
 * for an email tile with nothing to show (lib/renderables/types.ts: "a tile that
 * HAS one may return null … a tile with something honest to say when empty
 * should say it"), applied to a chart: the reading exists, only the picture is
 * missing, so the reading is what gets printed.
 *
 * The table carries the last `emailMonths` months, newest last, with a month
 * that is not a reading printed as its own word rather than as a blank — an
 * empty cell in an email is indistinguishable from a rendering failure.
 */
export function BlockCalendar({
  blockKey, axis, series, rules = [], bands = [], format = (v) => `${v}`,
  caption, label, mode = 'app', ctx, emailMonths = 6, height,
}: {
  /** The block's own key — what the runner rendered the PNG under. */
  blockKey: string
  axis: readonly string[]
  series: readonly CalendarSeries[]
  rules?: readonly CalendarRule[]
  bands?: readonly CalendarBand[]
  format?: (v: number) => string
  caption?: ReactNode
  label?: string
  mode?: RenderMode
  /** Required in email mode — it is where the image comes from. */
  ctx?: BlockContext
  emailMonths?: number
  height?: number
}) {
  if (!axis.length || !series.length) return null

  if (mode !== 'email') {
    return (
      <CalendarLine
        axis={axis}
        series={series}
        rules={rules}
        bands={bands}
        format={format}
        caption={caption}
        label={label}
        height={height}
        id={`k${blockKey.replace(/[^a-zA-Z0-9]/g, '')}`}
      />
    )
  }

  const src = ctx?.image(blockKey) ?? null
  const alt = label ?? `${series.map((s) => s.label).join(' vs ')}, month by month`
  if (src) {
    return (
      <div>
        <img src={src} alt={alt} width={544} style={{ display: 'block', width: '100%', maxWidth: 544, border: 0 }} />
        {caption ? <div style={{ fontFamily: FONT.mono, fontSize: 10.5, color: EMAIL.muted, marginTop: 6 }}>{caption}</div> : null}
      </div>
    )
  }

  const months = axis.slice(-emailMonths)
  return (
    <table width="100%" role="presentation" cellPadding={0} cellSpacing={0} border={0} style={{ borderCollapse: 'collapse', borderSpacing: 0 }}>
      <tbody>
        <tr>
          <td style={{ fontFamily: FONT.sans, fontSize: 11, fontWeight: 600, color: EMAIL.muted, padding: '0 8px 4px 0' }} />
          {months.map((m) => (
            <td key={m} align="right" style={{ fontFamily: FONT.mono, fontSize: 11, color: EMAIL.faint, padding: '0 0 4px 10px', whiteSpace: 'nowrap' }}>
              {monthName(m).split(' ')[0]}
            </td>
          ))}
        </tr>
        {series.map((s) => {
          const byMonth = new Map(s.points.map((p) => [p.month, p]))
          return (
            <tr key={s.label}>
              <td style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, padding: '3px 8px 3px 0', whiteSpace: 'nowrap', borderTop: `1px solid ${EMAIL.hairline}` }}>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 9999, background: tokenHex(s.color), marginRight: 6 }} />
                {s.label}
              </td>
              {months.map((m) => {
                const point = byMonth.get(m)
                const value = point?.value
                return (
                  <td key={m} align="right" style={{ fontFamily: FONT.mono, fontSize: 11.5, fontWeight: value != null ? 600 : 400, color: value != null ? EMAIL.ink : EMAIL.faint, padding: '3px 0 3px 10px', whiteSpace: 'nowrap', borderTop: `1px solid ${EMAIL.hairline}` }}>
                    {value != null ? <span data-copy="figure">{format(value)}</span> : (point ? STATE_SHORT[point.state] || '—' : '—')}
                  </td>
                )
              })}
            </tr>
          )
        })}
        {caption ? (
          <tr>
            <td colSpan={months.length + 1} style={{ fontFamily: FONT.mono, fontSize: 10.5, color: EMAIL.muted, paddingTop: 6 }}>{caption}</td>
          </tr>
        ) : null}
      </tbody>
    </table>
  )
}
