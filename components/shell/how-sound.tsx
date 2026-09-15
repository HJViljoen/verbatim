'use client'

import { useSearchParams } from 'next/navigation'
import { DrawerLink } from '@/components/shell/drawer-link'
import { BarPill } from '@/components/shell/page-grid'
import { Card, CardContent } from '@/components/ui/card'

// "How sound is this?" — the one counter a reading surface shows about itself,
// and the record behind it (item 7, WP7's composer).
//
// Same mechanism as HowToRead: the record is static text already in the
// payload, so opening it must not cost a server round trip. `?detail=record`
// is the address, pushed with history.pushState by DrawerLink, and closing it
// returns to the page's own address.
//
// The pill prints ONE line and the record prints the rest. The rule that made
// it one line: a method note nobody reads is a method note that has failed, and
// six clauses in a page bar is a method note. Everything the clause cannot say,
// the record says in full — including the facts nothing has recorded yet, which
// print as "not recorded" rather than as a zero.

export function HowSound({ basePath, line, lines }: { basePath: string; line: string; lines: string[] }) {
  const sp = useSearchParams()
  // Optional chaining: the hook returns null wherever there is no router —
  // a static render in a test or a script — and a page bar that throws
  // outside Next is a page bar nothing can check.
  const isOpen = sp?.get('detail') === 'record'
  // The pill wears the short head of the line — the counter, not the sentence —
  // and the whole sentence is its title, so a bar at phone width never wraps.
  const head = line.split(' · ')[0]
  return (
    <>
      <DrawerLink href={`${basePath}?detail=record`} title={line} className="shrink-0 cursor-pointer" data-print-hide>
        <BarPill>How sound is this? · {head}</BarPill>
      </DrawerLink>
      {isOpen && (
        <div role="dialog" aria-modal="true" aria-label="The record" className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8">
          <DrawerLink href={basePath} aria-label="Close" className="absolute inset-0 bg-foreground/25">{''}</DrawerLink>
          <Card className="relative z-10 w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-tile-hover">
            <DrawerLink
              href={basePath}
              aria-label="Close"
              className="absolute right-3 top-3 flex size-7 items-center justify-center rounded-full text-sm text-muted-foreground hover:bg-muted"
            >
              ✕
            </DrawerLink>
            <CardContent className="pt-6">
              <div className="space-y-3 pr-6">
                <h2 className="text-base font-semibold">How sound is this?</h2>
                <p className="text-sm text-muted-foreground">{line}</p>
                {/* Unmarked on purpose: the copy contract's four kinds are
                    model prose, a code figure, a calibrated level and a
                    verdict, and these are none of them — every line is
                    composed by lib/reading/record.ts out of counted facts, and
                    marking them `level` would demand an "of N" that a delivery
                    date does not have. Rule (c) still applies to them. */}
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  {lines.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  )
}
