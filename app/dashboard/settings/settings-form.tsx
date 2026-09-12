'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { updateTrackingConfig, type SettingsFormState } from './actions'
import { PERIODS, DAYS } from './constants'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { SettingsCard } from '@/components/settings-frame'

// Facts vs knobs (Redesign Spec §9): clients edit the facts only they know —
// competitor names, the terms we search for (search-terms-form.tsx, 2026-09-11)
// and how reports reach them.
//
// Search terms used to be an operator lever here, "because they drive cost and
// output quality". Cost is bounded below the UI now — the tracking_configs
// CHECK constraints cap each bucket at 15 and GATHER_MAX_SEARCHES_PER_RUN caps
// a run at 120 searches — and quality is what the performance table beside the
// editor is for. max_videos, comment_depth and platforms stay operator knobs:
// they move cost directly, and the client never sees them.

export interface TrackingConfig {
  competitor_names: string[] | null
  report_period: string | null
  report_day: string | null
}

const initialState: SettingsFormState = { ok: false, message: '' }
const join = (a: string[] | null) => (a ?? []).join(', ')
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const selectCls =
  'h-8 w-full rounded-[4px] border border-input bg-tile px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50'

function Labeled({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-muted-foreground/70">{hint}</span>}
    </label>
  )
}

export function SettingsForm({ cfg, canEdit }: { cfg: TrackingConfig; canEdit: boolean }) {
  const [state, formAction, pending] = useActionState(updateTrackingConfig, initialState)

  return (
    <form action={formAction} className="space-y-6">
      {/* fieldset disables every control at once for read-only members + while saving */}
      <fieldset disabled={!canEdit || pending} className="space-y-6">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <SettingsCard title="Competitors" description="The brands we compare you against. Comma-separated.">
            <Labeled label="Competitor names" hint="What we tag their content by. What we search for to find it is below, under “What we search for”.">
              <Input name="competitor_names" defaultValue={join(cfg.competitor_names)} placeholder="Ottobock, Blatchford" />
            </Labeled>
          </SettingsCard>

          <SettingsCard title={<span id="reports">Update cadence</span>} description="How often the update runs, every schedule sends after it.">
            <div className="space-y-4">
              <Labeled label="Report period">
                {cfg.report_period === 'paused' ? (
                  // Pausing is an operator lever this select cannot represent.
                  // Before, it rendered as "Weekly" and a save reported success
                  // while the action quietly wrote 'paused' back: the UI lied
                  // about what had happened.
                  <p className="text-sm text-muted-foreground">
                    Paused. Updates are not being sent. Contact us to start them again.
                  </p>
                ) : (
                  <select name="report_period" defaultValue={cfg.report_period ?? 'weekly'} className={selectCls}>
                    {PERIODS.map((p) => <option key={p} value={p}>{cap(p)}</option>)}
                  </select>
                )}
              </Labeled>
              <Labeled label="Report day">
                <select name="report_day" defaultValue={cfg.report_day ?? 'monday'} className={selectCls}>
                  {DAYS.map((d) => <option key={d} value={d}>{cap(d)}</option>)}
                </select>
              </Labeled>
              <p className="text-[11px] text-muted-foreground">
                Who receives what is set per schedule in{' '}
                <Link href="/dashboard/studio" className="underline underline-offset-2">
                  the Studio
                </Link>
                .
              </p>
            </div>
          </SettingsCard>
        </div>
      </fieldset>

      {canEdit ? (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save changes'}</Button>
          {state.message && (
            <span className={`text-sm ${state.ok ? 'text-positive' : 'text-destructive'}`}>{state.message}</span>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          You have read-only access. Ask an owner or admin to change tracking settings.
        </p>
      )}
    </form>
  )
}
