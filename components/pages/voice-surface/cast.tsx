import Link from 'next/link'
import type { Block, RenderMode } from '@/lib/blocks/types'
import type { QuoteRef } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BlockStat } from '@/components/blocks/stat'
import { TileColumns } from '@/components/shell/page-grid'
import { BlockProportion } from '@/components/blocks/bars'
import { BlockQuote } from '@/components/blocks/quote'
import { CrowdFigure } from '@/components/crowd-figure'
import { platformColour } from '@/components/profile-stats'
import { fmtInt } from '@/lib/format'
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
// it rather than let a reader assume the two agree. The eyebrow says so too,
// as the artboard's does: "Who is talking · current state".
//
// THREE CARDS ABREAST, the artboard's (Block D wave 2). Stacked full-width
// rows, each with a 64px crowd figure on the left, ran this block down a third
// of the page to say three short things three times. They are tinted inner
// blocks — the ONE inner tint, the second and last nesting level the design
// system allows — laid out with `TileColumns({ rule: false })`: three cards of
// one list are not three readings of one axis, and a card that carries its own
// tint must not also wear a hairline against its own edge.
//
// WHAT THE ARTBOARD PUTS IN THE CARD'S TOP-RIGHT IS A SHARE ("38%") AND OURS
// IS A COUNT. The mock's own denominator for it is the audience-month's 1,388,
// and a stored profile is not a reading of an audience-month: it is written
// over the run's whole insight population, across every audience and whatever
// months that run had read, and its groups OVERLAP — Össur's five sum to 674
// against a September category of 388. So the slot keeps the mock's type scale
// and prints the one number that is true, the count, with the overlap stated
// under the cards.

