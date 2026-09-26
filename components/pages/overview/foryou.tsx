import type { Block, RenderMode } from '@/lib/blocks/types'
import { openLink } from '@/components/blocks/open-link'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { TokenProse } from '@/components/blocks/prose'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt } from '@/lib/format'
import { surface } from '@/lib/nav'
import { FOR_YOU_SENTENCES, forYouSentence, forYouWords, type ForYouLine } from '@/lib/pages/overview-market/foryou'
import type { OverviewData } from '@/lib/pages/overview'
import type { FigureTable } from '@/lib/reading/verdicts'
import { CALIBRATION_TAG } from '@/lib/pages/overview-market/subjects'

// 7 · What it means for you (market-first WP2.5; plan §2.2 block 7; the
// approved preview's tile beside "The market by subject").
//
// COUNTED LINE-UPS, IN CODE'S SENTENCES. Each line is something the market
// said beside what you have: the subject your market asked about most over the
// last three months against your posts over those months, the lead
// conversation against your posts of the month, and (a ready subject only) the
// subject your followers talked about most. Every line names the words a post
// had to share, and which posts did, so a "none" can be checked. No advice
// (it stays in the ledger), no "you" column on a market row, no direction word.

export const FOR_YOU_TITLE = 'What it means for you'

/** The line's words under its figures: "checked: waterproof · rain · zip ·
 *  …", or the words the matching posts shared. */
function Words({ line, mode }: { line: ForYouLine; mode: RenderMode }) {
  const w = forYouWords(line)
  if (w.words.length === 0) return null
  const text = `${w.matched ? `${fmtInt(line.matchedPosts.length)} ${line.matchedPosts.length === 1 ? 'post' : 'posts'} on` : 'checked:'} ${w.words.join(' · ')}${w.more ? ' · …' : ''}`
  if (mode === 'email') return <div style={{ fontFamily: FONT.mono, fontSize: 12, color: EMAIL.muted, marginTop: 4 }}>{text}</div>
  return <span className="font-mono text-[12px] leading-[1.5] text-muted-foreground">{text}</span>
}

/** A line's head: a subject's name with its calibration word, or a theme's
 *  label in quotation marks (a model's words, marked as such). */
function Head({ line, mode }: { line: ForYouLine; mode: RenderMode }) {
  if (!line.label) return null
  const word = line.calibration ? CALIBRATION_TAG[line.calibration] : null
  const name = line.labelKind === 'theme'
    ? <>“<span data-copy="subject" data-slot="pass_b_theme">{line.label}</span>”</>
    : <span>{line.label}</span>
  if (mode === 'email') {
    return (
      <div style={{ fontFamily: FONT.sans, fontSize: 14, fontWeight: 600, color: EMAIL.ink }}>
        {name}{word ? <span style={{ fontFamily: FONT.mono, fontSize: 11, fontWeight: 400, color: EMAIL.muted }}> · {word}</span> : null}
      </div>
    )
  }
  return (
    <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
      <span className="text-[15px] font-semibold text-foreground">{name}</span>
      {word ? <span className="font-mono text-[12px] text-muted-foreground">{word}</span> : null}
    </span>
  )
}

/** One inner cell of the questions line: a big figure and the words under it
 *  (the preview's "16 videos / your market asked about it, over the last 3
 *  months"). */
function Cell({ figure, unit, under }: { figure: number; unit: React.ReactNode; under: string }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-md bg-inner p-6">
      <span className="flex flex-wrap items-baseline gap-x-2">
        <span data-copy="figure" className="font-mono text-[28px] font-semibold leading-none tabular-nums tracking-[-0.03em] text-foreground">{fmtInt(figure)}</span>
        <span className="text-[15px] text-secondary-foreground">{unit}</span>
      </span>
      <span className="text-[14px] leading-[1.45] text-secondary-foreground">{under}</span>
    </div>
  )
}

