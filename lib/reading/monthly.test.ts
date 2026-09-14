import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import {
  denominatorKey,
  freezeBoundary,
  freezeFor,
  freezeStateFor,
  mergeMonthRows,
  monthEndInstant,
  monthStartOf,
  monthWindow,
  monthsBetween,
  monthsToRefresh,
  nextMonth,
  themeReadingKey,
  windowOf,
} from './monthly'
import {
  FREEZE_AFTER_DAYS,
  MONTH_ORIGINS,
  MONTH_STATUSES,
  RPC_DENOMINATORS,
  RPC_THEME_READINGS,
  TABLE_DENOMINATORS,
  TABLE_THEME_READINGS,
  type StoredFreeze,
  type ThemeReading,
} from './types'

// The freeze rule's pure half. The numbers themselves come out of two SQL
// functions no test here can reach, so the last block reads the migration and
// fails when the two stop agreeing.

const CLIENT_MONTHS = ['2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01']

const stored = (over: Partial<StoredFreeze> & { key: string; month: string }): StoredFreeze => ({
  audience: 'industry-other',
  theme_id: null,
  status: 'filling',
  origin: 'live',
  frozen_at: null,
  ...over,
})

describe('months are UTC months', () => {
  it('takes the first of the month an instant falls in', () => {
    expect(monthStartOf('2026-09-14T22:13:00.000Z')).toBe('2026-09-01')
    expect(monthStartOf('2026-01-31T23:59:59.999Z')).toBe('2026-01-01')
    expect(monthStartOf('2026-09-01')).toBe('2026-09-01')
  })

  it('never reads an instant in the server\'s local zone', () => {
    // 2026-03-01T00:30Z is 2026-02-28 in every zone west of UTC. The month is
    // the UTC one, because comment_date is written UTC-midnight date-only.
    expect(monthStartOf('2026-03-01T00:30:00.000Z')).toBe('2026-03-01')
  })

  it('rolls the year', () => {
    expect(nextMonth('2026-12-01')).toBe('2027-01-01')
    expect(monthEndInstant('2026-12-01')).toBe('2027-01-01T00:00:00.000Z')
    expect(monthWindow('2026-02-01')).toEqual({
      from: '2026-02-01T00:00:00.000Z',
      to: '2026-03-01T00:00:00.000Z',
    })
  })

  it('refuses a value that is not a date rather than inventing a month', () => {
    expect(() => monthStartOf('not a date')).toThrow(/not a date/)
    expect(() => monthsBetween('2026-01-01', 'whenever')).toThrow(/not a date/)
  })
})

describe('freezeStateFor — the 30-day line', () => {
  it('freezes exactly 30 days after the month ends, not a millisecond before', () => {
    expect(freezeBoundary('2026-08-01')).toBe('2026-10-01T00:00:00.000Z')
    expect(freezeStateFor('2026-08-01', '2026-09-30T23:59:59.999Z')).toBe('filling')
    expect(freezeStateFor('2026-08-01', '2026-10-01T00:00:00.000Z')).toBe('frozen')
    expect(freezeStateFor('2026-08-01', '2026-10-01T00:00:00.001Z')).toBe('frozen')
  })

  it('leaves the current month open', () => {
    expect(freezeStateFor('2026-09-01', '2026-09-14T22:00:00.000Z')).toBe('filling')
  })

  it('puts July 2026 on the frozen side on the day the seed runs', () => {
    // The plan's done-when says "Jun 2026 and earlier frozen back_read; Aug and
    // Sep filling" and skips July. The rule places July with June: its line
    // (2026-08-01 + 30 d = 2026-08-31) passed a fortnight before the seed.
    expect(freezeStateFor('2026-07-01', '2026-09-15T00:00:00.000Z')).toBe('frozen')
    expect(freezeStateFor('2026-06-01', '2026-09-15T00:00:00.000Z')).toBe('frozen')
    expect(freezeStateFor('2026-08-01', '2026-09-15T00:00:00.000Z')).toBe('filling')
    expect(freezeStateFor('2026-09-01', '2026-09-15T00:00:00.000Z')).toBe('filling')
  })

  it('uses the constant the table comments quote', () => {
    expect(FREEZE_AFTER_DAYS).toBe(30)
  })
})

