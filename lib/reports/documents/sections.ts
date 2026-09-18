import type { DocPageKind, DocumentRole } from './types'

/**
 * The four section maps (Phase 1 WP19, item 43, design RP1).
 *
 * WHY A MAP AND NOT A SKELETON. The four briefs have always had a skeleton —
 * an ordered list of PAGE KINDS a model fills in. What they have never had is
 * the reading: `MARKET_BRIEF`'s skeleton is `in_short · findings · say_hear ·
 * competitor · personas · language · method`, which has no subjects page, no
 * moves page, and does have a personas page the quarterly review explicitly
 * cuts. RP1 calls the Marketing brief "the monthly review: subjects, the
 * category, rivals, the moves, the method page". Those five are PAGE BLOCKS —
 * they exist, they are drawn on Overview and Subjects and Competitive every
 * day, and a brief that re-derives them would be a second measurement of the
 * same month.
 *
 * SO A BRIEF IS TWO KINDS OF ENTRY, IN ONE ORDER. A `page` entry is the
 * model's — the skeleton as it was, written and scrubbed and checked. A
 * `block` entry is the product's — a `Block<D>` rendered in `'print'` mode
 * from the surface's own loader output, exactly as the reader saw it. The
 * design's "each section is a page block or a filter over one" is this list,
 * and "deck pages that duplicate a block render the block in print mode" is
 * what the deck does with it. Every section in the four maps is a WHOLE block;
 * the filter half of that sentence is not declared until a map needs it,
 * because a field no code reads is a promise in a type.
 *
 * A SECTION ID IS A STORED CONTRACT. It names a slide inside a built brief and
 * an edit in `report_edits`; renaming one orphans every artefact that named it.
 */

/** The surfaces a brief may borrow a block from. Each one is a page loader
 *  plus a block array; nothing else in the product answers `figures()`. */
export type BriefSurface = 'overview' | 'subjects' | 'voice' | 'competitive' | 'market'

export const BRIEF_SURFACES: readonly BriefSurface[] = ['overview', 'subjects', 'voice', 'competitive', 'market']

/**
 * What a section needs before it can say anything, named by its readiness row
 * id (`lib/readiness/compute.ts`).
 *
 * WHAT BELONGS IN `needs` AND WHAT DOES NOT: only an input WITHOUT WHICH THE
 * BLOCK HAS NOTHING AT ALL. `rival-accounts` is about whether we read each
 * rival's OWN accounts, and the standings block reads the category corpus
 * either way — declaring it there refused a section the block could draw,
 * measured against production on both tenants. A block that merely has less to
 * say still draws; that is what its own empty state is for.
 *
 * THIS IS THE HALF THE COMPOSE WALK WAS MISSING. Today a page whose material is
 * absent DROPS OUT of the skeleton silently (`compose.ts`: "a page whose only
 * material is missing … drops out rather than printing an empty sheet"), so a
 * brief built on a workspace with no subjects prints four pages, says nothing
 * about why, and reads as a complete document. RP1's rule is the opposite: a
 * brief with a missing input prints what it can AND NAMES the input and who
 * closes it — which is the readiness row, which already carries the owner and
 * the act that changes it.
 */
export type ReadinessId =
  | 'rival-accounts' | 'tracked-terms' | 'communities' | 'searchable-findings'
  | 'subject-set' | 'months-of-history' | 'anomaly-baseline' | 'read-depth'
  | 'update-record' | 'delivery' | 'change-record' | 'decisions' | 'retention'

