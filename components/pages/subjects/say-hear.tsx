import type { Block, RenderMode } from '@/lib/blocks/types'
import { openLink } from '@/components/blocks/open-link'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt } from '@/lib/format'
import { claimCountsLine } from '@/lib/market-tiles'
import type { OwnClaimRow } from '@/lib/reading/own-posts'

import { SAY_HEAR_CLAIMS_UNREADABLE, SAY_HEAR_CLAIMS_UNREADABLE_OUTSIDE, SAY_HEAR_SHOWN, type SubjectsData } from '@/lib/pages/subjects'

// The mock's third rail tile — "Say vs hear" (`subjects.sayhear.rows`, which
// mock-gap found built on Market and nowhere near this page).
//
// BOUND, NOT REBUILT. The tally is `claimCounts` over the same
// `run_summary.say_vs_hear` rows Market reads, from the same completed update
// (`lib/pages/subjects.ts loadSayHear`), and the per-claim rows are the census's
// own `OwnClaimRow[]` with the echo `claimEcho` already resolved. Two tiles of
// one product counting one ledger twice is how two pages come to disagree about
// how many claims a client made.
//
// AND IT IS DATED BY THE UPDATE, NOT BY THE MONTH (D9). The ledger is Pass D-a's
// resolution on one completed update; the month heading at the top of this page
// means comment-dated. The mock stamps this tile "Sep", which would put a
// run-dated figure under a month label — so the footer note names the update
// instead, in the slot the mock gave the month.

/** One claim: what you said, then what the audience did with it. */
function ClaimRow({ row, mode }: { row: OwnClaimRow; mode: RenderMode }) {
  const email = mode === 'email'
  const counted = row.echo.state === 'echoed' || row.echo.state === 'pushed_back' || row.echo.state === 'silent'
  return (
    <div className={email ? undefined : 'flex min-w-0 flex-col gap-0.5'} style={email ? { padding: '3px 0' } : undefined}>
      {/* THE WORDS ARE A MODEL'S, READ BACK OUT OF A COLUMN. `pass_d_a_say_vs_hear`
          is the slot that adjudicated them at write time — the same slot
          Market's own claim rows name (components/pages/market-surface/ways.tsx). */}
      <span
        data-copy="stored"
        data-slot="pass_d_a_say_vs_hear"
        className={email ? undefined : 'text-[12.5px] font-medium text-foreground'}
        style={email ? { fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink, display: 'block' } : undefined}
      >
        “{row.claim}”
      </span>
      <span
        data-copy={counted ? 'level' : undefined}
        className={email ? undefined : 'font-mono text-[10.5px] tabular-nums text-muted-foreground'}
        style={email ? { fontFamily: FONT.mono, fontSize: 10.5, color: EMAIL.muted, display: 'block' } : undefined}
        title={row.echo.why ?? undefined}
      >
        {row.echo.label}
        {counted && row.echo.value.n > 0 ? ` · ${fmtInt(row.echo.value.k)} of ${fmtInt(row.echo.value.n)} videos` : ''}
        {` · said in ${fmtInt(row.posts.k)} of ${fmtInt(row.posts.n)} posts`}
      </span>
    </div>
  )
}

export const subjectsSayHear: Block<SubjectsData> = {
  key: 'subjects.sayhear',
  title: 'Say vs hear',
  question: 'What did we claim, and did anyone take it up?',

  render(data, mode = 'app', ctx) {
    const empty = subjectsSayHear.emptyState(data)
    const email = mode === 'email'
    const footer = openLink(mode, `${ctx.appUrl}/dashboard/market`, 'Open Market →')
    const rows = (data.ownPosts?.claims ?? []).slice(0, SAY_HEAR_SHOWN)

    if (empty) {
      // OUR OWN OWNER IS NOT A CLIENT'S BUSINESS OUTSIDE THE APP. `Verbatim
      // engineering` is a readiness owner — a direction where a reader can
      // open Settings › Readiness, an internal label where they cannot — and
      // this page exports, so `print` is a PDF and a `/r/<token>` page. The
      // precedent is one tile over (`unanswered.tsx`).
      const said = mode === 'print' && empty === SAY_HEAR_CLAIMS_UNREADABLE
        ? SAY_HEAR_CLAIMS_UNREADABLE_OUTSIDE
        : empty
      return (
        <BlockFrame title={subjectsSayHear.title} question={subjectsSayHear.question} mode={mode} footer={footer}>
          <BlockEmpty mode={mode}>{said}</BlockEmpty>
        </BlockFrame>
      )
    }

    return (
      <BlockFrame
        title={subjectsSayHear.title}
        question={subjectsSayHear.question}
        mode={mode}
        meta="your claims"
        footer={footer}
        truncateFooter
        footerNote="latest update"
      >
        {rows.map((r) => <ClaimRow key={r.id} row={r} mode={mode} />)}
        {data.sayHear ? (
          // A TALLY, NOT A LEVEL. "13 claims · 3 echoed · 2 pushed back · 8
          // silent" is four counts of one ledger, not one share of one
          // population, and there is no "of N" to print because the four ARE
          // the N. `figure` is the right marker: code's numbers, code's
          // sentence.
          <span
            data-copy="figure"
            className={email ? undefined : 'font-mono text-[10.5px] tabular-nums text-muted-foreground'}
            style={email ? { fontFamily: FONT.mono, fontSize: 10.5, color: EMAIL.faint, display: 'block', paddingTop: 4 } : undefined}
          >
            {claimCountsLine(data.sayHear)}
          </span>
        ) : null}
      </BlockFrame>
    )
  },

  // NO FIGURE TABLE. A claim is not a video, a comment, a point or a
  // percentage, and `FigureTable`'s four units are the units the bands were
  // calibrated on. A tally of claims declared as "videos" would be a figure
  // token a model could substitute into a sentence about the conversation, and
  // the count is about our own ledger. The tile prints it; nothing may quote it.

  emptyState(data) {
    const c = data.ownPosts
    // THE BLOCK'S OWN SENTENCE, not the census's. `claimsNote` answers "what
    // did you publish"; this tile asks what you CLAIMED and whether anyone
    // took it up, and Your own posts is already printing that other sentence
    // one tile above.
    if (c?.claimsNote) return SAY_HEAR_CLAIMS_UNREADABLE
    if ((c?.claims.length ?? 0) === 0) {
      return data.sayHear
        ? 'Your latest update resolved no claim to a line we can quote back to you.'
        : 'What your posts claim is not recorded for this workspace yet.'
    }
    return null
  },
}
