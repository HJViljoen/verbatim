import Link from 'next/link'
import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame, FigureCell } from '@/components/blocks/frame'
import { BlockQuote } from '@/components/blocks/quote'
import { TileBlock } from '@/components/shell/tile'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, shortDate } from '@/lib/format'
import { CENSUS_EMPTY, OWN_POSTS_NO_ACCOUNTS, type ClaimEcho, type OwnClaimRow, type OwnPostCensus } from '@/lib/reading/own-posts'
import type { FigureTable } from '@/lib/reading/verdicts'
import type { CompetitiveSurfaceData } from '@/lib/pages/competitive-surface'

// CO4 · What they say about themselves (design §3 CO4; the artboard's
// `grid-column: span 5` card beside the head-to-head).
//
// THREE ABSENCES, AND NOT ONE OF THEM IS A ZERO. The mock draws two states —
// a rival with claims, and a rival reading "— not tracked" — and the census
// behind this block has three, which is the whole argument of
// lib/reading/own-posts.ts:
//
//   · NO ACCOUNT CONFIGURED (`unread === OWN_POSTS_NO_ACCOUNTS`). Nothing they
//     publish is read, so there is no census to take. This is the mock's
//     "— not tracked", and the only one of the three that is the CLIENT's to
//     fix.
//   · CONFIGURED AND SILENT (`unread === CENSUS_EMPTY(basis)`). We read their
//     accounts this month and they published nothing. A real reading, and the
//     opposite conclusion from the one above.
//   · POSTS READ. A census: what they published, how many cleared the comment
//     floor, and — where the claims could be read — what they claimed in it.
//
// A RIVAL'S CLAIMS ARE NEVER A TENANT'S TO READ IN FULL SENTENCES. M8's policy
// is `entity = 'client'`, so a rival census routinely carries real post counts
// and an EMPTY claims list, which on its own reads as "they claimed nothing" —
// a statement about them rather than about our permissions. `claimsNote`
// (`RIVAL_CLAIMS_WITHHELD`) is what prints in its place.
//
// THE MODEL'S WORDS ARE MARKED AND THE SLOT IS NAMED (D13). `OwnClaimRow.claim`
// is `video_claims.claim`, written by Pass A v4 at some past update, so it is
// `data-copy="stored"` naming `pass_a_brand_claim` — the slot this package
// added to `PROSE_POLICY`. An unknown slot fails the copy contract rather than
// exempting anything, which is what makes the exemption worth having.
//
// NO PROMISED DATE (D14). The mock's "Accounts not configured · digital
// director · by 15 Oct" keeps its first two thirds. Nothing in this product
// holds a delivery date, and a date computed from the calendar is wrong the
// first time it is read — `unlocks.tsx` has said so since WP14 and a second
// block may not disagree with it.

/** Who fixes a missing account. The same string `competitiveUnlockRows` uses
 *  for CO4's readiness row, because two places on one page naming two
 *  different owners for one job is worse than either answer. */
export const OWN_CLAIMS_OWNER = 'Your digital director'

export const OWN_CLAIMS_NONE =
  'No rival is tracked for this workspace yet, so there are no accounts to read. Name one in Settings and this starts counting.'

/** The mock's echo legend, honestly: a state, its count with its own "of N",
 *  and — where there is no count — the reason there is none, never a zero. */
function Echo({ echo, mode }: { echo: ClaimEcho; mode: RenderMode }) {
  const email = mode === 'email'
  const counted = echo.state === 'echoed' || echo.state === 'pushed_back' || echo.state === 'silent'
  const dot = echo.state === 'pushed_back' ? 'var(--negative)' : echo.state === 'echoed' ? 'var(--comp)' : 'var(--cat)'

  if (!counted) {
    return email
      ? <div style={{ fontFamily: FONT.sans, fontSize: 11, color: EMAIL.muted, marginTop: 2 }}>{echo.why}</div>
      : <p className="m-0 text-[11px] text-muted-foreground">{echo.why}</p>
  }

  const body = (
    <>
      {echo.label}{' '}
      <span data-copy="figure" className={email ? undefined : 'font-mono tabular-nums text-foreground'} style={email ? { fontFamily: FONT.mono, color: EMAIL.ink } : undefined}>
        {fmtInt(echo.value.k)} of {fmtInt(echo.value.n)} videos
      </span>
    </>
  )
  return email
    ? <div data-copy="level" style={{ fontFamily: FONT.sans, fontSize: 11, color: EMAIL.muted, marginTop: 2 }}>{body}</div>
    : (
      <span data-copy="level" className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="size-2 shrink-0 rounded-full" style={{ background: dot }} aria-hidden />
        {body}
      </span>
    )
}

