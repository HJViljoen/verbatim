import { fmtInt, shortDate } from '@/lib/format'
import { DELIVERED_STATUSES, type DeliveryRecord, type DeliveryStat } from '@/lib/settings/delivery'
import type { ReadingsRecord } from '@/lib/settings/readings'
import type { UpdateInput } from '@/lib/readiness/types'

import { DatePill, LabelRow, RecordSection, StatCell } from './frame'

/**
 * DELIVERY — the artboard's first section (`record.delivery.*`,
 * `record.readings`).
 *
 * Three things, in the artboard's order: four stat cells, this month's dated
 * pills, and the monthly-readings strip. The build had one prose sentence, a
 * row of pills printing raw ISO days with a run status on each, and no readings
 * strip at all — `readingsCounter` was composed in `lib/pages/overview.ts` and
 * rendered on OVERVIEW'S page bar.
 *
 * TWO COUNTS OF "UPDATES" ON ONE SECTION, AND BOTH SAY WHICH THEY ARE. The
 * stat cells and the pills count every update ON RECORD — the ones that
 * finished, the one that failed, and a run still in flight while the page is
 * open — because an update that failed still happened and is still in the
 * record (`lib/settings/delivery.ts`). The readings strip counts DELIVERED
 * updates, because that is what Overview's counter and the thin-month rule
 * count. So the two totals differ by the failures, which is why the cell is
 * captioned "on record" and not "delivered": captioned "delivered" it said 22
 * over a strip saying 21, two lines above a pill reading "· did not finish".
 * A failed update is marked on its own pill rather than quietly dropped.
 */
export function DeliveryBlock({
  record, stats, updates, month, readings,
}: {
  record: DeliveryRecord
  stats: readonly DeliveryStat[]
  /** The updates that ran in the month the page is reading, newest first. */
  updates: readonly UpdateInput[]
  /** That month, in the reader's words. */
  month: string
  readings: ReadingsRecord
}) {
  return (
    <RecordSection title="Delivery" meta="every update since the first one on record">
      {stats.length === 0 ? (
        <p className="m-0 text-[12.5px] text-muted-foreground">{record.line}</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {stats.map((s) => (
            <StatCell key={s.id} figure={s.figure} unit={s.unit} caption={s.caption} />
          ))}
        </div>
      )}

      {/* THE DELIVERY CAVEATS BELONG TO THE DELIVERY FIGURES, and they used to
          render after the monthly-readings strip, outside the 172px gutter,
          where they read as footnotes to the readings and the section's
          argument went stats → month → readings → stats again (design review
          finding 7). How many of the last few finished, and what the slot
          bookkeeping cannot tell, are both about the four cells above. */}
      <div className="flex flex-col gap-1">
        {record.total > 0 ? (
          <p className="m-0 text-[11.5px] text-muted-foreground">
            {fmtInt(record.recentSettled)} of the last {fmtInt(record.recent)} finished.
            {record.scheduledServed
              ? ` ${fmtInt(record.scheduledServed.scheduled)} served a scheduled slot, ${fmtInt(record.scheduledServed.byHand)} were run by hand.`
              : ''}
          </p>
        ) : null}
        {record.caveats.map((c) => (
          <p key={c} className="m-0 text-[11.5px] text-muted-foreground">{c}</p>
        ))}
      </div>

      <LabelRow label={month} sub={`${fmtInt(updates.length)} ${updates.length === 1 ? 'update' : 'updates'}`}>
        {updates.length === 0 ? (
          <p className="m-0 pt-1.5 text-[12px] text-muted-foreground">No update has run this month yet.</p>
        ) : (
          <ul className="flex flex-wrap items-center gap-2">
            {[...updates].reverse().map((u) => (
              <li key={u.id}>
                {/* The reader's date form, never the stored ISO day — the rule
                    `recordLines` states about its own dates, applied to the
                    chips that sit under it. */}
                <DatePill>
                  {shortDate(u.startedAt)}
                  {DELIVERED_STATUSES.has(u.status) ? '' : ' · did not finish'}
                </DatePill>
              </li>
            ))}
          </ul>
        )}
      </LabelRow>

      <LabelRow
        label="Monthly readings"
        sub={readings.recorded ? `${fmtInt(readings.readings)} so far` : 'not recorded'}
      >
        {!readings.recorded ? (
          <p className="m-0 text-[12.5px] text-muted-foreground">
            The month-by-month reading has not been recorded for this workspace yet, so there is nothing to count.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {readings.months.length > 0 ? (
              <p className="m-0 text-[12.5px]">
                {readings.months.map((m, i) => (
                  <span key={m.month}>
                    {i > 0 ? ' · ' : ''}
                    {m.label}{' '}
                    <span data-copy="figure" className="font-mono text-[12px] tabular-nums text-secondary-foreground">
                      {fmtInt(m.updates)}
                    </span>{' '}
                    {m.current ? 'so far' : m.updates === 1 ? 'update' : 'updates'}
                  </span>
                ))}
              </p>
            ) : null}
            <p className="m-0 text-[12px] text-muted-foreground">{capitalise(readings.counter)}.</p>
            {readings.backReadLabel ? (
              <p className="m-0 text-[12px] text-muted-foreground">
                {readings.backReadLabel} {readings.backRead.length === 1 ? 'was' : 'were'} read at setup — a reading of
                today’s corpus, not what we would have said at the time.
              </p>
            ) : null}
            {readings.belowFloor.length > 0 ? (
              <p className="m-0 text-[12px] text-muted-foreground">
                {readings.belowFloor[0].who} is under the floor in {readings.belowFloor[0].label} —{' '}
                <span data-copy="figure" className="font-mono text-[11.5px] tabular-nums text-secondary-foreground">
                  {fmtInt(readings.belowFloor[0].videos)}
                </span>{' '}
                videos against the{' '}
                <span data-copy="figure" className="font-mono text-[11.5px] tabular-nums text-secondary-foreground">
                  {fmtInt(readings.floor)}
                </span>{' '}
                a banded reading needs
                {/* THE REMAINDER IS COUNTED OFF THE TOTAL, NEVER OFF THE LIST.
                    `readings.belowFloor` is truncated to three, so counting it
                    here said "2 other months" over a workspace with four under
                    the floor (code review finding 2). */}
                {readings.belowFloorTotal > 1
                  ? `, and ${fmtInt(readings.belowFloorTotal - 1)} other ${readings.belowFloorTotal === 2 ? 'month is' : 'months are'} under it too`
                  : ''}
                . A month under the floor is one that has not filled up, not one that went wrong.
                {/* Except a month read at setup, which is as full as it will
                    ever be — so the thin-month sentence is not left standing
                    over months it is not true of. */}
                {readings.belowFloorBackRead > 0
                  ? ` Of those, ${fmtInt(readings.belowFloorBackRead)} ${readings.belowFloorBackRead === 1 ? 'was' : 'were'} read at setup and will not fill up any further.`
                  : ''}
              </p>
            ) : null}
          </div>
        )}
      </LabelRow>

    </RecordSection>
  )
}

/** `readingsCounter` is composed as a clause ("your 3rd monthly reading · the
 *  quarter view needs 6") because Overview prints it inside a bar line. Here it
 *  is a sentence of its own. */
function capitalise(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1)
}
