import { describe, expect, it } from 'vitest'

import { SEALAND_CLIENT_ID } from '../config'
import { assertProject, modeLine, parseScriptArgs, projectRefOf } from './market-first-args'

const spec = { name: 'measure-comparability', values: ['out', 'at'], flags: ['verbose'], defaultClient: SEALAND_CLIENT_ID }

describe('the market-first script flags (plan §4.0)', () => {
  it('is read-only by default, and needs --project every time', () => {
    const a = parseScriptArgs(['--project', 'zfmxrrugaihxpubunleu'], spec)
    expect(a.apply).toBe(false)
    expect(a.clientId).toBe(SEALAND_CLIENT_ID)
    expect(() => parseScriptArgs([], spec)).toThrow(/--project <ref> is required/)
    expect(() => parseScriptArgs(['--apply'], spec)).toThrow(/--project <ref> is required/)
  })

  it('writes only with --apply --project <an allow-listed ref>', () => {
    expect(parseScriptArgs(['--apply', '--project', 'mkwjlckescdveosvrvaq'], spec).apply).toBe(true)
    expect(() => parseScriptArgs(['--apply', '--project', 'abcdefghijklmnopqrst'], spec)).toThrow(/not allow-listed/)
  })

  it('refuses --write, an unknown flag and a flag with no value, so a typo is never a dry run', () => {
    expect(() => parseScriptArgs(['--write', '--project', 'zfmxrrugaihxpubunleu'], spec)).toThrow(/--write is refused/)
    expect(() => parseScriptArgs(['--aply', '--project', 'zfmxrrugaihxpubunleu'], spec)).toThrow(/unknown flag --aply/)
    expect(() => parseScriptArgs(['--project', 'zfmxrrugaihxpubunleu', '--out'], spec)).toThrow(/--out needs a value/)
    expect(() => parseScriptArgs(['--project', 'zfmxrrugaihxpubunleu', '--client', 'sealand'], spec)).toThrow(/uuid/)
  })

  it('carries value and boolean flags', () => {
    const a = parseScriptArgs(['--project', 'zfmxrrugaihxpubunleu', '--out', '/tmp/x.json', '--verbose', '--read-only'], spec)
    expect(a.values).toEqual({ out: '/tmp/x.json' })
    expect([...a.flags]).toEqual(['verbose'])
  })

  it('refuses before any read when the Supabase URL is another project', () => {
    const a = parseScriptArgs(['--project', 'zfmxrrugaihxpubunleu'], spec)
    expect(() => assertProject(a, 'https://zfmxrrugaihxpubunleu.supabase.co', 'x')).not.toThrow()
    expect(() => assertProject(a, 'https://mkwjlckescdveosvrvaq.supabase.co', 'x')).toThrow(/REFUSED: the Supabase URL points at mkwjlckescdveosvrvaq/)
    expect(() => assertProject(a, undefined, 'x')).toThrow(/no Supabase project/)
    expect(projectRefOf('http://localhost:54321')).toBeNull()
  })

  it('says first whether it writes', () => {
    expect(modeLine(parseScriptArgs(['--project', 'zfmxrrugaihxpubunleu'], spec), 'm')).toMatch(/^m: read-only on staging zfmxrrugaihxpubunleu/)
    expect(modeLine(parseScriptArgs(['--apply', '--project', 'mkwjlckescdveosvrvaq'], spec), 'm')).toMatch(/^m: APPLY on production mkwjlckescdveosvrvaq/)
  })
})
