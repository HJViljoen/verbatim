import type { Block, RenderMode } from '@/lib/blocks/types'
import { BrandClaim } from '@/components/blocks/brand-claim'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { openLink } from '@/components/blocks/open-link'
import { fmtInt, longMonth } from '@/lib/format'
import { EMAIL, FONT } from '@/lib/email/theme'
import { surface } from '@/lib/nav'
import { followersCount, followersOnly, type ClaimEcho } from '@/lib/reading/own-posts'
import type { FigureTable } from '@/lib/reading/verdicts'
import type { ClaimRow, ClaimSubjects, MarketSurfaceData } from '@/lib/pages/market-surface'
import { RULE, SCALE } from '@/components/pages/overview/market'

// Y3 · What you say, and what your market says back (market-first WP3.6, plan
// §2.6; was MK5b "Say vs hear").
//
// EACH CLAIM COUNTED IN THE MARKET (IO F48). A claim's echo is `claimEcho` fed
// with the reading month's MARKET videos, not the client audience's handful:
// of September's 654 market videos, how many carry the evidence the latest
// update cited for what the market said back. The count decides the state and
// Pass D-a's stance only its sign, so a stance nothing carried reads "Not
// talked about", and a month that could not be read says so rather than
// printing a zero.
//
// YOUR CLAIMS, BY SUBJECT. Over the claims, one line counts your claims read to
// date by the subject the post-and-claim judge filed each under (MF3
// `own_post_subjects`). Before the judge has filed them it reads "not checked
// yet", never "0 waterproofing" (done-when 6).
//
// A CLAIM IS NOT A QUOTE. `you_say` is Pass D-a's line for what the client
// claimed, printed through `BrandClaim` and marked `stored` under
// `pass_d_a_say_vs_hear`, as is the market's line beside it.
//
// THE HEADER IS THE TITLE ALONE AND THE FOOTER A LINK ALONE (25 Sep rulings):
// the verdicts' dating (the latest update's reading) is the column head's, and
// the month's base rides with each count.

/** The verdict dot, in the colour the state earns. */
const DOT: Record<ClaimEcho['state'], string> = {
  echoed: 'var(--you)',
  pushed_back: 'var(--negative)',
  silent: 'var(--border)',
  not_tracked: 'var(--border)',
}
const EMAIL_DOT: Record<ClaimEcho['state'], string> = {
  echoed: EMAIL.up,
  pushed_back: EMAIL.down,
  silent: EMAIL.border,
  not_tracked: EMAIL.border,
}

/** A stored row with no echo (before WP3.6) keeps its stance word alone. */
const stateOf = (claim: ClaimRow): ClaimEcho['state'] =>
  claim.echo?.state ?? (claim.audience === 'echoes' ? 'echoed' : claim.audience === 'contradicts' ? 'pushed_back' : 'silent')

/** "89 of 654 videos in September", or why nothing was counted — and, apart,
 *  your own posts behind the same evidence (walkthrough item 8). */
function EchoCount({ echo, month, mode }: { echo: ClaimEcho | undefined; month: string; mode: RenderMode }) {
  if (!echo) return null
  const email = mode === 'email'
  const own = followersCount(echo)
  const ownLine = own
    ? email
      ? <div style={{ fontFamily: FONT.sans, fontSize: 11, color: EMAIL.muted, marginTop: 2 }}>{own}</div>
      : <span className={`block ${SCALE.tag}`}>{own}</span>
    : null
  if (echo.state === 'not_tracked') {
    return email
      ? <><div style={{ fontFamily: FONT.sans, fontSize: 11, color: EMAIL.muted, marginTop: 2 }}>{echo.why}</div>{ownLine}</>
      : <><span className="mt-1 block text-[12px] leading-[1.4] text-muted-foreground">{echo.why}</span>{ownLine}</>
  }
  const words = `${fmtInt(echo.value.k)} of ${fmtInt(echo.value.n)} videos in ${longMonth(month)}`
  return email
    ? <><div data-copy="level" style={{ fontFamily: FONT.mono, fontSize: 11, color: EMAIL.muted, marginTop: 2 }}>{words}</div>{ownLine}</>
    : <><span data-copy="level" className={`mt-1 block ${SCALE.tag}`}>{words}</span>{ownLine}</>
}

/** Whose words the sentence summarises, where it is your followers' and not
 *  your market's (walkthrough item 8): "People respond to Sealand as a
 *  community-rooted label…" came off Sealand's own comment sections, under a
 *  market count of 0. */
const FOLLOWERS_SAID = 'Said by your own followers, not your market:'

/** Your claims read to date, by subject: the judge's filing, or "not checked
 *  yet" where it has not filed them. */
