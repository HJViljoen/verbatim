import type { SupabaseClient } from '@supabase/supabase-js'
import { DOCUMENT_BUILD_BUDGET_USD, DOCUMENT_QUESTIONS_MAX } from '../../config'
import { createSnapshot } from '../../snapshots'
import { collectQuoteRefs, freezeQuotes, resolveQuotes } from '../../renderables/quotes-freeze'
import { fetchQuoteResolutionsByRefs, type QuoteResolution } from '../../quotes'
import type { ReportRow } from '../types'
import { finishBuild } from '../build'
import { stampSnapshotReading } from '../reading-stamp'
import { CUSTOM_KEY, documentTemplate, promptVersion, resolveTemplate, type DocumentTemplate } from './templates'
import { DEFAULT_DOCUMENT_ROLE, documentSettings, isDocumentData, isDocumentRole, type DocumentRole, type DocumentSettings } from './types'
import { loadSignals, type Signals } from './signals'
import type { BriefReadingResult } from './load-reading'
import { composeQuestions, type ResearchQuestion } from './questions'
import { BuildBlockedError, runResearch, type ResearchAnswer } from './research'
import { allowedTokens, composeDocument, documentFigures, thinWeek } from './compose'
import { briefStamp } from './reading'
import { generateDocument, DOCUMENT_WRITER_MODEL, WriteFailedError } from './write-model'
import { type PreviousBrief, type WriterOutput } from './write'
import { checkDocument, type FindingVerdict } from './check'
import { completeBuild, failBuild, latestRunId, loadBuild, setBuildCost, setBuildStatus } from './builds'

/**
 * A document build as STEPS (T7, 2026-08-31): research → write → check →
 * freeze → render. Each step is a plain function, JSON in and JSON out, that
 * moves the build row's status on entry and adds its own model spend, so the
 * Inngest function (inngest/functions/build-document.ts) can run one per
 * `step.run` and the script can run them in process, the same code either way.
 *
 * SIGNALS ARE RELOADED PER STEP AND THE MONTH IS NOT. `Signals` carries a
 * closure (`trajectoryOf`) and the themes' embeddings, neither of which belongs
 * in a step's memoised output, so each step loads it. But the expensive half of
 * a signals load is not the run's themes: it is `loadBriefReading` — SIX page
 * loaders in one `Promise.all`, each 22–64 statements and 1.6–4.6 s against
 * production and each with its own `READ_CONCURRENCY = 12` (per call, not
 * global — `chunk.ts` is explicit), plus `loadRecordInputs`, `loadUpdates`, the
 * readiness rows and the switching pool. Running that three times for one
 * document put up to ~72 statements in flight from one Vercel function, three
 * times over, against the hard 5-slot Inngest concurrency this account shares
 * with the pipeline. The docstring's "≈ 7 s" predated four of those six
 * loaders and nobody has measured it since; `researchStep` is the step to
 * watch against the 300 s ceiling, because it pays a signals load AND
 * `runResearch`'s model calls in one step.
 *
 * So the month is read ONCE and carried — `ResearchOut.brief`, exactly as
 * `readingAt` is carried and for the same reason — with its quotes frozen,
 * because no comment's words may be in a memoised step output.
 *
 * Rendering is a route's job (finishBuild); no step launches Chromium.
 */

export class DocumentBuildError extends Error {}

export interface BuildContext {
  /** Null when there is no build row (the in-process script path). */
  buildId: string | null
  clientId: string
  userId: string | null
  runId: string | null
  report: ReportRow
  template: DocumentTemplate
  settings: DocumentSettings
  company: string
}

