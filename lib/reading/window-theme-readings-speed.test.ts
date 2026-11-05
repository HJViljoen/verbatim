import { readdirSync, readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

import { RPC_WINDOW_THEME_READINGS } from './types'

// 20261112090000 re-states `window_theme_readings` so that a quarter on Sealand
// stops taking 15-23 s against the API's 8 s cap. The change is in HOW the
// function counts, never in what: the runtime proof is on the throwaway cluster
// (scripts/pg-shim/window-theme-speed-checks.sql, old EXCEPT ALL new both ways
// plus hand-counted rows) and in the migration's header (production, read-only).
// These are the textual pins: the signature, the grants, and the one shape that
// made it slow must not come back.

const DIR = 'supabase/migrations/'
const FIX = '20261112090000_window_theme_readings_speed.sql'
const M3 = '20260918092000_reading_windows.sql'
const MONTH = '20260915092000_monthly_reading.sql'

const read = (f: string) => readFileSync(DIR + f, 'utf8')

/** The text of one function's definition, from `create or replace function public.<name>(` to its closing `$$;`. */
function definition(sql: string, name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}(`)
  if (start < 0) throw new Error(`no definition of ${name}`)
  const end = sql.indexOf('$$;', start)
  return sql.slice(start, end + 3)
}

/** One CTE of a body, `name as [materialized] ( … ),`, with SQL comments dropped and whitespace folded. */
function cte(body: string, name: string): string {
  const m = body.match(new RegExp(`\\n  ${name} as (materialized )?\\(([\\s\\S]*?)\\n  \\),`))
  if (!m) throw new Error(`no CTE ${name}`)
  return m[2].replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim()
}

const fix = definition(read(FIX), RPC_WINDOW_THEME_READINGS)
const shipped = definition(read(M3), RPC_WINDOW_THEME_READINGS)

describe('window_theme_readings, 20261112090000', () => {
  it('is the newest definition of the function, so it is the one a fresh apply leaves', () => {
    const defining = readdirSync(DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .filter((f) => read(f).includes(`create or replace function public.${RPC_WINDOW_THEME_READINGS}(`))
    expect(defining.at(-1)).toBe(FIX)
  })

  it('keeps the shipped signature, return type and attributes, byte for byte', () => {
    const head = (d: string) => d.slice(0, d.indexOf('as $$'))
    expect(head(fix)).toBe(head(shipped))
    expect(head(fix)).toContain('security definer')
    expect(head(fix)).toContain('set search_path = public, pg_temp')
  })

  it('restates the comment, the revoke and the grant as M3 left them', () => {
    const sig = `public.${RPC_WINDOW_THEME_READINGS}(uuid, uuid, timestamptz, timestamptz)`
    const sql = read(FIX)
    expect(sql).toContain(`revoke all on function ${sig} from public, anon, authenticated;`)
    expect(sql).toContain(`grant execute on function ${sig} to service_role;`)
    const comment = (s: string) => s.slice(s.indexOf(`comment on function ${sig} is`), s.indexOf(`revoke all on function ${sig}`))
    expect(comment(sql)).toBe(comment(read(M3)))
  })

  it('counts the undated citations exactly as the month function does', () => {
    const month = definition(read(MONTH), 'monthly_theme_readings')
    expect(cte(fix, 'undated_per_video')).toBe(cte(month, 'undated_per_video'))
  })

  it('never drives the undated pass from the window pairs back onto cited_all (the 15-23 s shape)', () => {
    expect(fix).not.toMatch(/\n  cited_videos as \(/)
    expect(cte(fix, 'undated_per_video')).not.toMatch(/join cited_all/)
    expect(cte(fix, 'undated_per_video')).toMatch(/^select .* from cited_all ca join vid_all v .* where ca\.comment_date is null group by 1, 2$/)
  })

  it('materialises the three inner sides the planner may re-read per outer row, and only those', () => {
    const materialised = [...fix.matchAll(/\n  (\w+) as materialized \(/g)].map((m) => m[1]).sort()
    expect(materialised).toEqual(['dated_ever', 'denom', 'undated_per_video'])
  })
})
