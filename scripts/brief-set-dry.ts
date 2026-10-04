// A DRY build of one month's four department briefs for one workspace: the
// rebuilt engine (lib/reports/briefs) run IN MEMORY, with nothing written
// anywhere but local files.
//
//   TSX_TSCONFIG_PATH=<wt>/tsconfig.json node --env-file=<wt>/.env.local \
//     --import <wt>/node_modules/tsx/dist/loader.mjs <wt>/scripts/brief-set-dry.ts \
//     --client <uuid> --month 2026-09 --out <dir> --cache <dir> \
//     [--cap 3] [--spent-before 0] [--concurrency 1] [--reuse research|grounding] [--stage inputs|research|write]
//
// OUT gets, per role, `<role>_brief.md` (the reader-facing text: quotes
// resolved to the commenters' words and attributed, figures substituted) and
// `<role>_brief.json` (the structured brief, quotes as refs, and its
// workings), plus `_set.json` (the ideas, the self-check, the allocation, the
// cost, the guard's log and the self-checks). CACHE holds the inputs, the
// research and the grounding between runs, so the writer can be run again
// without asking production twice; it carries comment words and lives in a
// scratch directory, never in OUT.
//
// NO WRITE CAN LEAVE THIS PROCESS (the spike's guard, scripts/brief-dry.ts):
// before any engine module loads, `fetch` is wrapped; to Supabase only
// GET/HEAD under /rest/v1 and POSTs to the `stable` read functions listed
// below go out; everything else is answered 403 here and recorded. The model
// calls are made with `log: false`; the research's own `ai_call_log` inserts
// (runResearch logs with persist on) are refused by the guard.
//
// READS ARE RATIONED (AGENTS.md): a timed probe first (over 3 s or an error
// stops the run), then at most --concurrency Supabase requests in flight.
//
// SPEND: every OpenAI response's usage is metered at `MODEL_PRICING`; once
// --spent-before plus this process's spend reaches --cap, the next call is
// refused.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { SupabaseClient } from '@supabase/supabase-js'

const argv = process.argv.slice(2)
const values = (name: string): string[] =>
  argv.flatMap((a, i) => (a === `--${name}` && argv[i + 1] && !argv[i + 1].startsWith('--') ? [argv[i + 1]] : []))
const flag = (name: string, fallback = ''): string => values(name)[0] ?? fallback
for (const a of argv) {
  if (a.startsWith('--') && !['client', 'month', 'out', 'cache', 'cap', 'spent-before', 'concurrency', 'reuse', 'stage', 'roles'].includes(a.slice(2))) throw new Error(`unknown flag: ${a}`)
}
const CLIENT = flag('client')
const MONTH = flag('month')
const OUT = flag('out')
const CACHE = flag('cache')
const CAP = Number(flag('cap', '3'))
const SPENT_BEFORE = Number(flag('spent-before', '0'))
const CONCURRENCY = Math.max(1, Number(flag('concurrency', '1')))
const REUSE = new Set(values('reuse'))
const STAGE = flag('stage', 'write')
if (!/^[0-9a-f-]{36}$/.test(CLIENT)) throw new Error('--client <uuid> is required')
if (!/^\d{4}-\d{2}$/.test(MONTH)) throw new Error('--month YYYY-MM is required')
if (!OUT || !CACHE) throw new Error('--out <dir> and --cache <dir> are required')

// ---- the guard (scripts/brief-dry.ts) -------------------------------------------------------

