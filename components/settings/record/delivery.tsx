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
    <RecordSection title="Delivery">
      {stats.length === 0 ? (
        <p className="m-0 text-[12.5px] text-muted-foreground">{record.line}</p>
      ) : (
        /* FOUR ABREAST AT `lg`, NOT `md` (Block D wave 3, RC2). `md` is
           exactly where the app's 224px sidebar and SettingsFrame's own 224px
           rail both arrive, so the four cells opened in a 240px pane: measured
           cell widths 768 → 48px, 820 → 61px, 900 → 81px, 1024 → 112px, and a
           24px mono "27 Sep" needs 82px. The figures painted over their
           neighbours — a crop showed "22 updates" with the next cell's 24px
           "5" printed on top of the "s". Two-up below `lg` gives every cell
           half the pane, which is 120px at the narrowest width this page is
           drawn at. */
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stats.map((s) => (
            <StatCell key={s.id} figure={s.figure} unit={s.unit} caption={s.caption} />
          ))}
        </div>
      )}

      {/* HOW MANY OF THE LAST FEW FINISHED belongs to the four cells above:
          it is data, one line. The caveats that sat under it (what the slot
          bookkeeping cannot tell) are method, and the 25 Sep rulings take
          every such line off the tab. */}
      {record.total > 0 ? (
        <p className="m-0 text-[13px] text-secondary-foreground">
          {fmtInt(record.recentSettled)} of the last {fmtInt(record.recent)} finished.
          {record.scheduledServed
            ? ` ${fmtInt(record.scheduledServed.scheduled)} served a scheduled slot, ${fmtInt(record.scheduledServed.byHand)} were run by hand.`
            : ''}
        </p>
      ) : null}

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
        ) : readings.months.length > 0 ? (
          // THE MONTHS AND THEIR UPDATES, AND NOTHING UNDER THEM (25 Sep
          // rulings): the count is the label's ("4 so far"), and the two
          // lines that followed (what the quarter view needs; which months
          // were read at setup) were method. Which months are under the floor
          // is the coverage row's (copy de-clutter C103).
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
      </LabelRow>

    </RecordSection>
  )
}
