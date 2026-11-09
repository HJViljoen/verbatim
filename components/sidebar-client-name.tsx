import { VerbatimMark } from "@/components/brand/mark"
import { Bone } from "@/components/shell/skeleton"

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

/**
 * THE HEADER WHILE THE SESSION RESOLVES (T1.8, 9 Nov): the dashboard layout's
 * Suspense fallback. The name's own row, the mark where it sits, and one bone
 * about a name's width where the name lands, so nothing moves when the name
 * (or the operator's switcher, the same row) replaces it. No word: the
 * "Verbatim" wordmark here read as a second name that changed on every hard
 * load.
 */
export function SidebarNamePending() {
  return (
    <div data-sidebar-name-pending="" className="flex h-[46px] min-w-0 items-center gap-3 px-3">
      <VerbatimMark size={20} className="shrink-0 text-brand" />
      <Bone className="h-4 w-16" />
    </div>
  )
}
