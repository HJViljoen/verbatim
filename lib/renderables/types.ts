import type { ReactNode } from 'react'
import type { EmailTheme } from '../email/theme'
import type { RenderMode } from '../blocks/types'
import type { ReadingHandle } from '../reading/read'

/**
 * The spine of Reports & Exports (Stage 1, 2026-08-29).
 *
 * Every dashboard page is a LOADER (`load(scope) → data`, one per page, the
 * DB waves kept exactly as the page had them — round trips cost more than
 * rows, 2026-08-23) and a set of RENDERERS (`render(data, mode)`, pure, one per
 * tile or item). The same data feeds the app page, the print route that Chrome
 * turns into PDF/PNG, and — later — the Studio, email and the agent.
 *
 * Data is TILE-READY: the shape the renderers consume, after lib/*-tiles.ts
 * has done its work. That is what a snapshot stores (report_snapshots.data),
 * so an export renders the same numbers in October that it rendered in
 * August, whatever the `*_current` views say by then.
 */

/**
 * Re-exported, not declared — the union lives in `lib/blocks/types.ts` since
 * Phase 1 WP10, so the codebase has exactly ONE RenderMode and a component
 * that takes a mode can be handed one by either spine.
 *
 * It gained a third member, `'email'`, and that costs the renderables nothing:
 * every legacy `render(data, mode)` asks `mode === 'print'` and treats
 * everything else as the screen. A legacy renderable is never CALLED with
 * `'email'` — its email is `Renderable.email`, a separate function against a
 * separate context — so the widened parameter is reach, not a change of
 * behaviour. A Block (lib/blocks/types.ts) is the thing that really renders
 * all three.
 */
export type { RenderMode } from '../blocks/types'

/**
 * Every page key the product has ever stored, in one list (Phase 1 WP9).
 *
 * A key is a STORED CONTRACT, not a route: it is `report_snapshots.ref.page`,
 * a section's `section.page` inside a built report, the `page` column on an
 * export event and the thing `/r/<token>` resolves a section by. Renaming one
 * does not move a page — it orphans every artefact that named it. So the nine
 * Phase 1 surfaces JOIN this list and the pages they replace STAY on it, with
 * `SECTION_PAGES` (lib/reports/types.ts) saying which of them a NEW report may
 * name and `components/pages/registry.ts` saying which still render.
 *
 * `overview`, `subjects` and `week` are the three new ones. `dashboard`,
 * `content` and `profile` are the retiring ones: `dashboard` keeps its module
 * with no route of its own, because one sent snapshot, one live share link and
 * the one active weekly schedule are all keyed on it and all of them would
 * quietly render a section short if the module left the registry.
 */
export const PAGE_KEYS = [
  'overview', 'subjects', 'voice', 'market', 'competitive', 'week', 'agent',
  'dashboard', 'content', 'profile',
] as const

export type PageKey = (typeof PAGE_KEYS)[number]

/** Print variants: the default export is the overview plus the selected item;
 *  `full` appends one slide per item (capped, see EXPORT_FULL_MAX_ITEMS). */
export type PrintVariant = 'default' | 'full'

export interface Scope {
  /** The session client on the app path (RLS-scoped), the admin client on the
   *  export path — where the tenant is already pinned by the session and the
   *  loader runs server-to-server. Loaders never widen their own reads. */
  supabase: unknown
  /**
   * The comment-dated reading, when this path has one (Phase 1 WP3, decision N).
   *
   * A SECOND CLIENT, ON PURPOSE. `supabase` above is the session client on the
   * app path, and the four reading functions are `revoke all … from
   * authenticated` — they take `p_client` as a parameter, so a function a
   * tenant could call is a function a tenant could call with someone else's id.
   * A reading therefore needs the service role, with the tenant id taken from
   * `getSessionContext()` and never from the URL; `ReadingHandle` carries the
   * pair together so a loader cannot separate them.
   *
   * REQUIRED since Phase 1 WP9. It was optional while WP3 shipped the reading
   * layer with no surface reading it; the moment a loader reads months, an
   * optional handle means every caller that forgot one gets a page that is
   * silently thinner than the same page reached another way — the app route
   * with a reading and the export route without it, answering the same
   * question two ways. The list is not kept by hand and the COUNT here was
   * wrong within one work package of being written — Block B joined
   * /dashboard/{subjects,market,competitive,week} and nobody re-counted. Run
   * `grep -rn 'reading: readingHandle' app lib scripts`: ten app routes
   * (/dashboard, /dashboard/{subjects,voice,videos,market,market-intel,
   * competitive,competitive-intel,week}, /dashboard/agent/[id]), /api/export,
   * lib/reports/build.ts and scripts/render-page.ts, which is a script and not
   * a page route. A loader that reads no month simply ignores it, and pays
   * nothing for it: the handle builds its service-role client lazily
   * (lib/reading/read.ts).
   */
  reading: ReadingHandle
  /**
   * Whether this reader may change what the page lets them change.
   *
   * OPTIONAL AND DEFAULTS CLOSED. Only Subjects reads it today: SU1 draws the
   * subject editor, whose controls are an affordance over a write that
   * `canManageTenant` and M4's two policies both gate. An export or a script
   * has no role to speak of and gets no controls, which is the right answer for
   * a PDF anyway.
   */
  canEdit?: boolean
  clientId: string
  /** The page's own URL params, verbatim. Selection lives here (`?item=`,
   *  `?theme=`, `?vs=`, `?persona=`…), so a loader resolves the same selection
   *  the reader was looking at when they clicked export. */
  params: Record<string, string | undefined>
  variant?: PrintVariant
}

