import { directionWordsFor } from '../config'
import type { ReportSection, ReportTemplate } from './types'

/**
 * A starter's keys, minus the tiles the pages no longer register.
 *
 * D1 took `voice.movers` out of the Voice module's catalogue, and
 * `studioCatalogue()` enumerates exactly that — so a starter that still names
 * it creates a report whose stored section holds a tile the picker cannot
 * show: the outline counts "6 of 5 tiles" and the first tile the user toggles
 * silently rewrites the section without it. The deck is fine either way
 * (`sectionSlides` keeps only the keys `slides()` emits), which is why the
 * starters' own "dropped at build time with a warning" is true of paper and
 * not of the Studio. Phase 1 flips `voice.movers` and the tile comes back.
 */
export function templateKeys(keys: string[], directionWords = directionWordsFor('voice.movers')): string[] {
  return directionWords ? keys : keys.filter((k) => k !== 'voice.movers')
}

/**
 * The four starters (spec §5). A template only ARRANGES pages the pipeline
 * already produces and sets the cover register — never new analysis. Keys are
 * the pages' static renderables (components/pages/<page>/index.tsx); a key the
 * registry does not know is dropped at build time with a warning, so a
 * renamed tile degrades a template rather than breaking it.
 *
 * Kept in code, not rows: versioned with the pages they name. A tenant's own
 * arrangement is the workspace's own template — a reports row (Stage 3).
 */
