import Link from 'next/link'
import type { ReactNode } from 'react'

import type { Block, QuoteRef, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { openLink } from '@/components/blocks/open-link'
import { PairChip } from '@/components/blocks/pair-chip'
import { BlockQuote } from '@/components/blocks/quote'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, longMonth } from '@/lib/format'
import { carriesShare } from '@/lib/reading/level'
import type { FigureTable } from '@/lib/reading/verdicts'
import { FLAG_NOT_A_CHANGE, FLAG_WORDS, prevReadK } from '@/lib/pages/overview-market'
import type { ThemeBlock, VoiceSurfaceData } from '@/lib/pages/voice-surface'
import type { Voice } from '@/lib/pages/overview'

// C3 · A theme in full (market-first WP2.4, plan §2.4 C3; key `voice.theme`,
// reworked to the approved preview's pane).
//
// IT OPENS THE LEAD THEME: the front page's own rule (`heroLead`) picks it, so
// the theme the front page's headline quotes is the theme this pane opens, and
// its maker share (a quarter or less) is printed beside its kind. A row on the
// board opens any other.
//
// THREE LEVELS, NEVER A CHANGE: the month, the month before as a level of its
// own, and how many of its videos came from searches added in the month. Then
// what people did in its comments, counted from the theme's own evidence, and
// its voices: evidence quotes of the theme's own insights, of its kind, dated
// in the month, never from the video's own account (plan §4.0 "Quotes"); for
// the lead, only from a video read as the market (decision F), as on the
// front page.
//
// "ASK ABOUT THIS" SENDS `?ask=` (plan §2.8 D3), which pre-fills the Ask box;
// the pane sent `?q=`, which Ask ignores.
//
// WHAT THE PANE DROPPED WITH THE PREVIEW: the month-by-month line (one month is
// read here, and the line's first joined step is October against November),
// the audience's tone, the search over every theme ever named, "Track this"
// and the conclusion link (both are Your moves'), and the spoken and on-screen
// lines. The header is the title alone and the pane has no footer.

const figure = 'font-mono font-semibold tabular-nums text-secondary-foreground'

/** A level: the share at 100 videos or more, the count under. */
function level(k: number, n: number): string {
  return carriesShare(n) ? `${Math.round((k / n) * 100)}%` : fmtInt(k)
}

/** One of the three figures: the number, its unit beside it, its basis under. */
function Stat({ value, unit, base, grey = false }: { value: ReactNode; unit: string; base: ReactNode; grey?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="flex items-baseline gap-2">
        <span className={`font-mono text-[28px] font-semibold leading-none tracking-[-0.03em] tabular-nums ${grey ? 'text-muted-foreground' : 'text-foreground'}`}>{value}</span>
        <span className="whitespace-nowrap text-[15px] text-secondary-foreground">{unit}</span>
      </span>
      <span className="text-[13px] leading-[1.5] text-muted-foreground">{base}</span>
    </div>
  )
}

/** One voice, with its cite linked to where it was said. */
function VoiceQuote({ voice, mode }: { voice: Voice; mode: RenderMode }) {
  const cite = voice.href
    ? <a href={voice.href} rel="noreferrer" target="_blank" style={mode === 'email' ? { color: EMAIL.muted } : undefined}>{voice.cite}</a>
    : voice.cite
  return <BlockQuote quote={voice.quote} cite={cite} mode={mode} ground="inner" />
}

/** "What people did in its comments, of its 18 videos: Ready to buy 13 · …" */
function Kinds({ t, mode }: { t: ThemeBlock; mode: RenderMode }) {
  if (!t.kinds || t.kinds.length === 0 || t.k == null) return null
  const email = mode === 'email'
  return (
    <p className={email ? undefined : 'm-0 text-[15px] leading-[1.6] text-secondary-foreground'} style={email ? { fontFamily: FONT.sans, fontSize: 13, color: EMAIL.ink2, margin: '8px 0 0' } : undefined}>
      What people did in its comments, of its <span data-copy="figure" className={email ? undefined : figure}>{fmtInt(t.k)}</span> videos:{' '}
      {t.kinds.map((k, i) => (
        <span key={k.kind}>
          {i > 0 ? ' · ' : ''}{k.label}{'\u00a0'}<span data-copy="figure" className={email ? undefined : figure}>{fmtInt(k.videos)}</span>
        </span>
      ))}
    </p>
  )
}

