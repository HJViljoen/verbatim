import { describe, expect, it } from 'vitest'

import { parseScriptArgs } from '../ops/market-first-args'
import { ARGS_SPEC, REHEARSAL_FLAG, rehearsalAllowsUnreadMonth } from '../../scripts/comparability-checks'

// comparability-checks' staging rehearsal flag (WP2.3). Staging's newest update
// is the 20 Sep run and staging runs no pipeline, so September is never read
// past its end there and the apply's guard refuses every write. The flag waives
// that guard on staging only, so the first write and the second apply's skip
// can be rehearsed before production's Mon 5 Oct apply. On production it is
// refused outright, before any read, whichever of --project and the Supabase
// URL names production.

const STAGING = 'zfmxrrugaihxpubunleu'
const PRODUCTION = 'mkwjlckescdveosvrvaq'
const url = (ref: string) => `https://${ref}.supabase.co`
const parse = (...argv: string[]) => parseScriptArgs(argv, ARGS_SPEC)

describe('comparability-checks --rehearsal-allow-unread-month', () => {
  it('is refused outright on production, before any read', () => {
    const a = parse('--apply', '--project', PRODUCTION, '--confirm', `--${REHEARSAL_FLAG}`)
    expect(() => rehearsalAllowsUnreadMonth(a, url(PRODUCTION)))
      .toThrow(/REFUSED: --rehearsal-allow-unread-month is a staging rehearsal flag and is never taken on production \(--project mkwjlckescdveosvrvaq, Supabase URL host mkwjlckescdveosvrvaq\)\. Nothing read\./)
    // A read-only or --check run on production is refused the same way.
    expect(() => rehearsalAllowsUnreadMonth(parse('--project', PRODUCTION, '--confirm', `--${REHEARSAL_FLAG}`), url(PRODUCTION))).toThrow(/never taken on production/)
    expect(() => rehearsalAllowsUnreadMonth(parse('--apply', '--check', '--project', PRODUCTION, '--confirm', `--${REHEARSAL_FLAG}`), url(PRODUCTION))).toThrow(/never taken on production/)
  })

  it('is refused when either the project or the Supabase URL is not staging', () => {
    // A staging --project with production's env file loaded.
    expect(() => rehearsalAllowsUnreadMonth(parse('--apply', '--project', STAGING, `--${REHEARSAL_FLAG}`), url(PRODUCTION)))
      .toThrow(/never taken on production \(--project zfmxrrugaihxpubunleu, Supabase URL host mkwjlckescdveosvrvaq\)/)
    // A production --project with staging's env file loaded.
    expect(() => rehearsalAllowsUnreadMonth(parse('--apply', '--project', PRODUCTION, `--${REHEARSAL_FLAG}`), url(STAGING))).toThrow(/never taken on production/)
    // No Supabase URL, or one that is not a Supabase project.
    expect(() => rehearsalAllowsUnreadMonth(parse('--apply', '--project', STAGING, `--${REHEARSAL_FLAG}`), undefined)).toThrow(/Supabase URL host none/)
    expect(() => rehearsalAllowsUnreadMonth(parse('--apply', '--project', STAGING, `--${REHEARSAL_FLAG}`), 'http://localhost:54321')).toThrow(/Supabase URL host none/)
  })

  it('goes with --apply on staging, and waives nothing without the flag', () => {
    expect(rehearsalAllowsUnreadMonth(parse('--apply', '--project', STAGING, `--${REHEARSAL_FLAG}`), url(STAGING))).toBe(true)
    expect(rehearsalAllowsUnreadMonth(parse('--apply', '--check', '--project', STAGING, `--${REHEARSAL_FLAG}`), url(STAGING))).toBe(true)
    expect(() => rehearsalAllowsUnreadMonth(parse('--project', STAGING, `--${REHEARSAL_FLAG}`), url(STAGING))).toThrow(/goes with --apply/)
    expect(rehearsalAllowsUnreadMonth(parse('--apply', '--project', STAGING), url(STAGING))).toBe(false)
    expect(rehearsalAllowsUnreadMonth(parse('--apply', '--project', PRODUCTION, '--confirm'), url(PRODUCTION))).toBe(false)
  })

  it('is spelled exactly; a near miss is an unknown flag, never a silent waiver', () => {
    expect(() => parse('--apply', '--project', STAGING, '--rehearsal-allow-unread')).toThrow(/unknown flag --rehearsal-allow-unread/)
    expect(() => parse('--apply', '--project', STAGING, '--rehearsal-allow-unread-month', 'yes')).toThrow(/unexpected argument yes/)
  })
})
