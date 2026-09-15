import { readFileSync } from 'node:fs'
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  ACTOR_KINDS,
  CONFIG_CHANGES_TABLE,
  CONFIG_SURFACES,
  WATCHED_CONFIG_COLUMNS,
  actorStamp,
  bucketsAfterRetag,
  changeLogBoundary,
  changeRow,
  diffConfigRows,
  isMissingConfigLog,
  pipelineActor,
  recordConfigChange,
  recordConfigChanges,
  reconstructedActor,
  retagChange,
  scriptActor,
  skipRetag,
  surfaceForColumn,
  updateWithActor,
  withActor,
  type ConfigActor,
} from './config-log'

// The configuration change log's pure half. The other half is a database
// trigger, which no test here can reach — so everything these tests pin has a
// mirror in supabase/migrations/20260915091000_config_changes.sql, and the two
// have to keep saying the same thing: the same column→surface mapping, the same
// vocabulary, and the same rule about what counts as a change.

const CLIENT = 'ac16988e-c4f3-4baf-b388-73895852a554'
const AT = new Date('2026-09-15T08:00:00.000Z')

const actor = (over: Partial<ConfigActor> = {}): ConfigActor => ({
  kind: 'script', user_id: null, label: 'test', at: AT.toISOString(), ...over,
})

afterEach(() => { vi.restoreAllMocks() })

describe('surfaceForColumn — the mapping the trigger also carries', () => {
  it('files all four keyword arrays under terms', () => {
    expect(surfaceForColumn('brand_keywords')).toBe('terms')
    expect(surfaceForColumn('competitor_keywords')).toBe('terms')
    expect(surfaceForColumn('industry_keywords')).toBe('terms')
    expect(surfaceForColumn('exclude_terms')).toBe('terms')
  })

  it('separates the rival NAMES from the terms they are searched by', () => {
    // competitor_names is the only column that produces videos.competitor_name;
    // competitor_keywords only decides what is searched for.
    expect(surfaceForColumn('competitor_names')).toBe('rivals')
    expect(surfaceForColumn('competitor_keywords')).toBe('terms')
  })

  it('maps the remaining watched columns', () => {
    expect(surfaceForColumn('own_handles')).toBe('handles')
    expect(surfaceForColumn('competitor_handles')).toBe('handles')
    expect(surfaceForColumn('platforms')).toBe('platforms')
    expect(surfaceForColumn('subreddits')).toBe('subreddits')
    expect(surfaceForColumn('report_period')).toBe('cadence')
    expect(surfaceForColumn('report_day')).toBe('cadence')
    expect(surfaceForColumn('max_videos')).toBe('knobs')
    expect(surfaceForColumn('max_comments')).toBe('knobs')
    expect(surfaceForColumn('comment_depth')).toBe('knobs')
  })

  it('gives every watched column a surface in the CHECK vocabulary', () => {
    for (const column of WATCHED_CONFIG_COLUMNS) {
      expect(CONFIG_SURFACES).toContain(surfaceForColumn(column))
    }
  })

  it('files an unknown column under other rather than inventing a surface', () => {
    expect(surfaceForColumn('report_emails')).toBe('other')
    expect(surfaceForColumn('nonsense')).toBe('other')
  })

  it('does not watch updated_at or last_actor — re-stamping is not a change', () => {
    expect(WATCHED_CONFIG_COLUMNS).not.toContain('updated_at' as never)
    expect(WATCHED_CONFIG_COLUMNS).not.toContain('last_actor' as never)
  })
})

