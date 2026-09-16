import type { ReactNode } from 'react'
import type { Block, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import { BlockMovement } from '@/components/blocks/movement'
import { fmtInt, fmtPct } from '@/lib/format'
import type { Mover } from '@/lib/pages/overview'
import type { QuarterlyData } from '@/lib/pages/quarterly'
import { QUARTER_PAGE_QUESTION, QUARTER_PAGE_TITLE } from '@/lib/reports/quarterly'
import { Figure, Note, Row } from './parts'

// QR4 · What the category talked about (mock page 4).
//
// MOVERS AND THE MIX ARE A MONTH, AND THE PAGE SAYS SO IN ITS FIRST LINE.
// This is the one page of a quarterly review most likely to be misread: a
// reader holding a document headed "Q3" will take every figure on it for a
// quarter figure unless told otherwise, and the movers, the kind mix, the mood
// and the attention line are all this month against last. The mock's own note
// says it; `CategoryPage.basis` composes it; it is printed before any row.
//
// THE QUARTER'S OWN READING, where the window pair could be taken, is a
// SEPARATE list below, banded by `quarterChange` over distinct videos. Where
// M3 is unapplied the list is empty and the page says the comparison is not
// recorded — it does not add three months together to fill the gap.
//
// A THEME'S LABEL IS THE MODEL's WORDS (`pass_b_theme` policy 'none'), so every
// site that prints one marks it `data-copy="subject"`. Six blocks failed rule
// (c) on live labels in the Block B fix pass for exactly this.

/** A theme's label is the MODEL's words (`pass_b_theme`, policy 'none'), so it
 *  is marked and its slot is named — that is what buys the rule-(c) exemption,
 *  and a marker with no slot buys nothing. An AUDIENCE's name is code's, and
 *  marking it would claim a provenance it does not have. */
function ObjectLabel({ label, model, mode }: { label: string; model: boolean; mode: RenderMode }): ReactNode {
  if (!model) return mode === 'email' ? <strong>{label}</strong> : <span className="font-medium">{label}</span>
  return mode === 'email'
    ? <strong data-copy="subject" data-slot="pass_b_theme">{label}</strong>
    : <span data-copy="subject" data-slot="pass_b_theme" className="font-medium">{label}</span>
}

function MoverRow({ mover, mode }: { mover: Mover; mode: RenderMode }) {
  return (
    <Row
      mode={mode}
      label={<ObjectLabel label={mover.label} model mode={mode} />}
      aside={<BlockMovement verdict={mover.verdict} unit="pts" mode={mode} />}
    >
      <Figure mode={mode} value={mover.pct == null ? '—' : fmtPct(mover.pct)} of={`${fmtInt(mover.k)} of ${fmtInt(mover.n)}`} />
    </Row>
  )
}

export const quarterlyCategory: Block<QuarterlyData> = {
  key: 'quarterly.category',
  title: QUARTER_PAGE_TITLE.category,
  question: QUARTER_PAGE_QUESTION.category,

  render(data, mode = 'app') {
    const c = data.category
    const frame = (children: ReactNode) => (
      <BlockFrame
        title={quarterlyCategory.title}
        question={quarterlyCategory.question}
        mode={mode}
        meta={c.denominator != null ? `${c.label} · ${fmtInt(c.denominator)} videos in ${c.monthLabel}` : c.label}
      >
        {children}
      </BlockFrame>
    )
    const empty = quarterlyCategory.emptyState(data)
    if (empty) return frame(<BlockEmpty mode={mode}>{empty}</BlockEmpty>)

    return frame(
      <div>
        <Note mode={mode} tone="body">{c.basis} {data.gate}</Note>

        {c.growing.length + c.fading.length > 0 ? (
          <div className={mode === 'email' ? undefined : 'mt-2'}>
            <Note mode={mode} tone="body">What moved most</Note>
            {[...c.growing, ...c.fading].map((m) => <MoverRow key={m.id} mover={m} mode={mode} />)}
          </div>
        ) : (
          <Note mode={mode}>{c.moversNote ?? 'Nothing moved clearly this month.'}</Note>
        )}

        {c.kinds.length > 0 ? (
          <div className={mode === 'email' ? undefined : 'mt-3'}>
            <Note mode={mode} tone="body">Kind of thing said</Note>
            {c.kinds.map((k) => (
              <Row
                key={k.kind}
                mode={mode}
                label={k.label}
                aside={<BlockMovement verdict={c.kindVerdicts[k.kind] ?? null} unit="pts" mode={mode} />}
              >
                <Figure mode={mode} value={k.pct == null ? '—' : fmtPct(k.pct)} of={`${fmtInt(k.videos)} of ${fmtInt(k.denominator)}`} />
              </Row>
            ))}
          </div>
        ) : (
          <Note mode={mode}>{c.kindsNote ?? 'What kind of thing was said is not recorded for this workspace yet.'}</Note>
        )}

        {c.mood ? (
          <div className={mode === 'email' ? undefined : 'mt-3'}>
            <Note mode={mode} tone="body">Mood</Note>
            {c.mood.shares.map((m) => (
              <Row key={m.mood} mode={mode} label={m.label}>
                <Figure mode={mode} value={m.pct == null ? '—' : fmtPct(m.pct)} of={`${fmtInt(m.videos)} of ${fmtInt(m.judged)} judged`} />
              </Row>
            ))}
          </div>
        ) : (
          <Note mode={mode}>{c.moodNote ?? 'The mood of the category is not recorded for this workspace yet.'}</Note>
        )}

        {c.attentionNote ? <Note mode={mode}>{c.attentionNote}</Note> : null}

        {c.quarter.length > 0 ? (
          <div className={mode === 'email' ? undefined : 'mt-3'}>
            <Note mode={mode} tone="body">The quarter against the quarter before it</Note>
            {c.quarter.map((v) => (
              <Row
                key={`${v.objectKind}:${v.objectId}`}
                mode={mode}
                label={<ObjectLabel label={v.objectLabel} model={v.objectKind === 'theme'} mode={mode} />}
                aside={<BlockMovement verdict={v} unit="pts" mode={mode} />}
              >
                <Figure mode={mode} value={`${fmtInt(v.value.k)} of ${fmtInt(v.value.n)}`} />
              </Row>
            ))}
          </div>
        ) : c.quarterNote ? (
          <Note mode={mode}>{c.quarterNote}</Note>
        ) : null}
      </div>,
    )
  },

  verdicts(data) {
    return [
      ...data.category.growing.map((m) => m.verdict),
      ...data.category.fading.map((m) => m.verdict),
      ...Object.values(data.category.kindVerdicts).filter((v): v is NonNullable<typeof v> => v != null),
      ...data.category.quarter,
    ]
  },

  emptyState(data) {
    const c = data.category
    if (c.denominator == null && c.growing.length === 0 && c.fading.length === 0) {
      return 'Nothing has been read for the category in this quarter yet.'
    }
    return null
  },
}
