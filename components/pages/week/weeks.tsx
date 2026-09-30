import type { Block } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { openLink } from '@/components/blocks/open-link'
import { WeekBars } from '@/components/charts/week-bars'
import { WEEK_BY_WEEK_HREF } from '@/components/pages/overview/weeks'
import { surface } from '@/lib/nav'
import { WEEKS_EMPTY, weekBarsBlock, weekBarsOmitted, weekVolumesEmpty } from '@/lib/pages/overview-market/weeks'
import type { WeekData } from '@/lib/pages/week'
import { weekName } from '@/lib/charts/week-bars'
import type { FigureTable } from '@/lib/reading/verdicts'

// "Week by week" on This week (market-first decision M, part 1; WP2.9,
// `week.weeks`, a new stored key): the front page's bars on This week's clock,
// drawn as the approved preview draws them (ThisWeek.dc.html): the videos and
// comments of the market for each week, as counts, our changes as marks in a
// row under the axis, and the week's facts in a panel beside the chart (the
// latest week no longer so far, until another is hovered). Each count is a
// count, never a share, and a week's comments are stated as part of their
// month ("7,851 comments, all dated in September"), as This week states every
// count. The same-age line is not drawn here: the footer links to it, on the
// front page, where it is pending until its check.
//
// THE HEADER IS THE TITLE ALONE AND THE FOOTER LINKS ALONE (25 Sep rulings);
// the method is How to read's "Week by week".

const token = (week: string, what: 'videos' | 'comments'): string => `week_${week.replace(/-/g, '_')}_${what}`

export const weekWeeks: Block<WeekData> = {
  key: 'week.weeks',
  title: 'Week by week',
  question: 'How many videos and comments came in each week?',

  render(data, mode = 'app', ctx) {
    // No week left to draw one way since our latest change (T0a, mechanism
    // 3): the block is omitted, never placeholdered.
    if (weekBarsOmitted(data.weeks)) return null
    const b = data.weeks ?? null
    const empty = weekWeeks.emptyState(data)
    const howTo = openLink(mode, `${ctx.appUrl}${WEEK_BY_WEEK_HREF}`, 'How to read: Week by week →')
    // THE SAME-AGE READING IS THE FRONT PAGE'S (§2.7): one link to it, where
    // the tenant keeps one.
    const front = surface('overview')
    const sameAge = b?.line ? openLink(mode, `${ctx.appUrl}${front.href}`, `Read at the same age, on ${front.label} →`) : null
    const footer = sameAge
      ? mode === 'email' ? <>{howTo}<span style={{ display: 'inline-block', width: 24 }} />{sameAge}</> : <span className="flex flex-wrap gap-x-8 gap-y-1">{howTo}{sameAge}</span>
      : howTo
    return (
      <BlockFrame title={weekWeeks.title} mode={mode} footer={footer} roomy card>
        {empty || !b ? <BlockEmpty mode={mode}>{empty}</BlockEmpty> : <WeekBars block={b} mode={mode} variant="week" surface="tile" />}
      </BlockFrame>
    )
  },

  figures(data): FigureTable {
    const out: FigureTable = {}
    // Only the weeks the bars draw (T0a, mechanism 3).
    for (const w of data.weeks ? weekBarsBlock(data.weeks).weeks : []) {
      if (w.state === 'none_gathered' || w.videos === 0) continue
      out[token(w.week, 'videos')] = { value: w.videos, unit: 'videos', label: `videos in your market in the week of ${weekName(w.week)}` }
      out[token(w.week, 'comments')] = { value: w.comments, unit: 'comments', label: `comments in your market dated in the week of ${weekName(w.week)}` }
    }
    return out
  },

  emptyState(data) {
    if (!data.weeks) return 'Week by week is not counted for this update yet.'
    if (weekVolumesEmpty(data.weeks)) return WEEKS_EMPTY
    return null
  },
}
