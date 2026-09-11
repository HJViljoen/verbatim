// When is a client's pipeline run expected? (WP2, 2026-09-11)
//
// This rule used to live only inside the Inngest dispatcher, which meant the
// only thing that knew when a run was due was the thing that runs it — so when
// the dispatcher went silent on 2026-09-06 nothing else could notice. The ops
// check outside Inngest needs the same answer, and this repo's recurring
// failure mode is two implementations of one rule, so the rule lives here and
// both import it.
//
// Every cadence is evaluated in Africa/Johannesburg so report_day matches the
// user's local week, and the daily cron fires at 06:00 SAST.

export const WEEKDAYS = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
] as const

export const DEFAULT_TZ = 'Africa/Johannesburg'
/** Local hour the dispatcher cron fires (TZ=Africa/Johannesburg 0 6 * * *). */
export const SLOT_HOUR = 6

/** The cadence columns of tracking_configs. Neither is constrained to an enum
 *  in the schema — 'paused' is a live value — so anything unrecognised simply
 *  never matches. */
export interface ScheduleConfig {
  report_period?: string | null
  report_day?: string | null
}

export interface LocalDate {
  /** Lower-case weekday name, as stored in tracking_configs.report_day. */
  weekday: string
  year: number
  /** 1-12. */
  month: number
  dayOfMonth: number
  hour: number
  minute: number
}

/** Milliseconds to add to a UTC instant to get the local wall clock in `tz`. */
function tzOffsetMs(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at)
  const num = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0')
  // hour is 00-23 with hour12:false, except that some ICU versions render
  // midnight as 24 — normalise so the arithmetic stays honest.
  const asIfUtc = Date.UTC(num('year'), num('month') - 1, num('day'), num('hour') % 24, num('minute'), num('second'))
  return asIfUtc - at.getTime()
}

/** The wall clock in `tz` at a given instant (default: now). */
export function localDate(now: Date = new Date(), tz: string = DEFAULT_TZ): LocalDate {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false, weekday: 'long',
    year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric',
  }).formatToParts(now)
  const value = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return {
    weekday: value('weekday').toLowerCase(),
    year: Number(value('year')),
    month: Number(value('month')),
    dayOfMonth: Number(value('day')),
    hour: Number(value('hour')) % 24,
    minute: Number(value('minute')),
  }
}

/** The UTC instant at which the wall clock in `tz` reads the given local time.
 *  Two passes because the offset that applies is the one at the *result*. */
function localToInstant(y: number, m: number, d: number, hour: number, tz: string): Date {
  const naive = Date.UTC(y, m - 1, d, hour, 0, 0)
  let ts = naive - tzOffsetMs(new Date(naive), tz)
  ts = naive - tzOffsetMs(new Date(ts), tz)
  return new Date(ts)
}

/** 06:00 local on the civil date `daysBack` days before `local`. */
function slotDaysBack(local: LocalDate, daysBack: number, tz: string): Date {
  const civil = new Date(Date.UTC(local.year, local.month - 1, local.dayOfMonth - daysBack))
  return localToInstant(civil.getUTCFullYear(), civil.getUTCMonth() + 1, civil.getUTCDate(), SLOT_HOUR, tz)
}

/**
 * The most recent 06:00 SAST, i.e. the last time the daily dispatcher cron was
 * supposed to fire at all — regardless of whether any client was due. The ops
 * check measures the dispatcher's heartbeat against this rather than against a
 * fixed age: a fixed 26 h threshold is exactly the slot-to-check gap, so
 * seconds of cron jitter decided whether a missed morning was reported.
 */
export function lastDailySlot(now: Date, tz: string = DEFAULT_TZ): Date {
  const local = localDate(now, tz)
  return slotDaysBack(local, local.hour < SLOT_HOUR ? 1 : 0, tz)
}

export function isWeeklyDue(cfg: ScheduleConfig, local: Pick<LocalDate, 'weekday'>): boolean {
  return cfg.report_period === 'weekly' && cfg.report_day === local.weekday
}

export function isMonthlyDue(cfg: ScheduleConfig, local: Pick<LocalDate, 'dayOfMonth'>): boolean {
  return cfg.report_period === 'monthly' && local.dayOfMonth === 1
}

/**
 * The most recent moment at which this client's run was expected to start, or
 * null when no cadence applies (paused, unset, or a report_day that is not a
 * weekday name). Weekly: the last `report_day` at 06:00 SAST. Monthly: the last
 * 1st of the month at 06:00 SAST. Always <= now.
 *
 * Nothing stores a "next expected run" anywhere, so a checker outside Inngest
 * has to compute it — this is that computation.
 */
export function lastExpectedSlot(cfg: ScheduleConfig, now: Date, tz: string = DEFAULT_TZ): Date | null {
  const local = localDate(now, tz)
  const beforeSlotToday = local.hour < SLOT_HOUR

  if (cfg.report_period === 'weekly') {
    const target = WEEKDAYS.indexOf((cfg.report_day ?? '') as (typeof WEEKDAYS)[number])
    const today = WEEKDAYS.indexOf(local.weekday as (typeof WEEKDAYS)[number])
    if (target < 0 || today < 0) return null
    let daysBack = (today - target + 7) % 7
    // On the report day itself, 06:00 may not have arrived yet — then the last
    // slot is a week ago, not this morning.
    if (daysBack === 0 && beforeSlotToday) daysBack = 7
    return slotDaysBack(local, daysBack, tz)
  }

  if (cfg.report_period === 'monthly') {
    let year = local.year
    let month = local.month
    // Before 06:00 on the 1st the month's slot is still ahead of us.
    if (local.dayOfMonth === 1 && beforeSlotToday) {
      month -= 1
      if (month === 0) { month = 12; year -= 1 }
    }
    return localToInstant(year, month, 1, SLOT_HOUR, tz)
  }

  return null
}
