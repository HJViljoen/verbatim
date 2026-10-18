/**
 * First sentence of a recommendation's reasoning, for the email (T0-10, kept
 * from the retired weekly email). The app shows the full rationale; the email
 * leads with the action and needs one line of why, or the quote falls below
 * the fold on a 390px phone. Abbreviations that end in a period are not
 * sentence ends; a reasoning with no terminator at all is returned whole.
 */
export function firstSentence(text: string, maxChars = 240): string {
  const trimmed = text.trim()
  if (!trimmed) return ''
  const match = trimmed.match(/^[\s\S]*?[.!?](?=\s|$)/)
  let out = match ? match[0].trim() : trimmed
  if (match && out.length < 40 && trimmed.length > out.length) {
    const second = trimmed.slice(out.length).match(/^\s*[\s\S]*?[.!?](?=\s|$)/)
    if (second) out = (out + second[0]).trim()
  }
  if (out.length > maxChars) out = `${out.slice(0, maxChars).trimEnd()}…`
  return out
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

/** A link's text: its tags dropped, and, with `linkBlocks`, each block
 *  inside it (a row's eyebrow, its name, its figure) its own line. */
function linkText(inner: string, linkBlocks: boolean): string {
  if (!linkBlocks) return inner.replace(/<[^>]+>/g, '').trim()
  return inner
    .replace(/<br\s*\/?>|<\/?(p|div|h[1-6])\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}

/** The plain-text alternative, read off the same HTML: block ends become line
 *  breaks, cells become spaces, links keep their address. No dependency.
 *
 *  `linkBlocks` (the weekly read's version 3 only, so every other email's
 *  text stays exactly as it was): a link that wraps a whole row keeps each
 *  block inside it on its own line, where a plain link's tags are dropped
 *  and its words run together ("Also talked aboutHow the prosthesis
 *  works14 videos"), and a link whose whole text is an arrow, which repeats
 *  its row's link beside it, is left out. */
export function htmlToText(html: string, opts: { linkBlocks?: boolean } = {}): string {
  const linkBlocks = opts.linkBlocks === true
  let s = html
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, (_, alt) => (alt ? `[${alt}]` : ''))
    .replace(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, inner) => {
      const text = linkText(inner, linkBlocks)
      return linkBlocks && text === '→' ? '' : `${text} (${href})`
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|tr|h[1-6]|li|blockquote|table)\b[^>]*>/gi, '\n')
    .replace(/<\/t[dh]>/gi, '  ')
    .replace(/<[^>]+>/g, '')
    // Numeric entities come in both bases: React writes an apostrophe as the
    // hex &#x27;, so a company name like Össur's read as Össur&#x27;s here.
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      const c = e.toLowerCase()
      if (c.startsWith('#x')) return String.fromCodePoint(parseInt(c.slice(2), 16))
      if (c.startsWith('#')) return String.fromCodePoint(Number(c.slice(1)))
      return ENTITIES[c] ?? m
    })
  s = s
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{2,}/g, '\n')
  return s.trim()
}