export interface BriefBlockSection {
  /** Stable, stored, never regenerated. */
  id: string
  /** The block key, `<surface>.<block>` — the same stored contract a report
   *  section's renderable key is. */
  block: string
  surface: BriefSurface
  /** The section's own name on paper. Not the block's title: a block is named
   *  for the page it sits on, and a brief is read end to end. */
  title: string
  /** One line of framing, the operator's voice, printed under the title. */
  framing: string
  /**
   * The short deck meta, top right (`sales.p2.header`).
   *
   * The artboard reads "Objections · September 2026" where the deck printed
   * "{the whole section title} · {the whole reading stamp}" — the title
   * repeated beside itself, and a 60-character stamp in a 10.5px mono slot that
   * has to fit on one line. The stamp is not lost: it rides the FOOTER of every
   * sheet, which is where the artboard puts it. This is the sheet's PLACE in
   * the brief, in one or two words. Absent leaves the title, as before.
   */
  context?: string
  /**
   * The green-ruled eyebrow over the section's own body (`sales.p2.header`).
   *
   * Every artboard sheet opens its left column with one — "Most heard first",
   * "How to use these" — and `Eyebrow` exists in the deck and was used on
   * written pages only, so a borrowed section opened with four stacked
   * heading-ish lines and no rule. It says what the ORDER of the rows is, which
   * is the one thing a list of counted rows will not tell a reader itself.
   */
  eyebrow?: string
  /**
   * What the right-hand pane of this sheet carries.
   *
   * The artboards are 7fr/5fr on every sheet and the build drew borrowed
   * sections full-bleed, single column, at about half the density. `'chart'`
   * is the month line (`sales.p2.chart`); `'confidence'` is the dots, the word
   * and the caveat, which existed only inside a finding page's right card.
   * Absent keeps the full-bleed single column, which is right for a block that
   * already lays out its own columns.
   */
  pane?: 'chart' | 'confidence'
  /**
   * The right card's own eyebrow and its opening line (`sales.p3.howtouse`).
   *
   * WHY A PANE NEEDS ITS OWN WORDS. The first pass gave `confidence` one body
   * — the reading's denominators, then the dots — so three sheets running
   * carried an identical card: "WHAT THIS RESTS ON · 1,388 the category · …"
   * verbatim on p3 and p4, and the same confidence sentence on p2, p3 and p4.
   * A panel that says the same thing three sheets running reads as chrome and
   * a reader stops looking at it, which is the opposite of what a confidence
   * rail is for. The artboard's right cards differ sheet by sheet — "HOW TO
   * USE THESE" over a lead and its practice items on p3, the rival material on
   * p4 — and this is that, as far as the reading honestly reaches.
   *
   * `paneLead` IS THE OPERATOR'S VOICE, like `framing`: how to read the rows
   * this sheet carries, written once here. It is not a model's and it names no
   * figure — the artboard's own lead ("Lead with the thing that is rising…")
   * is a sentence about one tenant's month and a direction claim besides, and
   * nothing composes one. A pane with a lead prints it; a pane without one
   * prints the reading's denominators, which is what every pane printed
   * before.
   */
  paneTitle?: string
  paneLead?: string
  /** What has to be recorded for this section to hold anything. */
  needs: readonly ReadinessId[]
  /**
   * Inputs this section READS BETTER WITH and draws fine without — printed as
   * a line beside it, never as a refusal (`sales.p4.untracked`).
   *
   * THE DISTINCTION `needs` COULD NOT CARRY. `rival-accounts` is the case this
   * field exists for: the standings block reads the category corpus whether or
   * not we read each rival's OWN accounts, so declaring it in `needs` refused a
   * section the block could draw — measured against production on both tenants,
   * and written into the comment at the top of this file. But "we do not read
   * Freitag's own posts" is exactly what the mock's readiness line says, and
   * dropping it altogether left a reader to assume we did. So the row is
   * NOTED: what is not tracked, what it waits for, and whose job it is.
   *
   * AND NO PROMISED DATE. `ReadinessRow` carries a role token and never a
   * person or a due date (deviations D12 and D14), so the line names the ROLE
   * and says nothing about when — which is the honest half of the mock's
   * "owner · by date".
   */
  notes?: readonly ReadinessId[]
}

