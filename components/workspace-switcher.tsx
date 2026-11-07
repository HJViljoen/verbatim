"use client"

import { useState, useTransition } from "react"
import { Check, ChevronsUpDown, CornerUpLeft } from "lucide-react"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { switchWorkspace } from "@/app/dashboard/workspace/actions"
import type { OperatorView } from "@/lib/auth"
import type { WorkspaceRow } from "@/lib/workspaces"
import { VerbatimMark } from "@/components/brand/mark"
import { TAG, TAG_TONE } from "@/components/v2/look"
import { cn } from "@/lib/utils"

/** A plan's tag in sentence case ("trial" reads "Trial"): the tags were
 *  uppercase mono until the audit design. */
const planWord = (plan: string | null | undefined): string =>
  plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : "No plan"

/**
 * The tenant switcher, rendered only for platform admins (the loader decides;
 * this component never gates anything itself). It replaces the "Verbatim"
 * wordmark in the sidebar header, because the one thing an operator needs to
 * see at all times is WHOSE data is on screen.
 */
export function WorkspaceSwitcher({
  operator, workspaces,
}: { operator: OperatorView; workspaces: WorkspaceRow[] }) {
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const homeName = workspaces.find((w) => w.id === operator.homeClientId)?.company_name

  const go = (clientId: string | null) => {
    setOpen(false)
    // The action redirects, so there is nothing to do on the way back; the
    // transition just keeps the trigger dimmed while the new tree streams in.
    startTransition(() => { void switchWorkspace(clientId) })
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        disabled={pending}
        className="flex h-[46px] w-full items-center gap-3 rounded-[8px] px-3 text-left outline-hidden hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60"
      >
        {/* The boards' header (the audit design): the 46px row the wordmark
            and the client's name draw too (components/workspace-switcher-loader.tsx),
            the yellow mark, the name in ink, so the header does not shift when
            this replaces the fallback. */}
        <VerbatimMark size={20} className="shrink-0 text-brand" />
        <span className="truncate text-[17px] font-bold tracking-[-0.02em] text-foreground">
          {operator.viewingName}
        </span>
        {!operator.isHome && (
          // Only when you are somewhere that isn't yours — the tag is a warning
          // that writes from here land on someone else's tenant, so it must not
          // become wallpaper by showing all the time.
          <span className={cn("shrink-0", TAG, TAG_TONE.mid)}>
            Operator
          </span>
        )}
        <ChevronsUpDown className="ml-auto size-4 shrink-0 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-56 min-w-56">
        {workspaces.map((w) => (
          <DropdownMenuItem
            key={w.id}
            onSelect={() => go(w.id === operator.homeClientId ? null : w.id)}
            className="gap-2"
          >
            <Check className={w.id === operator.viewingClientId ? "size-3.5 opacity-100" : "size-3.5 opacity-0"} aria-hidden />
            <span className={w.is_active ? "truncate" : "truncate text-muted-foreground"}>{w.company_name}</span>
            <span className={cn("ml-auto", TAG, TAG_TONE.mid)}>
              {w.is_active ? planWord(w.plan) : "Inactive"}
            </span>
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={() => go(null)} disabled={operator.isHome} className="gap-2">
          <CornerUpLeft className="size-3.5" aria-hidden />
          <span className="truncate">Back to your workspace</span>
          {homeName && <span className="ml-auto truncate text-[12px] text-muted-foreground">{homeName}</span>}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
