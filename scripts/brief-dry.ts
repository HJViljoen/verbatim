// A DRY build of one or more of the four document briefs for one workspace:
// the document engine's research → write → check → compose, run IN MEMORY,
// with nothing written anywhere but two local files per role.
//
//   node --env-file=.env.local --import tsx scripts/brief-dry.ts \
//     --client <uuid> --role sales_brief [--role market_brief …] --out <dir> \
//     [--cap 4] [--spent-before 0] [--concurrency 1]
//
// WHAT IT REUSES, UNCHANGED: `loadSignals`, `composeQuestions`, `runResearch`
// (the Ask agent), `generateDocument` (the writer), `checkDocument` (the
// self-check), the freeze step's quote resolution and `composeDocument`, then
// `DocumentDeck` rendered to static markup for the reading copy, with the
// quotes hydrated the way `/render/[snapshotId]` hydrates them.
//
// WHAT IT NEVER DOES: no report row, no build row, no snapshot, no stamp, no
// PDF, no email, no `ai_call_log` row. The engine's steps are not called: they
// are the functions inside them, called in order, with the signals read ONCE
// per role (a real build reads them three times).
//
// NO WRITE CAN LEAVE THIS PROCESS. Before any engine module is loaded, `fetch`
// is wrapped: to Supabase only GET/HEAD under /rest/v1 and POSTs to the
// `stable` read functions listed below go out; every other request (an
// insert, an update, an upsert, a delete, any other RPC, auth, storage) is
// answered 403 here, never sent, and recorded with the phase it came from.
// The engine's own `ai_call_log` inserts (the agent's, the writer's and the
// self-check's, which run with persist on) are refused this way; `logAiCall`
// tolerates a failed insert, so the calls themselves go on. The guard wraps
// the global, so it also covers the modules that build their own service-role
// client (`readingClient()`).
//
// READS ARE RATIONED (AGENTS.md): a timed probe first (over 3 s or an error
// stops the run), then at most --concurrency Supabase requests in flight
// (default 1), whatever the loaders ask for. Run one role at a time.
//
// SPEND: every OpenAI response's usage is metered at `MODEL_PRICING`. Once
// --spent-before plus this process's spend reaches --cap, the next OpenAI
// request is refused, and no new role starts unless its expected cost fits.

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ReportRow } from '../lib/reports/types'
import type { DocumentSnapshotData, DocumentWorkings, DocPage } from '../lib/reports/documents/types'
import type { ResearchAnswer } from '../lib/reports/documents/research'

// ---- arguments ----------------------------------------------------------------------------------

const argv = process.argv.slice(2)
const values = (name: string): string[] =>
  argv.flatMap((a, i) => (a === `--${name}` && argv[i + 1] && !argv[i + 1].startsWith('--') ? [argv[i + 1]] : []))
const flag = (name: string, fallback = ''): string => values(name)[0] ?? fallback

const ROLES = ['sales_brief', 'market_brief', 'content_brief', 'leadership_brief'] as const
type Role = (typeof ROLES)[number]
for (const a of argv) {
  if (a.startsWith('--') && !['client', 'role', 'out', 'cap', 'spent-before', 'concurrency'].includes(a.slice(2))) throw new Error(`unknown flag: ${a}`)
}
const CLIENT = flag('client')
const roles = values('role') as Role[]
const OUT = flag('out')
const CAP = Number(flag('cap', '4'))
const SPENT_BEFORE = Number(flag('spent-before', '0'))
const CONCURRENCY = Math.max(1, Number(flag('concurrency', '1')))
if (!/^[0-9a-f-]{36}$/.test(CLIENT)) throw new Error('--client <uuid> is required')
if (!roles.length || roles.some((r) => !ROLES.includes(r))) throw new Error(`--role must be one of ${ROLES.join(', ')}`)
if (!OUT) throw new Error('--out <dir> is required')
/** What a role is expected to cost at most (8 questions, a write, a check),
 *  so a role that cannot fit under the cap is not started. */
const EXPECTED_ROLE_USD = 0.9