describe('monthsBetween / windowOf', () => {
  it('enumerates the half-open window', () => {
    expect(monthsBetween('2026-06-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')).toEqual(CLIENT_MONTHS)
  })

  it('includes the month a partial end falls in', () => {
    expect(monthsBetween('2026-08-01T00:00:00.000Z', '2026-09-14T22:00:00.000Z')).toEqual([
      '2026-08-01', '2026-09-01',
    ])
  })

  it('is empty when the window ends where it starts', () => {
    expect(monthsBetween('2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z')).toEqual([])
    expect(monthsBetween('2026-09-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z')).toEqual([])
  })

  it('covers a whole set of months in one window, so a back-read is one call', () => {
    expect(windowOf(['2026-09-01', '2020-10-01', '2026-06-01'])).toEqual({
      from: '2020-10-01T00:00:00.000Z',
      to: '2026-10-01T00:00:00.000Z',
    })
    expect(windowOf([])).toBeNull()
  })
})

describe('monthsToRefresh — what a live run has to read', () => {
  it('reads the months that are still open, and only those', () => {
    expect(monthsToRefresh('2026-09-14T22:00:00.000Z', [])).toEqual(['2026-08-01', '2026-09-01'])
  })

  it('drops a month the moment its line passes', () => {
    expect(monthsToRefresh('2026-10-01T06:00:00.000Z', [])).toEqual(['2026-09-01', '2026-10-01'])
  })

  it('still visits a stored filling row whose line has passed — that visit freezes it', () => {
    expect(monthsToRefresh('2026-10-01T06:00:00.000Z', ['2026-08-01'])).toEqual([
      '2026-08-01', '2026-09-01', '2026-10-01',
    ])
  })

  it('does not go looking for history nobody took', () => {
    // Nothing stored, a year on: only the two open months, never 2020.
    expect(monthsToRefresh('2027-01-05T00:00:00.000Z', [])).toEqual(['2026-12-01', '2027-01-01'])
  })

  it('normalises a stored month to its first day', () => {
    expect(monthsToRefresh('2026-09-14T22:00:00.000Z', ['2026-03-17'])).toEqual([
      '2026-03-01', '2026-08-01', '2026-09-01',
    ])
  })
})

describe('freezeFor — origin is decided once and never revisited', () => {
  const now = '2026-09-15T02:00:00.000Z'

  it('a month first written while filling is live', () => {
    expect(freezeFor('2026-09-01', now, undefined)).toEqual({
      status: 'filling', origin: 'live', frozen_at: null,
    })
  })

  it('a month first written after its line had passed is back_read, frozen at once', () => {
    expect(freezeFor('2026-06-01', now, undefined)).toEqual({
      status: 'frozen', origin: 'back_read', frozen_at: now,
    })
  })

  it('a live row that has now closed freezes, and stays live', () => {
    expect(freezeFor('2026-07-01', now, { origin: 'live', frozen_at: null })).toEqual({
      status: 'frozen', origin: 'live', frozen_at: now,
    })
  })

  it('keeps the moment a row FIRST froze', () => {
    expect(freezeFor('2026-06-01', now, { origin: 'back_read', frozen_at: '2026-08-01T00:00:00.000Z' })).toEqual({
      status: 'frozen', origin: 'back_read', frozen_at: '2026-08-01T00:00:00.000Z',
    })
  })
})

