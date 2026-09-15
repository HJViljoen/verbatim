import Link from 'next/link'
import type { Block, RenderMode } from '@/lib/blocks/types'
import type { QuoteRef } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BlockProportion } from '@/components/blocks/bars'
import { BlockQuote } from '@/components/blocks/quote'
import { CrowdFigure } from '@/components/crowd-figure'
import { fmtInt, fmtPct } from '@/lib/format'
import { EMAIL, FONT } from '@/lib/email/theme'
import type { FigureTable } from '@/lib/reading/verdicts'
import type { CastPersona, VoiceSurfaceData } from '@/lib/pages/voice-surface'
import { castMasthead } from '@/lib/pages/voice-surface'

// VO4 · Who is talking, current state only (design §3 VO4, decision W).
//
// THE CAST MOVES HERE FROM CONSUMER PROFILE, AND THREE THINGS DO NOT.
//   · the connector lines — the most engineering-expensive element on the old
//     page and pure ornament (cut #74);
//   · "how the mix has moved" — it read the oldest twelve profiles,
//     survivor-only and index-spaced, and there is no sound persona series to
//     draw (cut #79). No per-persona trend replaces it, here or anywhere;
//   · the dropped-groups line ("3 groups were just below the floor") — it needs
//     `consumer_profiles.dropped` populated, which is a Pass E prompt change
//     this phase does not make (decision W). Omitted rather than stubbed: a
//     line that says "0 groups" about a column nothing writes is a false
//     statement about the data.
// The CROWD FIGURE is kept, at the owner's call (restoration #75), as the
// page's one piece of decoration.
//
// CURRENT STATE, AND THE BLOCK SAYS SO. Everything here is read off ONE stored
// profile, dated by the update that wrote it — which is why the masthead names
// that date and says when a later update has landed since. The rest of this
// page is dated by the comment; this block is the exception and has to declare
// it rather than let a reader assume the two agree.

/** The floor is a fact about the reading and is printed, not implied. */
function Persona({ persona, mode }: { persona: CastPersona; mode: RenderMode }) {
  const email = mode === 'email'
  const head = (
    <>
      <span className={email ? undefined : 'text-[13px] font-semibold'} style={email ? { fontFamily: FONT.sans, fontSize: 13, fontWeight: 600, color: EMAIL.ink } : undefined}>
        {persona.name}
      </span>{' '}
      <span data-copy="figure" className={email ? undefined : 'font-mono text-[12px] tabular-nums'}>
        {persona.pct == null ? '—' : fmtPct(persona.pct)} {fmtInt(persona.videos)} of {fmtInt(persona.denominator ?? 0)}
      </span>
    </>
  )

  const body = (
    <>
      <div>{head}</div>
      {persona.oneLiner ? (
        // The model's own words about the group. Marked as prose: rule (a)
        // checks them bare, so a digit here would be a number a model typed.
        <p data-copy="prose" className={email ? undefined : 'm-0 text-[12.5px] text-muted-foreground'} style={email ? { fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.muted } : undefined}>
          {persona.oneLiner}
        </p>
      ) : null}
      {persona.wants ? (
        <p data-copy="prose" className={email ? undefined : 'm-0 text-[12.5px]'} style={email ? { fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink } : undefined}>
          <span className={email ? undefined : 'text-muted-foreground'}>Drives</span> {persona.wants}
        </p>
      ) : null}
      {persona.blockers ? (
        <p data-copy="prose" className={email ? undefined : 'm-0 text-[12.5px]'} style={email ? { fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink } : undefined}>
          <span className={email ? undefined : 'text-muted-foreground'}>Stops</span> {persona.blockers}
        </p>
      ) : null}
      {persona.triggers ? (
        <p data-copy="prose" className={email ? undefined : 'm-0 text-[12.5px]'} style={email ? { fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink } : undefined}>
          <span className={email ? undefined : 'text-muted-foreground'}>What made them look</span> {persona.triggers}
        </p>
      ) : null}
      {persona.platformMix.length > 0 ? (
        <BlockProportion
          mode={mode}
          of="videos"
          segments={persona.platformMix
            .filter((p) => p.pct != null)
            .map((p) => ({ label: p.label, count: p.videos, pct: p.pct as number, color: `var(--platform-${p.platform})` }))}
        />
      ) : null}
      {persona.quote ? <BlockQuote mode={mode} quote={persona.quote} cite={persona.quoteCite ?? undefined} /> : null}
    </>
  )

  if (email) {
    return (
      <div style={{ padding: '6px 0', borderTop: `1px solid ${EMAIL.hairline}` }}>{body}</div>
    )
  }
  return (
    <div className="flex min-w-0 gap-3 border-t border-border/70 pt-2">
      {/* The one piece of decoration on the page, kept at the owner's call.
          Aria-hidden: it carries no information the words do not. */}
      <CrowdFigure personaKey={persona.key} className="h-16 w-auto flex-none" title={persona.name} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">{body}</div>
    </div>
  )
}

export const voiceCast: Block<VoiceSurfaceData> = {
  key: 'voice.cast',
  title: 'Who is talking',
  question: 'Who are the people behind these comments?',

  render(data, mode = 'app', ctx) {
    const c = data.cast
    const email = mode === 'email'
    const empty = voiceCast.emptyState(data)
    const masthead = castMasthead(c)
    const href = `${ctx.appUrl}/dashboard/voice#cast`

    const frameProps = {
      title: voiceCast.title,
      question: voiceCast.question,
      mode,
      meta: c.denominator != null ? `${fmtInt(c.denominator)} videos this month` : undefined,
      footer: email
        ? <span style={{ color: EMAIL.muted }}>{c.floorNote}</span>
        : <Link href={href} className="hover:underline">{c.floorNote}</Link>,
    }

    if (empty) {
      return (
        <BlockFrame {...frameProps}>
          <BlockEmpty mode={mode}>{empty}</BlockEmpty>
        </BlockFrame>
      )
    }

    return (
      <BlockFrame {...frameProps}>
        <div className={email ? undefined : 'flex flex-col gap-3'} id={email ? undefined : 'cast'}>
          {masthead ? (
            <p className={email ? undefined : 'm-0 text-[11.5px] text-muted-foreground'} style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted } : undefined}>
              {masthead}
            </p>
          ) : null}
          {c.personas.map((p) => <Persona key={p.key} persona={p} mode={mode} />)}
          {c.unnamedPct != null ? (
            <p className={email ? undefined : 'm-0 text-[11.5px] text-muted-foreground'} style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted } : undefined}>
              No group was named on <span data-copy="figure">{fmtPct(c.unnamedPct)}</span> of this audience’s videos.
            </p>
          ) : null}
        </div>
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    const out: FigureTable = {}
    // The largest group only. The cast is a description, not a measurement
    // ladder, and declaring every persona's share would spend the page's
    // number budget on the one block that is explicitly "current state".
    const lead = [...data.cast.personas].sort((a, b) => b.videos - a.videos)[0]
    if (lead && lead.pct != null) {
      out.cast_lead_share = { value: lead.pct, unit: 'pct', label: `${lead.name}, share of this audience's videos` }
    }
    return out
  },

  quotes(data): QuoteRef[] {
    return data.cast.personas.map((p) => p.quote?.ref).filter((r): r is string => Boolean(r))
  },

  emptyState(data) {
    return data.cast.empty
  },
}