describe('actorStamp — who the database cannot see', () => {
  it('names a tenant member as a user, by email', () => {
    expect(actorStamp({ userId: 'u1', email: 'owner@ossur.com', operator: null }, undefined, AT)).toMatchObject({
      kind: 'user', user_id: 'u1', label: 'owner@ossur.com', at: '2026-09-15T08:00:00.000Z',
    })
  })

  it('falls back to the user id when the claim carries no email', () => {
    expect(actorStamp({ userId: 'u1', operator: null }, undefined, AT).label).toBe('u1')
  })

  it('names a platform admin as an operator, at home or away', () => {
    const home = actorStamp({ userId: 'h', email: 'h@v.com', operator: { isHome: true } }, undefined, AT)
    const away = actorStamp({ userId: 'h', email: 'h@v.com', operator: { isHome: false } }, undefined, AT)
    expect(home.kind).toBe('operator')
    expect(away.kind).toBe('operator')
    // The switcher is precisely what the database cannot see: while viewing
    // another tenant the write goes out on the service-role client.
    expect(home.label).toBe('h@v.com')
    expect(away.label).toBe('h@v.com · operator view')
  })

  it('distinguishes two statements in one save, so neither stamp reads as stale', () => {
    const session = { userId: 'u1', email: 'owner@ossur.com', operator: null }
    const terms = actorStamp(session, 'search terms', AT)
    const exclusions = actorStamp(session, 'exclusions', AT)
    expect(terms.label).not.toBe(exclusions.label)
  })

  it('carries a nonce, so freshness never rests on the clock or on the detail', () => {
    // The trigger's freshness test is `NEW.last_actor is distinct from
    // OLD.last_actor`. Two saves by the same person in the same millisecond
    // with the same detail used to write the same jsonb, and the second one
    // was then logged as a bare role — `pipeline` on the admin-client writes.
    const session = { userId: 'u1', email: 'owner@ossur.com', operator: null }
    const a = actorStamp(session, 'search terms', AT)
    const b = actorStamp(session, 'search terms', AT)
    expect(a).not.toEqual(b)
    expect(a.nonce).toBeTruthy()
    expect(a.nonce).not.toBe(b.nonce)
    expect(scriptActor('scripts/set-cadence.ts --apply', AT).nonce)
      .not.toBe(scriptActor('scripts/set-cadence.ts --apply', AT).nonce)
    expect(pipelineActor('run-1', 'subreddit discovery', AT).nonce)
      .not.toBe(pipelineActor('run-1', 'subreddit discovery', AT).nonce)
  })

  it('stamps every actor kind inside the CHECK vocabulary', () => {
    const kinds = [
      actorStamp({ userId: 'u', operator: null }, undefined, AT).kind,
      actorStamp({ userId: 'u', operator: { isHome: true } }, undefined, AT).kind,
      scriptActor('scripts/set-cadence.ts --apply', AT).kind,
      pipelineActor('run-1', 'subreddit discovery', AT).kind,
      reconstructedActor('keyword_performance', AT).kind,
    ]
    for (const k of kinds) expect(ACTOR_KINDS).toContain(k)
  })

  it('carries the update on a pipeline stamp and on nothing else', () => {
    expect(pipelineActor('run-1', 'subreddit discovery', AT).run_id).toBe('run-1')
    expect(scriptActor('x', AT).run_id).toBeUndefined()
    expect(actorStamp({ userId: 'u', operator: null }, undefined, AT).run_id).toBeUndefined()
  })
})

