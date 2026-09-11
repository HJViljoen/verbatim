'use client'

import { useActionState, useState, useTransition } from 'react'
import { Plus, Sparkles, X } from 'lucide-react'
import { updateSearchTerms, suggestMoreTerms, type SettingsFormState, type SuggestState } from './actions'
import { MIN_KEYWORD_CHARS, MAX_TERMS_PER_BUCKET, cleanTerms } from '@/lib/onboarding-config'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { SettingsCard } from '@/components/settings-frame'

// What we search for — the client's own words, editable (WP5, 2026-09-11).
//
// Copy rule: these are "search terms", never "keywords", and the three groups
// read "Your brand", "Competitors", "Your category" — the words a marketer
// already has. The fourth list is the exclusions, phrased as the sentence it
// means: "when a match is really about this, it is not about us."
//
// Nothing here can raise cost. Each list is capped at the DB's own ceiling and
// every term is at least MIN_KEYWORD_CHARS, which is the lesson that cost
// Sealand 331 of 602 videos on its first run — a short, common word finds the
// whole internet.

export interface SearchTermsConfig {
  brand_keywords: string[] | null
  competitor_keywords: string[] | null
  industry_keywords: string[] | null
  exclude_terms: string[] | null
}

type Bucket = 'brand_keywords' | 'competitor_keywords' | 'industry_keywords' | 'exclude_terms'

const idleSave: SettingsFormState = { ok: false, message: '' }
const idleSuggest: SuggestState = { ok: false, message: '', suggestions: null }

