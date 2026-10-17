'use client'

import Link from 'next/link'
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { hasSiblings, type Crumb, type CrumbItem, type CrumbMenu, type CrumbSlot } from '@/lib/pages/crumbs'
import { cn } from '@/lib/utils'

// THE BREADCRUMB IN THE PAGE BAR (depth as pages, 17 Oct; the F2 boards'
// "Depth as pages", Heinrich's reference Supabase's top bar). On a level page
// the path replaces the title, 26px on the bar's 40px line: each ancestor a
// link in the muted ink at 500, a light slash between, the page itself in ink
// at 700 as the page's one h1. Every segment with siblings carries a 28px
// chevron that opens them (`aria-haspopup="menu"`); a segment with none is
// plain text, never a disabled button.
//
// ON A PHONE (F2-Market-Subject-Phone): "‹ {parent}" at 14px/600 above the
// page's name at 24px and its chevron; the ancestors' own chevrons stay on
// the wider bar.
//
// WHERE THE PATH WRAPS (17 Oct, drawn on production's names): each slash
// rides at the head of the crumb after it, in one unbreakable item, so a line
// never ends on a slash (at 1440 Össur's "Market / Community & encouragement
// /" stood over its page's name). An ancestor stops at `ANCESTOR_MAX` and
// ends in an ellipsis, its whole name still its text (a screen reader reads
// it all) and its `title`, so a real path holds one line at 1440 beside the
// period switch; the page's own name is never cut, and where it cannot fit
// beside its ancestors (at 1024, or a long label) it takes the next line,
// its slash with it, and wraps inside itself.
//
// THE SWITCHER (F2-Market-Subject-Switcher): the parent's set in the parent's
// order, the current page ticked, a state in words where it has one and never
// a figure, the unready below a hairline. Keyboard: Enter or Space on the
// chevron opens it on the current entry; the arrows, Home and End move;
// Enter follows; Escape closes and gives the chevron its focus back; Tab or a
// click outside closes it.
//
// CLIENT-SAFE BY CONSTRUCTION: it takes plain data (lib/pages/crumbs.ts) and
// imports nothing a browser bundle cannot hold (lib/test/client-chains.ts).

/** An ancestor's widest, before its ellipsis: Össur's "Community &
 *  encouragement / Praise for resilience and courage" fits 1440's bar beside
 *  the period switch; wider screens give a subject's name more. */
export const ANCESTOR_MAX = 'max-w-[11rem] min-[1680px]:max-w-[20rem]'

/** The light slash between two crumbs, at the head of the second. */
function Slash({ className }: { className?: string }) {
  return <span aria-hidden className={cn('shrink-0 text-[26px] leading-10 font-light text-muted-foreground/45', className)}>/</span>
}

/** A label replayed from a prose slot carries its node (the copy contract);
 *  a name a person gave, or the page's own words, is plain text. */
function Label({ children, slot }: { children: ReactNode; slot?: CrumbSlot }) {
  return slot ? <span data-copy="subject" data-slot={slot}>{children}</span> : <>{children}</>
}

/** The boards' up-down glyph. */
function UpDown() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="size-4">
      <path d="m8 9 4-4 4 4" />
      <path d="m8 15 4 4 4-4" />
    </svg>
  )
}

function Tick() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="size-4 shrink-0 text-orange-text">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

/** One entry of the switcher. */
function Entry({ item, dim, onKeyDown }: { item: CrumbItem; dim?: boolean; onKeyDown: (e: KeyboardEvent<HTMLAnchorElement>) => void }) {
  return (
    <Link
      href={item.href}
      role="menuitemradio"
      aria-checked={item.current}
      tabIndex={-1}
      data-menu-item=""
      onKeyDown={onKeyDown}
      className={cn(
        'flex min-h-[38px] items-center gap-2 rounded-lg px-2.5 py-[9px] text-[14px] leading-[1.3] text-foreground no-underline outline-none transition-colors hover:bg-inner focus-visible:bg-inner focus-visible:ring-2 focus-visible:ring-ring',
        item.current ? 'bg-accent font-semibold hover:bg-accent focus-visible:bg-accent' : null,
      )}
    >
      {item.current ? <Tick /> : <span aria-hidden className="size-4 shrink-0" />}
      <span className={cn('min-w-0', dim ? 'text-muted-foreground' : null)}><Label slot={item.slot}>{item.label}</Label></span>
      {item.note ? <span className="ml-auto whitespace-nowrap pl-2 text-[12px] font-normal text-muted-foreground">{item.note}</span> : null}
    </Link>
  )
}