/** One claim: the brand's own sentence, the posts that carried it with their
 *  "of N", the echo, and the verbatim behind it as a ref. */
function Claim({ row, mode }: { row: OwnClaimRow; mode: RenderMode }) {
  const email = mode === 'email'
  const cite = row.postedOn ? shortDate(row.postedOn) : null
  return (
    <div className={email ? undefined : 'flex min-w-0 flex-col gap-1.5'} style={email ? { padding: '4px 0' } : undefined}>
      <div className={email ? undefined : 'flex items-baseline justify-between gap-2.5'}>
        <span
          data-copy="stored"
          data-slot="pass_a_brand_claim"
          className={email ? undefined : 'min-w-0 text-[12.5px]'}
          style={email ? { fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink } : undefined}
        >
          &ldquo;{row.claim}&rdquo;
        </span>
        <span className={email ? undefined : 'shrink-0'}>
          <FigureCell
            value={`${fmtInt(row.posts.k)} ${row.posts.k === 1 ? 'post' : 'posts'}`}
            of={`of ${fmtInt(row.posts.n)}`}
            align="right"
            mode={mode}
          />
        </span>
      </div>
      <Echo echo={row.echo} mode={mode} />
      {row.quote ? <BlockQuote quote={row.quote} cite={cite ?? undefined} mode={mode} /> : null}
    </div>
  )
}

/**
 * THE SILENT CENSUS AS ONE SENTENCE (CO16).
 *
 * `CENSUS_EMPTY` reads "No post was published in this period — posts published
 * in September.": "this period" and the clock label are the same fact said
 * twice, the second appended as a fragment after a dash, in a card whose head
 * already carries no basis on an absence. The basis IS the period, so it is
 * said once, inside the sentence — and the sentence says the thing this arm
 * exists to say and the no-account arm does not: we READ their accounts. The
 * shared string is `lib/reading/own-posts.ts`'s and belongs to another package
 * in this wave, so the substitution is made where the sentence is printed.
 */
const censusSilent = (basis: string): string => `We read their accounts and found no ${basis}.`

/** One rival's census, or the reason there is not one. */
function Census({ census, mode }: { census: OwnPostCensus; mode: RenderMode }) {
  const email = mode === 'email'
  const head = (
    <div className={email ? undefined : 'flex flex-wrap items-center gap-2'} style={email ? { marginBottom: 2 } : undefined}>
      {email ? null : <span className="size-1.5 shrink-0 rounded-full bg-[var(--comp)]" aria-hidden />}
      <span className={email ? undefined : 'text-[12.5px] font-semibold'} style={email ? { fontFamily: FONT.sans, fontSize: 12.5, fontWeight: 600, color: EMAIL.ink } : undefined}>
        {census.audienceLabel}
      </span>
      {/* THE BASIS, ON EVERY CENSUS THAT HAS FIGURES. Every figure under this
          heading is dated by the POST and the rest of this page is dated by the
          comment; the two must not be read as one clock (D9). It is dropped on
          an absence, where there is no figure to date and where `CENSUS_EMPTY`
          already ends in the same words ("— posts published in September"). */}
      {census.unread ? null : (
        <span className={email ? undefined : 'font-mono text-[10.5px] text-muted-foreground'} style={email ? { fontFamily: FONT.mono, fontSize: 10.5, color: EMAIL.muted } : undefined}>
          {census.basis}
        </span>
      )}
    </div>
  )

  // The two absences that are not a census. They read differently on purpose:
  // one is a job for the client, the other is a reading.
  if (census.unread) {
    const line = (
      <p className={email ? undefined : 'm-0 text-[11.5px] text-muted-foreground'} style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted } : undefined}>
        {census.unread === CENSUS_EMPTY(census.basis) ? censusSilent(census.basis) : census.unread}
        {census.unread === OWN_POSTS_NO_ACCOUNTS ? <> — {OWN_CLAIMS_OWNER}.</> : null}
      </p>
    )
    return email
      ? <div style={{ padding: '5px 0', borderTop: `1px solid ${EMAIL.hairline}` }}>{head}{line}</div>
      : <div className="flex min-w-0 flex-col gap-1 border-t border-border/70 pt-2">{head}{line}</div>
  }

  const counts = (
    <span data-copy="level" className={email ? undefined : 'flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[11.5px] text-muted-foreground'} style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted } : undefined}>
      <span data-copy="figure" className={email ? undefined : 'font-mono tabular-nums text-foreground'} style={email ? { fontFamily: FONT.mono, color: EMAIL.ink } : undefined}>{fmtInt(census.published.k)}</span>{' '}
      {census.published.k === 1 ? 'post' : 'posts'} ·{' '}
      <span data-copy="figure" className={email ? undefined : 'font-mono tabular-nums text-foreground'} style={email ? { fontFamily: FONT.mono, color: EMAIL.ink } : undefined}>{fmtInt(census.overFloor.k)} of {fmtInt(census.overFloor.n)}</span>{' '}
      drew at least <span data-copy="figure" className={email ? undefined : 'font-mono tabular-nums'} style={email ? { fontFamily: FONT.mono } : undefined}>{fmtInt(census.commentFloor)}</span> comments
    </span>
  )

  const body = (
    <>
      {head}
      {counts}
      {census.claims.map((c) => <Claim key={c.id} row={c} mode={mode} />)}
      {census.claimsNote ? (
        <p className={email ? undefined : 'm-0 text-[11.5px] text-muted-foreground'} style={email ? { fontFamily: FONT.sans, fontSize: 11.5, color: EMAIL.muted } : undefined}>
          {census.claimsNote}
        </p>
      ) : null}
    </>
  )

  if (email) return <div style={{ padding: '6px 0', borderTop: `1px solid ${EMAIL.hairline}` }}>{body}</div>
  // The mock's tinted inner block — the second and last nesting level.
  return <TileBlock className="flex min-w-0 flex-col gap-1.5">{body}</TileBlock>
}