/** One editable list of terms: chips, an add box, and the count against the cap. */
function TermList({
  name, label, hint, terms, suggestions, disabled, onAdd, onRemove,
}: {
  name: Bucket
  label: string
  hint: string
  terms: string[]
  suggestions: string[]
  disabled: boolean
  onAdd: (term: string) => string | null
  onRemove: (term: string) => void
}) {
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const full = terms.length >= MAX_TERMS_PER_BUCKET

  function add(term: string) {
    const problem = onAdd(term)
    setError(problem)
    return problem === null
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div>
        <p className="text-[12px] font-medium">{label}</p>
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      </div>

      {/* The terms themselves. Hidden inputs carry them, one per term, so a
          term containing a comma survives the round trip. */}
      <ul className="flex flex-1 flex-wrap content-start gap-1.5">
        {terms.map((t) => (
          <li key={t}>
            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-tile py-0.5 pl-2.5 pr-1 text-[11.5px] shadow-block">
              {t}
              <input type="hidden" name={name} value={t} />
              <button
                type="button"
                onClick={() => { onRemove(t); setError(null) }}
                disabled={disabled}
                aria-label={`Remove ${t}`}
                className="cursor-pointer rounded-full p-0.5 text-muted-foreground transition-colors duration-150 hover:bg-inner hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
              >
                <X className="size-3" aria-hidden />
              </button>
            </span>
          </li>
        ))}
        {terms.length === 0 && <li className="text-[11.5px] text-muted-foreground">none yet</li>}
      </ul>

      {/* mt-auto: the three lists are equal-height grid cells, so the add rows
          line up even when one list's chips wrap onto a second line. */}
      <div className="mt-auto flex items-center gap-1.5">
        <Input
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setError(null) }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault() // Enter adds a term; it never submits the form
            if (add(draft)) setDraft('')
          }}
          disabled={disabled || full}
          placeholder={full ? `${MAX_TERMS_PER_BUCKET} is the limit` : 'Add a term'}
          aria-label={`Add a term to ${label}`}
          className="h-7 text-[12.5px]"
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled || full || draft.trim() === ''}
          onClick={() => { if (add(draft)) setDraft('') }}
        >
          Add
        </Button>
        <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-muted-foreground">
          {terms.length}/{MAX_TERMS_PER_BUCKET}
        </span>
      </div>

      {error && <p className="text-[11px] text-destructive">{error}</p>}

      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">Suggested</span>
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              disabled={disabled || full}
              className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-full bg-tile py-0.5 pl-1.5 pr-2.5 text-[11.5px] text-muted-foreground shadow-block transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus className="size-3" aria-hidden />
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function SearchTermsForm({ cfg, canEdit }: { cfg: SearchTermsConfig; canEdit: boolean }) {
  const [state, formAction, saving] = useActionState(updateSearchTerms, idleSave)
  const [suggest, setSuggest] = useState<SuggestState>(idleSuggest)
  const [suggesting, startSuggest] = useTransition()

  const [terms, setTerms] = useState<Record<Bucket, string[]>>({
    brand_keywords: cleanTerms(cfg.brand_keywords ?? []),
    competitor_keywords: cleanTerms(cfg.competitor_keywords ?? []),
    industry_keywords: cleanTerms(cfg.industry_keywords ?? []),
    exclude_terms: cleanTerms(cfg.exclude_terms ?? []),
  })

  /** Returns the reason a term was refused, or null when it went in. */
  function addTerm(bucket: Bucket, raw: string): string | null {
    const term = raw.trim().replace(/\s+/g, ' ')
    if (term.length < MIN_KEYWORD_CHARS) return `Terms need at least ${MIN_KEYWORD_CHARS} characters — a shorter word finds the whole internet.`
    const list = terms[bucket]
    if (list.length >= MAX_TERMS_PER_BUCKET) return `That list is full at ${MAX_TERMS_PER_BUCKET}. Remove one first.`
    if (list.some((t) => t.toLowerCase() === term.toLowerCase())) return 'That term is already in the list.'
    setTerms((prev) => ({ ...prev, [bucket]: [...prev[bucket], term] }))
    return null
  }

  function removeTerm(bucket: Bucket, term: string) {
    setTerms((prev) => ({ ...prev, [bucket]: prev[bucket].filter((t) => t !== term) }))
  }

  /** A suggestion already in the list is not a suggestion. */
  const unused = (bucket: Bucket, offered: string[]) => {
    const have = new Set(terms[bucket].map((t) => t.toLowerCase()))
    return offered.filter((t) => !have.has(t.toLowerCase()))
  }

  const disabled = !canEdit || saving

  return (
    <SettingsCard
      title="What we search for"
      description="The terms we look for on every platform. Change them and the next update searches the new ones — nothing already gathered changes."
    >
      <form action={formAction} className="space-y-4">
        <fieldset disabled={disabled} className="space-y-4">
          <div className="grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-3">
            <TermList
              name="brand_keywords" label="Your brand"
              hint="How people write your name, including the ways they get it wrong."
              terms={terms.brand_keywords} suggestions={unused('brand_keywords', suggest.suggestions?.brand ?? [])}
              disabled={disabled}
              onAdd={(t) => addTerm('brand_keywords', t)} onRemove={(t) => removeTerm('brand_keywords', t)}
            />
            <TermList
              name="competitor_keywords" label="Competitors"
              hint="What we search for to find their posts. Names to tag them by are set below."
              terms={terms.competitor_keywords} suggestions={unused('competitor_keywords', suggest.suggestions?.competitors ?? [])}
              disabled={disabled}
              onAdd={(t) => addTerm('competitor_keywords', t)} onRemove={(t) => removeTerm('competitor_keywords', t)}
            />
            <TermList
              name="industry_keywords" label="Your category"
              hint="What buyers type when they are talking about this kind of product."
              terms={terms.industry_keywords} suggestions={unused('industry_keywords', suggest.suggestions?.category ?? [])}
              disabled={disabled}
              onAdd={(t) => addTerm('industry_keywords', t)} onRemove={(t) => removeTerm('industry_keywords', t)}
            />
          </div>

          <div className="border-t border-border/70 pt-4">
            <TermList
              name="exclude_terms" label="Not this"
              hint="Senses of your name that are not you — Cotopaxi the volcano, Sealand the shipping line. A post that is really about one of these is not about you."
              terms={terms.exclude_terms} suggestions={[]}
              disabled={disabled}
              onAdd={(t) => addTerm('exclude_terms', t)} onRemove={(t) => removeTerm('exclude_terms', t)}
            />
          </div>
        </fieldset>

        {canEdit ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="sm" disabled={disabled}>{saving ? 'Saving…' : 'Save search terms'}</Button>
            <Button
              type="button" variant="secondary" size="sm" disabled={disabled || suggesting}
              onClick={() => startSuggest(async () => setSuggest(await suggestMoreTerms(idleSuggest, new FormData())))}
            >
              <Sparkles className="size-3.5" aria-hidden />
              {suggesting ? 'Thinking…' : 'Suggest more'}
            </Button>
            {state.message && <span className={`text-[12px] ${state.ok ? 'text-positive' : 'text-destructive'}`} role="status">{state.message}</span>}
            {!state.message && suggest.message && (
              <span className={`text-[12px] ${suggest.ok ? 'text-muted-foreground' : 'text-destructive'}`} role="status">{suggest.message}</span>
            )}
          </div>
        ) : (
          <p className="text-[11.5px] text-muted-foreground">
            You have read-only access. Ask an owner or admin to change what we search for.
          </p>
        )}
      </form>
    </SettingsCard>
  )
}