export interface ResearchOut {
  questions: ResearchQuestion[]
  answers: ResearchAnswer[]
  costUsd: number
  stoppedForBudget: boolean
  timings: Record<string, number>
  /**
   * THE INSTANT THIS BUILD READS AT, frozen once.
   *
   * `loadBriefReading` took `new Date().toISOString()` and every step reloads
   * the signals, so the period string the writer was given, the denominators
   * the method page printed and the stamp frozen onto the snapshot were three
   * reads 20-60 s apart, plus whatever an Inngest retry added. A build
   * straddling midnight on the 1st wrote to "September 2026" and froze
   * "October 2026"; a still-filling month re-read after a concurrent pipeline
   * run gave write and freeze different denominators. This is AGENTS.md's own
   * rule for a run — a window is frozen once, at open-run — applied to a
   * document, and the research step is the document's open-run: its output is
   * memoised by Inngest, so a retry of a later step re-reads the same instant.
   *
   * Optional because a build already in flight when this landed has a memoised
   * research output without it; such a build falls back to the clock, exactly
   * as it did before.
   */
  readingAt?: string
  /**
   * THE MONTH'S READING, FROZEN HERE AND CARRIED — `readingAt`'s own argument,
   * applied to the thing that argument was about.
   *
   * `loadBriefReading` is six page loaders in one `Promise.all`, each 22–64
   * statements and each with its own `READ_CONCURRENCY = 12` (which
   * `chunk.ts` is explicit is per call, not global), plus `loadRecordInputs`,
   * `loadUpdates`, the readiness rows and the switching pool. `signalsOf` ran
   * all of it in `researchStep`, again in `writeStep` and again in
   * `freezeStep` — three identical readings of one month for one document,
   * from a function with a hard 5-slot concurrency shared with the pipeline.
   * The steps are separate Inngest invocations, so the only way to read it
   * once is to carry it, which is exactly what `readingAt` already does.
   *
   * ITS QUOTES ARE REFS: the step's output is memoised and no comment's words
   * may be in it, so this is `freezeQuotes`d like the answers beside it. The
   * snapshot freezes the same fields on the way to the row, so the artefact is
   * byte-identical either way.
   *
   * Optional for the same reason `readingAt` is: a build already in flight has
   * a memoised research output without it and falls back to reading, exactly
   * as before.
   */
  brief?: BriefReadingResult
}
export interface WriteOut { written: WriterOutput; previous: PreviousBrief | null; costUsd: number; timings: Record<string, number> }
export interface CheckOut { written: WriterOutput; verdicts: FindingVerdict[]; dropped: { headline: string; reason: string }[]; flagged: boolean; brief: { answered: boolean; subjects: string[]; missed: string[] } | null; costUsd: number; timings: Record<string, number> }
export interface FreezeOut { snapshotId: string; title: string; evidenceIds: string[]; costUsd: number }
export interface RenderOut { artifactId: string; bytes: number; ms: number; url: string }

export function contextFor(args: { clientId: string; userId: string | null; report: ReportRow; company: string; runId?: string | null; buildId?: string | null }): BuildContext {
  const declared = documentTemplate(args.report.template_key)
  if (!declared) throw new DocumentBuildError(`Not a document template: ${args.report.template_key ?? 'none'}`)
  const settings = documentSettings(args.report.settings)
  // The template a build runs on is the DECLARED one composed with this
  // report's own settings (WP7d): the selected topic blocks' pages and
  // questions, and for a custom brief the role it is written in. The four
  // templates come back unchanged, by identity. Every step below reads
  // ctx.template and knows nothing about blocks.
  return {
    buildId: args.buildId ?? null,
    clientId: args.clientId,
    userId: args.userId,
    runId: args.runId ?? null,
    report: args.report,
    template: resolveTemplate(declared, settings),
    settings,
    company: args.company,
  }
}

/** The context of a build row: its report, tenant, run and company. */
export async function buildContext(admin: SupabaseClient, buildId: string): Promise<BuildContext> {
  const build = await loadBuild(admin, buildId)
  if (!build) throw new DocumentBuildError(`No such build: ${buildId}`)
  if (!build.report_id) throw new DocumentBuildError('The report of this build is gone.')
  const [{ data: report }, { data: client }] = await Promise.all([
    admin.from('reports').select('*').eq('id', build.report_id).eq('client_id', build.client_id).maybeSingle(),
    admin.from('clients').select('company_name').eq('id', build.client_id).maybeSingle(),
  ])
  if (!report) throw new DocumentBuildError('The report of this build is gone.')
  if ((report as ReportRow).kind !== 'document') throw new DocumentBuildError('Not a document report.')
  return contextFor({
    clientId: build.client_id,
    userId: build.requested_by,
    report: report as ReportRow,
    company: (client?.company_name as string | undefined) ?? '',
    runId: build.run_id,
    buildId: build.id,
  })
}

