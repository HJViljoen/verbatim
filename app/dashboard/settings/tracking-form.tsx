'use client'

import { useActionState, useState, type ReactNode } from 'react'
import { saveTracking, type SettingsFormState } from './actions'
import { SAVED_FIELDS } from './constants'
import { RivalsSection } from '@/components/settings/tracking/rivals'
import { TermsSection, type Bucket } from '@/components/settings/tracking/terms'
import { LastSaveStrip, SaveStateLine } from '@/components/settings/save-state-strip'
import { CONTROL } from '@/components/settings/chrome'
import type { TermSummary } from '@/lib/keywords/value'
import { cleanTerms, MIN_KEYWORD_CHARS, MAX_TERM_CHARS, MAX_TERMS_PER_BUCKET } from '@/lib/onboarding-config'
import { trackingPending } from '@/lib/settings/connections'
import { removeTerm } from '@/lib/settings/terms'
import type { RivalRow } from '@/lib/settings/rivals-view'
import { saveState, type LastChange } from '@/lib/settings/save-state'

// The Tracking sub-page's one form (Block D wave 2, `settings.save`).
//
// ONE FORM AND ONE SAVE ROW, which is the artboard's shape and is also the
// honest one: a page whose sections are six views of one configuration should
// not ask which button writes which third of it.
//
// EVERYTHING EDITABLE IS STATE HERE. The terms and the tracked rivals both
// live in this component, so the strip and the sentence beside the save button
// describe the same edits, "Discard" has something to discard, and the
// sections below can stay presentational — which is what makes them testable
// with a static render.
//
// NO CADENCE (27 Sep, Heinrich: "remove cadence from settings, and always have
// it weekly on sunday"; deploy 2b). Every workspace is updated weekly, on
// Sunday, and the pause is the operator's (lib/update-rhythm.ts), so the
// Cadence section, its two fields and its state are gone, and nothing here
// posts `report_period` or `report_day`.
//
// THE EDITOR OF WHAT WE READ (market-first WP3.10). Since the approved preview
// this form is drawn inside "The search set" card, in the set's place, when
// the reader asks to change it ("Queue a change"); the last save's strip,
// which hung under the settings rail, sits under its save row.
//
// THE TWO REDDIT CONTROLS ARE NOT IN THIS FORM, deliberately. Watching a
// community is its own logged write (`updateCommunity`) and it dispatches its
// action directly rather than nesting a second <form> inside this one — HTML
// has no such thing, and a nested form would post the reader's unsaved term
// edits to an action that knows nothing about them.

const idle: SettingsFormState = { ok: false, message: '' }

export interface TrackingFormProps {
  canEdit: boolean
  terms: Record<Bucket, string[]>
  /** When each term entered the set, folded lower-case, in short form. */
  dates: Readonly<Record<string, string>>
  datesNote?: string
  review: readonly TermSummary[]
  rivals: readonly RivalRow[]
  names: readonly string[]
  month: string
  lastChange: LastChange | null
  /** That change's own note, where it wrote one. */
  lastChangeNote?: string | null
  affectsRecorded: boolean
  /** Server-rendered sections that sit between the editable ones. */
  communities: ReactNode
  platforms: ReactNode
  performance: ReactNode
}

