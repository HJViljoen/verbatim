import Link from 'next/link'
import type { ReactNode } from 'react'
import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockCalendar } from '@/components/blocks/calendar'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BlockMovement } from '@/components/blocks/movement'
import { BlockProportion } from '@/components/blocks/bars'
import { BlockQuotes } from '@/components/blocks/quote'
import { BlockStat } from '@/components/blocks/stat'
import { DirectionWord } from '@/components/pages/overview/subjects'
import type { CalendarSeries } from '@/lib/charts/calendar'
import { PREVALENCE_LABEL } from '@/lib/calibration'
import { fmtInt, fmtPct } from '@/lib/format'
import { EMAIL, FONT } from '@/lib/email/theme'
import type { QuoteRef } from '@/lib/blocks/types'
import type { FigureTable, Verdict } from '@/lib/reading/verdicts'
import type { SpokenLine, ThemeBlock, VoiceSurfaceData } from '@/lib/pages/voice-surface'
import { heardLine } from '@/lib/pages/voice-surface'

// VO3 · A theme, in full (design §3 VO3).
//
// THE STRONGEST EVIDENCE CHAIN IN THE PRODUCT, and this block's job is to keep
// every link of it visible: the share with the count it rests on, the months it
// was read in on a dated calendar line, the tone of the audience around it, six
// voices in the words they were written in, the speech and the on-screen text
// behind the strongest of them, and what was counted but may not be quoted.
//
// WHAT WE CONCLUDED IS A LINK (decision Q). The mock draws Market's conclusion
// list at the foot of this page too. Two lists of conclusions is two lists, so
// MK1 owns it and this block carries the reader there with the theme selected.
//
// THE TONE LINE IS THE AUDIENCE'S, AND THE HEADING SAYS SO. Sentiment is judged
// per video and stored per audience-month; there is no per-theme sentiment row,
// and attributing the category's distribution to a theme that occupies 9% of it
// would be a number about the category wearing a theme's name. The mock's own
// caption is "Tone · category, all judged videos".

const MOOD_COLOR: Record<string, string> = {
  positive: 'var(--positive)',
  mixed: 'var(--mixed)',
  neutral: 'var(--neutral-seg)',
  negative: 'var(--negative)',
}

/** One line of the block, with its own heading — so a line that is absent is
 *  visibly absent rather than silently missing. */
