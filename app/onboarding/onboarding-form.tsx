'use client'

import { useActionState, useRef, useState, useTransition } from 'react'
import { Check, Sparkles } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { SELECTABLE_PLATFORMS } from '@/app/dashboard/settings/constants'
import { createWorkspace, suggestTerms, type OnboardingState, type SuggestTermsState } from './actions'

const idleOnboarding: OnboardingState = { ok: false, message: '' }
const idleSuggest: SuggestTermsState = { ok: false, message: '', suggestions: null }

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const GROUPS = [
  { key: 'brand', field: 'suggested_brand', label: 'Your brand' },
  { key: 'competitors', field: 'suggested_competitor', label: 'Competitors' },
  { key: 'category', field: 'suggested_category', label: 'Your category' },
] as const

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-muted-foreground/70">{hint}</span>}
    </label>
  )
}

export function OnboardingForm() {
  const [state, formAction, pending] = useActionState(createWorkspace, idleOnboarding)
  const [suggest, setSuggest] = useState<SuggestTermsState>(idleSuggest)
  const [suggesting, startSuggest] = useTransition()
  // Terms the user has TURNED OFF. Everything suggested starts on, so the
  // fastest path through onboarding is the one that does nothing.
  const [dropped, setDropped] = useState<Set<string>>(new Set())
  const form = useRef<HTMLFormElement>(null)

  function ask() {
    const el = form.current
    if (!el) return
    setDropped(new Set())
    startSuggest(async () => setSuggest(await suggestTerms(idleSuggest, new FormData(el))))
  }

  function toggle(id: string) {
    setDropped((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <form ref={form} action={formAction} className="space-y-5">
      <fieldset disabled={pending} className="space-y-5">
        <Field label="Company name">
          <Input name="company_name" required placeholder="Acme Co." />
        </Field>

        <Field label="Competitors" hint="Comma-separated. The brands you compete with. We listen under their posts too.">
          <Input name="competitor_names" required placeholder="Nike, Hoka, On" />
        </Field>

        <Field label="Category words" hint="Comma-separated, optional. A few words people use for what you sell.">
          <Input name="industry_keywords" placeholder="running shoes, trail running, marathon" />
        </Field>

        {/* Search terms. A name finds posts that name you; it never finds the
            conversation about what you sell, and a marketer should not have to
            guess which words that takes. We propose, they keep. */}
        <div className="space-y-2 rounded-md bg-inner px-3.5 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">Search terms</p>
              <p className="text-[11px] text-muted-foreground">
                {suggest.suggestions ? suggest.message : 'The words we look for. We can propose them from what you just typed.'}
              </p>
            </div>
            <Button type="button" variant="secondary" size="sm" disabled={suggesting} onClick={ask}>
              <Sparkles className="size-3.5" aria-hidden />
              {suggesting ? 'Thinking…' : suggest.suggestions ? 'Suggest again' : 'Suggest search terms'}
            </Button>
          </div>

          {!suggest.ok && suggest.message && <p className="text-[12px] text-destructive">{suggest.message}</p>}

          {suggest.suggestions && (
            <div className="space-y-2.5 pt-1">
              {GROUPS.map(({ key, field, label }) => {
                const terms = suggest.suggestions![key]
                if (terms.length === 0) return null
                return (
                  <div key={key} className="space-y-1.5">
                    <p className="text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">{label}</p>
                    <ul className="flex flex-wrap gap-1.5">
                      {terms.map((t) => {
                        const id = `${key}:${t}`
                        const on = !dropped.has(id)
                        return (
                          <li key={id}>
                            <button
                              type="button"
                              onClick={() => toggle(id)}
                              aria-pressed={on}
                              className={`inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-full py-0.5 pl-1.5 pr-2.5 text-[11.5px] shadow-block transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${on ? 'bg-accent text-accent-foreground' : 'bg-tile text-muted-foreground hover:text-foreground'}`}
                            >
                              <Check className={`size-3 ${on ? '' : 'opacity-0'}`} aria-hidden />
                              {t}
                            </button>
                            {on && <input type="hidden" name={field} value={t} />}
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <span className="text-sm font-medium">Platforms to track</span>
          <div className="flex flex-wrap gap-4 pt-1">
            {SELECTABLE_PLATFORMS.map((p) => (
              <label key={p} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="platforms"
                  value={p}
                  defaultChecked
                  className="size-4 rounded border-input accent-primary"
                />
                {cap(p)}
              </label>
            ))}
          </div>
        </div>
      </fieldset>

      {state.message && <p className="text-sm text-destructive">{state.message}</p>}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Setting up…' : 'Create workspace'}
      </Button>
    </form>
  )
}