/** A segment's chevron and the menu of its siblings. */
export function Switcher({ menu, defaultOpen = false, className }: {
  menu: CrumbMenu
  defaultOpen?: boolean
  /** The chevron's placement beside its label (the page's own name sets it
   *  on its first line). */
  className?: string
}) {
  // `defaultOpen` draws it open on first render (the board's open state, for
  // the render tier and the shots); the app never passes it.
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  const button = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const items = useCallback((): HTMLAnchorElement[] => Array.from(list.current?.querySelectorAll<HTMLAnchorElement>('[data-menu-item]') ?? []), [])

  const close = useCallback((focus: boolean) => {
    setOpen(false)
    if (focus) button.current?.focus()
  }, [])

  // On opening, the current entry (else the first) takes the focus.
  useEffect(() => {
    if (!open) return
    const all = items()
    ;(all.find((a) => a.getAttribute('aria-checked') === 'true') ?? all[0])?.focus()
  }, [open, items])

  // A click or a tap outside the chevron and its menu closes it.
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      const t = e.target as Node
      if (!list.current?.contains(t) && !button.current?.contains(t)) close(false)
    }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [open, close])

  const onItemKey = (e: KeyboardEvent<HTMLAnchorElement>) => {
    const all = items()
    const at = all.indexOf(e.currentTarget)
    const go = (i: number) => {
      e.preventDefault()
      all[(i + all.length) % all.length]?.focus()
    }
    if (e.key === 'ArrowDown') go(at + 1)
    else if (e.key === 'ArrowUp') go(at - 1)
    else if (e.key === 'Home') go(0)
    else if (e.key === 'End') go(all.length - 1)
    else if (e.key === 'Escape') {
      e.preventDefault()
      close(true)
    } else if (e.key === 'Tab') close(false)
    else if (e.key === ' ') {
      e.preventDefault()
      e.currentTarget.click()
    }
  }

  const onButtonKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setOpen(true)
    } else if (e.key === 'Escape' && open) {
      e.preventDefault()
      close(true)
    }
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={menu.switchLabel}
        data-crumb-chevron=""
        onClick={() => (open ? close(false) : setOpen(true))}
        onKeyDown={onButtonKey}
        className={cn(
          'inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[7px] text-muted-foreground transition-colors hover:bg-track hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          open ? 'bg-track text-foreground' : null,
          className,
        )}
      >
        <UpDown />
      </button>
      {open ? (
        <div
          ref={list}
          id={id}
          role="menu"
          aria-label={menu.label}
          className="absolute left-[-10px] top-[44px] z-20 flex max-h-[min(480px,70vh)] w-[340px] max-w-[calc(100vw-32px)] flex-col gap-px overflow-y-auto rounded-[12px] bg-card p-1.5 shadow-panel ring-1 ring-foreground/6"
        >
          {/* The board's small-caps label, for the eye: a menu may own only
              its items and separators (ARIA), and its name is already
              `aria-label`, so a screen reader is not told it twice. */}
          <p aria-hidden className="m-0 mx-2.5 mb-1.5 mt-2 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{menu.label}</p>
          {menu.items.map((item) => <Entry key={item.key} item={item} onKeyDown={onItemKey} />)}
          {menu.below && menu.below.length > 0 ? (
            <>
              <div role="separator" className="mx-1 my-[5px] h-px bg-track" />
              {menu.below.map((item) => <Entry key={item.key} item={item} dim onKeyDown={onItemKey} />)}
            </>
          ) : null}
        </div>
      ) : null}
    </>
  )
}

/** The bar's path: the ancestors and the page, each with its switcher where
 *  it has siblings; on a phone, the way back above the page's name. */
export function Crumbs({ crumbs, open }: { crumbs: readonly Crumb[]; open?: 'current' }) {
  const current = crumbs[crumbs.length - 1]
  const parent = crumbs.length > 1 ? crumbs[crumbs.length - 2] : null
  if (!current) return null
  return (
    <div data-crumbs="" className="min-w-0">
      {parent?.href ? (
        <Link href={parent.href} className="inline-flex min-h-8 items-center gap-1 text-[14px] font-semibold text-muted-foreground no-underline hover:text-foreground sm:hidden">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="size-4"><path d="m15 18-6-6 6-6" /></svg>
          <Label slot={parent.slot}>{parent.label}</Label>
        </Link>
      ) : null}
      <nav aria-label="Breadcrumb">
        <ol className="m-0 flex min-h-10 list-none flex-wrap items-center gap-x-2.5 p-0 max-sm:min-h-0">
          {crumbs.slice(0, -1).map((c, i) => (
            <li key={i} className="flex min-w-0 items-center gap-x-2.5 max-sm:hidden">
              {i > 0 ? <Slash /> : null}
              <span className="relative flex min-w-0 items-center gap-0.5">
                {c.href ? (
                  <Link href={c.href} title={c.label} className={cn('min-w-0 truncate text-[26px] leading-10 font-medium tracking-[-0.015em] text-muted-foreground no-underline underline-offset-[5px] decoration-1 hover:text-foreground hover:underline', ANCESTOR_MAX)}>
                    <Label slot={c.slot}>{c.label}</Label>
                  </Link>
                ) : <span title={c.label} className={cn('min-w-0 truncate text-[26px] leading-10 font-medium tracking-[-0.015em] text-muted-foreground', ANCESTOR_MAX)}><Label slot={c.slot}>{c.label}</Label></span>}
                {hasSiblings(c.menu) ? <Switcher menu={c.menu} /> : null}
              </span>
            </li>
          ))}
          {/* A name that wraps keeps its slash and its chevron on its first
              line (the chevron centred on that 40px line). */}
          <li className="flex min-w-0 items-center gap-x-2.5 sm:items-start">
            {crumbs.length > 1 ? <Slash className="max-sm:hidden" /> : null}
            <span className="relative flex min-w-0 items-center gap-0.5 sm:items-start">
              <h1 aria-current="page" className="m-0 min-w-0 text-[26px] leading-10 font-bold tracking-[-0.015em] text-foreground max-sm:text-[24px] max-sm:leading-[1.2]">
                <Label slot={current.slot}>{current.label}</Label>
              </h1>
              {hasSiblings(current.menu) ? <Switcher menu={current.menu} defaultOpen={open === 'current'} className="sm:mt-1.5" /> : null}
            </span>
          </li>
        </ol>
      </nav>
    </div>
  )
}