export function TrackingForm(props: TrackingFormProps) {
  const [state, formAction, saving] = useActionState(saveTracking, idle)
  const [terms, setTerms] = useState<Record<Bucket, string[]>>(() => ({
    brand_keywords: cleanTerms(props.terms.brand_keywords),
    competitor_keywords: cleanTerms(props.terms.competitor_keywords),
    industry_keywords: cleanTerms(props.terms.industry_keywords),
    exclude_terms: cleanTerms(props.terms.exclude_terms),
  }))
  const [names, setNames] = useState<string[]>(() => [...props.names])
  // THE TRACKED LIST RE-SEEDS WHEN THE SERVER'S DOES (settings ST8 / V1).
  //
  // `names` is the list this form will POST, seeded once by a lazy initialiser.
  // A rename is the one operation that rewrites that same list WITHOUT going
  // through this form: `renameRival` is a single `rename_rival` RPC that moves
  // `competitors.name`, rewrites `tracking_configs.competitor_names` and its
  // handles, and writes the `config_changes` row — then the page revalidates
  // and `props.names` and every `r.name` come back renamed while this state
  // still held the old string. Two things followed, and both are this one bug:
  //
  //   ST8  `dropped = !r.retiredAt && !names.includes(r.name)` went true the
  //        instant the rename succeeded, so the row it renamed greyed out, said
  //        "taken off here, not yet saved", and swapped its Rename control for
  //        "Put it back" — the control gone after its own click.
  //   V1   the section then rendered a phantom "Freitag · added here, not yet
  //        saved" row carrying `<input name="competitor_names" value="Freitag">`
  //        while the renamed row emitted none, so "Save tracking changes"
  //        posted the OLD name and wrote `tracking_configs.competitor_names`
  //        back over a rename `competitors` had already logged.
  //
  // Compared by CONTENT, not identity: a server component hands down a new
  // array every render, and an identity check would clobber a reader's unsaved
  // edits on any re-render at all. When the content does differ the server has
  // changed the list under this form, and its list is the one that is true —
  // an unsaved local edit at that moment is against a list that no longer
  // exists, which is exactly what `discard()` already says about stale edits.
  const serverNames = props.names.join('\u0000')
  const [seededFrom, setSeededFrom] = useState(serverNames)
  if (serverNames !== seededFrom) {
    setSeededFrom(serverNames)
    setNames([...props.names])
  }
  // useActionState keeps its last result forever, so "Saved." would sit under a
  // list the reader has since changed. The first edit after a save retires it.
  const [edited, setEdited] = useState(false)

  const before = {
    brand: cleanTerms(props.terms.brand_keywords),
    competitor: cleanTerms(props.terms.competitor_keywords),
    category: cleanTerms(props.terms.industry_keywords),
    exclusions: cleanTerms(props.terms.exclude_terms),
    rivals: props.names,
  }
  const pending = trackingPending(before, {
    brand: terms.brand_keywords,
    competitor: terms.competitor_keywords,
    category: terms.industry_keywords,
    exclusions: terms.exclude_terms,
    rivals: names,
  })
  const save = saveState({ pending, lastChange: props.lastChange, affectsRecorded: props.affectsRecorded })

  /** Returns the reason a term was refused, or null when it went in. */
  function addTerm(bucket: Bucket, raw: string): string | null {
    const term = raw.trim().replace(/\s+/g, ' ')
    if (term.length < MIN_KEYWORD_CHARS) return `Terms need at least ${MIN_KEYWORD_CHARS} characters: a shorter word finds the whole internet.`
    if (term.length > MAX_TERM_CHARS) return `Keep a term under ${MAX_TERM_CHARS} characters: a search box does not read a sentence.`
    const list = terms[bucket]
    if (list.length >= MAX_TERMS_PER_BUCKET) return `That list is full at ${MAX_TERMS_PER_BUCKET}. Remove one first.`
    if (list.some((t) => t.toLowerCase() === term.toLowerCase())) return 'That term is already in the list.'
    setTerms((prev) => ({ ...prev, [bucket]: [...prev[bucket], term] }))
    setEdited(true)
    return null
  }

  function addRival(raw: string): string | null {
    const name = raw.trim().replace(/\s+/g, ' ')
    if (name.length < 2) return 'Give the brand a name we can search for.'
    if (name.length > 80) return 'Keep a brand’s name under 80 characters.'
    if (names.length >= 15) return 'Fifteen brands is the limit. Take one off first.'
    if (names.some((n) => n.toLowerCase() === name.toLowerCase())) return 'That brand is already tracked.'
    setNames((prev) => [...prev, name])
    setEdited(true)
    return null
  }

  function discard() {
    setTerms({
      brand_keywords: cleanTerms(props.terms.brand_keywords),
      competitor_keywords: cleanTerms(props.terms.competitor_keywords),
      industry_keywords: cleanTerms(props.terms.industry_keywords),
      exclude_terms: cleanTerms(props.terms.exclude_terms),
    })
    setNames([...props.names])
    setEdited(false)
  }

  return (
    <form action={formAction} onSubmit={() => setEdited(false)} className="flex flex-col">
      <TermsSection
        terms={terms}
        dates={props.dates}
        datesNote={props.datesNote}
        review={props.review}
        canEdit={props.canEdit}
        onAdd={addTerm}
        // By what the term SAYS, not by which array it was filed in: the review
        // strip removes the performance table's spelling and bucket, which are
        // not always the stored ones (lib/settings/terms.ts, removeTerm).
        onRemove={(bucket, term) => { setTerms((prev) => removeTerm(prev, bucket, term).terms); setEdited(true) }}
      >
        {props.performance}
      </TermsSection>

      {props.communities}

      <RivalsSection
        rows={props.rivals}
        names={names}
        month={props.month}
        canEdit={props.canEdit}
        onAdd={addRival}
        onRemove={(name) => { setNames((prev) => prev.filter((n) => n !== name)); setEdited(true) }}
      />

      {props.platforms}

      {/* What this save is about to write, so its answer can name it. */}
      {pending.map((p) => <input key={p.field} type="hidden" name={SAVED_FIELDS} value={p.field} />)}

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
        {props.canEdit ? (
          <>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-11 shrink-0 items-center rounded-[4px] bg-primary px-5 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save tracking changes'}
            </button>
            <button type="button" onClick={discard} disabled={saving || pending.length === 0} className={CONTROL}>Discard</button>
            {/* A REFUSED SAVE IS AN ALERT (ST11). This is the one save on the
                page; when it fails, the reader's edits are still unwritten and
                they have to act. `role="status"` is a polite region, so a
                refusal rendered `text-negative` reached a screen reader as an
                update that could wait behind whatever else was speaking. Every
                other refusal on this page is `role="alert"`, the community
                control included. */}
            {state.message && !edited
              ? <span className={`text-[12.5px] ${state.ok ? 'text-positive' : 'text-negative'}`} role={state.ok ? 'status' : 'alert'}>{state.message}</span>
              : <SaveStateLine state={save} />}
          </>
        ) : (
          <p className="text-[12.5px] text-muted-foreground">
            You have read-only access. Ask an owner or admin to change what we track.
          </p>
        )}
      </div>
      <div className="mt-3 max-w-[560px]">
        <LastSaveStrip state={saveState({ lastChange: props.lastChange, affectsRecorded: props.affectsRecorded })} note={props.lastChangeNote ?? null} />
      </div>
    </form>
  )
}
