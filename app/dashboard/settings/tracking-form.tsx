'use client'

import { useActionState, useState, type ReactNode } from 'react'
import { saveTracking, type SettingsFormState } from './actions'
import { CadenceSection } from '@/components/settings/tracking/cadence'
import { RivalsSection } from '@/components/settings/tracking/rivals'
import { TermsSection, type Bucket } from '@/components/settings/tracking/terms'
import { SaveStateLine } from '@/components/settings/save-state-strip'
import { CONTROL } from '@/components/settings/chrome'
import type { TermSummary } from '@/lib/keywords/value'
import { cleanTerms, MIN_KEYWORD_CHARS, MAX_TERM_CHARS, MAX_TERMS_PER_BUCKET } from '@/lib/onboarding-config'
import { trackingPending } from '@/lib/settings/connections'
import type { RivalRow } from '@/lib/settings/rivals-view'
import { saveState, type LastChange } from '@/lib/settings/save-state'

// The Tracking sub-page's one form (Block D wave 2, `settings.save`).
//
// ONE FORM AND ONE SAVE ROW, which is the artboard's shape and is also the
// honest one: a page whose sections are six views of one configuration should
// not ask which button writes which third of it.
//
// EVERYTHING EDITABLE IS STATE HERE. The terms, the tracked rivals and the
// cadence all live in this component, so the strip in the rail and the sentence
// beside the save button describe the same edits, "Discard" has something to
// discard, and the sections below can stay presentational — which is what makes
// them testable with a static render.
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
  period: string
  day: string
  storedPeriod: string
  updatesThisMonth: readonly string[]
  lastUpdate: string | null
  showStudio: boolean
  lastChange: LastChange | null
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
  const [period, setPeriod] = useState(props.period)
  const [day, setDay] = useState(props.day)
  // useActionState keeps its last result forever, so "Saved." would sit under a
  // list the reader has since changed. The first edit after a save retires it.
  const [edited, setEdited] = useState(false)

  const before = {
    brand: cleanTerms(props.terms.brand_keywords),
    competitor: cleanTerms(props.terms.competitor_keywords),
    category: cleanTerms(props.terms.industry_keywords),
    exclusions: cleanTerms(props.terms.exclude_terms),
    rivals: props.names,
    period: props.period,
    day: props.day,
  }
  const pending = trackingPending(before, {
    brand: terms.brand_keywords,
    competitor: terms.competitor_keywords,
    category: terms.industry_keywords,
    exclusions: terms.exclude_terms,
    rivals: names,
    period,
    day,
  })
  const save = saveState({ pending, lastChange: props.lastChange, affectsRecorded: props.affectsRecorded })

  /** Returns the reason a term was refused, or null when it went in. */
  function addTerm(bucket: Bucket, raw: string): string | null {
    const term = raw.trim().replace(/\s+/g, ' ')
    if (term.length < MIN_KEYWORD_CHARS) return `Terms need at least ${MIN_KEYWORD_CHARS} characters — a shorter word finds the whole internet.`
    if (term.length > MAX_TERM_CHARS) return `Keep a term under ${MAX_TERM_CHARS} characters — a search box does not read a sentence.`
    const list = terms[bucket]
    if (list.length >= MAX_TERMS_PER_BUCKET) return `That list is full at ${MAX_TERMS_PER_BUCKET}. Remove one first.`
    if (list.some((t) => t.toLowerCase() === term.toLowerCase())) return 'That term is already in the list.'
    setTerms((prev) => ({ ...prev, [bucket]: [...prev[bucket], term] }))
    setEdited(true)
    return null
  }

  function addRival(raw: string): string | null {
    const name = raw.trim().replace(/\s+/g, ' ')
    if (name.length < 2) return 'Give the rival a name we can search for.'
    if (name.length > 80) return 'Keep a rival’s name under 80 characters.'
    if (names.length >= 15) return 'Fifteen rivals is the limit. Take one off first.'
    if (names.some((n) => n.toLowerCase() === name.toLowerCase())) return 'That rival is already tracked.'
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
    setPeriod(props.period)
    setDay(props.day)
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
        onRemove={(bucket, term) => { setTerms((prev) => ({ ...prev, [bucket]: prev[bucket].filter((t) => t !== term) })); setEdited(true) }}
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

      <CadenceSection
        period={period}
        day={day}
        storedPeriod={props.storedPeriod}
        onPeriod={(p) => { setPeriod(p); setEdited(true) }}
        onDay={(d) => { setDay(d); setEdited(true) }}
        canEdit={props.canEdit}
        updatesThisMonth={props.updatesThisMonth}
        month={props.month}
        lastUpdate={props.lastUpdate}
        showStudio={props.showStudio}
      />

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
            {state.message && !edited
              ? <span className={`text-[12.5px] ${state.ok ? 'text-positive' : 'text-negative'}`} role="status">{state.message}</span>
              : <SaveStateLine state={save} />}
          </>
        ) : (
          <p className="text-[12.5px] text-muted-foreground">
            You have read-only access. Ask an owner or admin to change what we track.
          </p>
        )}
      </div>
    </form>
  )
}
