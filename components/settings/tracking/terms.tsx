'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { CONTROL, Dot, FIELD, ICON_TARGET, LabelRow, MonoNote, Section, SectionHead } from '@/components/settings/chrome'
import { glossaryRule } from '@/lib/calibration'
import type { TermSummary } from '@/lib/keywords/value'
import { MAX_TERMS_PER_BUCKET } from '@/lib/onboarding-config'
import { termsMeta } from '@/lib/settings/terms'
import { cn } from '@/lib/utils'

// `settings.terms.*` — the search-terms section, as the artboard draws it.
//
// WHAT MOVED. The three buckets were side-by-side grid columns inside a filled
// card; the artboard lays each out as a 172px label gutter beside its chips,
// stacked, so the eye runs down one column of labels and the chips wrap into
// the width they actually need. The add box was per bucket (the bucket implied
// by which box you typed in); the artboard has ONE field with a category
// selector beside it, which is also the only shape that can say out loud what
// adding a term does to the series.
//
// THE FOURTH BUCKET STAYS. "Not this" is exclusions, it exists in the product,
// it is the list a client gets wrong most often, and the artboard simply has no
// row for it. A port that deleted it would be deleting a feature to match a
// drawing.
//
// THE SECOND GRADE OF DATE STAYS TOO. A chip's date is "added 6 Apr" where the
// log recorded the change and "in use by 6 Apr, not recorded" where the
// reconstruction worked it out afterwards — two different claims, printed
// apart (lib/settings/terms.ts). The artboard has one form; the product has
// two, and the weaker one may not borrow the stronger one's words.

export type Bucket = 'brand_keywords' | 'competitor_keywords' | 'industry_keywords' | 'exclude_terms'

export const BUCKETS: readonly { key: Bucket; label: string; hint: string }[] = [
  { key: 'brand_keywords', label: 'Brand', hint: 'How people write your name, including the ways they get it wrong.' },
  { key: 'competitor_keywords', label: 'Competitor', hint: 'What we search for to find their posts. The names we tag them by are set under Rivals.' },
  { key: 'industry_keywords', label: 'Category', hint: 'What buyers type when they are talking about this kind of product.' },
  { key: 'exclude_terms', label: 'Not this', hint: 'Senses of your name that are not you: Cotopaxi the volcano, Sealand the shipping line.' },
]

/** The sentence the add row prints. A term is not retroactive: the next update
 *  searches it, and the line it starts is a new line. */
export const NEW_TERM_RULE = 'a new term starts a new line; the old line is kept'

/** Why there is no "Keep it" beside the control that takes a term off. */
export const REVIEW_KEEP_NOTE = 'keeping it needs nothing — it stays until you take it off'

export interface TermsSectionProps {
  terms: Record<Bucket, string[]>
  /** When each term entered the set, folded lower-case, in short form. */
  dates: Readonly<Record<string, string>>
  /** The one boundary sentence under the chips. */
  datesNote?: string
  /** Terms the pooled record says are worth a look. */
  review: readonly TermSummary[]
  canEdit: boolean
  /** Returns the reason a term was refused, or null when it went in. */
  onAdd: (bucket: Bucket, term: string) => string | null
  onRemove: (bucket: Bucket, term: string) => void
  /** The shipped per-term record, rendered by the page and passed through. */
  children?: React.ReactNode
}

