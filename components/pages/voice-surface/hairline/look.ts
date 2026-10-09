// DESIGN TEST (Hairline look, Oct 2026). The switch is `?look=hairline` on
// /dashboard/voice, which next.config.ts rewrites to app/dashboard/voice/
// hairline (`./index.tsx`). These helpers keep the look on the variant's own
// links, so a click inside it stays in it.

export const LOOK_PARAM = 'look'
export const HAIRLINE_LOOK = 'hairline'

/** A page href with the look kept, so a click inside the variant stays in it.
 *  `/dashboard/voice?theme=x#theme` → `/dashboard/voice?theme=x&look=hairline#theme`. */
export function withLook(href: string): string {
  const [path, hash] = href.split('#')
  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}${LOOK_PARAM}=${HAIRLINE_LOOK}${hash != null ? `#${hash}` : ''}`
}