function SubjectsLine({ c, mode }: { c: ClaimSubjects; mode: RenderMode }) {
  const email = mode === 'email'
  const lead = (
    <span className={email ? undefined : 'whitespace-nowrap'}>
      Of your <span data-copy="figure" className={email ? undefined : 'font-mono font-semibold tabular-nums text-foreground'}>{fmtInt(c.claims)}</span> claims read to date
    </span>
  )
  const shown = c.state === 'checked' ? c.subjects : c.subjects.filter((x) => x.k > 0)
  const parts = [
        ...shown.map((x) => (
          <span key={x.subjectId} className={email ? undefined : 'whitespace-nowrap'}>
            <span data-copy="figure" className={email ? undefined : 'font-mono font-semibold tabular-nums text-foreground'}>{fmtInt(x.k)}</span> {x.name.toLowerCase()}
          </span>
        )),
        ...(c.state === 'partial' ? [<span key="rest"><span data-copy="figure">{fmtInt(c.unfiled)}</span> still to be read</span>] : []),
      ]
  if (email) {
    return (
      <div style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink2, margin: '2px 0 8px' }}>
        {lead}{parts.length > 0 ? ': ' : ''}{parts.map((p, i) => <span key={i}>{i > 0 ? ' · ' : ''}{p}</span>)}
      </div>
    )
  }
  // EVERY CLAIM ACCOUNTED FOR (sw-2 item 2). The subject counts can overlap
  // (a claim sits under two subjects) and skip the claims filed under a
  // subject being re-described or under none, so the parts above never added
  // up to the lead's figure. The line under them does, in the app; the email
  // prints as it was sent (reports on hold).
  const a = c.accounted
  const tally = a ? claimsTally(a, shown.reduce((n, x) => n + x.k, 0)) : null
  const appParts = a
    ? shown.map((x) => (
      <span key={x.subjectId} className="whitespace-nowrap">
        <span data-copy="figure" className="font-mono font-semibold tabular-nums text-foreground">{fmtInt(x.k)}</span> {x.name.toLowerCase()}
      </span>
    ))
    : parts
  return (
    <div className="flex flex-col gap-1">
      <p className="m-0 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[15px] leading-[1.45] text-secondary-foreground">
        {lead}
        {appParts.length > 0 ? <span aria-hidden className="h-4 w-px self-center bg-border" /> : null}
        {appParts}
      </p>
      {tally ? <p className="m-0 text-[13px] leading-[1.45] text-muted-foreground [text-wrap:pretty]">{tally}</p> : null}
    </div>
  )
}

/**
 * The sentence under the subject counts that accounts for every claim:
 * "27 sit under one or more of these subjects, 70 under subjects being
 * re-described and 7 under none." Its parts add up to the lead's figure; the
 * overlap is said only where the counts above add up past `under`. Null where
 * nothing needs accounting for.
 */
export function claimsTally(a: NonNullable<ClaimSubjects['accounted']>, shownSum: number): string | null {
  const bits: string[] = []
  if (a.under > 0) bits.push(`${fmtInt(a.under)} sit under ${a.under === 1 ? 'one' : 'one or more'} of these subjects${shownSum > a.under ? ' (a claim can sit under more than one)' : ''}`)
  if (a.redescribed > 0) bits.push(`${fmtInt(a.redescribed)} under subjects being re-described`)
  if (a.outside > 0) bits.push(`${fmtInt(a.outside)} under none of them`)
  if (a.pending > 0) bits.push(`${fmtInt(a.pending)} still to be read`)
  if (bits.length === 0 || (bits.length === 1 && a.under > 0 && shownSum === a.under)) return null
  const joined = bits.length === 1 ? bits[0] : `${bits.slice(0, -1).join(', ')} and ${bits.at(-1)}`
  return `${joined.charAt(0).toUpperCase()}${joined.slice(1)}.`
}

/** Words for the claims this block can draw (`CLAIM_ROWS`, five). */
const COUNT_WORDS = ['One', 'Two', 'Three', 'Four', 'Five'] as const

/** The claims table's head: "Three of them, …" under the line counting your
 *  claims (the preview's words), and with no such line above it, nothing for
 *  "them" to point back to, so it names the claims itself. */
export function claimsHead(claims: number, underCount: boolean): string {
  const said = 'with what your market said back'
  if (!underCount) return `Your claims, ${said}`
  return `${COUNT_WORDS[claims - 1] ?? 'Some'} of them, ${said}`
}