export type BriefEntry =
  | { kind: 'page'; page: DocPageKind }
  | { kind: 'block'; section: BriefBlockSection }

const block = (s: BriefBlockSection): BriefEntry => ({ kind: 'block', section: s })
const page = (p: DocPageKind): BriefEntry => ({ kind: 'page', page: p })

// ── Marketing — the monthly review ─────────────────────────────────────────
// RP1's own words: "subjects, the category, rivals, the moves, the method
// page". Five blocks and the written pages that argue from them.

export const MARKETING_MAP: readonly BriefEntry[] = [
  page('in_short'),
  block({
    id: 'mk.month', block: 'overview.sentence', surface: 'overview',
    title: 'The month', framing: 'Where the month stands, with the band it cleared and the count behind it.',
    needs: ['months-of-history'],
  }),
  block({
    id: 'mk.subjects', block: 'overview.subjects', surface: 'overview',
    title: 'Your subjects', framing: 'Each subject this month, against the month before and against the category.',
    needs: ['subject-set', 'months-of-history'],
  }),
  block({
    id: 'mk.category', block: 'overview.category', surface: 'overview',
    title: 'The category', framing: 'What the wider conversation was about this month.',
    needs: ['months-of-history'],
  }),
  block({
    id: 'mk.rivals', block: 'overview.rivals', surface: 'overview',
    title: 'Rivals', framing: 'Where each tracked rival sits in the same month.',
    needs: ['months-of-history'],
  }),
  page('finding'),
  block({
    id: 'mk.moves', block: 'overview.moves', surface: 'overview',
    title: 'Your moves', framing: 'What you said you would do, and the reading it will show up in.',
    needs: ['decisions'],
  }),
  page('method'),
]

// ── Leadership — the management readout ────────────────────────────────────
// Short on purpose. Where the company stands, what moved, what was decided,
// and the method behind it. No personas, no language page.

export const LEADERSHIP_MAP: readonly BriefEntry[] = [
  page('in_short'),
  block({
    id: 'ld.month', block: 'overview.sentence', surface: 'overview',
    title: 'The month', framing: 'The month in one reading, with the band and the count behind it.',
    needs: ['months-of-history'],
  }),
  page('finding'),
  block({
    id: 'ld.standing', block: 'competitive.rivals', surface: 'competitive',
    title: 'Where you stand', framing: 'Your own share of the month beside every tracked rival.',
    needs: ['months-of-history'],
  }),
  block({
    id: 'ld.subjects', block: 'overview.subjects', surface: 'overview',
    title: 'Your subjects', framing: 'The five to eight subjects this workspace is read against.',
    needs: ['subject-set', 'months-of-history'],
  }),
  block({
    id: 'ld.moves', block: 'overview.moves', surface: 'overview',
    title: 'What was decided', framing: 'Each recommendation and what was done about it.',
    needs: ['decisions'],
  }),
  page('method'),
]

// ── Sales — the customers' words, by subject and by rival ──────────────────
//
// THE ARTBOARD'S ORDER AND THE ARTBOARD'S NAMES (Block D wave 2, E-sales).
// `artboards/SalesBrief.dc.html` is seven sheets: cover · what they are
// pushing back on · what sells, in their words · what they complain about with
// each rival · who is moving, and which way · answers you can use · method.
// The ids do not move — a section id names a slide inside a built brief and an
// edit in `report_edits` — but the ORDER and the TITLES are the reader's, and
// they were neither the mock's order nor its words.
//
// AND THE BUILD KEEPS WHAT THE MOCK HAS NOT GOT. The overview sheet, the
// finding pages and the language page have no counterpart on the artboard and
// are not dropped for it: a finding is the argument this brief is written to
// make, and "Not settled this update" is the product saying what it could not
// answer. A blind port would have deleted all three.

