'use client'

import Link from 'next/link'
import { Check, ChevronDown } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { MonthOption } from '@/lib/shell/bar'
import { cn } from '@/lib/utils'

/**
 * The bar's month selector as a menu (default M-d, 26 Sep): the preview's chip
 * with its chevron, opening onto every month the page can read, newest first,
 * the month read marked. It always steps back, so on 1 to 3 Oct, before
 * October has a row, August and July are one click away.
 *
 * A BUTTON, SO IT IS REACHED BY KEYBOARD: Tab to the chip, Enter, Space or the
 * down arrow opens the menu, the arrows move through the months and Enter
 * follows one (the menu's own keys). Each month is a link, so it can also be
 * opened in a new tab or shared.
 */
export function MonthMenu({
  label, title, options, className,
}: { label: string; title: string; options: readonly MonthOption[]; className: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        title={title}
        aria-label={`${label}, ${title}. Choose a month`}
        className={cn(className, 'cursor-pointer hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted')}
      >
        {label}
        <ChevronDown aria-hidden className="size-3.5 shrink-0 text-secondary-foreground" strokeWidth={2} data-print-hide />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {options.map((o) => (
          <DropdownMenuItem key={o.month} asChild className="cursor-pointer gap-3 text-[12.5px]">
            <Link href={o.href} aria-current={o.current ? 'page' : undefined} className={o.current ? 'font-semibold text-foreground' : undefined}>
              <span className="min-w-0 truncate">{o.label}</span>
              {o.current ? <Check aria-hidden className="ml-auto size-3.5 shrink-0 text-foreground" /> : null}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
