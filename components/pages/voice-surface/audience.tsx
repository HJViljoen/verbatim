import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { PlatformIcon } from '@/components/charts/platform-icon'
import { EMAIL, FONT } from '@/lib/email/theme'
import { fmtInt, longMonth } from '@/lib/format'
import { carriesShare } from '@/lib/reading/level'
import type { FigureTable } from '@/lib/reading/verdicts'
import type { VoiceSurfaceData } from '@/lib/pages/voice-surface'

// C1 · The market in the month (market-first WP2.4, plan §2.4 C1; key
// `voice.audience`, reworked).
//
// THE PAGE'S SCOPE, SAID ONCE, AT THE TOP. The market is everything we read
// except your own posts (decision E): the category plus the videos filed under
// a brand you track. Themes are grouped within the category, so the page names
// both numbers here and every theme below is a share of the category's
// videos, never of the market's.
//
// THE AUDIENCE SWITCH AND THE KIND LADDER ARE GONE (the approved preview). The
// switch read one audience at a time, and a rival's audience holds 5 to 12
// videos a month, too few to group; the kinds are the front page's block 4.
// The Buyers and Makers views the preview draws beside this block arrive with
// deploy 5 (decision F); a control that does nothing is not drawn before then.
//
// WHERE IT WAS SAID is the category's platform mix, as counts: the base the
// themes below are grouped in.

/** The block's title, with the month by name (the lead's R6): on 1 to 15 Oct
 *  the page reads an ended September, where "this month" would be October. */
export const marketTitle = (month: string): string => `The market in ${longMonth(month)}`

const figure = 'font-mono font-semibold tabular-nums text-foreground'

/** A count in the sentence, as its own figure node. */
function N({ value, mode }: { value: number; mode: RenderMode }) {
  return (
    <span data-copy="figure" className={mode === 'email' ? undefined : figure} style={mode === 'email' ? { fontFamily: FONT.mono, fontWeight: 600, color: EMAIL.ink } : undefined}>
      {fmtInt(value)}
    </span>
  )
}

/** "; 7 of them are led by makers and sit on their own at the end of the
 *  list." What the board groups, where it grouped anything. */
function groupedClause(data: VoiceSurfaceData, mode: RenderMode) {
  const b = data.board
  const makers = b.makers?.length ?? 0
  const setAside = b.setAside?.length ?? 0
  if (b.segments !== 'measured' || makers + setAside === 0) return '.'
  if (setAside === 0) {
    return <>; <N value={makers} mode={mode} /> of them {makers === 1 ? 'is' : 'are'} led by makers and {makers === 1 ? 'sits' : 'sit'} on {makers === 1 ? 'its' : 'their'} own at the end of the list.</>
  }
  if (makers === 0) {
    return <>; <N value={setAside} mode={mode} /> of them {setAside === 1 ? 'is' : 'are'} led by off-topic videos and {setAside === 1 ? 'sits' : 'sit'} on {setAside === 1 ? 'its' : 'their'} own at the end of the list.</>
  }
  return <>; <N value={makers} mode={mode} /> of them are led by makers and <N value={setAside} mode={mode} /> by off-topic videos, and they sit on their own at the end of the list.</>
}