export const SALES_MAP: readonly BriefEntry[] = [
  page('in_short'),
  page('finding'),
  block({
    id: 'sl.unanswered', block: 'subjects.unanswered', surface: 'subjects',
    title: 'What they are pushing back on', framing: 'The questions the conversation puts and does not settle.',
    context: 'Objections', eyebrow: 'Most heard first', pane: 'chart',
    needs: ['subject-set'],
  }),
  block({
    id: 'sl.voices', block: 'subjects.voices', surface: 'subjects',
    title: 'What sells, in their words', framing: 'What customers actually said about each subject this month — say it back, in their words.',
    context: 'Selling points', eyebrow: 'In their own words', pane: 'confidence',
    paneTitle: 'How to use these',
    paneLead: 'Say these back in the customer\u2019s own words rather than in ours. Every phrase carries the count it was heard in and the population that count is of, so the one with the most behind it is the one to open with — and a phrase with a thin count is a lead to test, not a line to build on.',
    needs: ['subject-set'],
  }),
  block({
    id: 'sl.rivals', block: 'competitive.rivals', surface: 'competitive',
    // THE ARTBOARD'S TITLE, AND AN EMPTY STATE THAT TELLS THE TRUTH UNDER IT.
    // `competitive.rivals.figures()` returns `{}` and `rivalOwnClaims` is
    // unbound — both inside `components/pages/competitive-surface/`, which
    // E-competitive owns — so the sheet draws the rival selector, the reading
    // behind each rival and the untracked note, and no complaint. A client
    // reading a paid document met a heading promising per-rival complaints and
    // a page delivering a picker; the title is the mock's and stays, and the
    // framing and the pane now say what is actually on the sheet.
    title: 'What they complain about with each rival', framing: 'Who is being talked about this month, and how much of the reading rests on each.',
    context: 'Rivals', eyebrow: 'Who is being talked about', pane: 'confidence',
    paneTitle: 'What is on this sheet',
    paneLead: 'Who is being talked about, and how much of the month was read of each. What is said about a rival is not yet counted rival by rival, so this sheet does not carry the complaints its title names.',
    needs: ['months-of-history'],
    // `sales.p4.untracked` — the mock's readiness line. NOT a `needs`: this
    // block reads the category corpus either way, and refusing it would drop a
    // section the block can draw.
    notes: ['rival-accounts'],
  }),
  block({
    id: 'sl.questions', block: 'competitive.questions', surface: 'competitive',
    title: 'What buyers compare', framing: 'The comparisons buyers make out loud, and who they name.',
    context: 'Comparisons', eyebrow: 'Asked under their content',
    // THE ONE SHEET WITH NO RIGHT COLUMN AT ALL. `sl.questions` carried no
    // `pane`, so it was the single-column sheet in an otherwise 7fr/5fr deck
    // and the only one with no confidence rail — the deck's rhythm broken once
    // for no stated reason.
    pane: 'confidence',
    paneTitle: 'How to read these',
    paneLead: 'These are comparisons the audience put, counted in the videos we read — not comparisons we drew. A pairing appearing here says it was asked about, and says nothing about which side the asker settled on.',
    needs: [],
  }),
  page('switching'),
  page('scripted'),
  page('language'),
  page('method'),
]

// ── Content — what to make next ────────────────────────────────────────────

export const CONTENT_MAP: readonly BriefEntry[] = [
  page('in_short'),
  page('finding'),
  block({
    id: 'ct.advice', block: 'market.advice', surface: 'market',
    title: 'What to make next', framing: 'What the conversation asked for, and what was decided about each one.',
    needs: [],
  }),
  block({
    id: 'ct.ways', block: 'market.ways', surface: 'market',
    title: 'Ways in', framing: 'Where the category is already talking, and what it is talking about.',
    needs: ['months-of-history'],
  }),
  block({
    id: 'ct.voices', block: 'subjects.voices', surface: 'subjects',
    title: 'The words to borrow', framing: 'How customers say it, in their own words.',
    needs: ['subject-set'],
  }),
  page('asked'),
  page('method'),
]