describe('withActor / updateWithActor — stamping the UPDATE itself', () => {
  it('adds the actor without disturbing the payload', () => {
    const payload = { report_period: 'weekly', report_day: 'sunday' }
    expect(withActor(payload, actor())).toMatchObject({ ...payload, last_actor: actor() })
    expect(payload).toEqual({ report_period: 'weekly', report_day: 'sunday' })
  })

  it('gives a hand-built stamp a nonce of its own, so two look different to the trigger', () => {
    const one = withActor({}, actor()).last_actor
    const two = withActor({}, actor()).last_actor
    expect(one.nonce).toBeTruthy()
    expect(one).not.toEqual(two)
  })

  it('strips characters a jsonb body cannot carry', () => {
    const stamped = withActor({}, actor({ label: 'owner\u0000@ossur.com' }))
    expect(stamped.last_actor.label).toBe('owner@ossur.com')
  })

  it('writes once, stamped, when the column is there', async () => {
    const seen: Record<string, unknown>[] = []
    const res = await updateWithActor(async (p) => { seen.push(p); return { error: null } }, { report_day: 'sunday' }, actor())
    expect(res.error).toBeNull()
    expect(res.stamped).toBe(true)
    expect(seen).toHaveLength(1)
    expect(seen[0]).toHaveProperty('last_actor')
  })

  it('retries unstamped when the deploy lands before the migration, and says whose write it was', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const seen: Record<string, unknown>[] = []
    const res = await updateWithActor(
      async (p) => {
        seen.push(p)
        return 'last_actor' in p
          ? { error: { code: 'PGRST204', message: "Could not find the 'last_actor' column of 'tracking_configs'" } }
          : { error: null }
      },
      { report_day: 'sunday' },
      actor({ kind: 'operator', label: 'heinrich@verbatimintel.com · settings' }),
    )
    expect(res.error).toBeNull()
    expect(seen).toHaveLength(2)
    expect(seen[1]).toEqual({ report_day: 'sunday' })
    // The retry is unattributed: either nothing is logged (no column, no
    // trigger) or the trigger logs the bare role — `pipeline` on the writes
    // that go out on the admin client. This line is the only record of who it
    // actually was, so it is an error and it names them.
    const said = String(err.mock.calls[0]?.[0] ?? '')
    expect(said).toContain('PGRST204')
    expect(said).toContain('heinrich@verbatimintel.com')
    expect(said).toContain('UNSTAMPED')
    // And the caller is told, because two scripts close by telling an operator
    // that the change log recorded the change — which on this path it did not.
    expect(res.stamped).toBe(false)
  })

  it('does not retry any other failure — one rejected write, one report of it', async () => {
    let calls = 0
    const res = await updateWithActor(
      async () => { calls++; return { error: { code: '23514', message: 'violates check constraint' } } },
      { max_videos: 9_000 },
      actor(),
    )
    expect(calls).toBe(1)
    expect(res.error).toMatchObject({ code: '23514' })
  })
})

describe('diffConfigRows — one row per column that actually moved', () => {
  const stamp = actor({ kind: 'script', label: 'scripts/sealand-config-2026-09.ts --apply' })

  it('writes nothing when nothing moved', () => {
    expect(diffConfigRows({
      clientId: CLIENT,
      before: { competitor_names: ['Cotopaxi', 'Freitag'], report_day: 'sunday' },
      after: { competitor_names: ['Cotopaxi', 'Freitag'], report_day: 'sunday' },
      actor: stamp,
    })).toEqual([])
  })

  it('splits a multi-column write into one row per column, each on its surface', () => {
    const rows = diffConfigRows({
      clientId: CLIENT,
      before: { competitor_names: ['Cotopaxi', 'Freitag', 'Patagonia'], competitor_keywords: ['cotopaxi'], max_videos: 50 },
      after: { competitor_names: ['Cotopaxi', 'Freitag', 'Rareform'], competitor_keywords: ['cotopaxi backpack'], max_videos: 100 },
      actor: stamp,
    })
    expect(rows.map((r) => [r.field, r.surface])).toEqual([
      ['competitor_keywords', 'terms'],
      ['competitor_names', 'rivals'],
      ['max_videos', 'knobs'],
    ])
    expect(rows[1].before).toEqual(['Cotopaxi', 'Freitag', 'Patagonia'])
    expect(rows[1].after).toEqual(['Cotopaxi', 'Freitag', 'Rareform'])
  })

  it('ignores columns the write does not touch', () => {
    const rows = diffConfigRows({
      clientId: CLIENT,
      before: { report_day: 'monday', platforms: ['tiktok'] },
      after: { report_day: 'sunday' },
      actor: stamp,
    })
    expect(rows.map((r) => r.field)).toEqual(['report_day'])
  })

  it('treats array order as meaning — the first rival name wins a dual mention', () => {
    const rows = diffConfigRows({
      clientId: CLIENT,
      before: { competitor_names: ['Cotopaxi', 'Freitag'] },
      after: { competitor_names: ['Freitag', 'Cotopaxi'] },
      actor: stamp,
    })
    expect(rows).toHaveLength(1)
  })

  it('does not call a re-ordered jsonb object a change, the way Postgres would not', () => {
    const rows = diffConfigRows({
      clientId: CLIENT,
      before: { competitor_handles: { Cotopaxi: { instagram: 'cotopaxi', tiktok: 'cotopaxiofficial' } } },
      after: { competitor_handles: { Cotopaxi: { tiktok: 'cotopaxiofficial', instagram: 'cotopaxi' } } },
      actor: stamp,
    })
    expect(rows).toEqual([])
  })

  it('reads a birth as before = null, and stays quiet about what was never set', () => {
    const rows = diffConfigRows({
      clientId: CLIENT,
      before: null,
      after: {
        brand_keywords: ['sealand gear'],
        exclude_terms: [],              // nothing excluded is not a decision
        competitor_handles: {},         // no rival accounts is not a decision
        max_videos: 25,
      },
      actor: stamp,
    })
    expect(rows.map((r) => r.field)).toEqual(['brand_keywords', 'max_videos'])
    expect(rows[0].before).toBeNull()
  })

  it('carries source, note and a backdated timestamp for reconstruction', () => {
    const rows = diffConfigRows({
      clientId: CLIENT,
      before: { competitor_names: ['Cotopaxi'] },
      after: { competitor_names: ['Cotopaxi', 'Rareform'] },
      actor: reconstructedActor('theme_registry.bucket', AT),
      source: 'reconstructed',
      note: 'inferred from the buckets the 2026-09-09 update produced',
      changedAt: '2026-09-09T16:24:15.000Z',
    })
    expect(rows[0].source).toBe('reconstructed')
    expect(rows[0].changedAt).toBe('2026-09-09T16:24:15.000Z')
    expect(changeRow(rows[0]).changed_at).toBe('2026-09-09T16:24:15.000Z')
  })
})