/** "2 of 5 tracked" — the censuses that have an account configured, of all of
 *  them. Read off the censuses rather than off `tracking_configs` a second
 *  time: the block may not say a different number from the rows above it. */
export function trackedLine(censuses: readonly OwnPostCensus[]): string {
  const watched = censuses.filter((c) => c.unread !== OWN_POSTS_NO_ACCOUNTS).length
  return `${fmtInt(watched)} of ${fmtInt(censuses.length)} tracked`
}

export const competitiveOwnClaims: Block<CompetitiveSurfaceData> = {
  key: 'competitive.ownclaims',
  title: 'What they say about themselves',
  question: 'What is each rival putting out under their own name?',

  render(data, mode = 'app') {
    const censuses = data.ownClaims
    const email = mode === 'email'
    const empty = competitiveOwnClaims.emptyState(data)
    const missing = censuses.some((c) => c.unread === OWN_POSTS_NO_ACCOUNTS)

    return (
      <BlockFrame
        title={competitiveOwnClaims.title}
        // THE BLOCK FILLS ITS TILE, WHICH IS WHAT PUTS ITS FOOTER ON THE
        // FLOOR. `Tile`'s body is `flex-1 flex-col`, but the block renders as
        // its ONE child and was never stretched, so `BlockFrame`'s `mt-auto`
        // footer had no spare height to push against and floated mid-card with
        // up to 431px of empty tile beneath it. `distribute="between"` could
        // not help either: `justify-between` needs two children to spread.
        className={mode === 'app' ? 'h-full' : undefined}
        question={competitiveOwnClaims.question}
        mode={mode}
        meta="own posts · tracked accounts only"
        footer={
          missing
            ? mode === 'app'
              ? <Link href="/dashboard/settings" className="hover:underline">Add the missing accounts in Settings →</Link>
              : 'Add the missing accounts in Settings.'
            : undefined
        }
        footerNote={censuses.length > 0 ? trackedLine(censuses) : undefined}
      >
        {empty ? <BlockEmpty mode={mode}>{empty}</BlockEmpty> : null}
        <div className={email ? undefined : 'flex min-w-0 flex-col gap-2.5'}>
          {censuses.map((c) => <Census key={c.audience} census={c} mode={mode} />)}
        </div>
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    const out: FigureTable = {}
    for (const c of data.ownClaims) {
      if (c.unread) continue
      const key = c.audience.replace(/[^a-z0-9]+/gi, '_').toLowerCase()
      out[`ownposts_${key}_published`] = { value: c.published.k, unit: 'videos', label: `posts ${c.audienceLabel} published in this month` }
      out[`ownposts_${key}_over_floor`] = { value: c.overFloor.k, unit: 'videos', label: `posts of ${c.audienceLabel}’s that cleared the comment floor` }
    }
    return out
  },

  quotes(data) {
    return data.ownClaims.flatMap((c) => c.claims.flatMap((r) => (r.quote ? [r.quote.ref] : [])))
  },

  emptyState(data) {
    return data.ownClaims.length === 0 ? OWN_CLAIMS_NONE : null
  },
}
