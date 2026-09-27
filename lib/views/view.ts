import { viewsLive, type ViewsConfig } from './config'

// The market's views (market-first decision F; plan WP3.3: "the loaders take
// `view: 'everything' | 'market' | 'buyers' | 'makers'` from `?view=`").
//
// A VIEW IS A LENS OVER THE SAME MONTH, NEVER A DELETION. Every video stays in
// the market (decision E); a view reads the month's readings over one set of
// its videos, the set deploy 4's `lens-readings` step keeps in
// `month_lens_readings` (lib/reading/lens.ts):
//
//   everything  every video in the market: the stored month rows, no lens.
//   market      the off-topic videos set aside (lens `all_but_noise`): the
//               default once `setAside` is on (decision F).
//   buyers      makers' and off-topic videos set aside (lens `buyers`).
//   makers      the makers' own videos only (lens `makers`).
//
// THE PILL HAS THREE OPTIONS, THE PREVIEW'S: Everything · Buyers · Makers
// (Conversation.dc.html, "The market in the month"). "Everything" is the
// page's default view: `everything`, or `market` once off-topic videos are set
// aside from the default count, and then the note beside the pill says so.
//
// PURE. The URL is the state, as it is for the month and the horizon: each
// option IS an address, so a view can be shared, opened in a new tab and kept
// by an export's params. The default view writes no parameter at all.

export const MARKET_VIEWS = ['everything', 'market', 'buyers', 'makers'] as const
export type MarketView = (typeof MARKET_VIEWS)[number]

/** `?view=` */
export const VIEW_PARAM = 'view'

/** The `month_lens_readings.lens` each view reads; `everything` reads the
 *  stored month rows and no lens. */
export type ViewLens = 'all_but_noise' | 'buyers' | 'makers'
export const VIEW_LENS: Readonly<Record<MarketView, ViewLens | null>> = {
  everything: null,
  market: 'all_but_noise',
  buyers: 'buyers',
  makers: 'makers',
}

/** The pill's three options, in the preview's order and words. */
export const PILL_VIEWS = ['default', 'buyers', 'makers'] as const
export type PillView = (typeof PILL_VIEWS)[number]
export const PILL_LABEL: Readonly<Record<PillView, string>> = {
  default: 'Everything',
  buyers: 'Buyers',
  makers: 'Makers',
}

/** The view a page reads when the URL names none. */
export function defaultView(cfg: ViewsConfig | null): MarketView {
  return cfg?.setAside ? 'market' : 'everything'
}

const isView = (v: unknown): v is MarketView => typeof v === 'string' && (MARKET_VIEWS as readonly string[]).includes(v)

/**
 * The view `?view=` asks for, where the tenant may read it; else the default.
 * With no view live the parameter is not read at all, so a stored link that
 * carries one lands on the page exactly as it reads today. Buyers and Makers
 * need `views`; `market` and `everything` are readable wherever any view is
 * live (the note says which one the page is on).
 */
export function parseView(raw: unknown, cfg: ViewsConfig | null): MarketView {
  const fallback = defaultView(cfg)
  if (!viewsLive(cfg) || !isView(raw)) return fallback
  if ((raw === 'buyers' || raw === 'makers') && !cfg?.views) return fallback
  return raw
}

/** Which of the pill's three options a view presses. */
export function pillOf(view: MarketView): PillView {
  return view === 'buyers' || view === 'makers' ? view : 'default'
}

/**
 * Where a view points. The page's OWN params are carried through, as the
 * horizon's and the month's are, so switching the view keeps the month and
 * the open theme; the default view writes no parameter.
 */
export function viewHref(basePath: string, params: Readonly<Record<string, string | undefined>>, view: MarketView, cfg: ViewsConfig | null): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (k === VIEW_PARAM) continue
    if (typeof v === 'string' && v !== '') q.set(k, v)
  }
  if (view !== defaultView(cfg)) q.set(VIEW_PARAM, view)
  const s = q.toString()
  return s ? `${basePath}?${s}` : basePath
}

/** One option of the pill. */
export interface ViewChoice {
  pill: PillView
  view: MarketView
  label: string
  href: string
  active: boolean
}

/**
 * The pill's three options, each with where it points, or none where Buyers
 * and Makers are not live for the tenant: a control that does nothing is not
 * drawn (components/pages/voice-surface/audience.tsx, "a control that does
 * nothing is not drawn before then").
 */
export function viewChoices(
  basePath: string,
  params: Readonly<Record<string, string | undefined>>,
  current: MarketView,
  cfg: ViewsConfig | null,
): ViewChoice[] {
  if (!cfg?.views) return []
  const pressed = pillOf(current)
  return PILL_VIEWS.map((pill) => {
    const view: MarketView = pill === 'default' ? defaultView(cfg) : pill
    return { pill, view, label: PILL_LABEL[pill], href: viewHref(basePath, params, view, cfg), active: pill === pressed }
  })
}
