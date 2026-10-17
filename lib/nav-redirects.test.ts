import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { RETIRED_ADDRESSES, SURFACES, isMarketPage, redirectFor, type SearchParams } from './nav'
import { SETTINGS_ADDRESSES } from './settings/rail'

// EVERY OLD LINK LANDS (Design v2, decision 6 of the depth plan).
//
// Sent emails, stored snapshots, share links and bookmarks carry the 1 Oct
// addresses with their params: `?theme=` and `?themes=` on Conversation,
// `?vs=` on Competitive, `?item=` on Subjects, `?month=` on Your market and
// on the Dashboard, and `?rec=` / `?item=` / `?ledger=` on Your moves when it
// lived at /dashboard/market. `redirectFor` (lib/nav.ts) is the one mapping;
// this file holds it to a table of old links, written as a browser follows
// them: the server sees the path and the query, and a `#fragment` stays in
// the browser, which puts it back on a Location that has none (RFC 9110
// §10.2.2).

const ORIGIN = 'https://app.verbatimintel.com'

/** An old URL as the server sees it: the path and the params, a repeated key
 *  as a list (Next's own shape). */
function request(url: string): { path: string; params: SearchParams; hash: string } {
  const u = new URL(url, ORIGIN)
  const params: SearchParams = {}
  for (const [k, v] of u.searchParams) {
    const had = params[k]
    params[k] = had === undefined ? v : [...(Array.isArray(had) ? had : [had]), v]
  }
  return { path: u.pathname, params, hash: u.hash }
}

/** Where the browser ends up: the redirect's Location, with the old fragment
 *  carried where the Location has none; the old URL itself where nothing
 *  redirects. */
function land(url: string): string {
  const { path, params, hash } = request(url)
  const to = redirectFor(path, params)
  if (to === null) return url
  return to.includes('#') ? to : `${to}${hash}`
}

/** [old link, where it lands]. Decoded where a reader would read it; the
 *  encoding is the browser's either way. */
