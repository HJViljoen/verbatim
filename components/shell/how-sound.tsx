'use client'

import { useSearchParams } from 'next/navigation'
import { DrawerLink } from '@/components/shell/drawer-link'
import { useDialogFocus } from '@/components/shell/dialog-focus'
import { Card, CardContent } from '@/components/ui/card'
import { detailHref } from '@/lib/shell/bar'

// "How sound is this" — the sentence a reading surface says about its own
// basis, and the record behind it (item 7, WP7's composer).
//
// IN THE OPEN, as the mock draws it (`mock-sealand/artboards/Main.dc.html`): a
// bordered band under the bar carrying the whole sentence — the updates, the
// videos, the share not in English, the tracking changes — and beside it one
// link to the record. It was briefly a pill wearing the first clause with the
// sentence in a `title` attribute; that hid the video count, the non-English
// share and the tracking-change count from every phone, every tablet, every
// screenshot and every print, on a product whose argument is that a reading
// states its own basis.
//
// Same mechanism as HowToRead: the record is static text already in the
// payload, so opening it must not cost a server round trip. `?detail=record`
// is the address, pushed with history.pushState by DrawerLink, and closing it
// returns to the page's own address, selection and all.
//
// The band prints the sentence and the record prints the rest — including the
// facts nothing has recorded yet, which print as "not recorded" rather than as
// a zero.

export function HowSound({
  basePath, params = {}, line, lines,
}: { basePath: string; params?: Record<string, string | undefined>; line: string; lines: string[] }) {
  const sp = useSearchParams()
  // Optional chaining: the hook returns null wherever there is no router —
  // a static render in a test or a script — and a page bar that throws
  // outside Next is a page bar nothing can check.
  const isOpen = sp?.get('detail') === 'record'
  // The reader's horizon and selection travel with the record, both ways. The
  // drawer is pushed with history.pushState and nothing re-renders, so a bare
  // basePath would leave the address bar saying "/dashboard/voice" while the
  // screen shows three months of one theme — and that address, copied,
  // refreshed or reached with Back, is a different reading.
  const open = detailHref(basePath, params, 'record')
  const close = detailHref(basePath, params, null)
  // The same three promises as HowToRead's legend (SH20): this drawer is the
  // other `aria-modal` overlay in the app and it opens the same way.
  const dialog = useDialogFocus(isOpen, close)
  return (
    <>
      {/* The band wraps rather than truncates: at phone width the sentence
          takes the lines it needs. It is NOT print-hidden — the basis is part
          of the reading wherever the reading is seen — but the link into the
          record is, because a link is furniture on paper. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 self-start rounded-2xl px-3 py-1.5 ring-1 ring-border">
        <span className="font-mono text-[11px] leading-[1.5] text-muted-foreground">How sound is this: {line}</span>
        <DrawerLink href={open} className="shrink-0 cursor-pointer text-[12px] font-medium text-foreground underline underline-offset-2" data-print-hide>
          the record →
        </DrawerLink>
      </div>
      {isOpen && (
        <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="how-sound-title" tabIndex={-1} className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8">
          <DrawerLink href={close} aria-label="Close" className="absolute inset-0 bg-foreground/25">{''}</DrawerLink>
          <Card className="relative z-10 w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-tile-hover">
            <DrawerLink
              href={close}
              aria-label="Close"
              className="absolute right-3 top-3 flex size-7 items-center justify-center rounded-full text-sm text-muted-foreground hover:bg-muted"
            >
              ✕
            </DrawerLink>
            <CardContent className="pt-6">
              <div className="space-y-3 pr-6">
                <h2 id="how-sound-title" className="text-base font-semibold">How sound is this?</h2>
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
