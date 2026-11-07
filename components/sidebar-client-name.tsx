import { VerbatimMark } from "@/components/brand/mark"

/**
 * THE CLIENT'S OWN NAME BESIDE THE MARK (the audit design, decision 13; the
 * boards' header, "Össur"): the yellow mark, then the company name at 17px
 * bold in ink, in the boards' 46px row. No arrow: a client cannot switch, so
 * nothing here looks pressable. (The boards draw 16px; 17px keeps the palette
 * guard's pinned header size.)
 *
 * A leaf, so `scripts/pages-shots.ts` draws the shipped header (the wordmark
 * needs next/font, which only Next's compiler runs).
 */
export function SidebarClientName({ name }: { name: string }) {
  return (
    <div className="flex h-[46px] min-w-0 items-center gap-3 px-3">
      <VerbatimMark size={20} className="shrink-0 text-brand" />
      <span className="min-w-0 truncate text-[17px] font-bold tracking-[-0.01em] text-foreground">{name}</span>
    </div>
  )
}