const TABLE: readonly [string, string][] = [
  // Your market (/dashboard/overview, 1 Oct) → Market; a month opens Market's month view.
  ['/dashboard/overview', '/dashboard/market'],
  ['/dashboard/overview?month=2026-09', '/dashboard/market?period=month&month=2026-09'],
  ['/dashboard/overview?month=2026-09&horizon=last_3', '/dashboard/market?period=month&month=2026-09&horizon=last_3'],
  ['/dashboard/overview?period=week&month=2026-09', '/dashboard/market?period=week&month=2026-09'],
  ['/dashboard/overview?detail=legend', '/dashboard/market?detail=legend'],
  // The Dashboard's own old month link (the monthly email before 1 Oct).
  ['/dashboard?month=2026-08', '/dashboard/market?period=month&month=2026-08'],
  ['/dashboard?month=2026-08&theme=t1', '/dashboard/market?period=month&month=2026-08&theme=t1'],
  ['/dashboard', '/dashboard'],
  ['/dashboard?ask=x', '/dashboard?ask=x'],
  // This week (/dashboard/week) → Market, the query and the fragment kept.
  ['/dashboard/week', '/dashboard/market'],
  ['/dashboard/week#finding-3', '/dashboard/market#finding-3'],
  ['/dashboard/week?reply=question#reply', '/dashboard/market?reply=question#reply'],
  // Conversation (/dashboard/voice): an open theme → Market's `?conv=`; the rest → Voices.
  ['/dashboard/voice?theme=reg-123', '/dashboard/market/conversations/reg-123'],
  ['/dashboard/voice?theme=reg-123#theme', '/dashboard/market/conversations/reg-123#theme'],
  ['/dashboard/voice?theme=reg-123&audience=industry-other', '/dashboard/market/conversations/reg-123?audience=industry-other'],
  ['/dashboard/voice?month=2026-09&theme=reg-123', '/dashboard/market/conversations/reg-123?period=month&month=2026-09'],
  ['/dashboard/voice?themes=fit-and-comfort', '/dashboard/market/conversations/fit-and-comfort'],
  ['/dashboard/voice?themes=fit-and-comfort,liner-sweat#grounding', '/dashboard/market/conversations/fit-and-comfort#grounding'],
  ['/dashboard/voice?themes=a&themes=b', '/dashboard/market/conversations/a'],
  ['/dashboard/voice?theme=reg-1&themes=slug-2', '/dashboard/market/conversations/reg-1'],
  ['/dashboard/voice', '/dashboard/voices'],
  ['/dashboard/voice#cast', '/dashboard/voices#cast'],
  ['/dashboard/voice?persona=p1#cast', '/dashboard/voices?persona=p1#cast'],
  ['/dashboard/voice?brand=Ottobock#board', '/dashboard/voices?brand=Ottobock#board'],
  ['/dashboard/voice?month=2026-09&brand=Ottobock&board=all', '/dashboard/voices?month=2026-09&brand=Ottobock&board=all'],
  ['/dashboard/voice?theme=&themes=', '/dashboard/voices'],
  // Competitive (/dashboard/competitive) → Voices; the brand read in full is `?brand=`.
  ['/dashboard/competitive', '/dashboard/voices'],
  ['/dashboard/competitive?vs=Ottobock', '/dashboard/voices?brand=Ottobock'],
  ['/dashboard/competitive?vs=The%20North%20Face&month=2026-09', '/dashboard/voices?brand=The+North+Face&month=2026-09'],
  ['/dashboard/competitive?horizon=last_3', '/dashboard/voices?horizon=last_3'],
  // Subjects (/dashboard/subjects) → Market; the open subject is its page (17 Oct).
  ['/dashboard/subjects', '/dashboard/market'],
  ['/dashboard/subjects?month=2026-09', '/dashboard/market?period=month&month=2026-09'],
  ['/dashboard/subjects?item=s1', '/dashboard/market/subjects/s1'],
  ['/dashboard/subjects?item=s1&questions=last_3', '/dashboard/market/subjects/s1?questions=last_3'],
  ['/dashboard/subjects?item=s1&month=2026-09', '/dashboard/market/subjects/s1?period=month&month=2026-09'],
  // Your moves' old links on /dashboard/market → /dashboard/moves?advice=.
  ['/dashboard/market?rec=rec-42', '/dashboard/moves?advice=rec-42'],
  ['/dashboard/market?item=lin-7', '/dashboard/moves?advice=lin-7'],
  ['/dashboard/market?item=lin-7#advice-lin-7', '/dashboard/moves?advice=lin-7#advice-lin-7'],
  ['/dashboard/market?ledger=all', '/dashboard/moves?advice=all'],
  ['/dashboard/market?ledger=all&item=lin-7', '/dashboard/moves?advice=lin-7'],
  ['/dashboard/market?rec=rec-42&month=2026-09', '/dashboard/moves?advice=rec-42&month=2026-09'],
  // Market's open panels are pages (17 Oct): every stored `?conv=` and
  // `?subject=` lands on its page, the other params kept, `?at=` dropped.
  ['/dashboard/market?conv=reg-123', '/dashboard/market/conversations/reg-123'],
  ['/dashboard/market?conv=reg-123&at=top#conv-panel', '/dashboard/market/conversations/reg-123#conv-panel'],
  ['/dashboard/market?period=month&month=2026-09&conv=reg-123&at=table', '/dashboard/market/conversations/reg-123?period=month&month=2026-09'],
  ['/dashboard/market?conv=reg-123&subject=s1&at=subjects', '/dashboard/market/conversations/reg-123'],
  ['/dashboard/market?conv=fit-and-comfort&in=s1&all=1', '/dashboard/market/conversations/fit-and-comfort?in=s1&all=1'],
  ['/dashboard/market?subject=s1', '/dashboard/market/subjects/s1'],
  ['/dashboard/market?subject=s1&at=subjects#subject-panel', '/dashboard/market/subjects/s1#subject-panel'],
  ['/dashboard/market?period=time&subject=s1', '/dashboard/market/subjects/s1?period=time'],
  // Market's own links stay on Market.
  ['/dashboard/market', '/dashboard/market'],
  ['/dashboard/market?period=month&month=2026-09', '/dashboard/market?period=month&month=2026-09'],
  ['/dashboard/market?in=s1&all=1#conversations', '/dashboard/market?in=s1&all=1#conversations'],
  ['/dashboard/market/week', '/dashboard/market/week'],
  ['/dashboard/market/subjects/s1?period=month', '/dashboard/market/subjects/s1?period=month'],
  ['/dashboard/market/conversations/reg-123', '/dashboard/market/conversations/reg-123'],
  // Phase 1's orphans and Reports, as before (Consumer Profile → Voices now).
  ['/dashboard/profile', '/dashboard/voices'],
  ['/dashboard/guide', '/dashboard/settings'],
  ['/dashboard/settings/connections', '/dashboard/settings'],
  ['/dashboard/reports?group=sent&item=abc', '/dashboard/studio?group=sent&item=abc'],
  ['/dashboard/reports?view=x', '/dashboard/studio?view=x'],
  // An address that is no old page is not touched.
  ['/dashboard/moves?advice=lin-7', '/dashboard/moves?advice=lin-7'],
  ['/dashboard/voices?brand=Ottobock', '/dashboard/voices?brand=Ottobock'],
]