describe('changeRow — what reaches the database', () => {
  it('defaults a logged row to now, with no changed_at of its own', () => {
    const row = changeRow({ clientId: CLIENT, surface: 'schedule', actor: actor() })
    expect(row).not.toHaveProperty('changed_at')
    expect(row.source).toBe('logged')
    expect(row.before).toBeNull()
    expect(row.after).toBeNull()
    expect(row.rows_affected).toBeNull()
  })

  it('takes the update from the actor, and lets a row override it', () => {
    expect(changeRow({ clientId: CLIENT, surface: 'subreddits', actor: pipelineActor('run-1', 'discovery', AT) }).run_id).toBe('run-1')
    expect(changeRow({ clientId: CLIENT, surface: 'terms', actor: actor(), runId: 'run-9' }).run_id).toBe('run-9')
    expect(changeRow({ clientId: CLIENT, surface: 'terms', actor: pipelineActor('run-1', 'd', AT), runId: null }).run_id).toBeNull()
  })

  it('strips characters a model can produce and a text column cannot hold', () => {
    // The term suggester's words end up in industry_keywords, so model output
    // does reach this log's before/after.
    const row = changeRow({
      clientId: CLIENT,
      surface: 'terms',
      after: ['sustainable\u0000fashion'],
      actor: actor(),
      note: 'kept from a suggestion\u0007',
    })
    expect(row.after).toEqual(['sustainablefashion'])
    expect(row.note).toBe('kept from a suggestion')
  })
})

describe('recordConfigChange — non-fatal by design', () => {
  const fake = (error: { message?: string } | null) => {
    const inserted: unknown[] = []
    return {
      inserted,
      client: {
        from: () => ({
          insert: async (rows: Record<string, unknown> | Record<string, unknown>[]) => { inserted.push(rows); return { error } },
        }),
      },
    }
  }

  it('writes one row and says so', async () => {
    const f = fake(null)
    expect(await recordConfigChange(f.client, { clientId: CLIENT, surface: 'schedule', actor: actor() })).toBe(true)
    expect(f.inserted).toHaveLength(1)
  })

  it('reports a failed log without failing the caller — the work already happened', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const f = fake({ message: 'relation "public.config_changes" does not exist' })
    expect(await recordConfigChange(f.client, { clientId: CLIENT, surface: 'regate', actor: actor() })).toBe(false)
    expect(err).toHaveBeenCalled()
  })

  it('writes a set in one statement, and nothing at all for an empty set', async () => {
    const f = fake(null)
    expect(await recordConfigChanges(f.client, [])).toBe(0)
    expect(f.inserted).toHaveLength(0)
    expect(await recordConfigChanges(f.client, [
      { clientId: CLIENT, surface: 'terms', actor: actor() },
      { clientId: CLIENT, surface: 'rivals', actor: actor() },
    ])).toBe(2)
    expect(f.inserted).toHaveLength(1)
    expect((f.inserted[0] as unknown[]).length).toBe(2)
  })
})