/** The four maps, by the role that writes them. A custom brief keeps the
 *  skeleton it has always had — its whole point is the operator's own
 *  question, and borrowing another brief's blocks would answer a different
 *  one. */
export const BRIEF_MAPS: Record<DocumentRole, readonly BriefEntry[]> = {
  market_brief: MARKETING_MAP,
  leadership_brief: LEADERSHIP_MAP,
  sales_brief: SALES_MAP,
  content_brief: CONTENT_MAP,
}

export const briefMap = (role: DocumentRole): readonly BriefEntry[] => BRIEF_MAPS[role]

/** Every block section in a map, in order. */
export function sectionsOf(map: readonly BriefEntry[]): BriefBlockSection[] {
  return map.flatMap((e) => (e.kind === 'block' ? [e.section] : []))
}

/** The written page kinds a map still asks the model for. */
export function pageKindsOf(map: readonly BriefEntry[]): DocPageKind[] {
  const seen = new Set<DocPageKind>()
  for (const e of map) if (e.kind === 'page') seen.add(e.page)
  return [...seen]
}

/** Which surfaces a map has to load. Nothing loads a surface no section names:
 *  a page loader is seconds of reads, and the leadership brief must not pay
 *  for Market's because the content brief wants it. */
export function surfacesOf(map: readonly BriefEntry[]): BriefSurface[] {
  const seen = new Set<BriefSurface>()
  for (const s of sectionsOf(map)) seen.add(s.surface)
  return BRIEF_SURFACES.filter((s) => seen.has(s))
}

// ── the missing-input rule ─────────────────────────────────────────────────

/** One input a brief needed and did not have, with who closes it. */
export interface MissingInput {
  /** The readiness row. */
  id: ReadinessId
  /** The input, in the client's words — `ReadinessRow.input`. */
  input: string
  /** Who can close it — `OWNER_LABEL[row.owner]`. */
  owner: string
  /** Which of the three, so a brief can tell an instruction from a promise. */
  ownerRole: 'client' | 'ops' | 'engineering'
  /** The act that changes it — `ReadinessRow.unlocks`. */
  unlocks: string
  /** The sections that went without it, by title — the caller's match key. */
  sections: string[]
  /** The same sections by SHORT name (`labelOf`), which is what the sentence
   *  splices; a title is a heading and reads as a clause inside one. */
  labels: string[]
}

/**
 * The SHORT name of a section, for a sentence that splices one into itself.
 *
 * A section's `title` is written to be read as a heading — "What they complain
 * about with each rival" — and both `missingSentence` and `untrackedSentence`
 * splice it into running prose as if it were a short noun phrase. It was one
 * ("By rival") until the map took the artboard's own titles, and the sentence
 * then read "What they complain about with each rival is read without it",
 * which is not a sentence. `context` is already exactly this word — the
 * artboard's two-word slot, "Rivals" — so the label is that where a section
 * has one, and the title where it has not.
 */
const labelOf = (section: BriefBlockSection): string => section.context ?? section.title

/** A readiness row as this module needs it — the four fields, so a test needs
 *  no fixture of thirteen. */
export interface ReadinessLike {
  id: string
  input: string
  status: 'exists' | 'partial' | 'missing'
  owner: string
  ownerRole: 'client' | 'ops' | 'engineering'
  unlocks: string
}

/**
 * What this brief could not say, and who closes it.
 *
 * `partial` IS NOT MISSING. The readiness vocabulary's middle state is "the
 * input exists but does not cover what the block will be asked to draw" — a
 * brief built on it prints a thinner section, not an empty one, and naming it
 * as absent would be a claim the record does not support. Only `missing`
 * appears here.
 */
