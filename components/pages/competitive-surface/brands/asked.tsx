import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockFrame } from '@/components/blocks/frame'
import { openLink } from '@/components/blocks/open-link'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt } from '@/lib/format'
import { ASKED_PARAM, ASKED_TITLE, askedMonthsLine, type AskedBlock } from '@/lib/pages/brands'
import { competitiveSurfaceHref, type CompetitiveSurfaceData } from '@/lib/pages/competitive-surface'
import type { FigureTable } from '@/lib/reading/verdicts'
import { cn } from '@/lib/utils'
import { InnerLine, RULE, SCALE } from '@/components/pages/overview/market'
import { competitiveQuestions } from '../questions'
import { Fig, PartsText, SubHead } from './parts'

// B3 · Asked under their content (market-first WP3.5, plan §2.5 B3, CO5; the
// approved preview's narrow block beside "A brand in full").
//
// THE VIDEOS OF THE BRAND READ IN FULL THAT CARRIED A QUESTION over the
// ninety days, month by month, and the question themes asked under the most
// of them (grouped per audience, as every theme is, decision E: a theme label
// is model words, replayed as a `subject` node). "Show all" opens every theme
// on this page (`?asked=all`): the preview's target, Conversation filtered
// by brand, does not exist (a recorded deviation).
//
// THE KEY IS CO5'S (`competitive.questions`); a page built before deploy 5
// draws CO5 as it was.

const COLS = 'grid-cols-[minmax(0,1fr)_2.5rem]'

function Body({ a, mode }: { a: AskedBlock; mode: RenderMode }) {
  const months = askedMonthsLine(a)
  if (mode === 'email') {
    return (
      <div>
        <div style={{ fontFamily: FONT.sans, fontSize: 14, color: EMAIL.ink }}><Fig value={a.videos} mode={mode} /> question videos under {a.label}’s content, last 90 days</div>
        {months.length > 0 ? <div style={{ fontFamily: FONT.sans, fontSize: 12.5, color: EMAIL.ink2, marginTop: 2 }}><PartsText parts={months} mode={mode} /></div> : null}
        {a.themes.length > 0 ? <div style={{ fontFamily: FONT.sans, fontSize: 13, fontWeight: 600, color: EMAIL.ink, marginTop: 12 }}>Asked most <span style={{ fontFamily: FONT.mono, fontWeight: 400, color: EMAIL.muted }}>· videos</span></div> : null}
        {a.themes.map((t) => (
          <div key={t.registryId} style={{ fontFamily: FONT.sans, fontSize: 13, color: EMAIL.ink, padding: '4px 0', borderTop: `1px solid ${EMAIL.hairline}` }}>
            <span data-copy="subject" data-slot="pass_b_theme">{t.label}</span> · <span data-copy="figure" style={{ fontFamily: FONT.mono }}>{fmtInt(t.videos)}</span>
          </div>
        ))}
      </div>
    )
  }
  return (
    <>
      <div className="flex flex-col gap-2">
        <span className="flex items-baseline gap-2.5">
          <Fig value={a.videos} mode={mode} className="text-[28px] font-semibold leading-none tracking-[-0.03em] text-foreground" />
          <span className="text-[15px] text-secondary-foreground">question videos</span>
        </span>
        <span className="text-[14px] leading-[1.5] text-muted-foreground">
          under {a.label}’s content, last 90 days
          {months.length > 0 ? <><br /><PartsText parts={months} mode={mode} figureClassName="font-medium text-secondary-foreground" /></> : null}
        </span>
      </div>
      {a.themes.length > 0 ? (
        <div className="flex flex-col gap-2">
          <SubHead title="Asked most" note="videos" mode={mode} />
          <div role="table" aria-label="Asked most" className="flex flex-col border-t border-border">
            {a.themes.map((t, i) => (
              <div key={t.registryId} role="row" className={cn('grid min-h-16 items-center gap-x-4', COLS, i === a.themes.length - 1 ? null : RULE.row)}>
                <span role="rowheader" className={cn('min-w-0 py-2.5', SCALE.row)}><span data-copy="subject" data-slot="pass_b_theme">{t.label}</span></span>
                <span role="cell" data-copy="figure" className={cn(SCALE.num, 'font-semibold')}>{fmtInt(t.videos)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </>
  )
}

export const askedEmpty = (a: AskedBlock): string | null =>
  a.videos === 0 ? `Nothing was asked under ${a.label}’s content in the last 90 days.` : null

export const brandsAsked: Block<CompetitiveSurfaceData> = {
  key: competitiveQuestions.key,
  title: ASKED_TITLE,
  question: 'What do people ask under a brand’s content?',

  render(data, mode = 'app', ctx) {
    const b = data.brands
    if (!b) return competitiveQuestions.render(data, mode, ctx)
    const a = b.asked
    const empty = a ? askedEmpty(a) : 'No brand you track had a video in the last 90 days.'
    const href = a ? competitiveSurfaceHref(a.label, { ...(ctx.params ?? {}), [ASKED_PARAM]: 'all' }) : null
    // THE LINK COUNTS WHAT IT OPENS: every question theme under the brand's
    // content (`?asked=all`), not its question videos (a recorded deviation
    // from the preview's "Show all 21", whose target listed the videos).
    const footer = a && !empty && a.more > 0 && href ? openLink(mode, `${ctx.appUrl}${href}`, `Show all ${fmtInt(a.themes.length + a.more)} →`) : null
    return (
      <BlockFrame title={ASKED_TITLE} mode={mode} footer={footer} roomy>
        {empty || !a ? <InnerLine mode={mode}>{empty}</InnerLine> : <Body a={a} mode={mode} />}
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    const a = data.brands?.asked
    if (!data.brands) return competitiveQuestions.figures?.(data) ?? {}
    return a && a.videos > 0 ? { asked_videos: { value: a.videos, unit: 'videos', label: `${a.label}’s videos carrying a question over the last 90 days` } } : {}
  },

  quotes(data) {
    return data.brands ? [] : competitiveQuestions.quotes?.(data) ?? []
  },

  emptyState(data) {
    const b = data.brands
    if (!b) return competitiveQuestions.emptyState(data)
    return b.asked ? askedEmpty(b.asked) : 'No brand you track had a video in the last 90 days.'
  },
}