// ---- the guard ----------------------------------------------------------------------------------

/** Read-only functions on the brief's path, every one declared `stable` in
 *  its migration (Postgres refuses a data-modifying statement inside one). */
const READ_RPCS = new Set([
  'match_insights', 'window_denominators', 'window_theme_readings', 'window_subject_readings', 'window_kind_readings',
  'window_span_denominators', 'market_month_videos', 'market_segment_counts', 'market_week_volumes', 'segments_for_videos',
  'subject_band', 'monthly_evidence_refs', 'update_arrivals', 'theme_maker_shares', 'lens_readings', 'brand_mention_candidates',
  'monthly_denominators', 'monthly_theme_readings', 'monthly_subject_readings', 'monthly_kind_readings', 'monthly_audience_stats',
])

const supabaseHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://missing').host
const openaiHost = new URL(process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').host

interface Ledger {
  phase: string
  reads: number
  readsByPhase: Record<string, number>
  blocked: { phase: string; method: string; path: string }[]
  calls: { phase: string; model: string; endpoint: string; prompt: number; completion: number; usd: number }[]
  refusedForCap: number
}
const ledger: Ledger = { phase: 'start', reads: 0, readsByPhase: {}, blocked: [], calls: [], refusedForCap: 0 }
const spentHere = () => ledger.calls.reduce((n, c) => n + c.usd, 0)
const spentTotal = () => SPENT_BEFORE + spentHere()

let inFlight = 0
const waiting: (() => void)[] = []
const acquire = () => new Promise<void>((res) => { if (inFlight < CONCURRENCY) { inFlight++; res() } else waiting.push(() => { inFlight++; res() }) })
const release = () => { inFlight--; waiting.shift()?.() }

/** Filled in once lib/config is loaded (inside main). */
let priceOf: (model: string, prompt: number, completion: number) => number = () => 0

const realFetch = globalThis.fetch.bind(globalThis)
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const url = new URL(href)
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
  const refuse = (why: string) => {
    ledger.blocked.push({ phase: ledger.phase, method, path: `${url.host === supabaseHost ? '' : url.host}${url.pathname}` })
    return new Response(JSON.stringify({ message: `refused by brief-dry (${why}): ${method} ${url.pathname}`, code: 'DRY' }), { status: 403, headers: { 'content-type': 'application/json' } })
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
      throw new Error(`brief-dry: the spend cap of $${CAP} is reached ($${spentTotal().toFixed(3)}); refusing the call`)
    }
    let model = 'unknown'
    try { model = String(JSON.parse(typeof init?.body === 'string' ? init.body : '{}').model ?? 'unknown') } catch { /* not JSON */ }
    const res = await realFetch(input, init)
    try {
      const body = (await res.clone().json()) as { usage?: { prompt_tokens?: number; completion_tokens?: number } }
      const prompt = Number(body.usage?.prompt_tokens ?? 0)
      const completion = Number(body.usage?.completion_tokens ?? 0)
      ledger.calls.push({ phase: ledger.phase, model, endpoint: url.pathname.replace(/^\/v1/, ''), prompt, completion, usd: priceOf(model, prompt, completion) })
    } catch { /* an error body has no usage */ }
    return res
  }
  return refuse('not Supabase or OpenAI')
}) as typeof fetch

// ---- helpers ------------------------------------------------------------------------------------

const decode = (s: string): string =>
  s.replace(/&nbsp;/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&')

/** A sheet's markup as readable text: blocks on their own lines, list items
 *  as bullets, table cells separated, charts dropped. */
function sheetText(html: string): string {
  const s = html
    .replace(/<svg[\s\S]*?<\/svg>/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<li[^>]*>/g, '\n- ')
    .replace(/<h[1-6][^>]*>/g, '\n\n**').replace(/<\/h[1-6]>/g, '**\n')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<\/(p|div|section|header|footer|blockquote|figure|figcaption|tr|table|ul|ol|dd|dt|li)>/g, '\n')
    .replace(/<(td|th)[^>]*>/g, ' | ')
    .replace(/<\/(span|a|strong|em|b|i|code|small)>(?=<)/g, '$& ')
    .replace(/<[^>]+>/g, '')
  const lines = decode(s).split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim())
  const out: string[] = []
  for (const l of lines) {
    if (!l && !out[out.length - 1]) continue
    if (l === '**' || l === '** **' || l === '****') continue
    out.push(l)
  }
  return out.join('\n').replace(/\*\*\s*\*\*/g, '').replace(/\n{3,}/g, '\n\n').trim()
}