describe('every old link lands (the table)', () => {
  it('holds at least 25 old links, each written once', () => {
    expect(TABLE.length).toBeGreaterThanOrEqual(25)
    expect(new Set(TABLE.map(([from]) => from)).size).toBe(TABLE.length)
  })

  it.each(TABLE)('%s → %s', (from, to) => {
    expect(decodeURIComponent(land(from))).toBe(decodeURIComponent(to))
  })

  it('lands every redirect on an address something serves', () => {
    const served = [...SURFACES.map((s) => s.href), ...SETTINGS_ADDRESSES]
    for (const [from] of TABLE) {
      const { path, params } = request(from)
      const to = redirectFor(path, params)
      if (to === null) continue
      const landing = new URL(to, ORIGIN).pathname
      if (!isMarketPage(landing)) expect(served, from).toContain(landing)
    }
  })

  it('never redirects a landing again: one hop, never a chain or a loop', () => {
    for (const [from] of TABLE) {
      const { path, params } = request(from)
      const to = redirectFor(path, params)
      if (to === null) continue
      const next = request(to)
      expect(redirectFor(next.path, next.params), `${from} → ${to}`).toBeNull()
    }
  })
})

// ---- the stubs ask the mapping -----------------------------------------------

const ROOT = join(__dirname, '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

/** The URL a page's `redirect()` was called with, off the error Next throws
 *  (`NEXT_REDIRECT;replace;<url>;307;`). */
async function redirectOf(page: (props: { searchParams?: Promise<SearchParams> }) => unknown, params: SearchParams): Promise<string> {
  try {
    await page({ searchParams: Promise.resolve(params) })
  } catch (error) {
    const digest = (error as { digest?: string }).digest ?? ''
    const [kind, , url, status] = digest.split(';')
    expect(kind).toBe('NEXT_REDIRECT')
    expect(status).toBe('307')
    return url
  }
  throw new Error('the page did not redirect')
}

describe('the five old reading pages are redirect stubs that ask the mapping', () => {
  const STUBS = ['overview', 'week', 'voice', 'competitive', 'subjects'] as const

  it.each(STUBS)('/dashboard/%s redirects through retiredTo, with no loader above it', async (name) => {
    const src = read(`app/dashboard/${name}/page.tsx`)
    expect(src).toContain(`retiredTo('/dashboard/${name}'`)
    expect(src).not.toMatch(/<[A-Za-z]/)
    expect(existsSync(join(ROOT, 'app', 'dashboard', name, 'loading.tsx'))).toBe(false)
    const page = (await import(join(ROOT, 'app', 'dashboard', name, 'page.tsx'))) as { default: Parameters<typeof redirectOf>[0] }
    for (const [from, to] of TABLE.filter(([f]) => request(f).path === `/dashboard/${name}`)) {
      const { params } = request(from)
      expect(decodeURIComponent(await redirectOf(page.default, params)), from).toBe(decodeURIComponent(to.split('#')[0]))
    }
  })

  it('names every one in RETIRED_ADDRESSES', () => {
    for (const name of STUBS) expect(RETIRED_ADDRESSES[`/dashboard/${name}`]).toBeDefined()
  })

  it('Market sends Your moves\' old params on, before it reads anything', () => {
    const src = read('app/dashboard/market/page.tsx')
    expect(src).toMatch(/redirectFor\('\/dashboard\/market', sp\)[\s\S]*getSessionContext\(/)
  })

  it('the Dashboard sends an old month on through the same mapping', () => {
    expect(read('app/dashboard/(home)/page.tsx')).toMatch(/frontRedirect\(/)
    expect(read('lib/nav.ts')).toMatch(/export function frontRedirect[\s\S]*?return redirectFor\('\/dashboard', params\)/)
  })

  // Design v2 (T7): the page's own loader reads `?advice=` (a lineage, a
  // recommendation id from an old `?rec=`, or `all` for the record), so the
  // route hands it the params as they came.
  it('Your moves reads `?advice=` itself, `all` as the advice record', async () => {
    const src = read('app/dashboard/moves/page.tsx')
    expect(src).toContain('loadMovesPage({ supabase, clientId, reading: readingHandle(clientId), params }')
    const v2 = await import('./pages/v2/moves')
    const { LEDGER_ALL_VALUE } = await import('./pages/market-surface')
    expect(v2.ADVICE_PARAM).toBe('advice')
    expect(v2.ADVICE_RECORD).toBe(LEDGER_ALL_VALUE)
  })
})