const READ_RPCS = new Set([
  'match_insights', 'window_denominators', 'window_theme_readings', 'window_subject_readings', 'window_kind_readings',
  'window_span_denominators', 'market_month_videos', 'market_segment_counts', 'market_week_volumes', 'segments_for_videos',
  'subject_band', 'monthly_evidence_refs', 'update_arrivals', 'theme_maker_shares', 'lens_readings', 'brand_mention_candidates',
  'monthly_denominators', 'monthly_theme_readings', 'monthly_subject_readings', 'monthly_kind_readings', 'monthly_audience_stats',
])
const supabaseHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://missing').host
const openaiHost = new URL(process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').host

const ledger = {
  phase: 'start',
  reads: 0,
  readsByPhase: {} as Record<string, number>,
  blocked: [] as { phase: string; method: string; path: string }[],
  calls: [] as { phase: string; model: string; prompt: number; completion: number; usd: number }[],
  refusedForCap: 0,
}
const spentHere = () => ledger.calls.reduce((n, c) => n + c.usd, 0)
const spentTotal = () => SPENT_BEFORE + spentHere()
let inFlight = 0
const waiting: (() => void)[] = []
const acquire = () => new Promise<void>((res) => { if (inFlight < CONCURRENCY) { inFlight++; res() } else waiting.push(() => { inFlight++; res() }) })
const release = () => { inFlight--; waiting.shift()?.() }
let priceOf: (model: string, prompt: number, completion: number) => number = () => 0

const realFetch = globalThis.fetch.bind(globalThis)
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const url = new URL(href)
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
  const refuse = (why: string) => {
    ledger.blocked.push({ phase: ledger.phase, method, path: `${url.host === supabaseHost ? '' : url.host}${url.pathname}` })
    return new Response(JSON.stringify({ message: `refused by brief-set-dry (${why}): ${method} ${url.pathname}`, code: 'DRY' }), { status: 403, headers: { 'content-type': 'application/json' } })
  }
  if (url.host === supabaseHost) {
    const rpc = /^\/rest\/v1\/rpc\/([a-z_0-9]+)$/.exec(url.pathname)?.[1]
    const read = ((method === 'GET' || method === 'HEAD') && url.pathname.startsWith('/rest/v1/') && !rpc) || (method === 'POST' && !!rpc && READ_RPCS.has(rpc))
    if (!read) return refuse('a write, or a function not known to be read-only')
    await acquire()
    try {
      ledger.reads++
      ledger.readsByPhase[ledger.phase] = (ledger.readsByPhase[ledger.phase] ?? 0) + 1
      return await realFetch(input, init)
    } finally {
      release()
    }
  }
  if (url.host === openaiHost) {
    if (spentTotal() >= CAP) {
      ledger.refusedForCap++
      throw new Error(`brief-set-dry: the spend cap of $${CAP} is reached ($${spentTotal().toFixed(3)}); refusing the call`)
    }
    let model = 'unknown'
    try { model = String(JSON.parse(typeof init?.body === 'string' ? init.body : '{}').model ?? 'unknown') } catch { /* not JSON */ }
    const res = await realFetch(input, init)
    try {
      const body = (await res.clone().json()) as { usage?: { prompt_tokens?: number; completion_tokens?: number } }
      const prompt = Number(body.usage?.prompt_tokens ?? 0)
      const completion = Number(body.usage?.completion_tokens ?? 0)
      ledger.calls.push({ phase: ledger.phase, model, prompt, completion, usd: priceOf(model, prompt, completion) })
    } catch { /* an error body has no usage */ }
    return res
  }
  return refuse('not Supabase or OpenAI')
}) as typeof fetch

// ---- the run ----------------------------------------------------------------------------------

const BRIEF_FILE = { sales: 'sales_brief', marketing: 'marketing_brief', content: 'content_brief', leadership: 'leadership_brief' } as const

