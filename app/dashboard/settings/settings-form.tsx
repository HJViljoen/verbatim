'use client'

import { useActionState } from 'react'
import { updateTrackingConfig, type SettingsFormState } from './actions'
import { PLATFORMS, PERIODS, DAYS, LIMITS } from './constants'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export interface TrackingConfig {
  brand_keywords: string[] | null
  competitor_keywords: string[] | null
  competitor_names: string[] | null
  industry_keywords: string[] | null
  platforms: string[] | null
  report_emails: string[] | null
  report_period: string | null
  report_day: string | null
  max_videos: number | null
  max_comments: number | null
  comment_depth: number | null
}

const initialState: SettingsFormState = { ok: false, message: '' }
const join = (a: string[] | null) => (a ?? []).join(', ')
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const selectCls =
  'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50'

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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Platforms</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-4">
              {PLATFORMS.map((p) => (
                <label key={p} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="platforms"
                    value={p}
                    defaultChecked={cfg.platforms?.includes(p) ?? false}
                    className="size-4 rounded border-input accent-primary disabled:opacity-50"
                  />
                  {cap(p)}
                </label>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Competitors</CardTitle></CardHeader>
            <CardContent>
              <Labeled label="Competitor names" hint="Comma-separated. Used to tag competitor content.">
                <Input name="competitor_names" defaultValue={join(cfg.competitor_names)} placeholder="Ottobock, Blatchford" />
              </Labeled>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Brand keywords</CardTitle></CardHeader>
            <CardContent>
              <Labeled label="Your brand terms" hint="Comma-separated.">
                <Input name="brand_keywords" defaultValue={join(cfg.brand_keywords)} placeholder="Össur, Pro-Flex" />
              </Labeled>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Competitor keywords</CardTitle></CardHeader>
            <CardContent>
              <Labeled label="Competitor terms" hint="Comma-separated.">
                <Input name="competitor_keywords" defaultValue={join(cfg.competitor_keywords)} placeholder="Genium, Kenevo" />
              </Labeled>
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader><CardTitle className="text-sm">Industry keywords</CardTitle></CardHeader>
            <CardContent>
              <Labeled label="Category terms that define your space" hint="Comma-separated. Used for search + GPT context.">
                <Input name="industry_keywords" defaultValue={join(cfg.industry_keywords)} placeholder="prosthetic, amputee, prosthetic leg" />
              </Labeled>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-sm">Scrape &amp; report config</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Labeled label="Max videos / run">
              <Input type="number" name="max_videos" defaultValue={cfg.max_videos ?? ''} min={LIMITS.max_videos.min} max={LIMITS.max_videos.max} />
            </Labeled>
            <Labeled label="Max comments / video">
              <Input type="number" name="max_comments" defaultValue={cfg.max_comments ?? ''} min={LIMITS.max_comments.min} max={LIMITS.max_comments.max} />
            </Labeled>
            <Labeled label="Comment depth">
              <Input type="number" name="comment_depth" defaultValue={cfg.comment_depth ?? ''} min={LIMITS.comment_depth.min} max={LIMITS.comment_depth.max} />
            </Labeled>
            <Labeled label="Report period">
              <select name="report_period" defaultValue={cfg.report_period ?? 'weekly'} className={selectCls}>
                {PERIODS.map((p) => <option key={p} value={p}>{cap(p)}</option>)}
              </select>
            </Labeled>
            <Labeled label="Report day">
              <select name="report_day" defaultValue={cfg.report_day ?? 'monday'} className={selectCls}>
                {DAYS.map((d) => <option key={d} value={d}>{cap(d)}</option>)}
              </select>
            </Labeled>
            <Labeled label="Report emails" hint="Comma-separated.">
              <Input name="report_emails" defaultValue={join(cfg.report_emails)} placeholder="team@brand.com" />
            </Labeled>
          </CardContent>
        </Card>
      </fieldset>

      {canEdit ? (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save changes'}</Button>
          {state.message && (
            <span className={`text-sm ${state.ok ? 'text-green-600' : 'text-destructive'}`}>{state.message}</span>
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