export function TermsSection({ terms, dates, datesNote, review, canEdit, onAdd, onRemove, children }: TermsSectionProps) {
  const [draft, setDraft] = useState('')
  const [bucket, setBucket] = useState<Bucket>('industry_keywords')
  const [error, setError] = useState<string | null>(null)
  const full = terms[bucket].length >= MAX_TERMS_PER_BUCKET
  // A strip whose term is no longer in any list has nothing left to act on.
  // The rows come from the server's pooled record and stayed put after a
  // removal, so the one control on the strip looked inert whether it had
  // worked or not; now the strip goes with the term.
  const logged = Object.keys(dates).length > 0
  const tracked = new Set(Object.values(terms).flat().map((t) => t.trim().toLowerCase()))
  const flagged = review.filter((t) => tracked.has(t.keyword.trim().toLowerCase()))

  function add() {
    const problem = onAdd(bucket, draft)
    setError(problem)
    if (problem === null) setDraft('')
  }

  return (
    <Section>
      <SectionHead
        title={<span title={glossaryRule('search_terms')}>Search terms</span>}
        meta={termsMeta({
          brand: terms.brand_keywords,
          competitor: terms.competitor_keywords,
          category: terms.industry_keywords,
          exclusions: terms.exclude_terms,
        })}
      />

      {BUCKETS.map((b) => (
        <LabelRow
          key={b.key}
          label={b.label}
          meta={
            // The bucket's help is a hover once it has been read (copy
            // de-clutter C109).
            <span title={b.hint} className="cursor-help">
              {terms[b.key].length} term{terms[b.key].length === 1 ? '' : 's'}
            </span>
          }
        >
          <ul className="flex flex-wrap gap-2">
            {terms[b.key].map((t) => (
              <li key={t}>
                {/* The chip does not force a page to scroll. The term and its
                    date each hold their own line, and at a width that cannot
                    take both the date wraps under the term rather than the
                    whole chip pushing past the pane. */}
                <span className="inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded-[4px] bg-inner py-[7px] pl-2.5 pr-2 text-[12px] font-medium">
                  <span className="whitespace-nowrap">{t}</span>
                  {/* WHERE THE LOG HOLDS NOTHING AT ALL, THE CHIPS SAY NOTHING.
                      The sentence under them ("We have not written down when a
                      term was added yet") already says it once; per chip it is
                      the same statement twenty-one times. Where SOME terms are
                      dated, an undated one keeps its own sentence, because
                      there the absence is about that term. */}
                  {logged && (
                    <span title={datesNote} className="font-mono text-[10.5px] font-normal leading-[1.3] text-muted-foreground">
                      {dates[t.trim().toLowerCase()] ?? 'in the set before we kept a record'}
                    </span>
                  )}
                  <input type="hidden" name={b.key} value={t} />
                  <button
                    type="button"
                    onClick={() => { onRemove(b.key, t); setError(null) }}
                    disabled={!canEdit}
                    aria-label={`Remove ${t}`}
                    className={cn(ICON_TARGET, 'cursor-pointer rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-tile hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40')}
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                </span>
              </li>
            ))}
            {terms[b.key].length === 0 && <li className="py-[7px] text-[12px] text-muted-foreground">none yet</li>}
          </ul>
        </LabelRow>
      ))}

      {/* Where terms carry dates, what a date means is the chip's hover
          (copy de-clutter C92); where none do, the absence is said once. */}
      {datesNote && !logged && (
        <LabelRow label="" top="chips">
          <MonoNote>{datesNote}</MonoNote>
        </LabelRow>
      )}

      {flagged.length > 0 && (
        <LabelRow
          label="Worth reviewing"
          meta={`${flagged.length} term${flagged.length === 1 ? '' : 's'}`}
          top="control"
        >
          <div className="flex flex-col gap-2">
            {flagged.map((t) => (
              <ReviewStrip key={t.key} term={t} canEdit={canEdit} onDrop={() => onRemove(bucketOf(t.bucket), t.keyword)} />
            ))}
            {/* ONCE, UNDER THE STRIPS — not once per strip (ST7). It is a
                constant: the same 52 characters on every row, and inside the
                strip it was a flex item sized by its own content, so it took
                460px of a 716px row while the EVIDENCE beside it — the k of n
                and the sentence that says why the term is flagged — was laid
                out in 146px over three lines. A footnote that repeats cannot
                outbid the thing it is a footnote to. Same argument the rivals
                section already made for its own repeated sentence. */}
            <MonoNote>{REVIEW_KEEP_NOTE}</MonoNote>
          </div>
        </LabelRow>
      )}

      <LabelRow label="Add a term" top="control">
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={draft}
              onChange={(e) => { setDraft(e.target.value); setError(null) }}
              onKeyDown={(e) => {
                // Enter adds a term; it never submits the page's one form.
                if (e.key !== 'Enter') return
                e.preventDefault()
                add()
              }}
              disabled={!canEdit || full}
              placeholder={full ? `${MAX_TERMS_PER_BUCKET} is the limit for that list` : 'wet commute bag'}
              aria-label="Add a search term"
              className={cn(FIELD, 'w-[280px] max-w-full')}
            />
            <select
              value={bucket}
              onChange={(e) => { setBucket(e.target.value as Bucket); setError(null) }}
              disabled={!canEdit}
              aria-label="Which list the term joins"
              className={cn(FIELD, 'pr-8')}
            >
              {BUCKETS.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
            </select>
            <button type="button" onClick={add} disabled={!canEdit || full || draft.trim() === ''} className={CONTROL}>Add</button>
            <MonoNote>{NEW_TERM_RULE}</MonoNote>
          </div>
          {error && <span role="alert" className="text-[11.5px] text-negative">{error}</span>}
        </div>
      </LabelRow>

      {children}
    </Section>
  )
}

/** `settings.terms.review` — the amber-dot strip, one per term the record
 *  flags. The sentence is the evidence, in the client's words, and the figure
 *  it turns on is printed as k of n. */
export function ReviewStrip({ term, canEdit, onDrop }: { term: TermSummary; canEdit: boolean; onDrop: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[4px] bg-inner px-3.5 py-3">
      <span className="inline-flex shrink-0 items-center gap-1.5">
        <Dot tone="watch" />
        <span className="whitespace-nowrap text-[12.5px] font-semibold">{term.keyword}</span>
      </span>
      <span className="min-w-0 flex-1 text-[12.5px] text-secondary-foreground">
        kept <span className="font-mono font-medium tabular-nums">{term.kept.toLocaleString('en-GB')}</span> of{' '}
        <span className="font-mono font-medium tabular-nums">{term.found.toLocaleString('en-GB')}</span> found
        {term.because[0] ? ` — ${term.because[0]}` : ''}
      </span>
      {/* Sentence, then action, on one line — which is what the artboard draws
          and what M7 was after when it moved the control to the strip's own
          right edge. What M7 left between them was the keep-note, and that is
          now printed once under the list rather than on every strip (ST7).
          Nothing here is a "Keep it": see the constant above. */}
      <button type="button" onClick={onDrop} disabled={!canEdit} className={cn(CONTROL, 'ml-auto shrink-0')}>Remove it</button>
    </div>
  )
}

/** `TermSummary.bucket` is the column's own word; the form's key is the
 *  column. One map, so the review strip cannot remove a term from the wrong list. */
export function bucketOf(bucket: string): Bucket {
  if (bucket === 'brand') return 'brand_keywords'
  if (bucket === 'competitor') return 'competitor_keywords'
  if (bucket === 'exclude') return 'exclude_terms'
  return 'industry_keywords'
}