function Claim({ claim, month, mode }: { claim: ClaimRow; month: string; mode: RenderMode }) {
  const state = stateOf(claim)
  const label = claim.echo?.label ?? claim.verdictLabel
  const dot = claim.echo?.questioned ? 'var(--warning)' : DOT[state]
  const followers = followersOnly(claim.echo)
  if (mode === 'email') {
    return (
      <div style={{ padding: '6px 0', borderTop: `1px solid ${EMAIL.hairline}` }}>
        <div><BrandClaim mode={mode} copy="stored" slot="pass_d_a_say_vs_hear">{claim.youSay}</BrandClaim></div>
        <div style={{ fontFamily: FONT.sans, fontSize: 11, fontWeight: 600, color: EMAIL.ink2, marginTop: 2 }}>
          <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 9999, background: EMAIL_DOT[state], marginRight: 6 }} />
          {label}
        </div>
        {claim.theySay && followers ? <div style={{ fontFamily: FONT.sans, fontSize: 11, color: EMAIL.muted, marginTop: 2 }}>{FOLLOWERS_SAID}</div> : null}
        {claim.theySay ? <div data-copy="stored" data-slot="pass_d_a_say_vs_hear" style={{ fontFamily: FONT.sans, fontSize: 12, color: EMAIL.ink2, marginTop: 2 }}>{claim.theySay}</div> : null}
        <EchoCount echo={claim.echo} month={month} mode={mode} />
      </div>
    )
  }
  return (
    <div role="row" className={`grid min-w-0 grid-cols-1 gap-2 py-4 md:grid-cols-[minmax(0,1.3fr)_150px_minmax(0,1.3fr)] md:gap-6 ${RULE.row}`}>
      <BrandClaim mode={mode} copy="stored" slot="pass_d_a_say_vs_hear" className="block text-[14px] leading-[1.5]">{claim.youSay}</BrandClaim>
      <span className="flex items-center gap-2 self-start text-[14px] font-semibold text-foreground">
        <span aria-hidden className="size-2 shrink-0 rounded-[2px]" style={{ background: dot }} />
        {label}
      </span>
      <span className="min-w-0">
        {claim.theySay && followers ? <span className="mb-1 block text-[12px] font-medium text-muted-foreground">{FOLLOWERS_SAID}</span> : null}
        {claim.theySay ? <p data-copy="stored" data-slot="pass_d_a_say_vs_hear" className="m-0 text-[14px] leading-[1.5] text-secondary-foreground">{claim.theySay}</p> : null}
        <EchoCount echo={claim.echo} month={month} mode={mode} />
      </span>
    </div>
  )
}

export const marketSayHear: Block<MarketSurfaceData> = {
  key: 'market.sayhear',
  title: 'What you say, and what your market says back',
  question: 'What do we claim, and what does the market say back?',

  render(data, mode = 'app', ctx) {
    const w = data.ways
    const email = mode === 'email'
    const empty = marketSayHear.emptyState(data)
    const voice = surface('voice')
    const footer = w.claims.length > 0 ? openLink(mode, `${ctx.appUrl}${voice.href}`, 'Hear these voices →') : undefined
    const subjects = w.claimSubjects ?? null

    return (
      <BlockFrame title={marketSayHear.title} question={marketSayHear.question} mode={mode} roomy footer={footer}>
        {/* NOTHING TO SAY UNTIL THE CLAIMS ARE READ FOR THEIR SUBJECT
            (walkthrough B8): "which subject each is about: not checked yet"
            was our backlog, not a reading. */}
        {subjects && subjects.claims > 0 && subjects.state !== 'unchecked' ? <SubjectsLine c={subjects} mode={mode} /> : null}
        {empty ? <BlockEmpty mode={mode}>{empty}</BlockEmpty> : null}
        {w.claims.length > 0 ? (
          email ? (
            <div>{w.claims.map((claim) => <Claim key={claim.id} claim={claim} month={data.month} mode={mode} />)}</div>
          ) : (
            <div role="table" className="flex min-w-0 flex-col">
              <span className="text-[15px] font-semibold text-foreground">
                {claimsHead(w.claims.length, Boolean(subjects && subjects.claims > 0 && subjects.state !== 'unchecked'))}
              </span>
              <div role="row" className={`mt-3 hidden grid-cols-[minmax(0,1.3fr)_150px_minmax(0,1.3fr)] gap-6 md:grid ${RULE.head}`}>
                <span role="columnheader" className={SCALE.head}>You say</span>
                <span role="columnheader" className={SCALE.head}>Your market, this update</span>
                <span role="columnheader" className={SCALE.head}>What it says back</span>
              </div>
              {w.claims.map((claim) => <Claim key={claim.id} claim={claim} month={data.month} mode={mode} />)}
            </div>
          )
        ) : null}
      </BlockFrame>
    )
  },

  /** Each claim's market count, where it was counted. */
  figures(data): FigureTable {
    const out: FigureTable = {}
    data.ways.claims.forEach((c, i) => {
      if (c.echo && c.echo.state !== 'not_tracked') {
        out[`sayhear_${i + 1}`] = { value: c.echo.value.k, unit: 'videos', label: `market videos carrying what was said back to claim ${i + 1}, of ${c.echo.value.n}` }
      }
    })
    return out
  },

  emptyState(data) {
    return data.ways.claims.length === 0 ? data.ways.claimsLine : null
  },
}