export function missingInputs(
  map: readonly BriefEntry[],
  readiness: readonly ReadinessLike[],
): MissingInput[] {
  const byId = new Map(readiness.map((r) => [r.id, r]))
  const out = new Map<string, MissingInput>()
  for (const section of sectionsOf(map)) {
    for (const need of section.needs) {
      const row = byId.get(need)
      if (!row || row.status !== 'missing') continue
      const held = out.get(need)
      if (held) { held.sections.push(section.title); held.labels.push(labelOf(section)) }
      else out.set(need, { id: need, input: row.input, owner: row.owner, ownerRole: row.ownerRole, unlocks: row.unlocks, sections: [section.title], labels: [labelOf(section)] })
    }
  }
  return [...out.values()]
}

/**
 * The sentence a brief prints in place of a section it could not fill.
 *
 * NAMES THE INPUT AND WHO CLOSES IT, which is the whole of RP1's rule. Every
 * word of it is read by a client, in a PDF and behind a share link, so it
 * names people the way the document does: "we" for Verbatim and "you" for the
 * reader. It does NOT name them the way our own readiness screen does —
 * `OWNER_LABEL.client` is the string "Client", and "Client closes this" puts a
 * paying reader in the third person under an internal taxonomy. The client
 * branch is not a corner case: `decisions` becomes client-owned the moment the
 * decision record exists and is the only `needs` of both the marketing and the
 * leadership brief's moves section, so a fresh workspace's first build prints
 * this.
 */
export function missingSentence(m: MissingInput): string {
  // NOT "we have no {input}". Every readiness `input` is a noun phrase that
  // already opens with its own article ("the rival accounts we read"), so the
  // obvious wording reads "we have no the rival accounts we read". The verb
  // carries the sentence instead, and the input is quoted as the row it is.
  // THE SHORT NAME, AND NAMED AS A SECTION. See `labelOf`: a map title is
  // written to be read as a heading ("What they complain about with each
  // rival") and this sentence splices it into running prose.
  const names = m.labels.length > 0 ? m.labels : m.sections
  const head = `The ${names.join(' and ')} ${names.length === 1 ? 'section' : 'sections'} could not be filled. We have not recorded ${m.input}.`
  // `unlocks` IS AN INSTRUCTION TO WHOEVER OWNS THE ROW, and only the CLIENT
  // can act on theirs. Every other row's act is our own operator copy and must
  // not be printed as if the reader could do it: `subject-set` reads "Phase 1
  // builds the subject set and the form that names them" — a project phase, in
  // a document a customer reads — and `months-of-history`, which is ops and is
  // a `needs` of most sections in all four maps, reads "Apply the monthly
  // reading and seed it once per workspace", which is the sentence a
  // new-tenant brief would print most often and the one a client can do least
  // about. The owner is still named, because RP1 asks for it; what changes is
  // that a gap only we can close is a PROMISE and never an instruction.
  // THE ACT IS ITS OWN SENTENCE. `unlocks` is written as an imperative with its
  // own capital ("Mark a recommendation done…"), so hanging it off a dash put a
  // capital mid-sentence in a paid document. A full stop before it costs
  // nothing and takes the wording of every row as it stands.
  const act = m.ownerRole === 'client'
    ? `This one is yours to close. ${trimStop(m.unlocks)}.`
    : m.ownerRole === 'ops'
      ? 'We are setting it up, and it appears here the moment it is there.'
      : 'We are building it, and it appears here the moment it is there.'
  // NO IN-APP DESTINATION. Every rendering of a brief is a printed one — the
  // PDF, the share link at /r/<token>, the deck in the Studio — and this
  // sentence is composed ONCE and frozen into the snapshot, so there is no
  // arm of it that only an app reader sees. "It is on Settings › Readiness"
  // sent a share-link reader, who may not have an account at all, to a screen
  // of ours; it is the same rule `openLink` follows (a link in the app, an
  // <a> in an email, nothing on paper) and the same one the two _OUTSIDE
  // constants follow for readiness owners. A client row's own act still names
  // the screen the client acts on, because that is the act.
  return `${head} ${act}`
}

