import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, it, expect } from 'vitest'

import {
  CLIENT_AUDIENCE,
  INDUSTRY_AUDIENCE,
  RIVAL_PREFIX,
  UNKNOWN_RIVAL,
  audienceOf,
  findRival,
  isMissingCompetitors,
  isRivalAudience,
  planRivals,
  renameFrom,
  renameRival,
  retireRival,
  renameLabel,
  rivalKey,
  rivalNameOf,
  rivalSlug,
  stitchRenames,
  type Competitor,
  type RenameRecord,
} from './rivals'

describe('rivalKey — the audience key, built in one place', () => {
  it('keeps the name exactly as configured, spaces and capitals included', () => {
    // month_denominators.audience stores this string verbatim and it is in the
    // primary key, so anything that "tidies" it here splits a frozen series.
    expect(rivalKey('Topo Designs')).toBe('competitor:Topo Designs')
    expect(rivalKey('Össur')).toBe('competitor:Össur')
    expect(rivalKey('Cotopaxi')).toBe('competitor:Cotopaxi')
  })

  it('trims, because a trailing space in a Settings field is not a second rival', () => {
    expect(rivalKey('  Freitag  ')).toBe('competitor:Freitag')
  })

  it('names the missing name rather than printing null into a key', () => {
    // A video flagged as a rival's with no name means the tagger disagreed with
    // itself. scripts/regate-corpus.ts used to write `competitor:null` here.
    expect(rivalKey(null)).toBe(`${RIVAL_PREFIX}${UNKNOWN_RIVAL}`)
    expect(rivalKey(undefined)).toBe('competitor:unknown')
    expect(rivalKey('   ')).toBe('competitor:unknown')
  })
})

describe('rivalNameOf / isRivalAudience — reading a stored key back', () => {
  it('round-trips every name, including one with a colon in it', () => {
    for (const name of ['Topo Designs', 'Össur', 'Patagonia, Inc.', 'A:B']) {
      expect(rivalNameOf(rivalKey(name))).toBe(name)
      expect(isRivalAudience(rivalKey(name))).toBe(true)
    }
  })

  it('says no to the two audiences that are not rivals, and to a bare prefix', () => {
    for (const a of [CLIENT_AUDIENCE, INDUSTRY_AUDIENCE, 'competitor:', '', null, undefined]) {
      expect(isRivalAudience(a)).toBe(false)
      expect(rivalNameOf(a)).toBeNull()
    }
  })
})

describe('audienceOf — the three-way precedence, folded from nine copies', () => {
  it('reads client, then rival, then the category', () => {
    expect(audienceOf({ is_client: true, is_competitor: false, competitor_name: null })).toBe('client')
    expect(audienceOf({ is_client: false, is_competitor: true, competitor_name: 'Patagonia' })).toBe('competitor:Patagonia')
    expect(audienceOf({ is_client: false, is_competitor: false, competitor_name: null })).toBe('industry-other')
  })

  it('puts a dual-tagged video under the client, never under the rival', () => {
    // lib/gather/tagging.ts files a brand+competitor mention under the client;
    // the bucket rule has to agree or the same video is counted twice.
    expect(audienceOf({ is_client: true, is_competitor: true, competitor_name: 'Ottobock' })).toBe('client')
  })

  it('treats absent fields as the category, not as a crash', () => {
    expect(audienceOf({})).toBe('industry-other')
    expect(audienceOf({ is_client: null, is_competitor: null })).toBe('industry-other')
  })

  it('never emits the tagging inspector’s old "industry" label', () => {
    // scripts/run-tagging.ts emitted 'industry' where everything else emitted
    // 'industry-other' — an eighth copy that disagreed with the other seven.
    expect(audienceOf({ is_client: false, is_competitor: false })).not.toBe('industry')
  })
})

