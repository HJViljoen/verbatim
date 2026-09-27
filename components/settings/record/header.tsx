import type { ReactNode } from 'react'

/**
 * The scope statement. (The save-state strip left with the rail: the approved
 * SettingsRecord artboard draws tabs over the page and no strip, and this page
 * edits nothing. The sub-page's own header, "The record" with its delivery
 * meta and its rule, left with the 25 Sep rulings: the tab opens on its first
 * tile, as the approved preview does, and the delivery figures are the
 * Delivery tile's.)
 */

/**
 * The scope statement, in place of the artboard's "Export the record" button
 * (`record.export`).
 *
 * THE BUTTON IS BLOCKED BY THE REGISTRY, NOT BY EFFORT, AND THE PAGE SAYS SO.
 * `/api/export` renders a REGISTERED PAGE KEY through headless Chrome, and
 * `components/pages/registry.ts` has no `settings` module — `pageModule
 * ('settings')` is null, although `lib/nav.ts` names the key. Registering one
 * would mean building a renderable module whose tiles are a settings FORM, and
 * the export pipeline's tiles are readings. A button that produced nothing
 * would be worse than a block that can be selected and pasted, so the record
 * exports as text and the page states the reason in one sentence.
 *
 * THAT SENTENCE IS NOT WRITTEN IN THE IMPLEMENTER'S NOUNS (Block D wave 3,
 * RC4). It used to read "Export renders a registered page, and Settings has no
 * page module", and `ScopeStatement` renders `why` as a visible `<p>`, not a
 * tooltip — so a client read "a registered page" and "page module", which are
 * the export route's internals and this file's business, not theirs. mock-gap
 * element 21 asks the page to SAY WHY there is no export button; it does not
 * ask it to say so in our nouns. The paragraph above is where the mechanism
 * belongs.
 */

/**
 * The sentence the page prints where the artboard draws "Export the record".
 *
 * Exported so the route and the render tier say the same thing: the tier used
 * to assert on a stand-in of its own ("no registered page module"), which is
 * how the jargon survived a copy lens on a passing test.
 */
export const NO_EXPORT_WHY =
  'There is no file to download here. The record is printed below instead, to select and paste.'

export function ScopeStatement({ text, why }: { text: string; why?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      {why ? <p className="m-0 text-[13px] text-muted-foreground">{why}</p> : null}
      <div className="whitespace-pre-wrap rounded-[4px] bg-inner px-4 py-3 font-mono text-[13px] leading-[1.6] text-secondary-foreground ring-1 ring-border">
        {text}
      </div>
    </div>
  )
}