/**
 * A quote as it travels through the spine. `ref` says where the words come
 * from — `e:<insight_evidence.id>`, `c:<comments.id>`, `v:<videos.id>` or
 * `k:<video_claims.id>`; the full list, and what each resolves THROUGH, is in
 * lib/renderables/quotes-freeze.ts, and picking the wrong kind hands back
 * somebody else's words — and
 * it is the ONLY thing a snapshot keeps: `text` is emptied on freeze and
 * resolved live on render (lib/renderables/quotes-freeze.ts). That is the
 * agent's rule, applied to every export: an erased voice cannot survive
 * inside a stored artifact.
 */
export interface Quote {
  ref: string
  text: string
  /** The language the words were written in, as comment_translations read it
   *  (item 8, decision A, 2026-09-18). Absent means nothing has read this text
   *  — not that it is English. Present on a rendered quote, never on a frozen
   *  one: it is stripped by freezeQuotes with the words and comes back with
   *  them. */
  lang?: string | null
  /** The machine translation, or null for "already English". Shown UNDER the
   *  original, stamped, never instead of it. Never frozen: it is a third
   *  party's words, so a stored artefact keeps the ref and resolves the
   *  rendering live, which is also what makes an erasure reach it. */
  english?: string | null
}

/** What one ref resolves to at render. A bare string is still accepted
 *  everywhere a resolution is, for callers that want only the words. */
export interface QuoteResolution {
  text: string
  lang?: string | null
  english?: string | null
}

export interface Slide {
  /** Slide title (the section, in the page's own words). */
  title: string
  /** Renderable keys placed on this slide, in order. */
  keys: string[]
  /** `grid` lays tiles on the 12-column grid using their own spans; `single`
   *  gives one renderable the whole slide; `item` is a detail pane (an item's
   *  full view) on its own slide. */
  layout: 'grid' | 'single' | 'item'
}

/** What an email renderer may reach for (Stage 3): where links land, an
 *  inline image (`cid:`) the runner rendered for this tile — or null, in which
 *  case the tile says it in words — and the literal-hex palette. */
export interface EmailContext {
  appUrl: string
  image(tileKey: string): string | null
  theme: EmailTheme
}

export interface Renderable<D> {
  /** Table-based, inline-styled markup for an email body (Stage 3). A tile
   *  without one is simply not in the email — it is still on the paper. A tile
   *  that HAS one may return null for "not this week": DigestEmail then drops
   *  the section, heading and framing line included. Use that only where the
   *  empty state would be noise to the reader; a tile with something honest to
   *  say when empty should say it. */
  email?: (data: D, ctx: EmailContext) => ReactNode
  /** `<page>.<tile>`, e.g. 'dashboard.strip'. Stable: it names PNG exports and
   *  registry entries; renaming one orphans stored artifacts' tile_key. */
  key: string
  title: string
  render(data: D, mode: RenderMode): ReactNode
}

export interface PageModule<D> {
  key: PageKey
  title: string
  /** null = first-run empty state; the page renders its own empty tile and an
   *  export is refused ("nothing to export yet"). */
  load(scope: Scope): Promise<D | null>
  /** Which renderables go on which slide, for this variant. Pagination is
   *  decided HERE, not by the browser — Puppeteer's PDF pipeline is unreliable
   *  with break-inside:avoid, so slides are fixed boxes with break-after. */
  slides(data: D, variant: PrintVariant): Slide[]
  renderables: Record<string, Renderable<D>>
  /** A human title for the snapshot, from the data (e.g. "Dashboard · Sealand · 23 Aug"). */
  snapshotTitle(data: D): string
  /** The short line in every slide's header; defaults to the snapshot title. */
  printContext?(data: D): string
}
