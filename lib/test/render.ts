import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'

// The component-render test tier (Phase 1 WP0, decision X). Vitest's include
// gained `components/**/*.test.tsx`; this is what those tests call.
//
// A static render, and nothing more: no jsdom, no testing-library, no new
// dependency. `renderToStaticMarkup` runs a tree once on the server and hands
// back HTML, which is exactly the level the copy-and-figures contract is
// written at — what a block PRINTS, not what it does when clicked. A block
// that needs a click needs a different kind of test and probably a different
// kind of block.
//
// Why this module and not a bare import in every test: react-dom/server cannot
// be imported statically from an app route (Next compiles the route in the RSC
// layer and the import fails there — AGENTS.md, and lib/email/render-html.ts
// loads it at runtime for exactly that reason). Keeping the import in ONE file
// under lib/test means the day someone reaches for it from a route, they reach
// for a file whose name says "test" first.

/** Render a node to static HTML — the markup a block would print. */
export function render(node: ReactNode): string {
  return renderToStaticMarkup(node)
}

/** The visible words of a node: tags dropped, entities decoded, whitespace
 *  collapsed. What a reader actually reads, which is what the copy rules are
 *  about. */
export function renderText(node: ReactNode): string {
  return markupText(render(node))
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
}

/** Decode the entities React's escaper emits (`&amp; &lt; &gt; &quot; &#x27;`)
 *  plus the numeric forms. Non-ASCII is not escaped by React and needs none. */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = Number.parseInt(body.slice(2), 16)
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole
    }
    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole
    }
    return ENTITIES[body.toLowerCase()] ?? whole
  })
}

/** Strip tags and comments from a markup string and return its visible words.
 *  Tags become a single space, so `<b>one</b><b>two</b>` reads as two words
 *  and never as `onetwo`. */
export function markupText(markup: string): string {
  return decodeEntities(
    markup
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]*>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim()
}