export const voiceTheme: Block<VoiceSurfaceData> = {
  key: 'voice.theme',
  title: 'A theme in full',
  question: 'What exactly is being said, and how do we know?',

  render(data, mode = 'app', ctx) {
    const t = data.theme
    const email = mode === 'email'
    const empty = voiceTheme.emptyState(data)
    if (empty || t.k == null || t.n == null) {
      return (
        <BlockFrame title={voiceTheme.title} mode={mode} roomy>
          <BlockEmpty mode={mode}>{empty ?? `No theme is open for ${longMonth(data.month)}.`}</BlockEmpty>
        </BlockFrame>
      )
    }
    const month = longMonth(data.month)
    const soFar = data.reading?.state === 'so_far'
    const flag = t.flags[0] ?? null

    const title = (
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h3 data-copy="subject" data-slot="pass_b_theme" className={email ? undefined : 'm-0 text-[22px] font-semibold leading-[1.3] tracking-[-0.01em] text-foreground'} style={email ? { fontFamily: FONT.sans, fontSize: 17, fontWeight: 600, color: EMAIL.ink, margin: 0 } : undefined}>
          {t.label}
        </h3>
        {flag ? (
          <span title={FLAG_NOT_A_CHANGE} className={email ? undefined : 'whitespace-nowrap text-[13px] font-semibold text-secondary-foreground'} style={email ? { fontFamily: FONT.sans, fontSize: 12, fontWeight: 600, color: EMAIL.ink2 } : undefined}>
            {FLAG_WORDS[flag]}
            <span className={email ? undefined : 'sr-only'} style={email ? { fontWeight: 400, color: EMAIL.muted } : undefined}>, {FLAG_NOT_A_CHANGE}</span>
          </span>
        ) : null}
      </div>
    )
    const tags = [t.kindLabel, t.makerSentence].filter((x): x is string => Boolean(x))
    // ONE LINE OF TEXT THAT WRAPS AS TEXT: at 390 a flex row put the "·" at
    // the head of the second line.
    const tagLine = tags.length > 0 ? (
      <p className={email ? undefined : 'm-0 text-[15px] text-secondary-foreground [text-wrap:pretty]'} style={email ? { fontFamily: FONT.sans, fontSize: 13, color: EMAIL.ink2, margin: '4px 0 0' } : undefined}>
        {tags.map((w, i) => <span key={w}>{i > 0 ? <span aria-hidden className={email ? undefined : 'text-muted-foreground/70'}>{' · '}</span> : null}{w}</span>)}
      </p>
    ) : null

    // THE MONTH BEFORE ONLY WHERE IT READ THE THEME: a theme first heard
    // this month has no August figure, not "0%" (`prevReadK`); its flag says so.
    const prev = prevReadK(t) != null ? t.prev : null
    const stats = email ? (
      <p style={{ fontFamily: FONT.sans, fontSize: 13, color: EMAIL.ink2, margin: '8px 0 0' }}>
        <span data-copy="level"><span data-copy="figure">{fmtInt(t.k)}</span> of {fmtInt(t.n)} category videos</span> in {month}
        {prev ? <> · <span data-copy="level"><span data-copy="figure">{fmtInt(prev.k)}</span> of {fmtInt(prev.n)}</span> in {longMonth(prev.month)}</> : null}
        {t.provenance ? <> · <span data-copy="figure">{fmtInt(t.provenance.fromNewSearches)}</span> of the {fmtInt(t.k)} came from searches we added in {month}</> : null}
      </p>
    ) : (
      <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-3">
        <Stat
          value={<span data-copy="figure">{fmtInt(t.k)}</span>}
          unit="videos"
          base={(
            <span data-copy="level">
              in {month}{soFar ? ' so far' : ''},{' '}
              {carriesShare(t.n)
                ? <><span data-copy="figure" className={figure}>{level(t.k, t.n)}</span> of {fmtInt(t.n)} category videos</>
                : <>of {fmtInt(t.n)} category videos</>}
            </span>
          )}
        />
        {prev ? (
          <Stat
            grey
            value={<span data-copy="figure">{level(prev.k, prev.n)}</span>}
            unit={`in ${longMonth(prev.month)}`}
            base={<span data-copy="level"><span data-copy="figure" className={figure}>{fmtInt(prev.k)}</span> of {fmtInt(prev.n)} category videos</span>}
          />
        ) : null}
        {t.provenance ? (
          <Stat
            value={<span data-copy="figure">{fmtInt(t.provenance.fromNewSearches)}</span>}
            unit={`of the ${fmtInt(t.provenance.of)}`}
            base={`came from searches we added in ${month}`}
          />
        ) : null}
      </div>
    )

    const askLabel = 'Ask about this'
    const videosLabel = `The ${fmtInt(t.k)} videos behind this →`
    const actions = email ? (
      <p style={{ fontFamily: FONT.sans, fontSize: 13, margin: '10px 0 0' }}>
        <a href={`${ctx.appUrl}${t.askHref}`} style={{ color: EMAIL.link, textDecoration: 'none' }}>{askLabel} →</a>
      </p>
    ) : mode === 'print' ? null : (
      <div className="mt-auto flex flex-wrap items-center gap-6 border-t border-border/60 pt-6">
        <Link href={t.askHref} className="inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-md bg-primary px-5 text-[14px] font-semibold text-primary-foreground transition-colors hover:bg-accent-foreground">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="flex-none"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><path d="M12 8v2" /><path d="M12 13h.01" /></svg>
          {askLabel}
        </Link>
        <span className="text-[14px] font-medium text-foreground [&_[data-link-text]]:underline [&_[data-link-text]]:decoration-neutral-seg [&_[data-link-text]]:underline-offset-[5px]">
          {openLink(mode, `${ctx.appUrl}${t.videosHref}`, videosLabel)}
        </span>
      </div>
    )

    const voiceHead = (
      <div className="flex flex-col gap-1">
        <h3 className={email ? undefined : 'm-0 text-[15px] font-semibold text-foreground'} style={email ? { fontFamily: FONT.sans, fontSize: 13, fontWeight: 600, color: EMAIL.ink, margin: '12px 0 0' } : undefined}>Voices from this theme</h3>
        <span className={email ? undefined : 'font-mono text-[12px] text-muted-foreground'} style={email ? { fontFamily: FONT.mono, fontSize: 11, color: EMAIL.muted } : undefined}>
          dated in {month} · never the video’s own account
        </span>
      </div>
    )
    const voiceList = t.voices.length > 0
      ? t.voices.map((v) => <VoiceQuote key={v.quote.ref} voice={v} mode={mode} />)
      : <BlockEmpty mode={mode}>No comment from this theme dated in {month} can be quoted.</BlockEmpty>

    return (
      <BlockFrame title={voiceTheme.title} mode={mode} roomy>
        {email ? (
          <div>
            {title}{tagLine}{stats}<Kinds t={t} mode={mode} />
            <PairChip words={t.chip} mode={mode} />
            {voiceHead}{voiceList}{actions}
          </div>
        ) : (
          <div className="grid min-w-0 grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_304px] xl:gap-x-[88px]">
            <div className="flex min-w-0 flex-col gap-6 pt-1">
              <div className="flex flex-col gap-2">{title}{tagLine}</div>
              {stats}
              <Kinds t={t} mode={mode} />
              <PairChip words={t.chip} mode={mode} />
              {actions}
            </div>
            <aside className="flex min-w-0 flex-col gap-5 rounded-md bg-inner p-6">
              {voiceHead}
              {voiceList}
            </aside>
          </div>
        )}
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    const t = data.theme
    const out: FigureTable = {}
    if (t.k != null) out.theme_videos = { value: t.k, unit: 'videos', label: `videos that raised ${t.label} in ${longMonth(data.month)}` }
    return out
  },

  quotes(data): QuoteRef[] {
    return data.theme.voices.map((v) => v.quote.ref)
  },

  emptyState(data) {
    const t = data.theme
    if (t.state === 'none') return t.notes[0] ?? `No theme is open for ${longMonth(data.month)}.`
    return null
  },
}