function Line({ label, mode, children }: { label: string; mode: RenderMode; children: ReactNode }) {
  if (mode === 'email') {
    return (
      <div style={{ paddingTop: 8 }}>
        <div style={{ fontFamily: FONT.sans, fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.6px', color: EMAIL.muted }}>{label}</div>
        <div style={{ marginTop: 2 }}>{children}</div>
      </div>
    )
  }
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

/** The spoken line or the on-screen text, with where it came from. */
function Said({ line, label, mode }: { line: SpokenLine; label: string; mode: RenderMode }) {
  const cite = (
    <span className={mode === 'email' ? undefined : 'text-[11px] text-muted-foreground'} style={mode === 'email' ? { fontFamily: FONT.sans, fontSize: 11, color: EMAIL.muted } : undefined}>
      {line.cite}
    </span>
  )
  const body = (
    <>
      <span className={mode === 'email' ? undefined : 'text-[12.5px]'} style={mode === 'email' ? { fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink } : undefined}>
        “{line.text}”
      </span>{' '}
      {/* A DEAD LINK IS WORSE THAN NO LINK. A video with no public URL prints
          its provenance as words and is not wrapped in an anchor. */}
      {line.href && mode !== 'email'
        ? <a href={line.href} className="underline-offset-2 hover:underline" rel="noreferrer noopener" target="_blank">{cite}</a>
        : cite}
    </>
  )
  return <Line label={label} mode={mode}>{body}</Line>
}

/** The theme's own monthly line — the share of this audience's videos, month by
 *  month, on a generated calendar so a month with no reading keeps its slot. */
function themeSeries(t: ThemeBlock): CalendarSeries | null {
  const points = t.points.filter((p) => t.axis.includes(p.month))
  if (points.length === 0) return null
  return {
    // THE CHART'S LABEL IS SHORTENED, THE BLOCK'S IS NOT. `CalendarLine` draws
    // the series name at the right-hand end of the line, outside the plot area
    // — so a long theme label runs off the tile. Össur's "Admiration for
    // personal resilience" did, in the production render. The full label is
    // the heading two lines above; this one only has to identify the line.
    label: t.label.length > 28 ? `${t.label.slice(0, 27).trimEnd()}…` : t.label,
    color: 'var(--cat)',
    endNote: t.n != null ? `of ${fmtInt(t.n)}` : undefined,
    points: points.map((p) => ({
      month: p.month,
      value: p.pct,
      // A month with no reading is `hollow`, which is the chart's own token
      // for "we have no numerator here" — never a zero, and never dropped:
      // the axis is a calendar and a missing month keeps its slot or the line
      // closes the gap and misdates everything after it.
      state: p.pct == null ? ('hollow' as const) : p.status === 'filling' ? ('filling' as const) : ('read' as const),
      k: p.k,
      n: p.videos,
    })),
  }
}

export const voiceTheme: Block<VoiceSurfaceData> = {
  key: 'voice.theme',
  title: 'A theme, in full',
  question: 'What exactly is being said, and how do we know?',

  render(data, mode = 'app', ctx) {
    const t = data.theme
    const email = mode === 'email'
    const empty = voiceTheme.emptyState(data)
    const search = t.search

    const searchBox = email ? null : (
      <form action="/dashboard/voice" method="get" className="flex flex-wrap items-center gap-1.5">
        {/* The reader's whole selection travels with the search, so a result
            opens in the same audience and horizon they were reading in. */}
        {Object.entries(data.params)
          .filter(([key, value]) => key !== 'q' && key !== 'theme' && Boolean(value))
          .map(([key, value]) => <input key={key} type="hidden" name={key} value={value as string} />)}
        <label htmlFor="voice-theme-search" className="text-[11.5px] text-muted-foreground">Have we seen this before?</label>
        <input
          id="voice-theme-search"
          name="q"
          defaultValue={search.q}
          placeholder="search every theme ever named"
          className="min-w-0 flex-1 rounded border border-border/70 bg-transparent px-2 py-0.5 text-[12px]"
        />
      </form>
    )

    if (empty) {
      return (
        <BlockFrame title={voiceTheme.title} question={voiceTheme.question} mode={mode}>
          <BlockEmpty mode={mode}>{empty}</BlockEmpty>
          {searchBox}
        </BlockFrame>
      )
    }

    const series = themeSeries(t)
    const trackHref = `${ctx.appUrl}/dashboard/market?track=${encodeURIComponent(t.trackRegistryId ?? '')}`

    return (
      <BlockFrame
        title={voiceTheme.title}
        question={voiceTheme.question}
        mode={mode}
        meta={`${t.audienceLabel.toLowerCase()} · ${t.n == null ? '—' : fmtInt(t.n)} videos`}
        footer={email
          ? <a href={`${ctx.appUrl}${t.conclusionHref}`} style={{ color: EMAIL.ink }}>What we concluded from this →</a>
          : <Link href={t.conclusionHref} className="hover:underline">What we concluded from this →</Link>}
      >
        <div className={email ? undefined : 'flex flex-col gap-3'}>
          <div>
            <h3 className={email ? undefined : 'm-0 text-[15px] font-semibold'} style={email ? { fontFamily: FONT.sans, fontSize: 15, fontWeight: 600, color: EMAIL.ink } : undefined}>
              {t.label}
            </h3>
            {t.description ? (
              // THE MODEL'S OWN WORDS ABOUT THE SUBJECT, so `subject` and not
              // `prose`: PROSE_POLICY marks `pass_b_theme` 'none' — a theme's
              // label and description are the one slot the product never
              // direction-scrubs, because a direction word in them is about
              // the thing rather than about a reading of it.
              <p data-copy="subject" className={email ? undefined : 'm-0 text-[12.5px] text-muted-foreground'} style={email ? { fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.muted } : undefined}>
                {t.description}
              </p>
            ) : null}
          </div>

          <div className={email ? undefined : 'flex flex-wrap items-end gap-6'}>
            <BlockStat
              mode={mode}
              value={t.pct == null ? '—' : fmtPct(t.pct)}
              unit={`of ${t.audienceLabel.toLowerCase()} videos`}
              level={t.prevalence && t.k != null && t.n != null
                ? { word: PREVALENCE_LABEL[t.prevalence], of: `${fmtInt(t.k)} of ${fmtInt(t.n)} videos` }
                : undefined}
              base={<>{fmtInt(t.k ?? 0)} of {fmtInt(t.n ?? 0)} videos this month</>}
              aside={email ? undefined : (
                <span className="flex items-center gap-1.5">
                  <BlockMovement verdict={t.verdict} unit="pts" mode={mode} />
                  <DirectionWord direction={t.direction} mode={mode} />
                </span>
              )}
            />
            {email ? (
              <div style={{ marginTop: 4 }}>
                <BlockMovement verdict={t.verdict} unit="pts" mode={mode} />{' '}
                <DirectionWord direction={t.direction} mode={mode} />
              </div>
            ) : null}
          </div>

          <p className={email ? undefined : 'm-0 text-[11.5px] text-muted-foreground'} style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted } : undefined}>
            {heardLine({ firstHeard: t.firstHeard, axisFromRecordStart: t.axisFromRecordStart, monthsSeen: t.monthsSeen, monthsDrawn: t.monthsDrawn })}
            {t.onCamera ? <> · <span data-copy="figure">{t.onCamera}</span></> : null}
          </p>

          {series ? (
            <Line label="Month by month" mode={mode}>
              <BlockCalendar
                blockKey={voiceTheme.key}
                axis={t.axis}
                series={[series]}
                mode={mode}
                ctx={ctx}
                format={(v) => fmtPct(v)}
                // A LINE, NOT A POSTER. The default draws tall enough to
                // dominate the pane; the mock's own chart is a band under the
                // figure, and the six quotes below it are the evidence the
                // block exists for.
                height={150}
                label={`${t.label}, share of ${t.audienceLabel.toLowerCase()} videos, by month`}
              />
            </Line>
          ) : null}

          <Line label={`Tone · ${t.audienceLabel.toLowerCase()}, all judged videos`} mode={mode}>
            {t.tone ? (
              <>
                <BlockProportion
                  mode={mode}
                  of="videos"
                  segments={t.tone.shares
                    .filter((s) => s.pct != null)
                    .map((s) => ({ label: s.label, count: s.videos, pct: s.pct as number, color: MOOD_COLOR[s.mood] ?? 'var(--neutral-seg)' }))}
                />
                <p className={email ? undefined : 'm-0 flex flex-wrap items-center gap-2 text-[11.5px] text-muted-foreground'} style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted, marginTop: 4 } : undefined}>
                  <span data-copy="figure">of {fmtInt(t.tone.judged)} judged</span>
                  <BlockMovement verdict={t.tone.verdict} unit="pts" mode={mode} />
                </p>
              </>
            ) : (
              <BlockEmpty mode={mode}>{t.toneNote ?? 'Nothing in this month has been judged yet.'}</BlockEmpty>
            )}
          </Line>

          <Line label={`${fmtInt(t.quotes.length)} of the voices`} mode={mode}>
            {t.quotes.length > 0 ? (
              <BlockQuotes
                mode={mode}
                quotes={t.quotes.map((q, i) => ({ quote: q, cite: t.quoteCites[i] ?? undefined }))}
              />
            ) : (
              <BlockEmpty mode={mode}>No comment behind this theme can be quoted.</BlockEmpty>
            )}
          </Line>

          {t.spoken ? <Said line={t.spoken} label="Said on camera" mode={mode} /> : null}
          {t.onScreen ? <Said line={t.onScreen} label="On screen" mode={mode} /> : null}

          {t.withheld > 0 ? (
            <p className={email ? undefined : 'm-0 text-[11.5px] text-muted-foreground'} style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted } : undefined}>
              <span data-copy="figure">{fmtInt(t.withheld)}</span> comments describe who these commenters are — counted, not quoted.
            </p>
          ) : null}

          {t.notes.length > 0 ? (
            <p className={email ? undefined : 'm-0 text-[11px] text-muted-foreground'} style={email ? { fontFamily: FONT.sans, fontSize: 11, color: EMAIL.muted } : undefined}>
              {t.notes.join(' ')}
            </p>
          ) : null}

          {email ? null : (
            <div className="flex flex-wrap items-center gap-3 text-[12px] font-medium">
              {/* TRACK THIS is a primary action and it writes a move (WP4's
                  declareMove). It is a link into Market, where a move is named
                  and confirmed, rather than a one-click write from a reading
                  surface: a declaration is the line a client draws, and it
                  should be drawn deliberately. */}
              {t.trackRegistryId ? <Link href={trackHref} className="hover:underline">Track this →</Link> : null}
              <Link href={t.askHref} className="hover:underline">Ask about this →</Link>
              <Link href={t.videosHref} className="hover:underline">
                The {fmtInt(t.k ?? 0)} videos behind it →
              </Link>
            </div>
          )}

          {searchBox}
          {search.rows.length > 0 ? (
            <ul className={email ? undefined : 'm-0 flex list-none flex-col gap-1 p-0'}>
              {search.rows.map((r) => (
                <li key={r.id} className={email ? undefined : 'text-[12px]'}>
                  <Link href={r.href} className="underline-offset-2 hover:underline">{r.label}</Link>{' '}
                  <span className={email ? undefined : 'text-muted-foreground'}>
                    {r.firstHeard ? `first heard ${r.firstHeard.slice(0, 7)} · ` : ''}
                    <span data-copy="figure">{fmtInt(r.monthsSeen)}</span> updates have carried it
                  </span>
                </li>
              ))}
            </ul>
          ) : search.q ? (
            <BlockEmpty mode={mode}>Nothing in the register matches “{search.q}”.</BlockEmpty>
          ) : null}
        </div>
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    const t = data.theme
    const out: FigureTable = {}
    if (t.pct != null) out.theme_share = { value: t.pct, unit: 'pct', label: `${t.label}, share of this audience's month` }
    if (t.k != null) out.theme_videos = { value: t.k, unit: 'videos', label: `videos that raised ${t.label}` }
    if (t.tone) {
      const negative = t.tone.shares.find((s) => s.mood === 'negative')
      if (negative?.pct != null) out.theme_tone_negative = { value: negative.pct, unit: 'pct', label: 'the cold share of what this audience said' }
    }
    return out
  },

  verdicts(data): Verdict[] {
    const t = data.theme
    return [t.verdict, t.tone?.verdict ?? null].filter((v): v is Verdict => v != null)
  },

  quotes(data): QuoteRef[] {
    return data.theme.quotes.map((q) => q.ref)
  },

  emptyState(data) {
    const t = data.theme
    if (t.state === 'none') {
      return t.notes[0] ?? 'No theme in this audience carried enough of this month to be opened.'
    }
    return null
  },
}