const mark = async (admin: SupabaseClient, ctx: BuildContext, status: 'researching' | 'writing' | 'checking' | 'rendering', patch?: Parameters<typeof setBuildStatus>[3]) => {
  if (ctx.buildId) await setBuildStatus(admin, ctx.buildId, status, patch)
}
/** The build's spend so far, written as an absolute number so a retried
 *  step cannot count itself twice. */
const spend = async (admin: SupabaseClient, ctx: BuildContext, totalUsd: number) => {
  if (ctx.buildId) await setBuildCost(admin, ctx.buildId, totalUsd)
}
/** Which of the four voices writes this brief — and, since WP19, which
 *  section map it is composed from. The four fixed templates ARE their role;
 *  a custom brief names one in its settings. */
export const roleOf = (template: Pick<DocumentTemplate, 'key'>, settings: DocumentSettings): DocumentRole =>
  isDocumentRole(template.key) ? template.key : (settings.role ?? DEFAULT_DOCUMENT_ROLE)

const signalsOf = (admin: SupabaseClient, ctx: BuildContext, now?: string, brief?: BriefReadingResult) =>
  loadSignals(admin, { clientId: ctx.clientId, runId: ctx.runId, settings: ctx.settings, role: roleOf(ctx.template, ctx.settings), now, brief })

/**
 * The brief reading back out of the signals that were just loaded.
 *
 * `Signals` is `BriefReadingResult` spread flat plus everything else a build
 * needs; this puts the six fields back into the shape `loadSignals` takes, so
 * one step's read is the next step's input. `slideFigures` is nullable on
 * `Signals` (a reading that could not be loaded at all) and is required on the
 * result, so a null there means there is nothing worth carrying and the next
 * step reads for itself.
 */
function briefOf(s: Signals): BriefReadingResult | undefined {
  if (!s.slideFigures) return undefined
  const brief: BriefReadingResult = {
    reading: s.reading,
    surfaces: s.surfaces,
    missing: s.missing,
    map: s.map,
    sections: s.sections,
    slideFigures: s.slideFigures,
  }
  // AND IT IS NOT CARRIED AT ANY SIZE. A step's output is memoised by the
  // runner and has a ceiling; `surfaces` is six page loaders' whole output and
  // is the one field here with no bound on it. Over the limit the build reads
  // the month again in the next step — slower, and exactly what it did before
  // — rather than failing on a payload. The step's cost of finding out is one
  // `JSON.stringify` of data already in memory.
  return JSON.stringify(brief).length > CARRIED_BRIEF_MAX_BYTES ? undefined : brief
}

/** How much of a month's reading a step may hand the next one. Well under any
 *  step-output ceiling, and far above what either live tenant produces. */
export const CARRIED_BRIEF_MAX_BYTES = 1_000_000

export async function researchStep(admin: SupabaseClient, ctx: BuildContext): Promise<ResearchOut> {
  await mark(admin, ctx, 'researching')
  const timings: Record<string, number> = {}
  // Frozen here and carried, never re-read: see ResearchOut.readingAt.
  const readingAt = new Date().toISOString()
  let t0 = Date.now()
  const signals = await signalsOf(admin, ctx, readingAt)
  timings.signals = Date.now() - t0
  const questions = composeQuestions(ctx.template, signals, ctx.settings, DOCUMENT_QUESTIONS_MAX)
  t0 = Date.now()
  const research = await runResearch(admin, { clientId: ctx.clientId, companyName: signals.company, runId: signals.runId, questions, budgetUsd: DOCUMENT_BUILD_BUDGET_USD })
  timings.research = Date.now() - t0
  await spend(admin, ctx, research.costUsd)
  // The step's output is memoised by Inngest, so no comment's words may be in
  // it (AGENTS.md): quotes leave as refs with empty text; freezeStep resolves
  // them again for the picker.
  const answers = freezeQuotes(research.answers).data as ResearchAnswer[]
  // The month, carried rather than re-read by the two steps after this one —
  // and frozen under the same rule the answers above are.
  const brief = freezeQuotes(briefOf(signals)).data
  return { questions, answers, costUsd: research.costUsd, stoppedForBudget: research.stoppedForBudget, timings, readingAt, brief }
}