/** The line that opens the brief's own account of what it left out. */
export function missingSummary(missing: readonly MissingInput[]): string | null {
  if (missing.length === 0) return null
  const n = missing.length
  return n === 1
    ? 'One thing this brief needed is not recorded for this workspace yet, so one or more of its sections are shorter than usual.'
    : `${n} things this brief needed are not recorded for this workspace yet, so some of its sections are shorter than usual.`
}

const trimStop = (s: string): string => s.trim().replace(/[.!?]+$/, '')

// ── the readiness NOTE rule ────────────────────────────────────────────────

/** One input a section reads better with and did not have, as a LINE rather
 *  than a refusal. */
export interface UntrackedNote {
  id: ReadinessId
  /** The input, in the client's words. */
  input: string
  /** Who closes it, by ROLE — never a person, and never a date. */
  owner: string
  ownerRole: 'client' | 'ops' | 'engineering'
  /** The sections it is noted on, by title — the deck matches on this. */
  sections: string[]
  /** The same sections by SHORT name (`labelOf`), which is what the sentence
   *  splices. */
  labels: string[]
  /** The line itself, already composed. */
  line: string
}

/**
 * What a brief does not track, said beside the section rather than in place
 * of it (`sales.p4.untracked`).
 *
 * `partial` COUNTS HERE AND DOES NOT COUNT IN `missingInputs`, which is the
 * whole reason there are two functions. A `partial` row is "the input exists
 * but does not cover what the block will be asked to draw" — which is not a
 * reason to refuse a section and IS the thing this note says out loud: we read
 * two of your four rivals' own accounts. `exists` says nothing, because a note
 * about an input we have is noise.
 */
export function untrackedNotes(
  map: readonly BriefEntry[],
  readiness: readonly ReadinessLike[],
): UntrackedNote[] {
  const byId = new Map(readiness.map((r) => [r.id, r]))
  const out = new Map<string, UntrackedNote>()
  for (const section of sectionsOf(map)) {
    for (const note of section.notes ?? []) {
      const row = byId.get(note)
      if (!row || row.status === 'exists') continue
      const held = out.get(note)
      if (held) {
        held.sections.push(section.title)
        held.labels.push(labelOf(section))
        held.line = untrackedSentence(held)
        continue
      }
      const built: UntrackedNote = {
        id: note,
        input: row.input,
        owner: row.owner,
        ownerRole: row.ownerRole,
        sections: [section.title],
        labels: [labelOf(section)],
        line: '',
      }
      built.line = untrackedSentence(built)
      out.set(note, built)
    }
  }
  return [...out.values()]
}

/**
 * "We do not read the rival accounts we read for this workspace. Ours to set
 * up." — the mock's "their own posts, not tracked · owner · by date", minus
 * the date.
 *
 * NO DATE, AND THAT IS THE DEVIATION. `ReadinessRow` carries a role token and
 * nothing else; a due date on a brief would be a promise the product has no
 * field for and no mechanism behind. The ROLE stays, because it is what the
 * mock's line is actually for: a reader has to know whether this is theirs to
 * fix or ours.
 */
export function untrackedSentence(note: Pick<UntrackedNote, 'input' | 'ownerRole' | 'sections' | 'labels'>): string {
  // THE SHORT NAME, NOT THE HEADING. See `labelOf`: the map took the
  // artboard's own titles in this wave and "What they complain about with each
  // rival is read without it" stopped being a sentence the day it did.
  const names = note.labels?.length ? note.labels : note.sections
  const where = names.length > 0 ? ` The ${names.join(' and ')} ${names.length === 1 ? 'section is' : 'sections are'} read without it.` : ''
  const whose =
    note.ownerRole === 'client'
      ? 'Yours to name in Settings.'
      : note.ownerRole === 'ops'
        ? 'Ours to set up.'
        : 'Ours to build.'
  return `Not tracked: ${note.input}.${where} ${whose}`
}