describe('mergeMonthRows — a frozen row is never rewritten', () => {
  const now = '2026-10-02T06:00:00.000Z'
  const RUN = 'd346b0f7-5b2b-4b46-a60c-db0c83ecfda7'
  const months = ['2026-08-01', '2026-09-01', '2026-10-01']

  const reading = (month: string, audience: string, theme_id: string, videos: number): ThemeReading => ({
    month, audience, theme_id, videos, comments: videos * 2,
    platform_mix: { tiktok: videos }, excluded_on_camera: 0, excluded_undated: 0,
  })

  it('skips a stored frozen row and counts it, however different the fresh number is', () => {
    const fresh = [reading('2026-08-01', 'industry-other', 't1', 999)]
    const result = mergeMonthRows({
      months,
      fresh,
      stored: [stored({ key: themeReadingKey(fresh[0]), month: '2026-08-01', theme_id: 't1', status: 'frozen', frozen_at: '2026-10-01T00:00:00.000Z' })],
      keyOf: themeReadingKey,
      now,
      runId: RUN,
    })
    expect(result.writes).toEqual([])
    expect(result.keptFrozen).toBe(1)
    expect(result.stale).toEqual([])
  })

  it('rewrites a filling row and freezes it when its line has passed', () => {
    const fresh = [reading('2026-08-01', 'industry-other', 't1', 97), reading('2026-10-01', 'industry-other', 't1', 4)]
    const result = mergeMonthRows({
      months,
      fresh,
      stored: [stored({ key: themeReadingKey(fresh[0]), month: '2026-08-01', theme_id: 't1' })],
      keyOf: themeReadingKey,
      now,
      runId: RUN,
    })
    expect(result.writes).toHaveLength(2)
    expect(result.writes[0]).toMatchObject({
      month: '2026-08-01', theme_id: 't1', videos: 97, status: 'frozen', origin: 'live',
      frozen_at: now, read_at: now, run_id: RUN,
    })
    expect(result.writes[1]).toMatchObject({ month: '2026-10-01', status: 'filling', origin: 'live', frozen_at: null })
    expect(result.keptFrozen).toBe(0)
  })

  it('carries the platform mix through untouched', () => {
    const fresh = [reading('2026-10-01', 'competitor:Topo Designs', 't9', 3)]
    fresh[0].platform_mix = { tiktok: 2, reddit: 1 }
    const result = mergeMonthRows({ months, fresh, stored: [], keyOf: themeReadingKey, now, runId: RUN })
    expect(result.writes[0].platform_mix).toEqual({ tiktok: 2, reddit: 1 })
    expect(result.writes[0].audience).toBe('competitor:Topo Designs')
  })

  it('names the filling rows the current clustering no longer produces', () => {
    const gone = stored({ key: '2026-10-01|industry-other|t-dropped', month: '2026-10-01', theme_id: 't-dropped' })
    const frozenAndGone = stored({
      key: '2026-08-01|industry-other|t-old', month: '2026-08-01', theme_id: 't-old',
      status: 'frozen', frozen_at: '2026-10-01T00:00:00.000Z',
    })
    const outsideWindow = stored({ key: '2026-05-01|industry-other|t-old', month: '2026-05-01', theme_id: 't-old' })
    const result = mergeMonthRows({
      months,
      fresh: [reading('2026-10-01', 'industry-other', 't1', 4)],
      stored: [gone, frozenAndGone, outsideWindow],
      keyOf: themeReadingKey,
      now,
      runId: RUN,
    })
    // Only the filling row inside the window that the reading no longer has.
    expect(result.stale.map((s) => s.key)).toEqual([gone.key])
    expect(result.keptFrozen).toBe(0)
  })

  it('normalises a month to its first day before comparing or writing', () => {
    const fresh = [{ ...reading('2026-08-15', 'client', 't1', 2), month: '2026-08-15' }]
    const result = mergeMonthRows({
      months, fresh,
      stored: [stored({ key: '2026-08-01|client|t1', month: '2026-08-01', audience: 'client', theme_id: 't1', status: 'frozen' })],
      keyOf: themeReadingKey, now, runId: RUN,
    })
    expect(result.writes).toEqual([])
    expect(result.keptFrozen).toBe(1)
  })

  it('keys a denominator on month and audience alone', () => {
    expect(denominatorKey({ month: '2026-08-31T00:00:00.000Z', audience: 'client' })).toBe('2026-08-01|client')
    expect(themeReadingKey({ month: '2026-08-01', audience: 'client', theme_id: 't1' })).toBe('2026-08-01|client|t1')
  })

  it('drops a fresh month nobody asked for — the gap in a non-contiguous ask', () => {
    // months = [Mar, Aug, Sep] comes back from one call over Mar..Oct, so the
    // reading carries April to July too. Those arrive with no stored row read
    // for them; writing one would overwrite a frozen April as if it were new.
    const gappy = ['2026-03-01', '2026-09-01', '2026-10-01']
    const result = mergeMonthRows({
      months: gappy,
      fresh: [
        reading('2026-03-01', 'industry-other', 't1', 3),
        reading('2026-04-01', 'industry-other', 't1', 4),
        reading('2026-07-01', 'industry-other', 't1', 7),
        reading('2026-09-01', 'industry-other', 't1', 9),
      ],
      stored: [],
      keyOf: themeReadingKey,
      now,
      runId: RUN,
    })
    expect(result.writes.map((w) => w.month)).toEqual(['2026-03-01', '2026-09-01'])
  })

  it('holds every filling row when the reading comes back empty — that is no reading, not an empty clustering', () => {
    // The live shape: persist-themes writes theme_observations only inside its
    // registry block, which is env-flagged and swallows its own failure, so a
    // run can reach here having written none. Deleting on that answer erases
    // the months for good — no filling row means no later visit, and the Pass A
    // prune makes the clustering unrecomputable.
    const held = [
      stored({ key: '2026-08-01|industry-other|t1', month: '2026-08-01', theme_id: 't1' }),
      stored({ key: '2026-09-01|industry-other|t2', month: '2026-09-01', theme_id: 't2' }),
    ]
    const result = mergeMonthRows({
      months, fresh: [] as ThemeReading[], stored: held, keyOf: themeReadingKey, now, runId: RUN,
    })
    expect(result.writes).toEqual([])
    expect(result.stale).toEqual([])
    expect(result.emptyReading).toBe(true)
    expect(result.heldStale).toBe(2)
  })

  it('still drops a row the clustering dropped when the rest of the reading arrived', () => {
    const gone = stored({ key: '2026-08-01|industry-other|t-dropped', month: '2026-08-01', theme_id: 't-dropped' })
    const result = mergeMonthRows({
      months,
      fresh: [reading('2026-09-01', 'industry-other', 't1', 5)],
      stored: [gone],
      keyOf: themeReadingKey,
      now,
      runId: RUN,
    })
    expect(result.emptyReading).toBe(false)
    expect(result.heldStale).toBe(0)
    expect(result.stale.map((s) => s.key)).toEqual([gone.key])
  })

  it('holds nothing when there was nothing stored to hold', () => {
    const result = mergeMonthRows({
      months, fresh: [] as ThemeReading[], stored: [], keyOf: themeReadingKey, now, runId: RUN,
    })
    expect(result.emptyReading).toBe(true)
    expect(result.heldStale).toBe(0)
    expect(result.stale).toEqual([])
  })

  it('writes a seed with no run as run_id null rather than inventing one', () => {
    const result = mergeMonthRows({
      months, fresh: [reading('2026-09-01', 'client', 't1', 1)], stored: [],
      keyOf: themeReadingKey, now, runId: null,
    })
    expect(result.writes[0].run_id).toBeNull()
  })
})

