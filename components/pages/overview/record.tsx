import type { Block } from '@/lib/blocks/types'
import { BlockFrame } from '@/components/blocks/frame'
import { openLink } from '@/components/blocks/open-link'
import { EMAIL, FONT } from '@/lib/email/theme'
import type { FigureTable } from '@/lib/reading/verdicts'
import type { OverviewData } from '@/lib/pages/overview'

// OV6 · How sound is this month (design §3 OV6; ported to `Main.dc.html` §6 in
// Block D wave 2).
//
// The page bar prints the how-sound sentence and opens the record; this block
// prints the figures behind it that the bar does not, and links to the record.

/**
 * OV6 AS FIGURES (copy de-clutter 2026-09-24, ruling B). The page bar's
 * how-sound line owns the updates, the videos, the share not in English and the
 * tracking changes, and its modal (and Settings › The record) owns the
 * sentences: the freeze, the change record, the read-before-flags count. This
 * block keeps only the labelled figures neither of those prints, with no prose,
 * so no figure appears twice on one screen. Read depth prints once, labelled
 * with its all-time basis (D15).
 */
export function figureLine(data: OverviewData): string {
  return data.record.figures.map((f) => `${f.label}: ${f.value}`).join(' · ')
}

export const overviewRecord: Block<OverviewData> = {
  key: 'overview.record',
  title: 'How sound is this month',
  question: 'What is this reading made of, and what would not compare?',

  render(data, mode = 'app', ctx) {
    const r = data.record
    const email = mode === 'email'
    const href = `${ctx.appUrl}${r.href}`
    const figures = figureLine(data)

    if (email) {
      return (
        <BlockFrame title={overviewRecord.title} mode={mode} footer={<a href={href} style={{ color: EMAIL.ink }}>the record →</a>}>
          <div style={{ fontFamily: FONT.sans, fontSize: 11.5, lineHeight: 1.5, color: EMAIL.muted }}>{r.line}{figures ? ` · ${figures}` : ''}</div>
        </BlockFrame>
      )
    }
    return (
      <BlockFrame
        title={overviewRecord.title}
        mode={mode}
        // "the record →" beside the eyebrow: this block IS the record's
        // summary, so the link sits in the header, and `openLink` drops it on
        // paper where nobody can click it.
        meta={openLink(mode, href, 'the record →')}
      >
        {/* On paper there is no page bar, so the soundness line leads here. */}
        {mode === 'print' ? (
          <p className="m-0 font-mono text-[10px] leading-[1.45] text-secondary-foreground">How sound is this: {r.line}</p>
        ) : null}
        {/* One figure per cell: a label beside its value run together as one
            mono line read as a single sentence (copy de-clutter shots). */}
        {r.figures.length > 0 ? (
          <dl className="m-0 grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-x-6 gap-y-1.5">
            {r.figures.map((f) => (
              <div key={f.label} className="min-w-0">
                <dt className="font-mono text-[9.5px] uppercase tracking-[0.04em] text-muted-foreground">{f.label}</dt>
                <dd className="m-0 font-mono text-[11px] leading-[1.4] tabular-nums text-foreground">{f.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </BlockFrame>
    )
  },

  // NO FIGURES, DELIBERATELY. Every number in the record is already printed by
  // the block that rests on it — the month's videos on OV0, the shares above —
  // and declaring them again would spend the page's budget twice on one
  // reading. The record's job is provenance, not figures.
  figures(): FigureTable {
    return {}
  },

  emptyState(data) {
    return data.record.lines.length === 0 && data.record.figures.length === 0 ? 'Nothing about this reading has been recorded yet.' : null
  },
}