/** Phrases that break §0a on a brief (process, method, product health, empty
 *  cells), beyond the written read's own BANNED_PHRASES list. */
const BRIEF_BREAKS: { name: string; re: RegExp }[] = [
  { name: 'first brief / first update', re: /\bfirst\s+(?:brief|update|reading|issue)\b|\bnothing\s+yet\s+to\s+compare\b/i },
  { name: 'thin', re: /\bthin\b/i },
  { name: 'nothing captured / not recorded', re: /\bnothing\b[^.]{0,60}\b(?:captured|recorded|read|heard|found)\b|\bnot\s+(?:yet\s+)?(?:captured|recorded)\b|\bno\s+(?:\w+\s+){0,3}(?:captured|recorded)\b/i },
  { name: 'unfilled sheet', re: /\bNot read this month\b|\bcould not (?:fill|be filled|be read)\b|\bnot filled\b/i },
  { name: 'research / researcher / strands', re: /\bresearch(?:er)?\b|\bstrands?\b/i },
  { name: 'reading of / as at / filling', re: /\breading of\b|\bas at\b|\bstill filling\b|\bstops moving\b/i },
  { name: 'confidence words', re: /\b(?:solid|reasonable)\s*(?:reading|evidence|\.|,|$)|\bconfidence\b|\bhow sure\b|\bsupports? (?:it|the reading)\b/i },
  { name: 'not settled / could not settle', re: /\bnot sure yet\b|\bcould not settle\b|\bnot settled\b|\bopen questions?\b|\bunanswered by the conversation\b/i },
  { name: 'method / analysis', re: /\bmethod\b|\banaly(?:sis|sed|st)\b|\bextracted\b|\bverified\b/i },
  { name: 'conversation counts as process', re: /\bconversations? across\b|\bthe conversation (?:read|analysed)\b|\bcomments read\b|\bvideos read\b|\bread for the category\b/i },
  { name: 'first person', re: /\b(?:[Ww]e|[Oo]ur|[Oo]urs|us)\b/ },
  { name: 'update', re: /\bupdates?\b/i },
]

// ---- the run ------------------------------------------------------------------------------------