function figureValue(figures: FigureTable, key: string): number {
  return figures[key]?.value ?? 0
}

function Line({ line, month, mode }: { line: ForYouLine; month: string; mode: RenderMode }) {
  const body = forYouSentence(line.sentenceKey, month)
  if (!body) return null
  if (mode === 'email') {
    return (
      <div style={{ marginTop: 12 }}>
        <Head line={line} mode={mode} />
        <div style={{ fontFamily: FONT.sans, fontSize: 14, color: EMAIL.ink2, marginTop: 4 }}>
          <TokenProse body={body} figures={line.figures} mode={mode} />
        </div>
        <Words line={line} mode={mode} />
      </div>
    )
  }
  // THE PREVIEW'S QUESTIONS LINE, IN THE APP: the two counts as inner cells.
  // The same figures and words as the sentence paper and email print.
  if (line.kind === 'unanswered' && mode === 'app') {
    const posts = figureValue(line.figures, 'foryou_posts')
    const touched = figureValue(line.figures, 'foryou_touched')
    return (
      <div className="flex min-w-0 flex-col gap-3">
        <Head line={line} mode={mode} />
        <Cell figure={figureValue(line.figures, 'foryou_asked')} unit="videos" under="your market asked about it, over the last 3 months" />
        <Cell
          figure={touched}
          unit={<>of your <span data-copy="figure" className="font-mono font-semibold tabular-nums text-foreground">{fmtInt(posts)}</span> posts</>}
          under="shared two or more of its words, in that time"
        />
        <Words line={line} mode={mode} />
      </div>
    )
  }
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Head line={line} mode={mode} />
      <TokenProse body={body} figures={line.figures} mode={mode} className="m-0 text-[15px] leading-[1.55] text-secondary-foreground [text-wrap:pretty]" />
      <Words line={line} mode={mode} />
    </div>
  )
}

/** Its one line where there is nothing to line up (Össur: no subject named,
 *  and no conversation leads without a maker rule). */
export const FOR_YOU_NONE = 'Nothing lines up against your posts yet: no subject was asked about, and no conversation leads the month.'

export const overviewForYou: Block<OverviewData> = {
  key: 'overview.foryou',
  title: FOR_YOU_TITLE,
  question: 'What does your market say that your posts have or have not taken up?',

  render(data, mode = 'app', ctx) {
    const moves = surface('market')
    const footer = openLink(mode, `${ctx.appUrl}${moves.href}`, `Open ${moves.label} →`)
    const empty = overviewForYou.emptyState(data)
    const lines = (data.foryou?.lines ?? []).filter((l) => FOR_YOU_SENTENCES[l.sentenceKey])
    return (
      <BlockFrame title={FOR_YOU_TITLE} question={overviewForYou.question} mode={mode} footer={footer} roomy>
        {empty ? <BlockEmpty mode={mode}>{empty}</BlockEmpty> : mode === 'email' ? (
          <div>{lines.map((l, i) => <Line key={`${l.kind}-${i}`} line={l} month={data.foryou!.month} mode={mode} />)}</div>
        ) : (
          <div className="flex min-w-0 flex-col">
            {lines.map((l, i) => (
              <div key={`${l.kind}-${i}`} className={i > 0 ? 'mt-6 border-t border-border/60 pt-6' : undefined}>
                <Line line={l} month={data.foryou!.month} mode={mode} />
              </div>
            ))}
          </div>
        )}
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    const out: FigureTable = {}
    for (const [i, l] of (data.foryou?.lines ?? []).entries()) {
      for (const [k, v] of Object.entries(l.figures)) out[`${l.kind}_${i}_${k}`] = v
    }
    return out
  },

  emptyState(data) {
    if (!data.foryou) return 'What it means for you is read on the market page only.'
    return data.foryou.lines.some((l) => FOR_YOU_SENTENCES[l.sentenceKey]) ? null : FOR_YOU_NONE
  },
}