export async function writeStep(admin: SupabaseClient, ctx: BuildContext, r: Pick<ResearchOut, 'answers' | 'costUsd' | 'readingAt' | 'brief'>): Promise<WriteOut> {
  await mark(admin, ctx, 'writing')
  const signals = await signalsOf(admin, ctx, r.readingAt, r.brief)
  const figures = documentFigures(signals, r.answers)
  const period = briefPeriod(signals)
  const previous = await previousBrief(admin, ctx.report)
  const t0 = Date.now()
  const written = await generateDocument(admin, {
    clientId: ctx.clientId, runId: signals.runId,
    template: ctx.template, settings: ctx.settings, company: signals.company, period, reader: ctx.report.cover?.reader ?? null,
    figures, signals, answers: r.answers, previous, thin: thinWeek(signals), allow: allowedTokens(signals, r.answers),
  })
  await spend(admin, ctx, r.costUsd + written.costUsd)
  return { written: written.written, previous, costUsd: written.costUsd, timings: { write: Date.now() - t0 } }
}

export async function checkStep(admin: SupabaseClient, ctx: BuildContext, w: Pick<WriteOut, 'written'>, priorCostUsd = 0): Promise<CheckOut> {
  await mark(admin, ctx, 'checking')
  const runId = ctx.runId ?? (await latestRunId(admin, ctx.clientId))
  if (!runId) throw new DocumentBuildError('No finished run to check against.')
  const t0 = Date.now()
  // The operator's own brief is checked here too (WP7d): a custom brief that
  // was not answered flags the build for review, like a dropped finding.
  // Only a custom brief has an operator brief to answer: a fixed template's
  // brief is the template's own, and must never flag its build.
  const brief = ctx.template.key === CUSTOM_KEY ? ctx.settings.brief : undefined
  const out = await checkDocument(admin, { clientId: ctx.clientId, runId, companyName: ctx.company, written: w.written, brief })
  await spend(admin, ctx, priorCostUsd + out.costUsd)
  if (out.flagged) await mark(admin, ctx, 'checking', { needs_review: true })
  return { written: out.written, verdicts: out.verdicts, dropped: out.dropped, flagged: out.flagged, brief: out.brief, costUsd: out.costUsd, timings: { check: Date.now() - t0 } }
}