async function main() {
  // Everything that can make a client or read the environment loads AFTER the
  // guard above is in place.
  const { createAdminClient } = await import('../lib/supabase-admin')
  const config = await import('../lib/config')
  priceOf = (model, p, c) => {
    const key = Object.keys(config.MODEL_PRICING).sort((a, b) => b.length - a.length).find((k) => model === k || model.startsWith(`${k}-`))
    return key ? config.estimateCost(key, p, c) : 0
  }
  const { documentTemplate, promptVersion } = await import('../lib/reports/documents/templates')
  const { contextFor, roleOf, briefPeriod } = await import('../lib/reports/documents/steps')
  const { loadSignals } = await import('../lib/reports/documents/signals')
  const { composeQuestions } = await import('../lib/reports/documents/questions')
  const { runResearch } = await import('../lib/reports/documents/research')
  const { generateDocument, DOCUMENT_WRITER_MODEL } = await import('../lib/reports/documents/write-model')
  const { checkDocument } = await import('../lib/reports/documents/check')
  const { allowedTokens, composeDocument, documentFigures, thinWeek, documentSlides } = await import('../lib/reports/documents/compose')
  const { latestRunId } = await import('../lib/reports/documents/builds')
  const { collectQuoteRefs, freezeQuotes, resolveQuotes } = await import('../lib/renderables/quotes-freeze')
  const { fetchQuoteResolutionsByRefs } = await import('../lib/quotes')
  const { loadAskFrame } = await import('../lib/agent/answer')
  const { askWindow } = await import('../lib/agent/scope')
  const { substituteFigures } = await import('../lib/reports/cover')
  const { BANNED_PHRASES } = await import('../lib/written/scrub')
  const { selectAll } = await import('../lib/supabase-admin')

  const db = createAdminClient() as SupabaseClient
  mkdirSync(OUT, { recursive: true })

  // THE PROBE (AGENTS.md): one timed read of the client row over PostgREST,
  // the path every read below takes.
  ledger.phase = 'probe'
  const t0 = Date.now()
  const probe = await db.from('clients').select('company_name').eq('id', CLIENT).maybeSingle()
  const probeMs = Date.now() - t0
  if (probe.error || probeMs > 3000) throw new Error(`probe failed or slow (${probeMs} ms${probe.error ? `, ${probe.error.message}` : ''}); wait fifteen minutes`)
  if (!probe.data) throw new Error(`no such client: ${CLIENT}`)
  console.log(`probe: PostgREST ${probeMs} ms · ${probe.data.company_name}`)

  // How many months of the corpus exist at all: the month denominators, the
  // category's and the client's own, dated by the comment.
  ledger.phase = 'corpus'
  const { data: monthRows, error: monthErr } = await db
    .from('month_denominators').select('month, audience, videos, comments, status')
    .eq('client_id', CLIENT).in('audience', ['industry-other', 'client']).order('month', { ascending: true })
  if (monthErr) console.warn(`corpus months: ${monthErr.message}`)
  const corpusMonths = (monthRows ?? []) as { month: string; audience: string; videos: number; comments: number; status: string }[]

  for (const role of roles) {
    if (spentTotal() + EXPECTED_ROLE_USD > CAP) {
      console.log(`STOP before ${role}: $${spentTotal().toFixed(3)} spent, and a role may cost up to $${EXPECTED_ROLE_USD} against the $${CAP} cap`)
      break
    }
    const started = Date.now()
    const blockedBefore = ledger.blocked.length
    const callsBefore = ledger.calls.length
    const template = documentTemplate(role)!
    // A report that exists only in memory: no id, so there is no previous
    // brief (the writer is told this is the first), and nothing can point at
    // a row.
    const report = {
      id: '', client_id: CLIENT, kind: 'document', template_key: role, title: template.name, audience: template.audience,
      sections: [], cover: {}, settings: {}, status: 'draft', latest_snapshot_id: null, created_by: null, created_at: '', updated_at: '',
    } as unknown as ReportRow
    const ctx = contextFor({ clientId: CLIENT, userId: null, report, company: probe.data.company_name as string, runId: null })
    const readingAt = new Date().toISOString()
    const timings: Record<string, number> = {}

    console.log(`\n== ${role} (${template.name}) ==`)
    ledger.phase = `${role}:signals`
    let t = Date.now()
    const signals = await loadSignals(db, { clientId: CLIENT, runId: null, settings: ctx.settings, role: roleOf(ctx.template, ctx.settings), now: readingAt })
    timings.signals = Date.now() - t
    console.log(`signals: run ${signals.runId.slice(0, 8)} (${signals.runDate}, ${signals.runStatus}) · month ${signals.reading?.monthLabel ?? 'NONE'} ${signals.reading?.monthStatus ?? ''} · ${signals.sections.length} borrowed sections · ${signals.concerns.length} concerns · ${timings.signals} ms · ${ledger.readsByPhase[ledger.phase] ?? 0} reads`)

    const questions = composeQuestions(ctx.template, signals, ctx.settings, config.DOCUMENT_QUESTIONS_MAX)
    console.log(`questions: ${questions.map((q) => q.id).join(', ')}`)

    ledger.phase = `${role}:research`
    t = Date.now()
    const now = new Date(readingAt)
    const frame = await loadAskFrame(db, CLIENT, now)
    const window = askWindow(frame.reading, 'days90', readingAt)
    const budgetUsd = Math.max(0, Math.min(config.DOCUMENT_BUILD_BUDGET_USD, CAP - spentTotal() - 0.3))
    const research = await runResearch(db, { clientId: CLIENT, companyName: signals.company, runId: signals.runId, questions, budgetUsd, frame, now })
    timings.research = Date.now() - t
    console.log(`research: ${research.answers.map((a) => `${a.question.id}=${a.outcome}/${a.grounded.length}`).join(' ')} · $${research.costUsd.toFixed(3)} · ${timings.research} ms${research.stoppedForBudget ? ' · STOPPED FOR BUDGET' : ''}`)

    // The step boundary: the writer is handed the answers as refs, exactly as
    // writeStep receives them from researchStep's memoised output.
    const answersFrozen = freezeQuotes(research.answers).data as ResearchAnswer[]
    ledger.phase = `${role}:write`
    t = Date.now()
    const period = briefPeriod(signals)
    const writeFigures = documentFigures(signals, answersFrozen)
    const written = await generateDocument(db, {
      clientId: CLIENT, runId: signals.runId,
      template: ctx.template, settings: ctx.settings, company: signals.company, period, reader: null,
      figures: writeFigures, signals, answers: answersFrozen, previous: null, thin: thinWeek(signals), allow: allowedTokens(signals, answersFrozen),
    })
    timings.write = Date.now() - t
    console.log(`write: ${written.written.findings.length} findings · $${written.costUsd.toFixed(3)} · ${timings.write} ms`)

    ledger.phase = `${role}:check`
    t = Date.now()
    const checkRun = (await latestRunId(db, CLIENT)) ?? signals.runId
    const check = await checkDocument(db, { clientId: CLIENT, runId: checkRun, companyName: signals.company, written: written.written })
    timings.check = Date.now() - t
    console.log(`check: ${check.verdicts.map((v) => v.verdict).join(', ') || 'nothing checked'} · dropped ${check.dropped.length} · $${check.costUsd.toFixed(3)}`)

    // The freeze step's composition, without the snapshot: the answers' quotes
    // resolved again from their refs (what the picker judges), then compose.
    ledger.phase = `${role}:compose`
    const refs = collectQuoteRefs(answersFrozen)
    const texts = refs.length ? await fetchQuoteResolutionsByRefs(db, refs, { onReadError: 'throw' }) : new Map()
    const answers = resolveQuotes(answersFrozen, texts) as ResearchAnswer[]
    const figures = documentFigures(signals, answers)
    const costUsd = research.costUsd + written.costUsd + check.costUsd
    const { data, workings } = composeDocument({
      template: ctx.template, settings: ctx.settings, reportId: '', title: template.name, period, signals, answers, written: check.written, figures,
      model: DOCUMENT_WRITER_MODEL, promptVersion: promptVersion(ctx.template), costUsd, timings,
      check: {
        verdicts: Object.fromEntries(check.verdicts.filter((v) => v.verdict !== 'contradicts').map((v) => [v.headline, v.verdict as 'echoes' | 'silent'])),
        dropped: check.dropped,
        brief: null,
      },
    })

    // What the render route would print: the artefact as frozen, every quote
    // resolved again from its ref, then the deck.
    ledger.phase = `${role}:hydrate`
    const frozen = freezeQuotes(data).data as DocumentSnapshotData
    const deckRefs = collectQuoteRefs(frozen)
    const deckTexts = deckRefs.length ? await fetchQuoteResolutionsByRefs(db, deckRefs) : new Map()
    const hydrated = resolveQuotes(frozen, deckTexts) as DocumentSnapshotData

    const { createElement } = await import('react')
    const { renderToStaticMarkup } = await import('react-dom/server')
    const { DocumentDeck } = await import('../components/print/document-deck')
    const date = new Date(readingAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    const html = renderToStaticMarkup(createElement(DocumentDeck, { data: hydrated, date }))
    const sheets = html.split(/<section[^>]*class="[^"]*\bvb-slide\b[^"]*"[^>]*>/).slice(1).map(sheetText)

    // How long-run the evidence is: the comment dates behind every grounded
    // point's insights, by month, and per printed finding.
    ledger.phase = `${role}:evidence-dates`
    const pointInsights = new Map<string, string[]>()
    for (const a of answers) for (const p of a.grounded) pointInsights.set(p.id, p.insightIds)
    const insightIds = [...new Set([...pointInsights.values()].flat())]
    const evidence: { audience_insight_id: string; comment_id: string }[] = []
    for (let i = 0; i < insightIds.length; i += 100) {
      const part = insightIds.slice(i, i + 100)
      evidence.push(...await selectAll<{ audience_insight_id: string; comment_id: string }>(() =>
        db.from('insight_evidence').select('audience_insight_id, comment_id').in('audience_insight_id', part).eq('redacted', false).not('comment_id', 'is', null).order('id')))
    }
    const commentIds = [...new Set(evidence.map((e) => e.comment_id))]
    const dateOf = new Map<string, string>()
    for (let i = 0; i < commentIds.length; i += 100) {
      const part = commentIds.slice(i, i + 100)
      const rows = await selectAll<{ id: string; comment_date: string | null }>(() => db.from('comments').select('id, comment_date').in('id', part).order('id'))
      for (const r of rows) if (r.comment_date) dateOf.set(r.id, r.comment_date)
    }
    const commentsOf = new Map<string, string[]>()
    for (const e of evidence) commentsOf.set(e.audience_insight_id, [...(commentsOf.get(e.audience_insight_id) ?? []), e.comment_id])
    const monthsOf = (ids: string[]) => {
      const hist: Record<string, number> = {}
      const seen = new Set<string>()
      for (const id of ids) for (const c of commentsOf.get(id) ?? []) {
        if (seen.has(c)) continue
        seen.add(c)
        const d = dateOf.get(c)
        if (d) hist[d.slice(0, 7)] = (hist[d.slice(0, 7)] ?? 0) + 1
      }
      return Object.fromEntries(Object.entries(hist).sort())
    }
    const findingBasis = hydrated.pages.filter((p) => p.kind === 'finding').map((p) => {
      const basedOn = workings.blocks.find((b) => b.blockId === `${p.id}.headline`)?.basedOn ?? []
      const ids = basedOn.filter((b) => b.startsWith('G')).flatMap((g) => pointInsights.get(g) ?? [])
      return { id: p.id, headline: p.blocks.find((b) => b.field === 'headline')?.text ?? '', basedOn, commentMonths: monthsOf(ids) }
    })
    const evidenceMonths = monthsOf(insightIds)

    // §0a flags over the printed text, sentence by sentence.
    const flags: { sheet: number; rule: string; sentence: string }[] = []
    sheets.forEach((text, i) => {
      for (const sentence of text.split(/(?<=[.!?])\s+|\n/).map((x) => x.trim()).filter(Boolean)) {
        for (const r of [...BANNED_PHRASES, ...BRIEF_BREAKS]) if (r.re.test(sentence)) flags.push({ sheet: i + 1, rule: r.name, sentence })
      }
    })

    const roleCalls = ledger.calls.slice(callsBefore)
    const metered = roleCalls.reduce((n, c) => n + c.usd, 0)
    const blocked = ledger.blocked.slice(blockedBefore)
    const meta = {
      role, template: template.name, clientId: CLIENT, company: signals.company, readingAt, period,
      runId: signals.runId, runDate: signals.runDate, runStatus: signals.runStatus,
      month: signals.reading?.month ?? null, monthLabel: signals.reading?.monthLabel ?? null, monthStatus: signals.reading?.monthStatus ?? null,
      researchWindow: window, previousBrief: null, thin: thinWeek(signals), runConversations: signals.run.conversations,
      settings: ctx.settings, slides: documentSlides(hydrated).map((s) => s.title),
    }
    const cost = {
      engine: { research: research.costUsd, write: written.costUsd, check: check.costUsd, total: costUsd },
      metered: { total: metered, calls: roleCalls.length, byModel: roleCalls.reduce<Record<string, number>>((m, c) => ({ ...m, [c.model]: (m[c.model] ?? 0) + c.usd }), {}) },
      spentSoFar: spentTotal(), cap: CAP,
    }
    const json = {
      meta, cost, questions,
      research: answersFrozen.map((a) => ({ ...a, grounded: a.grounded.map((p) => ({ ...p })) })),
      written: check.written, check: { verdicts: check.verdicts, dropped: check.dropped },
      document: frozen, workings: freezeQuotes(workings).data as DocumentWorkings,
      evidence: { insights: insightIds.length, comments: commentIds.length, dated: dateOf.size, commentMonths: evidenceMonths, findings: findingBasis },
      corpusMonths,
      guard: { reads: ledger.readsByPhase, blocked, blockedByPath: blocked.reduce<Record<string, number>>((m, b) => ({ ...m, [`${b.method} ${b.path}`]: (m[`${b.method} ${b.path}`] ?? 0) + 1 }), {}) },
      flags,
      timings: { ...timings, totalMs: Date.now() - started },
    }
    writeFileSync(join(OUT, `${role}.json`), `${JSON.stringify(json, null, 2)}\n`)
    writeFileSync(join(OUT, `${role}.md`), renderMarkdown({ meta, cost, sheets, answers, hydrated, figuresText: (s: string) => substituteFigures(s, hydrated.figures).map((p) => ('figure' in p ? p.figure : p.text)).join(''), evidenceMonths, findingBasis, blocked: json.guard.blockedByPath, flags }))
    console.log(`done: ${sheets.length} sheets · ${hydrated.pages.filter((p) => p.kind === 'finding').length} findings · engine $${costUsd.toFixed(3)} · metered $${metered.toFixed(3)} · total so far $${spentTotal().toFixed(3)} · blocked ${blocked.length} (${Object.entries(json.guard.blockedByPath).map(([k, v]) => `${k}×${v}`).join(', ') || 'none'}) · ${Math.round((Date.now() - started) / 1000)} s`)
  }
  console.log(`\nTOTAL metered this process $${spentHere().toFixed(3)} · with earlier runs $${spentTotal().toFixed(3)} · ${ledger.reads} Supabase reads · ${ledger.blocked.length} refused requests · ${ledger.refusedForCap} refused for the cap`)
}

function renderMarkdown(r: {
  meta: { role: string; template: string; company: string; period: string; readingAt: string; runDate: string; monthLabel: string | null; monthStatus: string | null; researchWindow: { from: string; to: string } | null; thin: boolean; runConversations: number; slides: string[] }
  cost: { engine: { research: number; write: number; check: number; total: number }; metered: { total: number; calls: number } }
  sheets: string[]
  answers: ResearchAnswer[]
  hydrated: DocumentSnapshotData
  figuresText: (s: string) => string
  evidenceMonths: Record<string, number>
  findingBasis: { id: string; headline: string; basedOn: string[]; commentMonths: Record<string, number> }[]
  blocked: Record<string, number>
  flags: { sheet: number; rule: string; sentence: string }[]
}): string {
  const m = r.meta
  const months = (h: Record<string, number>) => Object.entries(h).map(([k, v]) => `${k}: ${v}`).join(' · ') || 'none'
  const out: string[] = [
    `# ${m.template}: ${m.company} (dry draft)`,
    '',
    `Built in memory by \`scripts/brief-dry.ts\` on ${m.readingAt.slice(0, 16).replace('T', ' ')} UTC. Nothing was stored, logged, rendered to PDF or sent.`,
    '',
    `- **Period printed:** ${m.period}`,
    `- **Month the borrowed sections read:** ${m.monthLabel ?? 'none'} (${m.monthStatus ?? 'n/a'})`,
    `- **Research window (Ask agent, comment-dated):** ${m.researchWindow ? `${m.researchWindow.from} to ${m.researchWindow.to} (exclusive), 90 days` : 'all time'}`,
    `- **Writer material (concerns, personas, rivals' claims):** the latest run, ${m.runDate}${m.thin ? ` (THIN: ${m.runConversations} conversations in the run)` : ''}`,
    `- **Comments behind the research's evidence, by month:** ${months(r.evidenceMonths)}`,
    `- **Cost:** engine $${r.cost.engine.total.toFixed(3)} (research $${r.cost.engine.research.toFixed(3)}, write $${r.cost.engine.write.toFixed(3)}, check $${r.cost.engine.check.toFixed(3)}); metered at the wire $${r.cost.metered.total.toFixed(3)} over ${r.cost.metered.calls} calls`,
    `- **Writes refused by the guard:** ${Object.entries(r.blocked).map(([k, v]) => `${k} ×${v}`).join(', ') || 'none'}`,
    `- **Sheets:** ${r.sheets.length} (${m.slides.join(' · ')})`,
    '',
    '---',
    '',
    '## The brief as the deck prints it, sheet by sheet',
    '',
    '_Static text of `DocumentDeck` (the PDF\'s own component): figures substituted, quotes resolved from their refs as the render route resolves them. Charts are dropped; a table\'s cells are separated by `|`._',
    '',
  ]
  r.sheets.forEach((text, i) => { out.push(`### Sheet ${i + 1} of ${r.sheets.length}`, '', text, '', '---', '') })

  out.push('## The written pages, field by field', '', '_The same written pages straight from the composed document, labelled by field, so the writer\'s words can be read apart from the layout._', '')
  for (const p of r.hydrated.pages as DocPage[]) {
    out.push(`### ${p.title} (${p.kind}${p.meta?.sure ? `, ${p.meta.sure}` : ''})`, '')
    for (const b of p.blocks) {
      const label = b.label ? `${b.field}: ${b.label}` : b.field
      const text = b.text ? r.figuresText(b.text) : ''
      if (text) out.push(`**${label}.** ${text}`, '')
      if (b.items?.length) out.push(`**${label}:**`, ...b.items.filter(Boolean).map((x) => `- ${r.figuresText(x)}`), '')
      const q = (b as { quote?: { text?: string; english?: string | null } | null }).quote
      if (q?.text) out.push(`> "${q.english || q.text}"${q.english ? ` (translated from: "${q.text}")` : ''}`, '')
    }
  }

  out.push('---', '', '## The research behind it', '')
  for (const a of r.answers) {
    out.push(`### ${a.question.id} (${a.question.purpose}): ${a.outcome}, ${a.grounded.length} grounded points, ${a.conversationCount} conversations, $${a.costUsd.toFixed(3)}`, '', `_${a.question.text}_`, '')
    if (a.answer) out.push(a.answer, '')
    for (const p of a.grounded) out.push(`- **${p.id}** (${p.conversationCount} conversations; ${p.themeLabels.slice(0, 3).join(', ') || 'no theme'}): ${p.text}`)
    if (a.grounded.length) out.push('')
  }

  out.push('## When the evidence behind each printed finding was written', '')
  for (const f of r.findingBasis) out.push(`- **${f.headline}** (${f.basedOn.join(', ')}): ${months(f.commentMonths)}`)
  out.push('')

  out.push('## §0a flags (automatic, per sentence; read by hand in the README)', '')
  const seen = new Set<string>()
  for (const f of r.flags) {
    const key = `${f.sheet}|${f.sentence}`
    if (seen.has(key)) continue
    seen.add(key)
    const rules = r.flags.filter((x) => x.sheet === f.sheet && x.sentence === f.sentence).map((x) => x.rule)
    out.push(`- sheet ${f.sheet} [${[...new Set(rules)].join(', ')}]: ${f.sentence}`)
  }
  out.push('')
  return out.join('\n')
}

main().catch((e) => {
  console.error(e)
  console.error(`spent this process $${spentHere().toFixed(3)} · refused ${ledger.blocked.length}`)
  process.exit(1)
})