describe('the migration and this module say the same thing', () => {
  const sql = readFileSync('supabase/migrations/20260915092000_monthly_reading.sql', 'utf8')

  it('names the same tables and functions', () => {
    expect(sql).toContain(`create table if not exists public.${TABLE_DENOMINATORS} (`)
    expect(sql).toContain(`create table if not exists public.${TABLE_THEME_READINGS} (`)
    expect(sql).toContain(`create or replace function public.${RPC_DENOMINATORS}(`)
    expect(sql).toContain(`create or replace function public.${RPC_THEME_READINGS}(`)
  })

  it('carries the same status and origin vocabularies, twice each', () => {
    const statuses = sql.match(/status\s+text not null check \(status in \(([^)]*)\)\)/g) ?? []
    const origins = sql.match(/origin\s+text not null check \(origin in \(([^)]*)\)\)/g) ?? []
    expect(statuses).toHaveLength(2)
    expect(origins).toHaveLength(2)
    for (const clause of statuses) {
      for (const s of MONTH_STATUSES) expect(clause).toContain(`'${s}'`)
      expect(clause.match(/'/g)).toHaveLength(MONTH_STATUSES.length * 2)
    }
    for (const clause of origins) {
      for (const o of MONTH_ORIGINS) expect(clause).toContain(`'${o}'`)
      expect(clause.match(/'/g)).toHaveLength(MONTH_ORIGINS.length * 2)
    }
  })

  it('buckets months in UTC in both functions, never in the session zone', () => {
    const trunc = sql.match(/date_trunc\('month', [a-z_]+\.comment_date at time zone 'UTC'\)::date/g) ?? []
    expect(trunc.length).toBeGreaterThanOrEqual(3)  // one in the denominator, two in the theme read
    // No unqualified date_trunc on a timestamptz anywhere.
    expect(sql).not.toMatch(/date_trunc\('month', [a-z_]+\.comment_date\)/)
  })

  it('derives the audience with the same precedence as entityOf: client, then rival, then the category', () => {
    const cases = sql.match(
      /case when v\.is_client\s+then 'client'\s+when v\.is_competitor then 'competitor:' \|\| coalesce\(v\.competitor_name, 'unknown'\)\s+else 'industry-other'/g,
    ) ?? []
    expect(cases).toHaveLength(2)
  })

  it('reads the base insight table, never the _current view — an id set must resolve a superseded row', () => {
    expect(sql).toContain('join public.audience_insights ai on ai.id = m.insight_id')
    expect(sql).not.toMatch(/(?:from|join) public\.audience_insights_current/)
  })

  it('grants both functions to the service role and to nobody else', () => {
    for (const fn of [
      `${RPC_DENOMINATORS}(uuid, timestamptz, timestamptz)`,
      `${RPC_THEME_READINGS}(uuid, uuid, timestamptz, timestamptz)`,
    ]) {
      expect(sql).toContain(`revoke all on function public.${fn} from public, anon, authenticated;`)
      expect(sql).toContain(`grant execute on function public.${fn} to service_role;`)
    }
  })

  it('leaves both tables read-only for a tenant and writable by the service role alone', () => {
    for (const table of [TABLE_DENOMINATORS, TABLE_THEME_READINGS]) {
      expect(sql).toMatch(new RegExp(`alter table public\\.${table}\\s+enable row level security`))
      expect(sql).toMatch(new RegExp(`create policy "[^"]+" on public\\.${table}\\n\\s+for select to authenticated using \\(client_id = public\\.get_my_client_id\\(\\)\\)`))
      expect(sql).toMatch(new RegExp(`grant select on public\\.${table}\\s+to authenticated;`))
      expect(sql).toMatch(new RegExp(`grant select, insert, update, delete on public\\.${table}\\s+to service_role;`))
    }
  })

  it('keeps every column this module writes', () => {
    const columns = ['month', 'audience', 'videos', 'comments', 'platform_mix', 'status', 'origin', 'read_at', 'run_id', 'frozen_at']
    for (const c of [...columns, 'dual_mention', 'excluded_undated']) {
      expect(sql.slice(sql.indexOf(`create table if not exists public.${TABLE_DENOMINATORS}`), sql.indexOf(`create table if not exists public.${TABLE_THEME_READINGS}`))).toContain(c)
    }
    const themeBlock = sql.slice(sql.indexOf(`create table if not exists public.${TABLE_THEME_READINGS}`))
    for (const c of [...columns, 'theme_id', 'excluded_on_camera', 'excluded_undated']) {
      expect(themeBlock).toContain(c)
    }
  })
})