export async function freezeStep(
  admin: SupabaseClient,
  ctx: BuildContext,
  args: { answers: ResearchAnswer[]; written: WriterOutput; check: Pick<CheckOut, 'verdicts' | 'dropped' | 'brief'> | null; costUsd: number; timings: Record<string, number>; readingAt?: string; reading?: BriefReadingResult },
): Promise<FreezeOut> {
  // A retried step must not freeze twice: the row already names its snapshot.
  if (ctx.buildId) {
    const row = await loadBuild(admin, ctx.buildId)
    if (row?.snapshot_id) {
      const { data: snap } = await admin.from('report_snapshots').select('id, title, evidence_ids').eq('id', row.snapshot_id).maybeSingle()
      if (snap) return { snapshotId: snap.id as string, title: (snap.title as string) ?? '', evidenceIds: (snap.evidence_ids as string[]) ?? [], costUsd: args.costUsd }
    }
  }
  // The quote picker judges words (readsAsHeroQuote); the step boundary
  // stripped them, so resolve the refs once, in memory, never stored.
  //
  // `onReadError: 'throw'` because this is the one caller of that function
  // COMPOSING an artefact rather than rendering one, and it runs inside a step
  // that retries. Everywhere else the degrade is right — a digest send or a
  // share link is a one-shot render of numbers that are already final, and a
  // few missing quotes beat no render at all. Here the snapshot IS the record:
  // a document frozen from a thinner pool than the build asked for is wrong
  // for ever, and nothing on the page would say so.
  const refs = collectQuoteRefs(args.answers)
  const texts = refs.length ? await fetchQuoteResolutionsByRefs(admin, refs, { onReadError: 'throw' }) : new Map<string, QuoteResolution>()
  const answers = resolveQuotes(args.answers, texts) as ResearchAnswer[]
  const signals = await signalsOf(admin, ctx, args.readingAt, args.reading)
  const figures = documentFigures(signals, answers)
  const period = briefPeriod(signals)
  const title = ctx.report.cover?.title?.trim() || ctx.report.title || ctx.template.name
  const check = args.check
    ? {
        verdicts: Object.fromEntries(args.check.verdicts.filter((v) => v.verdict !== 'contradicts').map((v) => [v.headline, v.verdict as 'echoes' | 'silent'])),
        dropped: args.check.dropped,
        // Why a build asks to be read, when no finding was dropped (WP7d).
        brief: args.check.brief ?? null,
      }
    : null
  const { data, workings } = composeDocument({
    template: ctx.template, settings: ctx.settings, reportId: ctx.report.id, title, period, signals, answers, written: args.written, figures,
    model: DOCUMENT_WRITER_MODEL, promptVersion: promptVersion(ctx.template), costUsd: args.costUsd, timings: args.timings, check,
  })
  const fullTitle = `${title} · ${signals.company}`
  const snap = await createSnapshot(admin, {
    clientId: ctx.clientId,
    userId: ctx.userId,
    kind: 'report',
    ref: { reportId: ctx.report.id || undefined, params: {} },
    title: fullTitle,
    runId: signals.runId,
    data,
    workings,
    reportId: ctx.report.id || null,
  })
  // WHAT THIS BRIEF IS A READING OF, ON THE ROW (M9).
  //
  // M9's own comment promises it — "WP19 re-bases those on the monthly reading
  // and they will carry a basis from then on" — and nothing stamped a brief, so
  // all four provenance columns stayed null for ever. The backfill cannot
  // rescue them either: WP19 puts the instant at `data.reading.readingAt` while
  // the backfill reads the top-level `data->>readingAt`.
  //
  // NON-FATAL, the `stampSnapshotReading` contract: the brief is already
  // stored, the reading is already inside `data`, and the columns are what make
  // it queryable rather than what make it true. A build must not fail because
  // M9 has not been applied.
  if (signals.reading) {
    try {
      await stampSnapshotReading(admin, ctx.clientId, snap.id, {
        readingAt: signals.reading.readingAt,
        month: signals.reading.month,
        monthStatus: signals.reading.monthStatus,
        windowBasis: 'month',
      })
    } catch (error) {
      console.warn('[documents] could not stamp the brief’s reading', error)
    }
  }
  if (ctx.buildId) await setBuildStatus(admin, ctx.buildId, 'checking', { snapshot_id: snap.id })
  return { snapshotId: snap.id, title: fullTitle, evidenceIds: snap.evidenceIds, costUsd: args.costUsd }
}

/** The render, in a route or a script, never in a step. */
export async function renderStep(admin: SupabaseClient, ctx: BuildContext, f: Pick<FreezeOut, 'snapshotId' | 'title'>, baseUrl: string): Promise<RenderOut> {
  if (ctx.buildId) {
    const row = await loadBuild(admin, ctx.buildId)
    if (row?.status === 'failed') throw new DocumentBuildError('This build was given up on; a newer one may be running.')
    if (row?.status === 'done' && row.artifact_id) {
      const { data: art } = await admin.from('artifacts').select('id, bytes').eq('id', row.artifact_id).maybeSingle()
      if (art) return { artifactId: art.id as string, bytes: (art.bytes as number) ?? 0, ms: 0, url: '' }
    }
  }
  await mark(admin, ctx, 'rendering')
  const out = await finishBuild(admin, { clientId: ctx.clientId, userId: ctx.userId, reportId: ctx.report.id, snapshotId: f.snapshotId, title: f.title, baseUrl })
  if (ctx.buildId) await completeBuild(admin, ctx.buildId, { artifact_id: out.artifact.id, snapshot_id: f.snapshotId })
  return { artifactId: out.artifact.id, bytes: out.artifact.bytes, ms: out.ms, url: out.url }
}

/** All the steps, in process (the script; a tenant without Inngest). Marks
 *  the row failed on any throw and rethrows. */