/** The floor is a fact about the reading and is printed, not implied. */
function Persona({ persona, mode }: { persona: CastPersona; mode: RenderMode }) {
  const email = mode === 'email'
  const head = email ? (
    <>
      <span style={{ fontFamily: FONT.sans, fontSize: 13, fontWeight: 600, color: EMAIL.ink }}>{persona.name}</span>{' '}
      <span data-copy="figure" style={{ fontFamily: FONT.mono, fontSize: 12, color: EMAIL.ink }}>{fmtInt(persona.videos)} videos</span>
    </>
  ) : (
    <div className="flex items-center justify-between gap-2">
      {/* The one piece of decoration on the page, kept at the owner's call
          (restoration #75) and shrunk into the card's head row. Aria-hidden: it
          carries no information the words do not — and deliberately ONE figure
          rather than the artboard's ten-icon array, four of them filled, which
          is a share drawn as a picture and this block has no share to draw. */}
      <CrowdFigure personaKey={persona.key} className="h-9 w-auto flex-none" title={persona.name} />
      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{persona.name}</span>
      {/* A COUNT, AND NO SHARE — see CastPersona.videos and the file header.
          `BlockStat` with no level is the right primitive for exactly this: a
          count that is not a share of anything, at the mock's 18px, stamping
          its own figure marker. */}
      <span className="flex-none">
        <BlockStat mode={mode} size="sm" value={fmtInt(persona.videos)} unit="videos" />
      </span>
    </div>
  )

  const body = (
    <>
      {head}
      {persona.oneLiner ? (
        // THE MODEL'S OWN WORDS ABOUT THE GROUP, so `subject` and not `prose`.
        // PROSE_POLICY (lib/prose/scrub.ts) marks `pass_e_persona` 'digits' and
        // never 'direction', because in this slot a direction word is about the
        // people rather than about a reading — production says so: Össur's cast
        // is described as helping people "keep dignity and momentum" and
        // stopped by "pain, falls, slow progress", and Sealand's by an
        // "emotional pull [that] fades fast". The digit half of that policy is
        // enforced at WRITE time, where the scrubber is wired, rather than
        // here.
        <p data-copy="subject" data-slot="pass_e_persona" className={email ? undefined : 'm-0 text-[12.5px] text-muted-foreground'} style={email ? { fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.muted } : undefined}>
          {persona.oneLiner}
        </p>
      ) : null}
      {persona.wants ? (
        // THE LABEL IS CODE'S AND SITS OUTSIDE THE EXEMPT NODE. `subject`
        // takes the direction rule off everything inside it, so a node that
        // wraps a word code wrote is a place a real direction word could hide.
        // Only the model's own sentence is marked.
        <p className={email ? undefined : 'm-0 text-[12.5px]'} style={email ? { fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink } : undefined}>
          <span className={email ? undefined : 'text-muted-foreground'}>Drives</span>{' '}
          <span data-copy="subject" data-slot="pass_e_persona">{persona.wants}</span>
        </p>
      ) : null}
      {persona.blockers ? (
        <p className={email ? undefined : 'm-0 text-[12.5px]'} style={email ? { fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink } : undefined}>
          <span className={email ? undefined : 'text-muted-foreground'}>Stops</span>{' '}
          <span data-copy="subject" data-slot="pass_e_persona">{persona.blockers}</span>
        </p>
      ) : null}
      {persona.triggers ? (
        <p className={email ? undefined : 'm-0 text-[12.5px]'} style={email ? { fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink } : undefined}>
          <span className={email ? undefined : 'text-muted-foreground'}>What made them look</span>{' '}
          <span data-copy="subject" data-slot="pass_e_persona">{persona.triggers}</span>
        </p>
      ) : null}
      {persona.platformMix.length > 0 ? (
        <BlockProportion
          mode={mode}
          of="videos"
          segments={persona.platformMix
            .filter((p) => p.pct != null)
            // THE PRODUCT'S ONE PLATFORM PALETTE, which exists and is not
            // this. `var(--platform-tiktok)` is defined nowhere in the repo,
            // so every segment and every legend dot painted transparent: the
            // artboard's four-segment bar rendered as three mono percentages
            // floating in a card. `platformColour` is the map the profile
            // page's donuts have used since Stage 2 — fixed per platform, so a
            // platform keeps its colour when another is absent from the data.
            .map((p) => ({ label: p.label, count: p.videos, pct: p.pct as number, color: platformColour(p.platform) }))}
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
    <div className="flex min-w-0 flex-col gap-2 rounded bg-inner px-3.5 py-3">
      {body}
    </div>
  )
}

export const voiceCast: Block<VoiceSurfaceData> = {
  key: 'voice.cast',
  // The artboard's eyebrow, and the declaration this block has to make: every
  // other figure on the page is dated by the comment, and this one is dated by
  // the update that wrote the profile.
  title: 'Who is talking · current state',
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
      // NOT "comments". `consumer_profiles.insight_population` counts the
      // POINTS Pass A extracted and the workspace currently holds — Össur's
      // 3,129 against 10,534 comments in the September category — and
      // "comments" has a fixed meaning in this product's copy
      // (lib/calibration.ts GLOSSARY), so calling these that is a wrong
      // number wearing a defined word. "Insight" is pipeline vocabulary and
      // is not one of the thirteen words either, so the line says the plain
      // thing instead.
      meta: c.population != null ? `read over ${fmtInt(c.population)} separate points people made` : undefined,
      footer: email
        ? <span style={{ color: EMAIL.muted }}>{c.floorNote}</span>
        : <Link href={href} className="hover:underline">{c.floorNote}</Link>,
      // The artboard's right-hand footer note. NOT its left half — "No persona
      // 16% of category videos" is the remainder of a partition these groups do
      // not make, and `unnamedShare` was deleted for that reason.
      footerNote: c.stateNote,
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
          {email
            ? c.personas.map((p) => <Persona key={p.key} persona={p} mode={mode} />)
            : (
              <TileColumns of={3} rule={false}>
                {c.personas.map((p) => <Persona key={p.key} persona={p} mode={mode} />)}
              </TileColumns>
            )}
          {/* NOT the mock's "No persona 16% of category videos". That figure is
              the remainder of a partition, and these groups do not partition
              anything — a video can carry two of them. The overlap is stated
              instead of a remainder being taken from it. */}
          <p className={email ? undefined : 'm-0 text-[11.5px] text-muted-foreground'} style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted } : undefined}>
            {c.overlapNote}
          </p>
        </div>
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    const out: FigureTable = {}
    // The largest group only, as a COUNT. The cast is a description, not a
    // measurement ladder, and declaring every group would spend the page's
    // number budget on the one block that is explicitly "current state".
    const lead = [...data.cast.personas].sort((a, b) => b.videos - a.videos)[0]
    if (lead) {
      out.cast_lead_videos = { value: lead.videos, unit: 'videos', label: `videos the group "${lead.name}" was read on` }
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
