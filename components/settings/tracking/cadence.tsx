'use client'

import Link from 'next/link'
import { DAYS, PERIODS } from '@/app/dashboard/settings/constants'
import { FIELD, LabelRow, MonoNote, Section, SectionHead } from '@/components/settings/chrome'
import { cap, shortDate } from '@/lib/format'
import { SLOT_HOUR } from '@/lib/pipeline/schedule-due'
import { FREEZE_AFTER_DAYS } from '@/lib/reading/types'
import { STUDIO_HREF } from '@/lib/studio-visibility'
import { cn } from '@/lib/utils'

// `settings.cadence.*` — how often an update lands, and on which day.
//
// FORTNIGHTLY IS NOT INVENTED. The artboard offers Weekly · Fortnightly ·
// Monthly; the product understands weekly, monthly, daily and paused, and
// nothing anywhere can run a fortnightly schedule. A third radio that wrote a
// value the dispatcher ignores would be a setting that silently does nothing.
//
// 06:00 IS A FACT, NOT A CONTROL. There is no per-tenant hour column: the
// dispatcher's cron fires at `SLOT_HOUR` in Africa/Johannesburg for every
// workspace (lib/pipeline/schedule-due.ts). The artboard draws a dropdown; a
// dropdown with one value that cannot be changed is furniture, so it prints as
// what it is.
//
// NO "next 4 Oct". There is no field for the next slot that survives a paused
// tenant, a changed day or a missed dispatch, and a promised calendar date is
// the one thing a settings page must not print on a guess (D12/D14). What IS
// true is what already happened, so the evidence line under the chosen cadence
// names the updates of this month by their dates.
//
// AND THE MONTH DOES NOT CLOSE ON THE 28th. The artboard's note says it does;
// the code freezes a month 30 days after it ENDS (FREEZE_AFTER_DAYS, the three
// guards on the six month tables). A settings note stating the 28th would be a
// copy claim that does not match the code, which is the exact failure AGENTS.md
// names.

export const SLOT_NOTE = `${String(SLOT_HOUR).padStart(2, '0')}:00 SAST, the same hour for every workspace`
export const FREEZE_NOTE = `a month stays open for ${FREEZE_AFTER_DAYS} days after it ends, then closes for good`

export interface CadenceSectionProps {
  period: string
  day: string
  /** What is stored, which is not what the reader may have just chosen. */
  storedPeriod: string
  onPeriod: (period: string) => void
  onDay: (day: string) => void
  canEdit: boolean
  /** The updates of the month in hand, newest first, `YYYY-MM-DD`. */
  updatesThisMonth: readonly string[]
  /** The month those updates are in, as a month start. */
  month: string
  lastUpdate: string | null
  showStudio: boolean
}

export function CadenceSection({
  period, day, storedPeriod, onPeriod, onDay, canEdit, updatesThisMonth, month, lastUpdate, showStudio,
}: CadenceSectionProps) {
  const paused = storedPeriod === 'paused'
  const meta = [
    paused ? 'paused' : period,
    `${cap(day)} ${SLOT_NOTE}`,
    lastUpdate ? `last ${shortDate(`${lastUpdate}T00:00:00.000Z`)}` : 'no update on record',
  ].join(' · ')

  return (
    <Section>
      <SectionHead title="Cadence" meta={meta} />

      <LabelRow label="How often" top="control">
        {paused ? (
          // Pausing is an operator lever this control cannot represent. Before,
          // it rendered as "Weekly" and a save wrote that back, re-arming the
          // scheduler on a workspace meant to be quiet.
          <p className="py-2 text-[12.5px] text-muted-foreground">
            Paused. Updates are not being sent. Contact us to start them again.
          </p>
        ) : (
          <div className="flex flex-col">
            {PERIODS.map((p) => (
              <label key={p} className={cn('flex min-h-9 cursor-pointer items-center gap-2.5 text-[12.5px]', period === p ? 'text-foreground' : 'text-secondary-foreground')}>
                <input
                  type="radio"
                  name="report_period"
                  value={p}
                  checked={period === p}
                  onChange={() => onPeriod(p)}
                  disabled={!canEdit}
                  className="size-4 accent-primary"
                />
                <span className={period === p ? 'font-medium' : undefined}>{cap(p)}</span>
                {storedPeriod === p && updatesThisMonth.length > 0 && (
                  <MonoNote className="text-[11px] text-muted-foreground">
                    {updatesThisMonth.length} update{updatesThisMonth.length === 1 ? '' : 's'} in{' '}
                    {new Date(`${month}T00:00:00.000Z`).toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' })} —{' '}
                    {updatesThisMonth.map((d) => shortDate(`${d}T00:00:00.000Z`)).join(', ')}
                  </MonoNote>
                )}
              </label>
            ))}
          </div>
        )}
      </LabelRow>

      <LabelRow label="When it lands" top="control">
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <select
              name="report_day"
              value={day}
              onChange={(e) => onDay(e.target.value)}
              disabled={!canEdit}
              aria-label="The day an update lands"
              className={cn(FIELD, 'w-[180px]')}
            >
              {DAYS.map((d) => <option key={d} value={d}>{cap(d)}</option>)}
            </select>
            <span className="inline-flex h-11 items-center rounded-[4px] bg-inner px-3 font-mono text-[11px] text-muted-foreground">{SLOT_NOTE}</span>
            <MonoNote>{FREEZE_NOTE}</MonoNote>
          </div>
          <span className="text-[11.5px] text-muted-foreground">
            {showStudio ? (
              <>Who receives what is set per schedule in <Link href={STUDIO_HREF} className="underline underline-offset-2">the Studio</Link>.</>
            ) : (
              <>Who receives each update is managed by Verbatim for now. Ask us to change a list.</>
            )}
          </span>
        </div>
      </LabelRow>
    </Section>
  )
}
