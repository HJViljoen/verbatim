'use client'

import Link from 'next/link'
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { hasSiblings, type Crumb, type CrumbItem, type CrumbMenu, type CrumbSlot } from '@/lib/pages/crumbs'
import { cn } from '@/lib/utils'

// THE PATH, A SLIM ROW OF ITS OWN (F3-Market-Nav, 17 Oct; Heinrich: the
// subject's page and the conversation's "look the same and say the same", so
// the hierarchy was lost). On a level page the path is a 14px row at the top
// of the content column with a hairline under it, edge to edge of the column:
// each ancestor a muted link at 500, a light slash between, the page itself
// in ink at 600. The page's NAME is no longer the path's last segment: the
// title block under the row (components/shell/level-bar.tsx) names the level
// and holds the page's one h1. Every segment with siblings carries a 22px
// up-down button that opens them (`aria-haspopup="menu"`), ancestors
// included; a segment with none is plain text, never a disabled button.
//
// ON A PHONE (F3's phone boards, as F2's): the row becomes the way back,
// "‹ {parent}" at 14px/600 above the level label and the title, and the
// page's own chevron rides after the title (`LevelBar`).
//
// WHERE THE PATH WRAPS (17 Oct, drawn on production's names): each slash
// rides at the head of the crumb after it, in one unbreakable item, so a line
// never ends on a slash. An ancestor stops at `ANCESTOR_MAX` and ends in an
// ellipsis, its whole name still its text (a screen reader reads it all) and
// its `title`; the page's own segment is never cut, and wraps inside itself
// where it cannot fit.
//
// THE SWITCHER (F2-Market-Subject-Switcher, F3-Market-Nav 4 and 5): the
// parent's set in the parent's order, the current page ticked, a state in
// words where it has one and never a figure, the unready below a hairline. It
// opens under its own chevron in the row. Keyboard: Enter or Space on the
// chevron opens it on the current entry; the arrows, Home and End move;
// Enter follows; Escape closes and gives the chevron its focus back; Tab or a
// click outside closes it (`scripts/crumbs-keys.ts`).
//
// CLIENT-SAFE BY CONSTRUCTION: it takes plain data (lib/pages/crumbs.ts) and
// imports nothing a browser bundle cannot hold (lib/test/client-chains.ts).

/** An ancestor's widest, before its ellipsis: at 14px a real path holds one
 *  line beside nothing (the period switch sits under the row now). */
export const ANCESTOR_MAX = 'max-w-[16rem] min-[1680px]:max-w-[24rem]'

/** The light slash between two crumbs, at the head of the second: 17px at
 *  300 in palette A's muted at 45% (the board's warm `#B9B6AE` is a neutral
 *  the drift guard refuses). */
function Slash({ className }: { className?: string }) {
  return <span aria-hidden className={cn('shrink-0 pr-1 pl-[5px] text-[17px] leading-[22px] font-light text-muted-foreground/45', className)}>/</span>
}

/** A label replayed from a prose slot carries its node (the copy contract);
 *  a name a person gave, or the page's own words, is plain text. */
function Label({ children, slot }: { children: ReactNode; slot?: CrumbSlot }) {
  return slot ? <span data-copy="subject" data-slot={slot}>{children}</span> : <>{children}</>
}

/** The boards' up-down glyph. */
function UpDown() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="size-3.5">
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

/** A segment's chevron and the menu of its siblings: the board's 22px
 *  button, its menu opening under it. */
export function Switcher({ menu, defaultOpen = false, className }: {
  menu: CrumbMenu
  defaultOpen?: boolean
  /** The chevron's placement beside its label (the phone's title sets it
   *  beside its first line). */
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
          'inline-flex size-[22px] shrink-0 cursor-pointer items-center justify-center rounded-[5px] text-muted-foreground transition-colors hover:bg-track hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
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
          className={cn('absolute left-[-4px] top-[30px] z-20 flex max-h-[min(480px,70vh)] max-w-[calc(100vw-32px)] flex-col gap-px overflow-y-auto rounded-[12px] bg-card p-1.5 shadow-panel ring-1 ring-foreground/6', menu.wide ? 'w-[460px]' : 'w-[320px]')}
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

/** The row's path (F3-Market-Nav): the ancestors and the page, each with
 *  its switcher where it has siblings, a hairline under the row edge to edge
 *  of the content column. From 640 only: a phone has the way back
 *  (`BackLink`) and the title's own chevron instead. */
export function CrumbRow({ crumbs, open }: { crumbs: readonly Crumb[]; open?: 'current' }) {
  const current = crumbs[crumbs.length - 1]
  if (!current) return null
  return (
    <div data-crumb-row="" className="border-b border-border pt-3 pb-[11px] max-sm:hidden sm:-mx-4 sm:-mt-[18px] sm:px-4 md:-mx-10 md:-mt-7 md:px-10">
      <nav aria-label="Breadcrumb">
        <ol className="m-0 flex min-h-[26px] min-w-0 list-none flex-wrap items-center p-0 text-[14px] leading-[22px]">
          {crumbs.map((c, i) => {
            const here = i === crumbs.length - 1
            return (
              <li key={i} className="relative flex min-w-0 items-center">
                {i > 0 ? <Slash /> : null}
                {here
                  ? <span aria-current="page" className="min-w-0 px-[5px] py-px font-semibold text-foreground"><Label slot={c.slot}>{c.label}</Label></span>
                  : c.href
                    ? <Link href={c.href} title={c.label} className={cn('min-w-0 truncate rounded-[5px] px-[5px] py-px font-medium text-muted-foreground no-underline transition-colors hover:bg-track hover:text-foreground', ANCESTOR_MAX)}><Label slot={c.slot}>{c.label}</Label></Link>
                    : <span title={c.label} className={cn('min-w-0 truncate px-[5px] py-px font-medium text-muted-foreground', ANCESTOR_MAX)}><Label slot={c.slot}>{c.label}</Label></span>}
                {hasSiblings(c.menu) ? <Switcher menu={c.menu} defaultOpen={here && open === 'current'} /> : null}
              </li>
            )
          })}
        </ol>
      </nav>
    </div>
  )
}

/** On a phone, the row becomes the way back to the parent ("‹ Market",
 *  "‹ Fit & comfort"), above the level label and the title. */
export function BackLink({ crumbs }: { crumbs: readonly Crumb[] }) {
  const parent = crumbs.length > 1 ? crumbs[crumbs.length - 2] : null
  if (!parent?.href) return null
  return (
    <Link href={parent.href} data-back-link="" className="inline-flex min-h-8 items-center gap-1 text-[14px] font-semibold text-muted-foreground no-underline hover:text-foreground sm:hidden">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="size-4"><path d="m15 18-6-6 6-6" /></svg>
      <Label slot={parent.slot}>{parent.label}</Label>
    </Link>
  )
}