describe('the corpus re-tag', () => {
  it('leaves an own or rival account post alone — its tag is an identity, not a reading', () => {
    // 37 of Sealand's 59 own posts would lose is_client under a content re-tag:
    // the handle `sealandgear` contains none of its brand keywords.
    expect(skipRetag('owned')).toBe(true)
    expect(skipRetag('competitor_owned')).toBe(true)
  })

  it('re-judges everything found by search', () => {
    expect(skipRetag('discovered')).toBe(false)
    expect(skipRetag(null)).toBe(false)
    expect(skipRetag(undefined)).toBe(false)
    expect(skipRetag('')).toBe(false)
  })

  it('counts the corpus that exists, not the one the re-tag asked for', () => {
    const before = ['competitor:Patagonia', 'competitor:Patagonia', 'industry', 'client']
    // Rows 0 and 1 were re-judged as industry; row 1's UPDATE failed, so it is
    // not in `moved` and keeps the bucket it has in the database.
    const after = bucketsAfterRetag(before, new Map([[0, 'industry']]))
    expect(after).toEqual(['industry', 'competitor:Patagonia', 'industry', 'client'])
    expect(before).toEqual(['competitor:Patagonia', 'competitor:Patagonia', 'industry', 'client'])
  })

  it('ignores an index that is not a row', () => {
    expect(bucketsAfterRetag(['industry'], new Map([[7, 'client'], [-1, 'client']]))).toEqual(['industry'])
    expect(bucketsAfterRetag([], new Map())).toEqual([])
  })

  it('records the method, the rows moved and the rows spared', () => {
    const row = retagChange({
      clientId: CLIENT,
      actor: scriptActor('scripts/run-tagging.ts --write --method substring', AT),
      method: 'substring',
      before: { 'competitor:Patagonia': 85, 'industry': 1692 },
      after: { 'industry': 1844 },
      rowsAffected: 94,
      skipped: 37,
      costUsd: 0.312,
    })
    expect(row.surface).toBe('entity_retag')
    expect(row.rowsAffected).toBe(94)
    expect(row.note).toContain('94 video(s) moved')
    expect(row.note).toContain('37 posted by your own or a tracked rival')
    expect(row.before).toEqual({ 'competitor:Patagonia': 85, 'industry': 1692 })
  })

  it('keeps the command line and the spend on the label, and out of the sentence', () => {
    // Every member of the tenant can read this table, and Phase 1 will put it
    // on a screen. What the client reads is the note; what an operator needs —
    // which script, which flags, what it cost us — belongs beside the command.
    const row = retagChange({
      clientId: CLIENT,
      actor: scriptActor('scripts/run-tagging.ts --write --method gpt', AT),
      method: 'gpt',
      before: { industry: 10 },
      after: { industry: 10 },
      rowsAffected: 0,
      skipped: 0,
      costUsd: 0.312,
    })
    expect(row.actor.label).toBe('scripts/run-tagging.ts --write --method gpt · OpenAI $0.31200')
    expect(row.note).not.toMatch(/\$|OpenAI|scripts\/|--write|gpt|substring|corpus/)
  })
})

