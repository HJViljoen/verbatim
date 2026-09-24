import type { Block, RenderMode } from '@/lib/blocks/types'
import { openLink } from '@/components/blocks/open-link'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BrandClaim } from '@/components/blocks/brand-claim'
import { EMAIL, FONT } from '@/lib/email/theme'
import { claimCountsLine } from '@/lib/market-tiles'

import { SAY_HEAR_SHOWN, type SayHearClaim, type SubjectsData } from '@/lib/pages/subjects'

// The mock's third rail tile: "Say vs hear" (`subjects.sayhear.rows`).
//
// ROWS AND TALLY ARE ONE LEDGER. Both come from `run_summary.say_vs_hear` on
// the latest completed update (`lib/pages/subjects.ts loadSayHear`), the same
// rows Market reads. The rows used to be the own-post census's `video_claims`
// instead, echoed by matching their sentence to the ledger's `you_say` by exact
// text, which never matched; every row read "not tracked" under a tally that
// said two of three were echoed. Each row now carries the one state the ledger
// gave it, in the tally's own words, so the rows and the count cannot disagree.
//
// A CLAIM IS NOT A QUOTE (`BrandClaim`). Quotation marks and the serif belong to
// people in the conversation; the brand's own line is plain text, and the meta
// ("your claims") says whose it is once.
//
// DATED BY THE UPDATE, NOT BY THE MONTH (D9): the footer note names the update
// in the slot the mock gave the month.

/** The state's word, in the tally's vocabulary (`claimCountsLine`). */
const STATE_WORD: Record<SayHearClaim['state'], string> = {
  echoed: 'echoed',
  pushed_back: 'pushed back',
  silent: 'silent',
}

/** Market's dot: green where the audience carried it, red where it argued. */
const STATE_DOT: Record<SayHearClaim['state'], { app: string; email: string }> = {
  echoed: { app: 'var(--you)', email: EMAIL.up },
  pushed_back: { app: 'var(--negative)', email: EMAIL.down },
  silent: { app: 'var(--border)', email: EMAIL.border },
}

function ClaimRow({ row, mode }: { row: SayHearClaim; mode: RenderMode }) {
  const email = mode === 'email'
  const dot = STATE_DOT[row.state]
  return (
    <div className={email ? undefined : 'flex min-w-0 flex-col gap-1'} style={email ? { padding: '4px 0' } : undefined}>
      {/* THE WORDS ARE A MODEL'S, READ BACK OUT OF A COLUMN. `pass_d_a_say_vs_hear`
          is the slot that wrote `you_say`, the same slot Market's rows name. */}
      <BrandClaim mode={mode} copy="stored" slot="pass_d_a_say_vs_hear">{row.claim}</BrandClaim>
      {email ? (
        <div style={{ fontFamily: FONT.sans, fontSize: 11, color: EMAIL.muted, marginTop: 2 }}>
          <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 9999, background: dot.email, marginRight: 6 }} />
          {STATE_WORD[row.state]}
        </div>
      ) : (
        <span className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
          <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: dot.app }} />
          {STATE_WORD[row.state]}
        </span>
      )}
    </div>
  )
}

/** What the tile says when the latest update set no claim against the audience. */
export const SAY_HEAR_NONE = 'Your latest update found no claim in your posts to read against the conversation.'

export const subjectsSayHear: Block<SubjectsData> = {
  key: 'subjects.sayhear',
  title: 'Say vs hear',
  question: 'What did we claim, and did anyone take it up?',

  render(data, mode = 'app', ctx) {
    const empty = subjectsSayHear.emptyState(data)
    const email = mode === 'email'
    const footer = openLink(mode, `${ctx.appUrl}/dashboard/market`, 'Open Market →')
    const rows = data.sayHearClaims.slice(0, SAY_HEAR_SHOWN)

    if (empty) {
      return (
        <BlockFrame title={subjectsSayHear.title} question={subjectsSayHear.question} mode={mode} footer={footer}>
          <BlockEmpty mode={mode}>{empty}</BlockEmpty>
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
        {rows.map((r, i) => <ClaimRow key={`${i}:${r.claim}`} row={r} mode={mode} />)}
        {data.sayHear && data.sayHear.total > rows.length ? (
          // THE WHOLE LEDGER, ONLY WHERE THE ROWS ARE NOT ALL OF IT. With every
          // claim listed above, the tally only repeats the rows. A tally, not
          // a level: four counts of one ledger, so `figure`.
          <span
            data-copy="figure"
            className={email ? undefined : 'text-[11px] tabular-nums text-muted-foreground'}
            style={email ? { fontFamily: FONT.sans, fontSize: 11, color: EMAIL.muted, display: 'block', paddingTop: 4 } : undefined}
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
    // ONE SENTENCE FOR THE WHOLE TILE, never a per-row "not tracked": a claim
    // on the ledger was read against the audience, and a workspace without a
    // ledger says so here, once.
    if (data.sayHearClaims.length === 0) return SAY_HEAR_NONE
    return null
  },
}
