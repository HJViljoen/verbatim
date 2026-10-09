'use client'

import { useEffect, useState } from 'react'
import { BookOpenText, MapPin, MessageSquareText, TextQuote, Users, type LucideIcon } from 'lucide-react'
import { KIND_ICON } from '@/components/colour-roles'

// DESIGN TEST (Hairline look; see ./body.tsx). The /figures page's shelf list
// as the page's index: an icon, the name, a mono count at the right, the
// section in view on a stone plate. Anchors, not filters: every block stays
// on the page. A sticky column at 1280px and wider; a strip of pills above
// the blocks below that (its kind rows left out). Icons are keyed by name
// because a server component cannot hand a component to a client one.

export interface Shelf {
  id: string
  label: string
  count: string | null
  /** 'board' · 'theme' · 'where' · 'who' · 'words', or a kind key. */
  icon: string
  /** A kind under "The market's words". */
  sub?: boolean
}

const SECTION_ICON: Record<string, LucideIcon> = {
  board: MessageSquareText,
  theme: BookOpenText,
  where: MapPin,
  who: Users,
  words: TextQuote,
}

export function Shelves({ items }: { items: Shelf[] }) {
  const [on, setOn] = useState<string | null>(items[0]?.id ?? null)

  useEffect(() => {
    const els = items.map((s) => document.getElementById(s.id)).filter((e): e is HTMLElement => e != null)
    if (els.length === 0 || typeof IntersectionObserver === 'undefined') return
    const seen = new Set<string>()
    const order = items.map((s) => s.id)
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) seen.add(e.target.id)
          else seen.delete(e.target.id)
        }
        // The most specific block crossing the reading line: the last one in
        // the index's order (a kind wins over "The market's words").
        const hit = [...order].reverse().find((id) => seen.has(id))
        if (hit) setOn(hit)
      },
      { rootMargin: '-12% 0px -72% 0px' },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [items])

  if (items.length === 0) return null
  return (
    <nav className="hl-shelves" aria-label="On this page">
      <ul>
        {items.map((s) => {
          const Icon = SECTION_ICON[s.icon] ?? KIND_ICON[s.icon]
          const current = on === s.id
          return (
            <li key={s.id} className={s.sub ? 'hl-shelf-sub' : undefined}>
              <a href={`#${s.id}`} className="hl-shelf" aria-current={current ? 'true' : undefined}>
                {Icon ? <Icon aria-hidden className="hl-shelf-icon" strokeWidth={1.75} /> : <span aria-hidden className="hl-shelf-icon" />}
                <span className="hl-shelf-label">{s.label}</span>
                {s.count != null ? <span data-copy="figure" className="hl-shelf-n">{s.count}</span> : null}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