describe('the fold has one implementation', () => {
  const roots = ['lib', 'app', 'components', 'scripts', 'inngest']
  const files: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry)
      if (statSync(path).isDirectory()) walk(path)
      else if (/\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path)) files.push(path)
    }
  }
  for (const root of roots) walk(new URL(`../${root}`, import.meta.url).pathname)

  it('leaves no second copy of the precedence rule anywhere in the repo', () => {
    // Nine copies existed when this file was written and two of them disagreed.
    // A tenth is how the next disagreement arrives, so it fails here instead.
    const rule = /is_client[\s\S]{0,120}`competitor:\$\{/
    const offenders = files.filter((f) => !f.endsWith('lib/rivals.ts') && rule.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })

  it('and the two SQL copies still build the same three keys, prefix and all', () => {
    // Deliberate duplication: the monthly reading runs in the database and a
    // function boundary there would be a per-row call on a corpus scan. They
    // are allowed to exist and not allowed to drift.
    //
    // What this checks is the SHAPE — the same precedence, the same prefix, the
    // same two constants — and not the edges. The copies do not btrim and read
    // an empty string as a name, where rivalKey trims and folds a blank to
    // 'unknown' (see rivalKey's comment). Production has 0 padded and 0 blank
    // competitor_name values, the copies are in a migration already applied,
    // and M3 rewrites those two bodies; asserting agreement at the edges here
    // would be asserting something untrue.
    const sql = readFileSync(new URL('../supabase/migrations/20260915092000_monthly_reading.sql', import.meta.url), 'utf8')
    const copies = [...sql.matchAll(/when v\.is_client\s+then 'client'[\s\S]{0,240}?else '([a-z-]+)'/g)]
    expect(copies.length).toBe(2)
    for (const copy of copies) {
      expect(copy[0]).toContain(`'${RIVAL_PREFIX}' || coalesce(v.competitor_name, '${UNKNOWN_RIVAL}')`)
      expect(copy[0]).toContain(`then '${CLIENT_AUDIENCE}'`)
      expect(copy[1]).toBe(INDUSTRY_AUDIENCE)
    }
  })
})

describe('rivalSlug — the stable key a spelling folds to', () => {
  it('folds accents, case and spacing the way the research measured', () => {
    expect(rivalSlug('Össur')).toBe('ossur')
    expect(rivalSlug('Ossur')).toBe('ossur')
    expect(rivalSlug('Topo Designs')).toBe('topo-designs')
    expect(rivalSlug('topo  designs')).toBe('topo-designs')
    expect(rivalSlug('  Ottobock GmbH  ')).toBe('ottobock-gmbh')
    expect(rivalSlug('Café Déjà')).toBe('cafe-deja')
  })

  it('collapses the spellings a free-text field actually produces to one key', () => {
    const spellings = ['Cotopaxi', 'cotopaxi', 'COTOPAXI', ' Cotopaxi ']
    expect(new Set(spellings.map(rivalSlug)).size).toBe(1)
  })

  it('has no slug for a name with nothing to key on', () => {
    expect(rivalSlug('!!!')).toBe('')
    expect(rivalSlug('')).toBe('')
    expect(rivalSlug(null)).toBe('')
  })

  it('still keys a name written in another script, because slug is not null', () => {
    // competitors.slug is `not null`: no slug means no row, and no row means no
    // identity at all -- no "tracked since", no rename, nothing decision I
    // bought. The hex of the UTF-8 bytes is the one fold a database and a
    // browser agree on byte for byte.
    const bytes = (n: string) => `x-${[...new TextEncoder().encode(n)].map((b) => b.toString(16).padStart(2, '0')).join('')}`
    for (const name of ['\u30c6\u30b9\u30c8', '\u0428\u0435\u0440\u0435\u0433', '\u0634\u0631\u0643\u0629']) {
      expect(rivalSlug(name)).toBe(bytes(name.toLowerCase()))
      expect(rivalSlug(name)).not.toBe('')
    }
    // Case and padding still fold to one key, which is what the live unique
    // index is for.
    expect(rivalSlug('  \u0428\u0415\u0420\u0415\u0413  ')).toBe(rivalSlug('\u0448\u0435\u0440\u0435\u0433'))
    // One ASCII letter is enough to take the ordinary path.
    expect(rivalSlug('\u30c6\u30b9\u30c8 X')).toBe('x')
  })

  it('matches public.rival_slug, which decomposes and strips BEFORE lowercasing', () => {
    // On a C-locale cluster lower('Ö') is 'Ö', so lowercasing first throws the
    // letter away as punctuation: 'Össur' came back 'ssur'. Both twins fold in
    // the same order so the answer never depends on a collation.
    const sql = readFileSync(new URL('../supabase/migrations/20260918090000_competitors.sql', import.meta.url), 'utf8')
    const decl = sql.slice(sql.indexOf('create or replace function public.rival_slug'), sql.indexOf('comment on function public.rival_slug'))
    const body = decl.slice(decl.indexOf('with folded as ('))
    // lower() wraps the already-stripped text; the wrong order reads
    // normalize(lower(...)) and is what produced 'ssur'.
    expect(body).not.toContain('normalize(lower(')
    expect(body).toMatch(/lower\(\s*regexp_replace\([\s\S]*?normalize\(/)
    expect(body).toContain("chr(768)")
    expect(body).toContain("chr(879)")
    // And the same fallback, reached by the same guard: a name with no ASCII
    // gets the hex of its UTF-8 bytes, a name with no letter at all gets NULL.
    expect(body).toContain("octet_length(b.base) > char_length(b.base)")
    expect(body).toContain("'x-' || encode(convert_to(b.base, 'UTF8'), 'hex')")
  })

  it('is not entitySlug, which is an Inngest step-id segment and may not change', () => {
    // lib/gather/owned.ts entitySlug does not strip diacritics: 'Össur' is
    // '-ssur' there, and renaming a step id strands an in-flight run.
    const owned = readFileSync(new URL('./gather/owned.ts', import.meta.url), 'utf8')
    expect(owned).toContain("const slug = entity.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')")
  })
})

describe('findRival — a stored name finds its identity', () => {
  const rivals: Competitor[] = [
    { id: 'a', client_id: 'c', name: 'Topo Designs', slug: 'topo-designs', first_seen_at: null, retired_at: '2026-09-09T16:10:00Z', superseded_by: null, created_by: null, created_at: '' },
    { id: 'b', client_id: 'c', name: 'Cotopaxi', slug: 'cotopaxi', first_seen_at: null, retired_at: null, superseded_by: null, created_by: null, created_at: '' },
    { id: 'c', client_id: 'c', name: 'Topo', slug: 'topo', first_seen_at: null, retired_at: null, superseded_by: null, created_by: null, created_at: '' },
  ]

  it('takes a name or a whole audience key', () => {
    expect(findRival(rivals, 'Cotopaxi')?.id).toBe('b')
    expect(findRival(rivals, 'competitor:Cotopaxi')?.id).toBe('b')
  })

  it('survives a capitalisation or an accent', () => {
    expect(findRival(rivals, 'competitor:cotopaxi')?.id).toBe('b')
    expect(findRival(rivals, 'COTOPAXI')?.id).toBe('b')
  })

  it('finds a retired rival, because a frozen month still has to be rendered', () => {
    expect(findRival(rivals, 'competitor:Topo Designs')?.id).toBe('a')
  })

  it('returns nothing for the two non-rival audiences and for an unknown name', () => {
    expect(findRival(rivals, 'industry-other')).toBeNull()
    expect(findRival(rivals, 'competitor:Poler')).toBeNull()
    expect(findRival(rivals, '')).toBeNull()
  })
})

describe('planRivals — every tracked name keeps an identity', () => {
  // The invariant the table is worth having for. The backfill makes it true
  // once; a Settings save that adds a rival is where it would start decaying —
  // a name with no row has no "tracked since", resolves back from a frozen
  // month to nothing, and cannot be renamed at all (rename_rival needs an id).
  const row = (over: Partial<Competitor>): Competitor => ({
    id: 'x', client_id: 'c', name: 'X', slug: 'x', first_seen_at: null,
    retired_at: null, superseded_by: null, created_by: null, created_at: '', ...over,
  })
  const live = [row({ id: 'b', name: 'Cotopaxi', slug: 'cotopaxi' })]

  it('creates only the names that have no row', () => {
    const plan = planRivals(live, ['Cotopaxi', 'Rareform'])
    expect(plan.create).toEqual([{ name: 'Rareform', slug: 'rareform' }])
    expect(plan.revive).toEqual([])
  })

  it('matches on the slug, so a re-typed capitalisation is not a second rival', () => {
    expect(planRivals(live, ['cotopaxi', 'COTOPAXI ']).create).toEqual([])
  })

  it('keeps one row per slug when a list names the same rival twice', () => {
    expect(planRivals([], ['Topo Designs', 'topo designs']).create)
      .toEqual([{ name: 'Topo Designs', slug: 'topo-designs' }])
  })

  it('revives the retired row rather than minting a second identity', () => {
    // Two rows on one slug would make findRival choose, and the frozen months
    // under that name belong to the rival that earned them.
    const retired = [
      row({ id: 'old', name: 'Patagonia', slug: 'patagonia', retired_at: '2026-09-09T16:10:00Z' }),
      row({ id: 'older', name: 'Patagonia', slug: 'patagonia', retired_at: '2026-06-01T00:00:00Z' }),
    ]
    const plan = planRivals(retired, ['Patagonia'])
    expect(plan.create).toEqual([])
    expect(plan.revive.map((r) => r.id)).toEqual(['old'])
  })

  it('leaves a retired row alone when the same slug is already live', () => {
    const both = [
      row({ id: 'old', name: 'Topo Designs', slug: 'topo-designs', retired_at: '2026-09-09T16:10:00Z' }),
      row({ id: 'now', name: 'Topo designs', slug: 'topo-designs' }),
    ]
    expect(planRivals(both, ['Topo designs'])).toEqual({ create: [], revive: [] })
  })

  it('never removes: a name dropped from the list is retireRival’s business', () => {
    expect(planRivals(live, [])).toEqual({ create: [], revive: [] })
  })

  it('skips a name that folds to no slug at all', () => {
    expect(planRivals([], ['   ', '!!!']).create).toEqual([])
  })
})

describe('renameFrom — reading a rename off the change log', () => {
  it('takes the pair off a rival_rename row, old first', () => {
    expect(renameFrom({ surface: 'rival_rename', affects_audiences: ['competitor:Topo Designs', 'competitor:Topo'], changed_at: '2026-11-12T08:00:00Z' }))
      .toEqual({ from: 'competitor:Topo Designs', to: 'competitor:Topo', at: '2026-11-12T08:00:00Z' })
  })

  it('ignores every other surface, and a row written before the column existed', () => {
    expect(renameFrom({ surface: 'rivals', affects_audiences: ['competitor:A', 'competitor:B'] })).toBeNull()
    expect(renameFrom({ surface: 'rival_rename', affects_audiences: null })).toBeNull()
    expect(renameFrom({ surface: 'rival_rename', affects_audiences: ['competitor:A'] })).toBeNull()
    expect(renameFrom({ surface: 'rival_rename', affects_audiences: ['competitor:A', 'competitor:A'] })).toBeNull()
  })
})

describe('stitchRenames — one line, with the change marked on it', () => {
  type P = { audience: string; month: string; videos: number }
  const rename = (from: string, to: string, at = '2026-08-01T00:00:00Z'): RenameRecord => ({ from, to, at })

  const split: P[] = [
    { audience: 'competitor:Topo Designs', month: '2026-05', videos: 4 },
    { audience: 'competitor:Topo Designs', month: '2026-06', videos: 5 },
    { audience: 'competitor:Topo', month: '2026-07', videos: 6 },
    { audience: 'competitor:Topo', month: '2026-08', videos: 7 },
  ]

  it('joins the two halves into one line under the newest name', () => {
    const [line] = stitchRenames(split, [rename('competitor:Topo Designs', 'competitor:Topo')])
    expect(line.audience).toBe('competitor:Topo')
    expect(line.names).toEqual(['competitor:Topo Designs', 'competitor:Topo'])
    expect(line.points.map((p) => p.month)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08'])
  })

  it('draws the rule where the months change key, not at the wall clock', () => {
    // changed_at can sit months from the conversation it moved; the break
    // belongs where the reader can see the line change name.
    const [line] = stitchRenames(split, [rename('competitor:Topo Designs', 'competitor:Topo', '2026-11-30T00:00:00Z')])
    expect(line.breaks).toEqual([{
      month: '2026-07',
      from: 'competitor:Topo Designs',
      to: 'competitor:Topo',
      at: '2026-11-30T00:00:00Z',
      label: 'Topo Designs is now called Topo',
    }])
  })

  it('follows a chain of renames to one line', () => {
    const points: P[] = [
      { audience: 'competitor:A', month: '2026-01', videos: 1 },
      { audience: 'competitor:B', month: '2026-02', videos: 2 },
      { audience: 'competitor:C', month: '2026-03', videos: 3 },
    ]
    const [line] = stitchRenames(points, [
      rename('competitor:A', 'competitor:B'),
      rename('competitor:B', 'competitor:C'),
    ])
    expect(line.audience).toBe('competitor:C')
    expect(line.names).toEqual(['competitor:A', 'competitor:B', 'competitor:C'])
    expect(line.breaks.map((b) => b.month)).toEqual(['2026-02', '2026-03'])
  })

  it('draws one line when two names are renamed into one', () => {
    // What a merge looks like in the log: A -> C and B -> C. Both halves belong
    // to C's line, and the legend has to name all three or it is a line whose
    // legend omits one of the names it draws.
    const points: P[] = [
      { audience: 'competitor:A', month: '2026-01', videos: 1 },
      { audience: 'competitor:B', month: '2026-02', videos: 2 },
      { audience: 'competitor:C', month: '2026-03', videos: 3 },
    ]
    const lines = stitchRenames(points, [
      rename('competitor:A', 'competitor:C'),
      rename('competitor:B', 'competitor:C'),
    ])
    expect(lines).toHaveLength(1)
    expect(lines[0].audience).toBe('competitor:C')
    expect(lines[0].names).toEqual(['competitor:A', 'competitor:B', 'competitor:C'])
    expect(lines[0].points).toHaveLength(3)
    expect(lines[0].breaks.map((b) => `${b.from}->${b.to}`))
      .toEqual(['competitor:A->competitor:C', 'competitor:B->competitor:C'])
  })

  it('terminates on a cycle, because a log is written by people', () => {
    const points: P[] = [{ audience: 'competitor:A', month: '2026-01', videos: 1 }]
    const lines = stitchRenames(points, [rename('competitor:A', 'competitor:B'), rename('competitor:B', 'competitor:A')])
    expect(lines).toHaveLength(1)
    expect(lines[0].points).toHaveLength(1)
  })

  it('keeps both halves of A -> B -> A on one line rather than swapping labels', () => {
    // No key in a cycle is un-renamed, so neither is the "current" name by the
    // shape alone; the newest rename's target is the best answer available and
    // the legend still names both. Walking forward from each key put the two
    // halves in different groups and had them swap labels.
    const points: P[] = [
      { audience: 'competitor:A', month: '2026-01', videos: 1 },
      { audience: 'competitor:B', month: '2026-02', videos: 2 },
      { audience: 'competitor:A', month: '2026-03', videos: 3 },
    ]
    const lines = stitchRenames(points, [
      rename('competitor:A', 'competitor:B', '2026-01-15T00:00:00Z'),
      rename('competitor:B', 'competitor:A', '2026-02-20T00:00:00Z'),
    ])
    expect(lines).toHaveLength(1)
    expect(lines[0].audience).toBe('competitor:A')
    expect(lines[0].names).toEqual(['competitor:B', 'competitor:A'])
    expect(lines[0].points.map((p) => p.month)).toEqual(['2026-01', '2026-02', '2026-03'])
    // One rule, the one that carries the line towards the name it is drawn
    // under: "B is now called A" on a line labelled B would be worse than none.
    expect(lines[0].breaks.map((b) => `${b.from}->${b.to}@${b.month}`))
      .toEqual(['competitor:B->competitor:A@2026-01'])
  })

  it('draws no rule when the new name has no months yet', () => {
    const points: P[] = [{ audience: 'competitor:Topo Designs', month: '2026-05', videos: 4 }]
    const [line] = stitchRenames(points, [rename('competitor:Topo Designs', 'competitor:Topo')])
    expect(line.audience).toBe('competitor:Topo')
    expect(line.breaks).toEqual([])
    expect(line.points).toHaveLength(1)
  })

  it('keeps both halves of the month a rename landed in', () => {
    const points: P[] = [
      { audience: 'competitor:Topo Designs', month: '2026-07', videos: 2 },
      { audience: 'competitor:Topo', month: '2026-07', videos: 3 },
    ]
    const [line] = stitchRenames(points, [rename('competitor:Topo Designs', 'competitor:Topo')])
    expect(line.points).toHaveLength(2)
    expect(line.breaks[0].month).toBe('2026-07')
  })

  it('passes everything else through untouched, one series each', () => {
    const points: P[] = [
      { audience: 'client', month: '2026-05', videos: 1 },
      { audience: 'industry-other', month: '2026-05', videos: 9 },
      { audience: 'competitor:Cotopaxi', month: '2026-05', videos: 3 },
    ]
    const lines = stitchRenames(points, [rename('competitor:Topo Designs', 'competitor:Topo')])
    expect(lines.map((l) => l.audience)).toEqual(['client', 'competitor:Cotopaxi', 'industry-other'])
    for (const line of lines) expect(line.breaks).toEqual([])
  })

  it('with no renames is a grouping and nothing more', () => {
    const lines = stitchRenames(split, [])
    expect(lines.map((l) => l.audience)).toEqual(['competitor:Topo', 'competitor:Topo Designs'])
  })
})

describe('renameLabel — the sentence over the rule', () => {
  it('names both, in the reader’s words, with no key in sight', () => {
    expect(renameLabel('competitor:Topo Designs', 'competitor:Topo')).toBe('Topo Designs is now called Topo')
    expect(renameLabel('competitor:Topo Designs', 'competitor:Topo')).not.toMatch(/competitor:/)
  })
})

describe('isMissingCompetitors — surviving a deploy that lands before M1', () => {
  it('recognises the table not being there yet', () => {
    expect(isMissingCompetitors({ code: 'PGRST205', message: "Could not find the table 'public.competitors' in the schema cache" })).toBe(true)
    expect(isMissingCompetitors({ code: '42P01', message: 'relation "public.competitors" does not exist' })).toBe(true)
  })

  it('does not swallow anything else', () => {
    expect(isMissingCompetitors(null)).toBe(false)
    expect(isMissingCompetitors({ code: '42P01', message: 'relation "public.subjects" does not exist' })).toBe(false)
    expect(isMissingCompetitors({ code: '23505', message: 'duplicate key value violates unique constraint on competitors' })).toBe(false)
  })
})

describe('renameRival / retireRival — the TypeScript half', () => {
  const actor = { kind: 'user' as const, user_id: 'u1', label: 'owner@sealand.test · settings', at: '2026-11-12T08:00:00Z', nonce: 'n1' }

  it('calls the function by the names the migration declares', () => {
    // A misspelled RPC argument is invisible until the day someone renames a
    // rival in production, so the two sides are compared here instead.
    const sql = readFileSync(new URL('../supabase/migrations/20260918090000_competitors.sql', import.meta.url), 'utf8')
    const decl = sql.slice(sql.indexOf('create or replace function public.rename_rival'))
    const declared = [...decl.slice(0, decl.indexOf(') returns jsonb')).matchAll(/^\s*(p_[a-z_]+)\s+/gm)].map((m) => m[1])
    const source = readFileSync(new URL('./rivals.ts', import.meta.url), 'utf8')
    const passed = [...source.slice(source.indexOf("rpc('rename_rival'")).matchAll(/^\s*(p_[a-z_]+):/gm)].map((m) => m[1])
    expect(declared).toEqual(['p_client_id', 'p_competitor_id', 'p_new_name', 'p_actor', 'p_affects_months', 'p_note'])
    expect(passed).toEqual(declared)
  })

  it('hands the whole rename to the one transaction and returns its counts', async () => {
    const calls: { fn: string; args: Record<string, unknown> }[] = []
    const client = {
      rpc: (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args })
        return Promise.resolve({
          data: { renamed: true, old_name: 'Topo Designs', new_name: 'Topo', videos: 98, theme_registry: 21, themes: 4, change_id: 'ch1' },
          error: null,
        })
      },
    } as never

    const result = await renameRival(
      { client, clientId: 'c1', actor, affectsMonths: '[2025-06-01,2026-10-01)' },
      'rival-1',
      'Topo',
    )
    expect(calls).toHaveLength(1)
    expect(calls[0].fn).toBe('rename_rival')
    expect(calls[0].args.p_affects_months).toBe('[2025-06-01,2026-10-01)')
    expect(result.videos).toBe(98)
    expect(result.theme_registry).toBe(21)
  })

  it('retires without deleting, and logs the audience the line ends under', async () => {
    const updates: Record<string, unknown>[] = []
    const logged: Record<string, unknown>[] = []
    const client = {
      from: (table: string) => ({
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'r1', name: 'Poler', retired_at: null }, error: null }) }) }) }),
        update: (payload: Record<string, unknown>) => {
          updates.push({ table, ...payload })
          return { eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }
        },
        insert: (rows: Record<string, unknown>[]) => {
          logged.push(...rows)
          return Promise.resolve({ error: null })
        },
      }),
    } as never

    const out = await retireRival({ client, clientId: 'c1', actor }, 'r1', new Date('2026-11-12T08:00:00Z'))
    expect(out).toEqual({ retired: true, name: 'Poler' })
    expect(updates).toEqual([{ table: 'competitors', retired_at: '2026-11-12T08:00:00.000Z' }])
    expect(logged).toHaveLength(1)
    expect(logged[0].surface).toBe('rivals')
    expect(logged[0].affects_audiences).toEqual(['competitor:Poler'])
    expect(String(logged[0].note)).toContain('Poler')
    // Calibrated: a client reads this line. No key, no jargon, no zero.
    expect(String(logged[0].note)).not.toMatch(/competitor:|bucket|audience key/)
  })

  it('retiring an already-retired rival writes nothing at all', async () => {
    const touched: string[] = []
    const client = {
      from: () => ({
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'r1', name: 'Poler', retired_at: '2026-09-09T16:10:00Z' }, error: null }) }) }) }),
        update: () => { touched.push('update'); return { eq: () => ({ eq: () => Promise.resolve({ error: null }) }) } },
        insert: () => { touched.push('insert'); return Promise.resolve({ error: null }) },
      }),
    } as never
    expect(await retireRival({ client, clientId: 'c1', actor }, 'r1')).toEqual({ retired: false, name: 'Poler' })
    expect(touched).toEqual([])
  })
})
