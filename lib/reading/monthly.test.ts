import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import {
  denominatorKey,
  freezeBoundary,
  freezeFor,
  freezeStateFor,
  isMissingMonthlyReading,
  mergeMonthRows,
  monthEndInstant,
  monthStartOf,
  monthWindow,
  monthsBetween,
  monthsToRefresh,
  nextMonth,
  completeWeeksBefore,
  dayInWindow,
  isoWeekLabel,
  isoWeekOf,
  weekCrossesAMonth,
  trailingCompleteMonths,
  themeReadingKey,
  windowOf,
  monthRowKey,
  toStoredFreeze,
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
  MONTH_DENOMINATOR_TABLE,
  MONTH_SUBJECT_TABLE,
  MONTH_TABLES,
  MONTH_THEME_TABLE,
} from './types'
import { subjectMonthSide } from '../subjects/read'
import { JUDGE_VERSION } from '../subjects/types'

// The freeze rule's pure half. The numbers themselves come out of two SQL
// functions no test here can reach, so the last block reads the migration and
// fails when the two stop agreeing.

const CLIENT_MONTHS = ['2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01']

const stored = (over: Partial<StoredFreeze> & { key: string; month: string }): StoredFreeze => ({
  audience: 'industry-other',
  objectId: null,
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
    // the UTC one, because comment_date is bucketed in UTC on both sides.
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
      stored: [stored({ key: themeReadingKey(fresh[0]), month: '2026-08-01', objectId: 't1', status: 'frozen', frozen_at: '2026-10-01T00:00:00.000Z' })],
      keyOf: themeReadingKey,
      now,
      runId: RUN,
    })
    expect(result.writes).toEqual([])
    expect(result.keptFrozen).toBe(1)
    expect(result.stale).toEqual([])
  })

  it('stamps the run clustering key on every row it writes', () => {
    const fresh = [reading('2026-10-01', 'industry-other', 't1', 4)]
    const key = 'a=pass_a_v4.1;c=0.58;f=2;m=gpt-5.4;k=video_v1'
    const result = mergeMonthRows({
      months, fresh, stored: [], keyOf: themeReadingKey, now, runId: RUN, clusteringKey: key,
    })
    expect(result.writes[0]).toMatchObject({ run_id: RUN, clustering_key: key })
  })

  it('OMITS the column when the run recorded no key, rather than writing null', () => {
    // M2 is applied by hand, so a deploy can reach production before the column
    // does. An omitted key is an omitted column, which lands on a database
    // either way; `clustering_key: null` would be 42703 until the migration ran.
    const fresh = [reading('2026-10-01', 'industry-other', 't1', 4)]
    const result = mergeMonthRows({
      months, fresh, stored: [], keyOf: themeReadingKey, now, runId: RUN, clusteringKey: null,
    })
    expect('clustering_key' in result.writes[0]).toBe(false)
    const unset = mergeMonthRows({ months, fresh, stored: [], keyOf: themeReadingKey, now, runId: RUN })
    expect('clustering_key' in unset.writes[0]).toBe(false)
  })

  it('rewrites a filling row and freezes it when its line has passed', () => {
    const fresh = [reading('2026-08-01', 'industry-other', 't1', 97), reading('2026-10-01', 'industry-other', 't1', 4)]
    const result = mergeMonthRows({
      months,
      fresh,
      stored: [stored({ key: themeReadingKey(fresh[0]), month: '2026-08-01', objectId: 't1' })],
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
    const gone = stored({ key: '2026-10-01|industry-other|t-dropped', month: '2026-10-01', objectId: 't-dropped' })
    const frozenAndGone = stored({
      key: '2026-08-01|industry-other|t-old', month: '2026-08-01', objectId: 't-old',
      status: 'frozen', frozen_at: '2026-10-01T00:00:00.000Z',
    })
    const outsideWindow = stored({ key: '2026-05-01|industry-other|t-old', month: '2026-05-01', objectId: 't-old' })
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
      stored: [stored({ key: '2026-08-01|client|t1', month: '2026-08-01', audience: 'client', objectId: 't1', status: 'frozen' })],
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
      stored({ key: '2026-08-01|industry-other|t1', month: '2026-08-01', objectId: 't1' }),
      stored({ key: '2026-09-01|industry-other|t2', month: '2026-09-01', objectId: 't2' }),
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
    const gone = stored({ key: '2026-08-01|industry-other|t-dropped', month: '2026-08-01', objectId: 't-dropped' })
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

describe('isMissingMonthlyReading — surviving a deploy that lands before its migration', () => {
  it('knows the four shapes the missing objects arrive in', () => {
    expect(isMissingMonthlyReading({
      code: 'PGRST202',
      message: `Could not find the function public.${RPC_DENOMINATORS}(p_client, p_from, p_to) in the schema cache`,
    })).toBe(true)
    expect(isMissingMonthlyReading({
      code: 'PGRST205',
      message: `Could not find the table 'public.${TABLE_DENOMINATORS}' in the schema cache`,
    })).toBe(true)
    expect(isMissingMonthlyReading({ code: '42883', message: `function public.${RPC_THEME_READINGS} does not exist` })).toBe(true)
    expect(isMissingMonthlyReading({ code: '42P01', message: `relation "public.${TABLE_THEME_READINGS}" does not exist` })).toBe(true)
  })

  it('still knows it once selectAll has flattened the code away', () => {
    // selectAll wraps a PostgREST error in a plain Error, so by the time the
    // step sees it the sentence is all that is left.
    expect(isMissingMonthlyReading(
      new Error(`selectAll: Could not find the table 'public.${TABLE_THEME_READINGS}' in the schema cache`),
    )).toBe(true)
    expect(isMissingMonthlyReading(
      new Error(`selectAll: Could not find the function public.${RPC_THEME_READINGS} in the schema cache`),
    )).toBe(true)
  })

  it('swallows nothing else', () => {
    expect(isMissingMonthlyReading(new Error(`${TABLE_DENOMINATORS} upsert: duplicate key value violates unique constraint`))).toBe(false)
    expect(isMissingMonthlyReading({ code: '42P01', message: 'relation "public.themes" does not exist' })).toBe(false)
    expect(isMissingMonthlyReading({ code: '57014', message: 'canceling statement due to statement timeout' })).toBe(false)
    expect(isMissingMonthlyReading(new Error('fetch failed'))).toBe(false)
    expect(isMissingMonthlyReading(null)).toBe(false)
    expect(isMissingMonthlyReading('PGRST202')).toBe(false)
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

  it('puts "a frozen row is never rewritten" in the database, on both tables', () => {
    // The merge keeps it, but two writers exist and nothing stopped a third.
    // UPDATE only: a delete guard would block the cascade from clients and
    // theme_registry and make a tenant undeletable.
    expect(sql).toContain('create or replace function public.month_reading_frozen_guard()')
    for (const table of [TABLE_DENOMINATORS, TABLE_THEME_READINGS]) {
      expect(sql).toContain(`drop trigger if exists ${table}_frozen_guard on public.${table};`)
      expect(sql).toMatch(new RegExp(
        `create trigger ${table}_frozen_guard\\n\\s+before update on public\\.${table}\\n` +
        `\\s+for each row when \\(old\\.status = 'frozen'\\)`,
      ))
    }
    expect(sql).not.toMatch(/before delete on public\.month_/)
  })

  it('matches a rival name as a substring, never as a LIKE pattern', () => {
    // competitor_names is free text a tenant types in Settings. Under LIKE, a
    // name holding _ or % is a wildcard, and it would inflate dual_mention into
    // rows that freeze.
    expect(sql).toContain('where position(r.name in regexp_replace(')
    expect(sql).not.toMatch(/like '%' \|\| r\.name/)
  })

  it('writes the diacritic fold as escapes, never as the combining marks themselves', () => {
    // The class used to be two invisible marks in the source, one of which
    // combined with the preceding bracket on screen. This file is applied by
    // hand through the Supabase MCP: a copy, a paste or an editor normalising
    // those bytes would change what 'Össur' folds to and therefore what
    // dual_mention counts, with nothing raising an error. Both forms are built
    // from code points here so this test cannot itself carry the bytes.
    const BACKSLASH = String.fromCharCode(92)
    const escaped = `[${BACKSLASH}u0300-${BACKSLASH}u036f]`
    expect(sql.split(escaped).length - 1).toBe(2)
    for (const mark of [0x300, 0x36f]) expect(sql.includes(String.fromCharCode(mark))).toBe(false)
  })

  it('dates undated citations per month, and counts the on-camera exclusion independent of the window', () => {
    // Both were properties of the CALL: the pipeline reads Aug–Sep and the seed
    // reads the whole history, so the same frozen column meant two different
    // things depending on who wrote the row first (7 vs 3 on Össur's top theme).
    expect(sql).toContain('left join undated   u  on u.theme_id  = b.theme_id and u.month = b.month and u.audience = b.audience')
    const datedEver = sql.slice(sql.indexOf('dated_ever as ('), sql.indexOf('oncam_in as ('))
    expect(datedEver).toContain('c.comment_date is not null')
    expect(datedEver).not.toContain('p_from')
    expect(datedEver).not.toContain('p_to')
    expect(sql).toContain('where not exists (select 1 from dated_ever d where d.video_uuid = o.video_uuid)')
    // And the attribution INTO months stays window-scoped, or the function
    // would return months the caller never asked for.
    const denom = sql.slice(sql.indexOf('  denom as ('), sql.indexOf('  dated_ever as ('))
    expect(denom).toContain('c.comment_date >= p_from and c.comment_date < p_to')
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

// The calendar the anomaly check reads: complete weeks, and the complete months
// behind them (WP4). Every boundary here is UTC.

describe('trailing complete months', () => {
  it('excludes the month the instant falls in — it is still filling', () => {
    expect(trailingCompleteMonths('2026-09-07T00:00:00.000Z', 3)).toEqual(['2026-06-01', '2026-07-01', '2026-08-01'])
  })

  it('steps back a month for a week that starts before its month has ended', () => {
    // ISO week 36 begins 31 August: August has not ended, so the baseline is May–July.
    expect(trailingCompleteMonths('2026-08-31T00:00:00.000Z', 3)).toEqual(['2026-05-01', '2026-06-01', '2026-07-01'])
  })

  it('counts a month that ended on the very instant asked about', () => {
    expect(trailingCompleteMonths('2026-09-01T00:00:00.000Z', 1)).toEqual(['2026-08-01'])
  })

  it('crosses a year boundary', () => {
    expect(trailingCompleteMonths('2026-02-10T00:00:00.000Z', 3)).toEqual(['2025-11-01', '2025-12-01', '2026-01-01'])
  })
})

describe('ISO weeks', () => {
  it('reads the week a date falls in', () => {
    expect(isoWeekOf('2026-06-29')).toEqual({ year: 2026, week: 27 })
    expect(isoWeekOf('2026-07-05')).toEqual({ year: 2026, week: 27 })
    expect(isoWeekOf('2026-09-07')).toEqual({ year: 2026, week: 37 })
    expect(isoWeekOf('2026-09-13')).toEqual({ year: 2026, week: 37 })
    // 1 January 2026 is a Thursday, so it belongs to week 1 of 2026…
    expect(isoWeekOf('2026-01-01')).toEqual({ year: 2026, week: 1 })
    // …and the Monday of that week is still December 2025.
    expect(isoWeekOf('2025-12-29')).toEqual({ year: 2026, week: 1 })
  })

  it('labels a week the way the replay prints it', () => {
    expect(isoWeekLabel({ year: 2026, week: 7 })).toBe('2026-W07')
    expect(isoWeekLabel({ year: 2026, week: 37 })).toBe('2026-W37')
  })

  it('gives the eleven complete weeks behind 15 September 2026 as W27–W37', () => {
    const weeks = completeWeeksBefore('2026-09-15T09:00:00.000Z', 11)
    expect(weeks).toHaveLength(11)
    expect(weeks.map((w) => w.label)).toEqual([
      '2026-W27', '2026-W28', '2026-W29', '2026-W30', '2026-W31', '2026-W32',
      '2026-W33', '2026-W34', '2026-W35', '2026-W36', '2026-W37',
    ])
    expect(weeks[0].from).toBe('2026-06-29T00:00:00.000Z')
    expect(weeks.at(-1)?.from).toBe('2026-09-07T00:00:00.000Z')
    expect(weeks.at(-1)?.to).toBe('2026-09-14T00:00:00.000Z')
  })

  it('never includes the week the clock is standing in', () => {
    // A Monday: the week that began this morning is not complete.
    const weeks = completeWeeksBefore('2026-09-14T00:00:00.000Z', 1)
    expect(weeks[0].label).toBe('2026-W37')
    expect(new Date(weeks[0].to).getTime()).toBeLessThanOrEqual(new Date('2026-09-14T00:00:00.000Z').getTime())
  })

  it('hands each week to the reading as a half-open window of exactly seven days', () => {
    for (const w of completeWeeksBefore('2026-09-15T00:00:00.000Z', 11)) {
      expect(new Date(w.to).getTime() - new Date(w.from).getTime()).toBe(7 * 86_400_000)
    }
  })
})

describe('weekCrossesAMonth — the weeks a month-grouped reading cannot answer', () => {
  const weeks = completeWeeksBefore('2026-09-15T09:00:00.000Z', 11)
  const week = (label: string) => weeks.find((w) => w.label === label)!

  it('reads a week inside one month', () => {
    // W35: Monday 24 August to Sunday 30 August, all of it in August.
    expect(week('2026-W35').from).toBe('2026-08-24T00:00:00.000Z')
    expect(weekCrossesAMonth(week('2026-W35'))).toBe(false)
  })

  it('refuses a week that spans two months', () => {
    // W36: Monday 31 August to Sunday 6 September — two rows out of a monthly
    // reading, and a video with comments on both sides counted twice.
    expect(week('2026-W36').from).toBe('2026-08-31T00:00:00.000Z')
    expect(weekCrossesAMonth(week('2026-W36'))).toBe(true)
    // The other two in the replayed range, named in the report.
    expect(weekCrossesAMonth(week('2026-W27'))).toBe(true)   // 29 Jun – 5 Jul
    expect(weekCrossesAMonth(week('2026-W31'))).toBe(true)   // 27 Jul – 2 Aug
    for (const label of ['2026-W28', '2026-W29', '2026-W30', '2026-W32', '2026-W33', '2026-W34', '2026-W37']) {
      expect(weekCrossesAMonth(week(label))).toBe(false)
    }
  })

  it('does not count a week that ENDS on a month boundary as crossing it', () => {
    // `to` is exclusive: this week's last instant is 31 August, not 1 September.
    expect(weekCrossesAMonth({ from: '2026-08-25T00:00:00.000Z', to: '2026-09-01T00:00:00.000Z' })).toBe(false)
    expect(weekCrossesAMonth({ from: '2026-08-25T00:00:00.000Z', to: '2026-09-01T00:00:00.001Z' })).toBe(true)
  })

  it('refuses a value that is not a date rather than guessing', () => {
    expect(() => weekCrossesAMonth({ from: '2026-08-24T00:00:00.000Z', to: 'never' })).toThrow(/not a date/)
  })
})

describe('dayInWindow — a comment date against a half-open window', () => {
  const august = { from: '2026-08-01T00:00:00.000Z', to: '2026-09-01T00:00:00.000Z' }

  it('includes the first day and excludes the last bound', () => {
    expect(dayInWindow('2026-08-01', august)).toBe(true)
    expect(dayInWindow('2026-08-31', august)).toBe(true)
    expect(dayInWindow('2026-09-01', august)).toBe(false)
    expect(dayInWindow('2026-07-31', august)).toBe(false)
  })

  it('reads the day off a full timestamp, in UTC', () => {
    expect(dayInWindow('2026-08-31T23:59:59.999Z', august)).toBe(true)
    expect(dayInWindow('2026-09-01T00:00:00.000Z', august)).toBe(false)
  })

  it('compares instants, not text — the same bound spelled two ways agrees', () => {
    // '2026-09-07T00:00:00Z' < '2026-09-07T00:00:00.000Z' as strings, which is
    // how a lexicographic test drops a day at the edge of a window.
    const terse = { from: '2026-09-07T00:00:00Z', to: '2026-09-14T00:00:00Z' }
    const full = { from: '2026-09-07T00:00:00.000Z', to: '2026-09-14T00:00:00.000Z' }
    for (const day of ['2026-09-06', '2026-09-07', '2026-09-13', '2026-09-14']) {
      expect(dayInWindow(day, terse)).toBe(dayInWindow(day, full))
    }
    expect(dayInWindow('2026-09-07', terse)).toBe(true)
    expect(dayInWindow('2026-09-14', terse)).toBe(false)
  })

  it('refuses a value that is not a date rather than dropping the row in silence', () => {
    expect(() => dayInWindow('not a date', august)).toThrow(/not a date/)
    expect(() => dayInWindow('2026-08-02', { from: 'whenever', to: august.to })).toThrow(/not a window/)
  })
})

describe('mergeMonthRows — a closed audience-month takes no fresh key', () => {
  const now = '2026-10-02T06:00:00.000Z'
  const RUN = 'd346b0f7-5b2b-4b46-a60c-db0c83ecfda7'
  const months = ['2026-08-01']
  const AUG = '2026-08-01|industry-other'

  const reading = (theme_id: string, videos: number): ThemeReading => ({
    month: '2026-08-01', audience: 'industry-other', theme_id, videos, comments: videos * 2,
    platform_mix: { tiktok: videos }, excluded_on_camera: 0, excluded_undated: 0,
  })

  // The state mergeMonthRows' own empty-reading path produces: a registry
  // failure holds August's filling theme rows while the denominators — which do
  // not depend on the clustering — are written and frozen. The next visit
  // re-clusters and mints a key August never held.
  const held = stored({ key: '2026-08-01|industry-other|t-held', month: '2026-08-01', objectId: 't-held' })

  it('refuses the newly minted key and still writes the row it can', () => {
    const result = mergeMonthRows({
      months,
      fresh: [reading('t-held', 97), reading('t-fresh', 12)],
      stored: [held],
      keyOf: themeReadingKey,
      now,
      runId: RUN,
      closedAudienceMonths: [AUG],
    })
    // Without this the database refuses the batch IN WHOLE — the legitimate
    // update of t-held never lands either, on every run, for ever.
    expect(result.writes.map((w) => w.theme_id)).toEqual(['t-held'])
    expect(result.refusedLate).toEqual([{ month: '2026-08-01', audience: 'industry-other', key: '2026-08-01|industry-other|t-fresh' }])
  })

  it('allows the first back-read of a table that holds nothing of that month (decision K)', () => {
    const result = mergeMonthRows({
      months,
      fresh: [reading('t-fresh', 12), reading('t-other', 4)],
      stored: [],
      keyOf: themeReadingKey,
      now,
      runId: RUN,
      closedAudienceMonths: [AUG],
    })
    expect(result.writes).toHaveLength(2)
    expect(result.refusedLate).toEqual([])
  })

  it('leaves an audience-month that is still filling alone', () => {
    const result = mergeMonthRows({
      months,
      fresh: [reading('t-fresh', 12)],
      stored: [held],
      keyOf: themeReadingKey,
      now,
      runId: RUN,
      closedAudienceMonths: [],
    })
    expect(result.writes).toHaveLength(1)
    expect(result.refusedLate).toEqual([])
  })

  it('judges the audience-month, not the month: a rival closed elsewhere is unaffected', () => {
    const fresh = { ...reading('t-fresh', 12), audience: 'competitor:Topo' }
    const result = mergeMonthRows({
      months, fresh: [fresh], stored: [held], keyOf: themeReadingKey, now, runId: RUN,
      closedAudienceMonths: [AUG],
    })
    expect(result.writes).toHaveLength(1)
  })

  it('refuses nothing when the caller names no closed months', () => {
    const result = mergeMonthRows({
      months, fresh: [reading('t-fresh', 12)], stored: [held], keyOf: themeReadingKey, now, runId: RUN,
    })
    expect(result.writes).toHaveLength(1)
    expect(result.refusedLate).toEqual([])
  })
})

// ---- The sibling tables (WP4) -------------------------------------------------
// M4 adds a third month table and the plan adds more after it. What makes that
// safe is that the freeze contract is now a DESCRIPTOR rather than a copied
// block of code: one key builder, one stored read, one merge, one stale sweep,
// one delete. These pin the descriptor's own behaviour, which is the part a
// fourth table will lean on without reading.

describe('monthRowKey', () => {
  it('is the audience-month for a denominator, which is about no object at all', () => {
    expect(monthRowKey(MONTH_DENOMINATOR_TABLE, { month: '2026-08-14', audience: 'client' }))
      .toBe('2026-08-01|client')
  })

  it('appends the object column named by the descriptor, whichever it is', () => {
    expect(monthRowKey(MONTH_THEME_TABLE, { month: '2026-08-01', audience: 'client', theme_id: 't1' }))
      .toBe('2026-08-01|client|t1')
    expect(monthRowKey(MONTH_SUBJECT_TABLE, { month: '2026-08-01', audience: 'client', subject_id: 's1' }))
      .toBe('2026-08-01|client|s1')
  })

  it('agrees with the key builders the theme side already used', () => {
    const row = { month: '2026-08-01', audience: 'competitor:Topo Designs', theme_id: 't1' }
    expect(monthRowKey(MONTH_THEME_TABLE, row)).toBe(themeReadingKey(row))
    expect(monthRowKey(MONTH_DENOMINATOR_TABLE, row)).toBe(denominatorKey(row))
  })

  it('stays unambiguous only because an object id is a uuid — so the descriptor’s columns are uuids', () => {
    // The key is `month|audience|object`, and `audience` is FREE TEXT: a
    // competitor's name exactly as somebody typed it in Settings, pipe
    // characters and all. Two audience-months could fold into one key only if
    // an object id could also carry a pipe, which is why every object column
    // in every month table is a uuid and not a label. That is an invariant of
    // the schema, so it is checked against the schema.
    const collides = monthRowKey(MONTH_SUBJECT_TABLE, { month: '2026-08-01', audience: 'rival:a|b', subject_id: 's' })
      === monthRowKey(MONTH_SUBJECT_TABLE, { month: '2026-08-01', audience: 'rival:a', subject_id: 'b|s' })
    expect(collides).toBe(true)
    const schema = [
      ['supabase/migrations/20260915092000_monthly_reading.sql', 'theme_id           uuid not null'],
      ['supabase/migrations/20260918093000_subjects.sql', 'subject_id         uuid not null'],
    ] as const
    for (const [file, declaration] of schema) expect(readFileSync(file, 'utf8')).toContain(declaration)
  })
})

describe('toStoredFreeze over a descriptor', () => {
  const row = { month: '2026-08-14', audience: 'client', status: 'frozen' as const, origin: 'back_read' as const, frozen_at: 'T' }

  it('reads the object id out of whichever column the table uses', () => {
    expect(toStoredFreeze(MONTH_SUBJECT_TABLE, [{ ...row, subject_id: 's1' }])[0])
      .toEqual({ key: '2026-08-01|client|s1', month: '2026-08-01', audience: 'client', objectId: 's1', status: 'frozen', origin: 'back_read', frozen_at: 'T' })
  })

  it('leaves a denominator row with no object, because it is about none', () => {
    expect(toStoredFreeze(MONTH_DENOMINATOR_TABLE, [row])[0].objectId).toBeNull()
  })

  it('normalises the month, so a row read mid-month keys the same as one read on the first', () => {
    expect(toStoredFreeze(MONTH_THEME_TABLE, [{ ...row, theme_id: 't' }])[0].month).toBe('2026-08-01')
  })
})

describe('MONTH_TABLES', () => {
  it('holds every month table, so fillingMonths cannot forget one', () => {
    // The silent, permanent bug this list exists to prevent: a month whose
    // theme rows froze while its subject rows are still `filling` leaves
    // fillingMonths, leaves monthsToRefresh, and is never visited again.
    expect(MONTH_TABLES.map((t) => t.table)).toEqual([
      'month_denominators', 'month_theme_readings', 'month_subject_readings',
    ])
  })

  it('names exactly one denominator', () => {
    expect(MONTH_TABLES.filter((t) => t.objectColumn === null)).toHaveLength(1)
  })

  it('spells every onConflict as the table’s real primary key', () => {
    for (const t of MONTH_TABLES) {
      const expected = ['client_id', 'month', 'audience', t.objectColumn].filter(Boolean).join(',')
      expect(t.onConflict).toBe(expected)
    }
  })
})

describe('the subject side of a freeze visit', () => {
  it('stamps the judge version, not a clustering key', () => {
    // A subject reading is a judgement artefact. Stamping it with a clustering
    // fingerprint would make two months of one subject look incomparable
    // whenever the themes were re-clustered, which has nothing to do with it.
    const side = subjectMonthSide({} as never, 'client-1', 'judge_vX')
    expect(side.clustering).toBe(false)
    expect(side.stamp).toEqual({ judge_version: 'judge_vX' })
    expect(side.table).toBe(MONTH_SUBJECT_TABLE)
  })

  it('defaults to the shipped judge version', () => {
    expect(subjectMonthSide({} as never, 'client-1').stamp).toEqual({ judge_version: JUDGE_VERSION })
  })
})

describe('the subject month migration matches the module', () => {
  const sql = readFileSync('supabase/migrations/20260918093000_subjects.sql', 'utf8')

  it('names the table and the two functions this module calls', () => {
    expect(sql).toContain('create table if not exists public.month_subject_readings')
    expect(sql).toContain('create or replace function public.monthly_subject_readings')
    expect(sql).toContain('create or replace function public.window_subject_readings')
    expect(sql).toContain('create or replace function public.subject_band')
  })

  it('carries BOTH guards, reusing the generic functions rather than copying them', () => {
    expect(sql).toContain('before update on public.month_subject_readings')
    expect(sql).toContain('before insert on public.month_subject_readings')
    expect(sql).toContain('execute function public.month_reading_frozen_guard()')
    expect(sql).toContain('execute function public.month_reading_frozen_insert_guard()')
  })

  it('carries the freeze columns the merge writes, and judge_version beside run_id', () => {
    for (const c of ['status', 'origin', 'read_at', 'run_id', 'frozen_at', 'judge_version', 'excluded_on_camera', 'excluded_undated']) {
      expect(sql).toContain(c)
    }
  })

  it('keeps the reads service-role only — the client_id is a parameter', () => {
    expect(sql).toContain('revoke all on function public.monthly_subject_readings(uuid, timestamptz, timestamptz) from public, anon, authenticated')
    expect(sql).toContain('grant execute on function public.window_subject_readings(uuid, timestamptz, timestamptz) to service_role')
  })

  it('withholds the columns that decide what a measurement means from a member', () => {
    // A rename mints a new subject; an edit in place would re-decide membership
    // under an unchanged judge_version.
    expect(sql).toContain('grant update (status, superseded_by, updated_at) on public.subjects to authenticated')
    expect(sql).not.toContain('grant update (name')
  })
})