export const voiceAudience: Block<VoiceSurfaceData> = {
  key: 'voice.audience',
  title: 'The market in the month',
  question: 'How big was your market, and where are its themes grouped?',

  render(data, mode = 'app') {
    const m = data.market
    const email = mode === 'email'
    const title = marketTitle(data.month)
    const empty = voiceAudience.emptyState(data)
    if (empty) {
      return (
        <BlockFrame title={title} mode={mode} roomy>
          <BlockEmpty mode={mode}>{empty}</BlockEmpty>
        </BlockFrame>
      )
    }
    const soFar = data.reading?.state === 'so_far'
    const b = data.board
    const lead = (
      <p className={email ? undefined : 'm-0 max-w-[700px] text-[24px] font-medium leading-[1.3] tracking-[-0.02em] text-foreground [text-wrap:balance] sm:text-[28px]'} style={email ? { fontFamily: FONT.sans, fontSize: 20, fontWeight: 500, color: EMAIL.ink, margin: 0 } : undefined}>
        <N value={m.videos ?? 0} mode={mode} /> videos in your market in {longMonth(data.month)}{soFar ? ' so far' : ''}.
      </p>
    )
    const body = email ? { fontFamily: FONT.sans, fontSize: 14, lineHeight: 1.6, color: EMAIL.ink2, margin: '8px 0 0' } : undefined
    const bodyClass = email ? undefined : 'm-0 max-w-[600px] text-[17px] leading-[1.6] text-secondary-foreground [text-wrap:pretty]'
    const category = m.category ?? 0
    const split = (
      <p className={bodyClass} style={body}>
        {(m.rivalFiled ?? 0) > 0
          ? <><N value={category} mode={mode} /> are in the category, where themes are grouped, and <N value={m.rivalFiled ?? 0} mode={mode} /> are filed under a brand you track. </>
          : <>All <N value={category} mode={mode} /> are in the category, where themes are grouped. </>}
        {b.atTen > 0
          ? <>In the <N value={category} mode={mode} />, <N value={b.atTen} mode={mode} /> {b.atTen === 1 ? 'theme' : 'themes'} reached 10 videos or more{groupedClause(data, mode)}</>
          : <>In the <N value={category} mode={mode} />, no theme reached 10 videos yet.</>}
      </p>
    )
    // ONE DENOMINATOR, NAMED: "52% of 625", never a share of an unnamed base
    // (the preview's "of the category's September videos"; the copy contract's
    // "of N"). Under 100 the count prints with its base instead (levelText).
    const inThemes = b.inThemes != null && category > 0 ? (
      <p className={bodyClass} style={body}>
        {carriesShare(category)
          ? <><span data-copy="level"><span data-copy="figure" className={email ? undefined : figure} style={email ? { fontFamily: FONT.mono, fontWeight: 600, color: EMAIL.ink } : undefined}>{Math.round((b.inThemes / category) * 100)}%</span> of <N value={category} mode={mode} /></span> sit in a theme of 10 or more.</>
          : <><span data-copy="level"><N value={b.inThemes} mode={mode} /> of <N value={category} mode={mode} /></span> sit in a theme of 10 or more.</>}
      </p>
    ) : null

    const max = Math.max(1, ...m.platformMix.map((p) => p.videos))
    const where = m.platformMix.length > 0 ? (
      email ? (
        <p style={{ fontFamily: FONT.sans, fontSize: 13, color: EMAIL.ink2, margin: '10px 0 0' }}>
          Where it was said, of the category’s videos: {m.platformMix.map((p, i) => (
            <span key={p.platform}>{i > 0 ? ' · ' : ''}{p.label} <span data-copy="figure" style={{ fontFamily: FONT.mono }}>{fmtInt(p.videos)}</span></span>
          ))}
        </p>
      ) : (
        <aside className="flex min-w-0 max-w-[560px] flex-col gap-3 rounded-md bg-inner p-6 xl:max-w-none">
          <div className="flex flex-col gap-1">
            <h3 className="m-0 text-[15px] font-semibold text-foreground">Where it was said</h3>
            <span className="font-mono text-[12px] text-muted-foreground">category videos</span>
          </div>
          <div role="table" className="flex flex-col">
            {m.platformMix.map((p) => (
              <div key={p.platform} role="row" className="grid min-h-10 grid-cols-[104px_minmax(0,1fr)_40px] items-center gap-x-4 border-b border-border/60">
                <span role="rowheader" className="flex min-w-0 items-center gap-2.5 text-[15px] text-foreground">
                  <PlatformIcon platform={p.platform} size={14} className="flex-none text-muted-foreground" />
                  <span className="truncate">{p.label}</span>
                </span>
                <span aria-hidden className="relative block h-1.5">
                  <span className="absolute inset-y-0 left-0 rounded-[2px] bg-foreground" style={{ width: `${(p.videos / max) * 100}%` }} />
                </span>
                <span className="text-right font-mono text-[15px] font-semibold tabular-nums text-foreground"><span data-copy="figure">{fmtInt(p.videos)}</span></span>
              </div>
            ))}
          </div>
        </aside>
      )
    ) : null

    return (
      <BlockFrame title={title} mode={mode} roomy>
        {email ? (
          <div>{lead}{split}{inThemes}{where}</div>
        ) : (
          <div className="grid min-w-0 grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_304px] xl:gap-x-[88px]">
            <div className="flex min-w-0 flex-col gap-4 pt-1">{lead}{split}{inThemes}</div>
            {where}
          </div>
        )}
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    const m = data.market
    const out: FigureTable = {}
    if (m.videos != null) out.market_videos = { value: m.videos, unit: 'videos', label: `videos in your market in ${longMonth(data.month)}` }
    if (m.category != null) out.category_videos = { value: m.category, unit: 'videos', label: `category videos in ${longMonth(data.month)}` }
    if (m.rivalFiled != null) out.rival_filed_videos = { value: m.rivalFiled, unit: 'videos', label: `videos filed under a brand you track in ${longMonth(data.month)}` }
    return out
  },

  emptyState(data) {
    if (data.market.videos == null || data.market.videos === 0) {
      return `Nothing has been read into ${longMonth(data.month)} for your market yet.`
    }
    return null
  },
}
