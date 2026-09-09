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
        className="flex w-full items-center gap-1.5 rounded-md px-4 pt-5 pb-1 text-left outline-hidden hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60"
      >
        <span className="truncate text-[17px] font-bold tracking-[-0.02em] text-foreground">
          {operator.viewingName}
        </span>
        {!operator.isHome && (
          // Only when you are somewhere that isn't yours — the tag is a warning
          // that writes from here land on someone else's tenant, so it must not
          // become wallpaper by showing all the time.
          <span className="shrink-0 rounded-sm bg-sidebar-accent px-1 py-px font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
            Operator
          </span>
        )}
        <ChevronsUpDown className="ml-auto size-3.5 shrink-0 text-muted-foreground" aria-hidden />
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
            <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
              {w.is_active ? w.plan : "inactive"}
            </span>
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={() => go(null)} disabled={operator.isHome} className="gap-2">
          <CornerUpLeft className="size-3.5" aria-hidden />
          <span className="truncate">Back to your workspace</span>
          {homeName && <span className="ml-auto truncate text-[11px] text-muted-foreground">{homeName}</span>}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