describe('isMissingConfigLog — which of two sentences the readiness page prints', () => {
  // This predicate decides between "nothing has been recorded yet" (the log is
  // there, nobody has changed anything) and "nothing in the product writes
  // down a configuration change" (the migration has not landed) — two answers
  // with two different owners. Widen it and a grants problem on
  // `config_changes` reads forever after as an unapplied migration, with the
  // person who applied it blamed.
  //
  // The shapes are the live ones, checked read-only against production on
  // 2026-09-15 before the readiness page was built: a GET on a table PostgREST
  // has never heard of comes back 404 / PGRST205 with the table named. (A HEAD
  // count comes back 204 / count null / error null — no error at all, which is
  // why the page probes with a GET first.)
  it('knows the table missing, by any of the four ways it is said', () => {
    expect(isMissingConfigLog({
      code: 'PGRST205',
      message: `Could not find the table 'public.${CONFIG_CHANGES_TABLE}' in the schema cache`,
    })).toBe(true)
    expect(isMissingConfigLog({ code: '42P01', message: `relation "public.${CONFIG_CHANGES_TABLE}" does not exist` })).toBe(true)
    expect(isMissingConfigLog({
      code: 'PGRST204',
      message: `Could not find the 'actor_label' column of '${CONFIG_CHANGES_TABLE}' in the schema cache`,
    })).toBe(true)
    expect(isMissingConfigLog({ code: '42703', message: `column ${CONFIG_CHANGES_TABLE}.source does not exist` })).toBe(true)
  })

  it('still knows it once the code has been flattened away', () => {
    // `selectAll` wraps a PostgREST error in a plain Error, so by the time a
    // reader sees it the sentence is all that is left.
    expect(isMissingConfigLog(new Error(`relation "public.${CONFIG_CHANGES_TABLE}" does not exist`))).toBe(true)
    expect(isMissingConfigLog(
      new Error(`selectAll: Could not find the table 'public.${CONFIG_CHANGES_TABLE}' in the schema cache`),
    )).toBe(true)
  })

  it('is not a blanket swallow — a grants or constraint failure is a real failure', () => {
    expect(isMissingConfigLog({ code: '42501', message: `permission denied for table ${CONFIG_CHANGES_TABLE}` })).toBe(false)
    expect(isMissingConfigLog({
      code: '23514',
      message: `new row for relation "${CONFIG_CHANGES_TABLE}" violates check constraint "config_changes_surface_check"`,
    })).toBe(false)
    expect(isMissingConfigLog({ code: '57014', message: 'canceling statement due to statement timeout' })).toBe(false)
    expect(isMissingConfigLog(new Error('fetch failed'))).toBe(false)
  })

  it('never answers for another table', () => {
    expect(isMissingConfigLog({ code: '42P01', message: 'relation "public.tracking_configs" does not exist' })).toBe(false)
    expect(isMissingConfigLog({
      code: 'PGRST205',
      message: "Could not find the table 'public.rec_decisions' in the schema cache",
    })).toBe(false)
  })

  it('treats no error as no error', () => {
    expect(isMissingConfigLog(null)).toBe(false)
    expect(isMissingConfigLog(undefined)).toBe(false)
    expect(isMissingConfigLog('PGRST205')).toBe(false)
  })
})

describe('changeLogBoundary — inference must never read as record', () => {
  it('says plainly that nothing is recorded yet', () => {
    expect(changeLogBoundary(null)).toContain('No configuration change has been recorded yet')
    expect(changeLogBoundary(null)).toContain('a label, not a record')
  })

  it('names the day the record begins', () => {
    const line = changeLogBoundary('2026-09-15T08:12:03.400Z')
    expect(line).toContain('2026-09-15')
    expect(line).not.toContain('08:12')
    expect(line).toContain('a label, not a record')
  })

  it('carries no pipeline jargon', () => {
    for (const line of [changeLogBoundary(null), changeLogBoundary('2026-09-15T00:00:00Z')]) {
      expect(line).not.toMatch(/\brun\b|gather|Pass [A-E]|pipeline/i)
    }
  })
})