async function main() {
  const { createAdminClient } = await import('../lib/supabase-admin')
  const config = await import('../lib/config')
  priceOf = (model, p, c) => {
    const key = Object.keys(config.MODEL_PRICING).sort((a, b) => b.length - a.length).find((k) => model === k || model.startsWith(`${k}-`))
    return key ? config.estimateCost(key, p, c) : 0
  }
  const build = await import('../lib/reports/briefs/build')
  const { briefMarkdown } = await import('../lib/reports/briefs/markdown')
  const { repeatsAcross, ideaHomes } = await import('../lib/reports/briefs/compose')
  const { briefBreaks } = await import('../lib/reports/briefs/scrub')
  const { BANNED_PHRASES, bannedHits } = await import('../lib/written/scrub')
  const { freezeQuotes } = await import('../lib/renderables/quotes-freeze')
  const { BRIEF_ROLES } = await import('../lib/reports/briefs/types')

  const db = createAdminClient() as SupabaseClient
  mkdirSync(OUT, { recursive: true })
  mkdirSync(CACHE, { recursive: true })
  const now = new Date()
  const month = `${MONTH}-01`

  ledger.phase = 'probe'
  const t0 = Date.now()
  const probe = await db.from('clients').select('company_name').eq('id', CLIENT).maybeSingle()
  const probeMs = Date.now() - t0
  if (probe.error || probeMs > 3000) throw new Error(`probe failed or slow (${probeMs} ms${probe.error ? `, ${probe.error.message}` : ''}); wait fifteen minutes`)
  if (!probe.data) throw new Error(`no such client: ${CLIENT}`)
  console.log(`probe: PostgREST ${probeMs} ms · ${probe.data.company_name}`)

  // Inputs (cached with the research: one wave of light reads).
  const inputsFile = join(CACHE, 'inputs.json')
  let inputs: Awaited<ReturnType<typeof build.loadBriefSetInputs>>
  if (REUSE.has('research') && existsSync(inputsFile)) {
    inputs = JSON.parse(readFileSync(inputsFile, 'utf8'))
    console.log('inputs: from cache')
  } else {
    ledger.phase = 'inputs'
    const t = Date.now()
    inputs = await build.loadBriefSetInputs(db, { clientId: CLIENT, month, now })
    writeFileSync(inputsFile, JSON.stringify(inputs, null, 2))
    console.log(`inputs: ${inputs.company} · rivals ${inputs.rivals.join(', ') || 'none'} · market ${inputs.market?.videos ?? '?'} videos · ${inputs.standing.length} subjects (${inputs.standing.map((s) => `${s.name}:${s.calibration}`).join(', ')}) · playbook ${inputs.playbook ? 'yes' : 'no'} · ${inputs.sayVsHear.length} say-vs-hear · claims ${inputs.context?.claims.length ?? 0} · ${Date.now() - t} ms · ${ledger.readsByPhase.inputs ?? 0} reads`)
  }
  if (STAGE === 'inputs') return finish()

  const questions = build.questionsFor(inputs)
  console.log(`questions (${questions.length}): ${questions.map((q) => q.id).join(', ')}`)

  // Research (cached: the expensive half).
  const researchFile = join(CACHE, 'research.json')
  let research: { answers: Awaited<ReturnType<typeof build.researchBriefSet>>['answers']; window: { from: string; to: string } | null; costUsd: number }
  if (REUSE.has('research') && existsSync(researchFile)) {
    research = JSON.parse(readFileSync(researchFile, 'utf8'))
    console.log(`research: from cache ($${research.costUsd.toFixed(3)} when it was asked)`)
  } else {
    ledger.phase = 'research'
    const t = Date.now()
    const r = await build.researchBriefSet(db, inputs, questions, { now, budgetUsd: Math.max(0, CAP - spentTotal() - 0.8), parallel: 3 })
    research = { answers: freezeQuotes(r.answers).data as typeof r.answers, window: r.window, costUsd: r.costUsd }
    writeFileSync(researchFile, JSON.stringify(research, null, 2))
    console.log(`research: ${research.answers.map((a) => `${a.question.id}=${a.outcome}/${a.grounded.length}`).join(' ')} · $${r.costUsd.toFixed(3)} · ${Math.round((Date.now() - t) / 1000)} s · window ${r.window?.from}..${r.window?.to}`)
  }
  if (STAGE === 'research') return finish()
  if (!research.window) throw new Error('research has no window')

  // Grounding (cached in the scratch directory only: it carries comment words).
  const groundFile = join(CACHE, 'grounding.json')
  let grounded: Awaited<ReturnType<typeof build.groundBriefResearch>>
  if ((REUSE.has('grounding') || REUSE.has('research')) && existsSync(groundFile)) {
    const g = JSON.parse(readFileSync(groundFile, 'utf8'))
    grounded = { points: g.points, counted: new Map(g.counted), whoVideos: new Map(g.whoVideos), brandsOf: new Map(g.brandsOf) }
    console.log('grounding: from cache')
  } else {
    ledger.phase = 'grounding'
    const t = Date.now()
    grounded = await build.groundBriefResearch(db, inputs, research.answers, questions, research.window)
    writeFileSync(groundFile, JSON.stringify({ points: grounded.points, counted: [...grounded.counted], whoVideos: [...grounded.whoVideos], brandsOf: [...grounded.brandsOf] }))
    const usable = grounded.points.filter((p) => p.usable)
    console.log(`grounding: ${grounded.points.length} points, ${usable.length} usable · ${Math.round((Date.now() - t) / 1000)} s · ${ledger.readsByPhase.grounding ?? 0} reads`)
  }
  if (STAGE === 'grounding') return finish()

  ledger.phase = 'write'
  const roles = values('roles').length ? values('roles') as typeof BRIEF_ROLES[number][] : undefined
  const set = await build.writeBriefSet(db, inputs, questions, grounded, { log: false, researchCostUsd: 0, roles })
  console.log(`ideas: ${set.allocation.ideas.map((i) => `${i.id}→${i.home}(${i.placed}, ${i.videos}v): ${i.headline}`).join(' | ')}`)
  console.log(`held ideas: ${set.allocation.held.map((h) => `${h.headline} [${h.reason}]`).join(' | ') || 'none'}`)

  // The files.
  const textOf = (ref: string) => set.quotes.textOf(ref)
  const briefs = Object.values(set.briefs).map((b) => b.data)
  const flags: { role: string; rule: string; sentence: string }[] = []
  for (const role of Object.keys(set.briefs) as (keyof typeof BRIEF_FILE)[]) {
    const b = set.briefs[role]
    const md = briefMarkdown(b.data, textOf, inputs.noun)
    writeFileSync(join(OUT, `${BRIEF_FILE[role]}.md`), md)
    // §0a flags over the printed text, sentence by sentence (quotes excluded:
    // a commenter's words are theirs).
    for (const line of md.split('\n').filter((l) => !l.startsWith('>') && !/^- "/.test(l))) {
      for (const sentence of line.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean)) {
        for (const rule of [...bannedHits(sentence, BANNED_PHRASES), ...briefBreaks(sentence)]) flags.push({ role, rule, sentence })
      }
    }
    const ownPoints = set.grounded.points.filter((p) => p.role === role || b.data.findings.some((f) => f.basedOn.includes(p.id)))
    writeFileSync(join(OUT, `${BRIEF_FILE[role]}.json`), `${JSON.stringify({
      brief: b.data,
      workings: {
        questions: questions.filter((q) => q.role === role),
        research: research.answers.filter((a) => a.question.id.startsWith(`${role}.`)).map((a) => ({ question: a.question, outcome: a.outcome, answer: a.answer, grounded: a.grounded.map((p) => ({ id: p.id, text: p.text, conversationCount: p.conversationCount, themeLabels: p.themeLabels })) })),
        points: ownPoints,
        ideas: set.allocation.ideas.filter((i) => i.home === role),
        writer: b.raw,
        scrub: b.scrub,
        costUsd: b.costUsd,
      },
    }, null, 2)}\n`)
  }
  const meteredWrite = ledger.calls.filter((c) => c.phase === 'write').reduce((n, c) => n + c.usd, 0)
  writeFileSync(join(OUT, '_set.json'), `${JSON.stringify({
    clientId: CLIENT, company: inputs.company, month, builtAt: now.toISOString(), researchWindow: research.window,
    questions: questions.map((q) => ({ id: q.id, section: q.section, text: q.text })),
    ideas: set.ideas.raw, check: set.check, allocation: set.allocation, homes: Object.fromEntries(ideaHomes(briefs)),
    repeats: repeatsAcross(briefs), flags,
    points: { total: set.grounded.points.length, usable: set.grounded.points.filter((p) => p.usable).length, byRole: Object.fromEntries(BRIEF_ROLES.map((r) => [r, set.grounded.points.filter((p) => p.role === r && p.usable).length])) },
    cost: { researchUsd: research.costUsd, writeEngineUsd: set.costUsd, writeMeteredUsd: meteredWrite, meteredThisProcess: spentHere(), spentTotal: spentTotal(), cap: CAP },
    guard: { reads: ledger.readsByPhase, blocked: ledger.blocked.reduce<Record<string, number>>((m, b) => ({ ...m, [`${b.phase} ${b.method} ${b.path}`]: (m[`${b.phase} ${b.method} ${b.path}`] ?? 0) + 1 }), {}) },
  }, null, 2)}\n`)
  console.log(`flags: ${flags.length} · repeats: ${repeatsAcross(briefs).length}`)
  return finish()
}

function finish() {
  console.log(`\nTOTAL metered this process $${spentHere().toFixed(3)} · with earlier runs $${spentTotal().toFixed(3)} · ${ledger.reads} Supabase reads (${Object.entries(ledger.readsByPhase).map(([k, v]) => `${k} ${v}`).join(', ')}) · ${ledger.blocked.length} refused (${[...new Set(ledger.blocked.map((b) => `${b.method} ${b.path}`))].join(', ') || 'none'}) · ${ledger.refusedForCap} refused for the cap`)
}

main().catch((e) => {
  console.error(e)
  finish()
  process.exit(1)
})