export const STARTER_TEMPLATES: ReportTemplate[] = [
  {
    // THE WEEKLY REPORT, AND IT IS NOT AN ARRANGEMENT OF PAGES (Phase 1 WP17).
    // It is composed from block keys (lib/reports/weekly.ts), so it carries no
    // sections and is never offered as a starting point for a report. It is in
    // this list for one reason: a schedule names what it sends through
    // `starter_key`, and every guard that asks "is this a template we know?"
    // must answer yes for it — otherwise editing the recipients of the one
    // schedule that matters is refused with "Pick a template."
    key: 'weekly_report',
    artefact: true,
    name: 'Weekly report',
    audience: 'general',
    description: 'The state of the week, every number stated against the month: the six sections that go to everyone after every update.',
    sections: [],
  },
  {
    // THE MONTHLY REPORT (Phase 1 WP18), and it is here for exactly the reason
    // the weekly one is: a schedule names what it sends through `starter_key`
    // until M8's `report_schedules.artefact` column lands, and every guard that
    // asks "is this a template we know?" must answer yes for it — otherwise the
    // moment an operator points a schedule at the monthly report, editing its
    // recipients is refused with "Pick a template." `artefact: true` keeps it
    // out of the picker: it is an arrangement of BLOCK keys
    // (lib/reports/monthly.ts) and carries no sections, so it is not a starting
    // point for a report anybody could edit.
    key: 'monthly_report',
    artefact: true,
    name: 'Monthly report',
    audience: 'general',
    description: 'The month in full: where you stand on your subjects, what moved, the rivals’ month, your moves, one voice per subject and what to decide before the next reading.',
    sections: [],
  },
  {
    // THE QUARTERLY REVIEW (Phase 1 WP20), and it is not an arrangement of
    // pages either: eight blocks over one reading (lib/reports/quarterly.ts).
    // It is here for the single reason the weekly report is — a schedule names
    // what it sends through `starter_key` until M8's `artefact` column is
    // applied, and every guard that asks "is this a template we know?" must
    // answer yes. Without this entry a quarterly schedule created through
    // Settings is refused by app/dashboard/studio/actions.ts with "Pick a
    // template." the moment anyone edits its recipients.
    key: 'quarterly_review',
    artefact: true,
    name: 'Quarterly review',
    audience: 'general',
    description: 'The quarter against the quarter before it, where six monthly readings stand behind both sides: the eight pages that go out after the first update of each quarter.',
    sections: [],
  },
  {
    // RETIRED (Phase 1 WP17). The weekly REPORT replaces it — an arranged
    // report over block keys, stated month-to-date against the trailing
    // baseline, rather than the dashboard's run-indexed tiles. It stays here,
    // resolvable, because Össur's live schedule and one sent snapshot name it
    // and must keep rendering until an operator migrates them
    // (scripts/migrate-schedule-keys.ts); it is simply never offered again.
    key: 'weekly_digest',
    retired: true,
    name: 'Weekly digest',
    audience: 'general',
    description: 'The retiring digest: what changed since the last update, over the old Dashboard\u2019s tiles. Replaced by the weekly report.',
    sections: [
      { page: 'dashboard', params: {}, keys: ['dashboard.strip', 'dashboard.hero', 'dashboard.sentiment', 'dashboard.share', 'dashboard.themes', 'dashboard.movement', 'dashboard.recommendation', 'dashboard.accounts'] },
      // What this section does and does not change, precisely — the loose
      // version of this comment ("an existing report's sections are a stored
      // row") was only true of half the schedules. A `report_id` schedule sends
      // the stored `reports.sections`, so it is untouched. A `starter_key`
      // schedule resolves its sections from THIS array at send time
      // (lib/schedules/resolve.ts), so it does pick the section up — which is
      // why the email renderer returns null when nothing is tracked, and why
      // the print deck's slide is gated on the same thing.
      { page: 'dashboard', params: {}, keys: ['dashboard.initiatives'], framing: 'What you told us you are trying to move.' },
      { page: 'content', params: {}, keys: ['content.inbox'], framing: 'Comments worth a reply this update.' },
      { page: 'competitive', params: {}, keys: ['competitive.standings'] },
    ],
  },
  {
    key: 'monthly_marketing_review',
    name: 'Monthly marketing review',
    audience: 'marketing',
    description: 'Where you stand, what the market is saying, the competitive picture and what is working in content: the round-up a marketing lead takes into the monthly meeting.',
    sections: [
      { page: 'dashboard', params: {}, keys: ['dashboard.strip', 'dashboard.hero', 'dashboard.sentiment', 'dashboard.share', 'dashboard.themes', 'dashboard.movement', 'dashboard.recommendation', 'dashboard.accounts'] },
      { page: 'voice', params: {}, keys: templateKeys(['voice.map', 'voice.theme', 'voice.movers', 'voice.phrases', 'voice.mood', 'voice.ribbon']) },
      { page: 'market', params: {}, keys: ['market.shortRead', 'market.news', 'market.detail'] },
      { page: 'competitive', params: {}, keys: ['competitive.standings', 'competitive.faceoff', 'competitive.shareLine', 'competitive.table'] },
      { page: 'content', params: {}, keys: ['content.works', 'content.inbox', 'content.field', 'content.voices', 'content.accounts'] },
    ],
  },
  {
    key: 'leadership_one_pager',
    name: 'Leadership one-pager',
    audience: 'leadership',
    description: 'The executive brief, the four numbers that moved and the one recommendation: two slides after the cover, for someone who will read the cover.',
    sections: [
      { page: 'dashboard', params: {}, keys: ['dashboard.strip', 'dashboard.hero', 'dashboard.sentiment', 'dashboard.share', 'dashboard.movement', 'dashboard.recommendation'] },
    ],
  },
  {
    key: 'sales_objections_competitors',
    name: 'Sales: objections & competitors',
    audience: 'sales',
    description: 'What customers push back on, in their words, and how each competitor is talked about, for the people who hear the objections first.',
    sections: [
      { page: 'voice', params: { type: 'pain_point' }, keys: ['voice.map', 'voice.theme', 'voice.phrases', 'voice.mood', 'voice.ribbon'], framing: 'The pain points customers raise, in their own words.' },
      { page: 'voice', params: { type: 'objection' }, keys: ['voice.map', 'voice.theme'], framing: 'The objections heard before a purchase.' },
      { page: 'competitive', params: {}, keys: ['competitive.standings', 'competitive.faceoff', 'competitive.shareLine', 'competitive.table', 'competitive.finding'], variant: 'full' },
      { page: 'content', params: {}, keys: ['content.inbox'], framing: 'Comments worth a reply this update.' },
    ],
  },
  {
    key: 'content_what_to_make_next',
    name: 'Content: what to make next',
    audience: 'content',
    description: 'What is working right now, the playbooks side by side, how customers actually talk, and the recommendations, for the people making the next video.',
    sections: [
      { page: 'content', params: {}, keys: ['content.works', 'content.inbox', 'content.field', 'content.voices', 'content.accounts', 'content.playbooks'] },
      { page: 'voice', params: {}, keys: ['voice.phrases', 'voice.mood', 'voice.ribbon'], framing: 'How customers say it: the words to borrow.' },
      { page: 'market', params: { group: 'recs' }, keys: ['market.shortRead', 'market.detail'] },
    ],
  },
]

export const starterTemplate = (key: string): ReportTemplate | null => STARTER_TEMPLATES.find((t) => t.key === key) ?? null

/** What the picker offers: everything that has not retired. A retired starter
 *  still RESOLVES (a stored schedule names it and keeps sending), it is just
 *  never handed to somebody starting a new report. */
export const starterTemplates = (): ReportTemplate[] => STARTER_TEMPLATES.filter((t) => !t.retired && !t.artefact)

/** Mint section ids for a fresh report from a template's sections. */
export function instantiate(sections: Omit<ReportSection, 'id'>[]): ReportSection[] {
  return sections.map((s) => ({ ...s, id: newSectionId() }))
}

export function newSectionId(): string {
  const c = globalThis.crypto
  if (c?.randomUUID) return c.randomUUID().slice(0, 8)
  return Math.random().toString(36).slice(2, 10)
}