describe('the mirror in the migration — the two have to keep saying the same thing', () => {
  // The trigger carries its own copy of the watched-column list and of the
  // column→surface mapping, in SQL. A change to one side only is silent: the
  // same edit then reads `knobs` when a person makes it in the browser and
  // `other` when a script writes it, and diffConfigRows stops covering a column
  // that the database is still logging. Nothing but this test notices.
  const sql = readFileSync(new URL('../supabase/migrations/20260915091000_config_changes.sql', import.meta.url), 'utf8')

  const quoted = (s: string) => [...s.matchAll(/'([^']+)'/g)].map((m) => m[1])

  it('watches exactly the columns WATCHED_CONFIG_COLUMNS names, in the same order', () => {
    const array = sql.match(/foreach\s+v_col\s+in\s+array\s+array\[([\s\S]*?)\]/i)?.[1]
    expect(array, 'the trigger\'s column array is no longer where this test looks for it').toBeTruthy()
    expect(quoted(array!)).toEqual([...WATCHED_CONFIG_COLUMNS])
  })

  it('files every column on the same surface the TypeScript does', () => {
    const block = sql.match(/case v_col([\s\S]*?)\bend\b/i)?.[1]
    expect(block, 'the trigger\'s CASE is no longer where this test looks for it').toBeTruthy()
    const arms = new Map([...block!.matchAll(/when\s+'([^']+)'\s+then\s+'([^']+)'/g)].map((m) => [m[1], m[2]]))
    const fallback = block!.match(/else\s+'([^']+)'/)?.[1]
    expect(CONFIG_SURFACES).toContain(fallback as never)
    for (const column of WATCHED_CONFIG_COLUMNS) {
      expect(arms.get(column) ?? fallback, `${column} reads differently in SQL`).toBe(surfaceForColumn(column))
    }
    // And the CASE names nothing the loop never reaches.
    for (const named of arms.keys()) expect(WATCHED_CONFIG_COLUMNS).toContain(named as never)
  })

  it('takes update, delete and truncate off the service role, which the default ACL hands it', () => {
    // The log is the audit record for exactly the writes nobody else sees, and
    // the service role is the one that bypasses RLS — so "append-only" is a
    // property of the application, not of the database, until these three are
    // revoked. This project's pg_default_acl grants arwdDxtm on every new
    // public table; a plain Postgres cluster has no such default, so a local
    // exercise of this file cannot catch it. Nothing in the repo updates or
    // deletes a row here: lib/config-log.ts inserts, lib/readiness/load.ts and
    // scripts/reconstruct-config-log.ts read. Same rule, same wording as
    // 20260915093000_rec_decisions.sql.
    expect(sql).toMatch(/revoke update, delete, truncate on public\.config_changes from service_role;/)
    expect(sql).toMatch(/grant select, insert on public\.config_changes to service_role;/)
  })

  it('carries the same two vocabularies in its CHECK constraints', () => {
    // The surface list moved: 20260918090000_competitors.sql (Phase 1 M1) drops
    // and re-adds the constraint to admit 'rival_rename' and 'prompt_version',
    // so the LIVE vocabulary is the newest migration that writes it, not this
    // one. Read it that way rather than freezing the vocabulary here — the
    // point of the test is that TypeScript and the database agree about what a
    // surface may be, and a later migration is allowed to move the answer.
    const rivalsSql = readFileSync(new URL('../supabase/migrations/20260918090000_competitors.sql', import.meta.url), 'utf8')
    const surfaces = rivalsSql.match(/check\s*\(surface in \(([\s\S]*?)\)\)/i)?.[1]
    const kinds = sql.match(/check\s*\(actor_kind in\s*\(([\s\S]*?)\)\)/i)?.[1]
    expect(surfaces).toBeTruthy()
    expect(kinds).toBeTruthy()
    expect(quoted(surfaces!).sort()).toEqual([...CONFIG_SURFACES].sort())
    expect(quoted(kinds!).sort()).toEqual([...ACTOR_KINDS].sort())
    // And the original file's own CHECK is still a subset of it — a migration
    // that re-adds the constraint must never drop a surface already stored.
    const original = quoted(sql.match(/check\s*\(surface in \(([\s\S]*?)\)\)/i)![1])
    for (const surface of original) expect(CONFIG_SURFACES).toContain(surface as never)
  })
})
