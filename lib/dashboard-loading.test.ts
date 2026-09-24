import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

// EVERY DASHBOARD PAGE NAMES ITS OWN LOADING SKELETON (2026-09-24).
//
// Next wraps a segment's page in the NEAREST `loading.tsx` above it, so a page
// with none silently inherits its parent's. That is how every Phase 1 page
// came to show the pre-redesign Overview's tiles while it loaded: none of them
// had a loader, and `app/dashboard/loading.tsx` still drew the old dashboard.
// A skeleton that is the wrong page's shape is worse than none, because the
// whole page jumps when the real one lands.
//
// So a page passes only if (a) its own folder has a `loading.tsx`, (b) it is
// listed in SHARED against the ancestor whose skeleton genuinely draws it, or
// (c) it is listed in INHERITS as a redirect-only page with a reason. A new
// page fails here until someone decides which it is.

const ROOT = join(__dirname, '..', 'app', 'dashboard')

/** Page folder (relative to app/dashboard) → the ancestor folder whose
 *  loader draws it. */
const SHARED: Readonly<Record<string, string>> = {
  // The settings frame (components/settings-frame.tsx) is one shell for every
  // sub-page, and components/settings-skeleton.tsx draws that shell.
  'settings/connections': 'settings', // redirects to /dashboard/settings
  'settings/how-to-read': 'settings',
  'settings/readiness': 'settings',
  'settings/record': 'settings',
  'settings/reports': 'settings',
  'settings/subjects': 'settings',
  // Both only redirect: [id] into the Reports archive, new to the Studio or back.
  'reports/[id]': 'reports',
  'reports/new': 'reports',
  // Redirects to studio/edit/[reportId]; reports/studio/loading.tsx re-exports its skeleton.
  'reports/studio/[reportId]': 'reports/studio',
}

/** Redirect-only pages allowed to inherit whatever is above them. */
const INHERITS: Readonly<Record<string, string>> = {
  // Both redirect to /dashboard/agent. Ask's own loaders are being redone with
  // its crowd art on a separate branch; these follow it there.
  ask: 'redirects to /dashboard/agent',
  'ask/[id]': 'redirects to /dashboard/agent',
}

function pages(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...pages(p))
    else if (name === 'page.tsx') out.push(relative(ROOT, dir).split(sep).join('/'))
  }
  return out
}

const LEGACY = new Set(['competitive-intel', 'market-intel', 'videos'])

const hasLoader = (folder: string) => existsSync(join(ROOT, folder, 'loading.tsx'))
const ALL = pages(ROOT).sort()

describe('dashboard loading skeletons', () => {
  it('finds the dashboard pages', () => {
    expect(ALL).toContain('')
    expect(ALL.length).toBeGreaterThan(20)
  })

  it.each(ALL.map((f) => [f || '(root)', f]))('%s has a loader of its own or a named one', (_label, folder) => {
    if (hasLoader(folder)) return
    const shared = SHARED[folder]
    if (shared !== undefined) {
      expect(folder.startsWith(`${shared}/`), `${folder} is not under ${shared}`).toBe(true)
      expect(hasLoader(shared), `${shared}/loading.tsx is missing`).toBe(true)
      return
    }
    const reason = INHERITS[folder]
    expect(reason, `app/dashboard/${folder}/page.tsx has no loading.tsx: add one that mirrors its layout, or list it in SHARED`).toBeDefined()
    const src = readFileSync(join(ROOT, folder, 'page.tsx'), 'utf8')
    expect(src, `${folder} is listed as redirect-only but does not redirect`).toMatch(/\bredirect\(/)
    expect(src, `${folder} is listed as redirect-only but renders JSX`).not.toMatch(/<[A-Za-z]/)
  })

  it('lists no page that has gone, or that has a loader of its own', () => {
    for (const folder of [...Object.keys(SHARED), ...Object.keys(INHERITS)]) {
      expect(ALL, `${folder} is listed but has no page.tsx`).toContain(folder)
      expect(hasLoader(folder), `${folder} is listed but has its own loading.tsx`).toBe(false)
    }
  })

  // Each loader renders with no data and no router, and says it is loading.
  const LOADERS = [...new Set(ALL.filter(hasLoader).concat(Object.values(SHARED)))].sort()
  it.each(LOADERS.map((f) => [f || '(root)', f]))('%s/loading.tsx renders a status', async (_label, folder) => {
    const mod = (await import(join(ROOT, folder, 'loading.tsx'))) as { default: ComponentType }
    const html = renderToStaticMarkup(createElement(mod.default))
    expect(html.length).toBeGreaterThan(0)
    // The three legacy routes keep the loaders they had until they retire.
    if (!LEGACY.has(folder)) expect(html).toMatch(/role="status"/)
  })

  it('the root skeleton is the current Overview, not the pre-redesign dashboard', () => {
    const src = readFileSync(join(ROOT, 'loading.tsx'), 'utf8')
    expect(src).toMatch(/nav="overview"/)
    expect(src).not.toMatch(/SkeletonStrip|title="Dashboard"/)
  })
})
