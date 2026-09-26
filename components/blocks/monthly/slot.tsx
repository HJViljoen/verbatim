import type { ReactNode } from 'react'
import type { BlockContext, RenderMode } from '@/lib/blocks/types'
import { BlockEmpty, BlockFrame } from '@/components/blocks/frame'
import type { MonthlyData } from '@/lib/pages/monthly'
import type { MonthlyBlockKey } from '@/lib/reports/monthly'
import type { MonthlySlot, MonthlySlots } from '@/lib/reports/monthly-slots'
import type { FigureTable } from '@/lib/reading/verdicts'
import { sectionFooter, type MonthlyBlock, type SectionLink } from './adapt'

/** What a filled slot holds. */
type SlotValue<K extends keyof MonthlySlots> = Extract<MonthlySlots[K], { state: 'filled' }>['value']

/**
 * A section another package fills (market-first WP2.1, the skeleton; the
 * slots are `lib/reports/monthly-slots.ts`).
 *
 * STUB: ABSENT. While the slot is a stub, `absent` is true and the
 * arrangement drops the section from the email, the deck and the share page
 * (plan WP2.1: "the missing sections are absent rather than empty"). The
 * block still renders its frame and its stub line, because the registry
 * sweep renders every block in every mode, and a block that cannot render its
 * own empty state is the defect the sweep exists to catch; no reader meets it.
 *
 * FILLED: THE PACKAGE'S VALUE. The body below is a first cut from the pinned
 * shape and the plan's words (§2.2); the owning package replaces it with its
 * front-page block's body, as every other section prints the page's block, so
 * the section and the page print one sentence.
 */
export function slotSection<K extends keyof MonthlySlots>(opts: {
  key: MonthlyBlockKey
  title: string
  slot: K
  link: (() => SectionLink) | null
  /** The stub's line: rendered by the sweep, never on an artefact. */
  stub: string
  body: (value: SlotValue<K>, data: MonthlyData, mode: RenderMode, ctx: BlockContext) => ReactNode
  figures?: (value: SlotValue<K>, data: MonthlyData) => FigureTable
}): MonthlyBlock {
  // A snapshot missing the field (or the slot) reads as a stub.
  const valueOf = (data: MonthlyData): SlotValue<K> | null => {
    const slot = data.slots?.[opts.slot] as MonthlySlot<SlotValue<K>> | undefined
    return slot?.state === 'filled' ? slot.value : null
  }
  return {
    key: opts.key,
    title: opts.title,
    absent: (data) => valueOf(data) == null,
    render(data, mode, ctx) {
      const footer = sectionFooter(mode, ctx, opts.link?.() ?? null)
      const value = valueOf(data)
      return (
        <BlockFrame title={opts.title} mode={mode} footer={footer} roomy card={mode === 'email'}>
          {value == null ? <BlockEmpty mode={mode}>{opts.stub}</BlockEmpty> : opts.body(value, data, mode, ctx)}
        </BlockFrame>
      )
    },
    figures(data) {
      const value = valueOf(data)
      return value == null || !opts.figures ? {} : opts.figures(value, data)
    },
    emptyState(data) {
      return valueOf(data) == null ? opts.stub : null
    },
  }
}