export async function runBuildInProcess(
  admin: SupabaseClient,
  ctx: BuildContext,
  opts: { baseUrl: string; check?: boolean; log?: (line: string) => void },
): Promise<{ research: ResearchOut; write: WriteOut; check: CheckOut | null; freeze: FreezeOut; render: RenderOut }> {
  const log = opts.log ?? (() => {})
  try {
    const research = await researchStep(admin, ctx)
    log(`research: ${research.answers.length} answers · $${research.costUsd.toFixed(3)} · ${research.timings.research} ms`)
    const write = await writeStep(admin, ctx, research)
    log(`write: ${write.written.findings.length} findings · $${write.costUsd.toFixed(3)} · ${write.timings.write} ms`)
    const check = opts.check === false ? null : await checkStep(admin, ctx, write, research.costUsd + write.costUsd)
    if (check) log(`check: ${check.verdicts.map((v) => v.verdict).join(', ') || 'nothing to check'} · dropped ${check.dropped.length}${check.brief ? ` · brief ${check.brief.answered ? 'answered' : `UNANSWERED (nothing on ${check.brief.missed.join(', ')})`}` : ''} · $${check.costUsd.toFixed(3)} · ${check.timings.check} ms`)
    const costUsd = research.costUsd + write.costUsd + (check?.costUsd ?? 0)
    const timings = { ...research.timings, ...write.timings, ...(check?.timings ?? {}) }
    const freeze = await freezeStep(admin, ctx, { answers: research.answers, written: check?.written ?? write.written, check, costUsd, timings, readingAt: research.readingAt, reading: research.brief })
    log(`freeze: snapshot ${freeze.snapshotId.slice(0, 8)} · ${freeze.evidenceIds.length} evidence refs`)
    const render = await renderStep(admin, ctx, freeze, opts.baseUrl)
    log(`render: ${render.bytes} bytes · ${render.ms} ms`)
    return { research, write, check, freeze, render }
  } catch (e) {
    if (ctx.buildId) await failBuild(admin, ctx.buildId, plainBuildMessage(e)).catch(() => {})
    throw e
  }
}

/** What a tenant may read about a failure: the known classes carry
 *  calibrated words; anything else stays in the logs. */
export function plainBuildMessage(e: unknown): string {
  if (e instanceof BuildBlockedError || e instanceof WriteFailedError || e instanceof DocumentBuildError) return e.message
  console.error('[documents] build failed:', e)
  return 'The build failed. Try again, or tell us if it keeps happening.'
}

/** The report's latest document build, for continuity: its summary and its
 *  finding headlines. Null on a first build or when the report has none. */
export async function previousBrief(admin: SupabaseClient, report: Pick<ReportRow, 'id' | 'client_id' | 'latest_snapshot_id'>): Promise<PreviousBrief | null> {
  // The last brief anyone SAW: reports.latest_snapshot_id is set when a build
  // printed, so a freeze that never rendered does not steer continuity.
  if (!report.id || !report.latest_snapshot_id) return null
  const { data } = await admin
    .from('report_snapshots')
    .select('data')
    .eq('id', report.latest_snapshot_id)
    .eq('client_id', report.client_id)
    .maybeSingle()
  const d = (data as { data?: unknown } | null)?.data
  if (!isDocumentData(d)) return null
  const summary = d.pages.find((p) => p.kind === 'in_short')?.blocks.find((b) => b.field === 'summary')?.text ?? ''
  const headlines = d.pages.filter((p) => p.kind === 'finding').map((p) => p.blocks.find((b) => b.field === 'headline')?.text ?? '').filter(Boolean)
  if (!summary && !headlines.length) return null
  return { summary, headlines }
}

/**
 * The period a brief prints (Phase 1 WP19, item 43).
 *
 * "Update of 30 Aug 2026" was the period on every brief, on its method page and
 * in its email — a run's own bookkeeping, printed as the thing the numbers are
 * about. A brief whose numbers are a month's cannot keep it. Where there is a
 * monthly reading the period is the month, the instant it was read and, while
 * the month is still filling, the day it stops moving; where there is none the
 * old string stands, because a brief that says "September 2026" over update
 * figures would be the same lie the other way round.
 */
export function briefPeriod(signals: Pick<Signals, 'reading' | 'runDate'>): string {
  return signals.reading ? briefStamp(signals.reading) : periodOf(signals.runDate)
}

/** "Update of 30 Aug 2026" — the basis a brief with no monthly reading has. */
export function periodOf(runDate: string): string {
  const d = new Date(runDate)
  if (Number.isNaN(d.getTime())) return 'This update'
  return `Update of ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
}
