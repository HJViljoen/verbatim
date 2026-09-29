import type { Block, RenderMode } from '@/lib/blocks/types'
import { openLink } from '@/components/blocks/open-link'
import { surface } from '@/lib/nav'
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

/** THE PREVIEW'S "WHAT CAME BACK" (Subjects.dc.html, d3 polish): the verdict
 *  in Your moves' own words (`lib/pages/market-surface.ts` `verdictLabel`:
 *  Echoed · Pushed back · Not taken up), each after a small square: green,
 *  amber, and an empty one where nothing came back. The email keeps its dot
 *  and the tally's lower-case words, as it was sent. */
const VERDICT: Record<SayHearClaim['state'], { word: string; square: string }> = {
  echoed: { word: 'Echoed', square: 'bg-you' },
  pushed_back: { word: 'Pushed back', square: 'bg-warning' },
  // YOUR MOVES' WORD, which is `claimVerdict`'s (walkthrough item 8): one
  // claim, one word on both pages.
  silent: { word: 'Not talked about', square: 'shadow-[inset_0_0_0_1.5px_var(--cat)]' },
}

/** A "Questioned" row's square: neither agreement nor argument. */
const QUESTIONED_SQUARE = 'shadow-[inset_0_0_0_1.5px_var(--warning)]'

/** The whole ledger in the app, in the rows' own words: "13 claims · 3
 *  echoed · 2 pushed back · 8 not talked about", with questions apart from
 *  pushback where the rows told them apart. */
const appTally = (c: { total: number; echoed: number; pushedBack: number; silent: number; questioned?: number }): string => {
  const questioned = c.questioned ?? 0
  return [
    `${c.total} claim${c.total === 1 ? '' : 's'}`,
    `${c.echoed} echoed`,
    `${c.pushedBack - questioned} pushed back`,
    ...(questioned > 0 ? [`${questioned} questioned`] : []),
    `${c.silent} not talked about`,
  ].join(' · ')
}

/** The app's two columns, the preview's: what you said, and what came back. */
const SAY_HEAR_COLS = 'grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 sm:grid-cols-[minmax(0,1fr)_112px]'

function AppClaimRow({ row }: { row: SayHearClaim }) {
  const v = VERDICT[row.state]
  return (
    <div className={`${SAY_HEAR_COLS} items-baseline border-b border-border/60 py-6 last:border-b-0 last:pb-0`}>
      <span className="flex min-w-0 flex-col gap-1.5">
        <BrandClaim mode="app" copy="stored" slot="pass_d_a_say_vs_hear" className="text-[15px] leading-[1.55] [text-wrap:pretty]">{row.claim}</BrandClaim>
        {/* WHOSE READING IT IS (walkthrough item 8): where your followers took
            it up and the market did not, the row says so rather than letting
            the market's word stand alone. */}
        {row.note ? <span className="text-[13px] leading-[1.45] text-muted-foreground">{row.note}</span> : null}
      </span>
      <span className="inline-flex items-center gap-2.5 justify-self-end whitespace-nowrap text-[15px] font-semibold text-foreground">
        <span aria-hidden className={`inline-block size-2 flex-none rounded-[2px] ${row.questioned ? QUESTIONED_SQUARE : v.square}`} />
        {row.label ?? v.word}
      </span>
    </div>
  )
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
          {row.questioned ? 'questioned' : STATE_WORD[row.state]}
          {row.note ? <div style={{ marginTop: 2 }}>{row.note}</div> : null}
        </div>
      ) : (
        <span className="flex flex-col gap-0.5 text-[11.5px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: dot.app }} />
            {row.questioned ? 'questioned' : STATE_WORD[row.state]}
          </span>
          {row.note ? <span>{row.note}</span> : null}
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
    const moves = surface('market')
    const footer = openLink(mode, `${ctx.appUrl}${moves.href}`, `Open ${moves.label} →`)
    const rows = data.sayHearClaims.slice(0, SAY_HEAR_SHOWN)

    if (empty) {
      return (
        <BlockFrame title={subjectsSayHear.title} question={subjectsSayHear.question} mode={mode} footer={footer} roomy>
          <BlockEmpty mode={mode}>{empty}</BlockEmpty>
        </BlockFrame>
      )
    }

    return (
      <BlockFrame
        title={subjectsSayHear.title}
        question={subjectsSayHear.question}
        mode={mode}
        // Title alone, links alone (25 Sep rulings; Subjects from deploy 3).
        footer={footer}
        truncateFooter
        roomy
      >
        {mode === 'app' ? (
          <div className="flex min-w-0 flex-col">
            <div className={`${SAY_HEAR_COLS} items-end border-b border-border pb-2.5 text-[13px] font-medium leading-[1.35] text-muted-foreground`}>
              <span>What you said</span>
              <span className="text-right">What came back</span>
            </div>
            {rows.map((r, i) => <AppClaimRow key={`${i}:${r.claim}`} row={r} />)}
          </div>
        ) : rows.map((r, i) => <ClaimRow key={`${i}:${r.claim}`} row={r} mode={mode} />)}
        {data.sayHear && data.sayHear.total > rows.length ? (
          // THE WHOLE LEDGER, ONLY WHERE THE ROWS ARE NOT ALL OF IT. With every
          // claim listed above, the tally only repeats the rows. A tally, not
          // a level: four counts of one ledger, so `figure`.
          <span
            data-copy="figure"
            className={email ? undefined : 'text-[13px] tabular-nums text-muted-foreground'}
            style={email ? { fontFamily: FONT.sans, fontSize: 11, color: EMAIL.muted, display: 'block', paddingTop: 4 } : undefined}
          >
            {email ? claimCountsLine(data.sayHear) : appTally(data.sayHear)}
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
