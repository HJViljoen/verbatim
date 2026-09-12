import { createAdminClient, selectAll } from '../lib/supabase-admin'
import { chunk } from '../lib/chunk'
import { adapters } from '../lib/gather/platforms'
import type { Platform, RawItem } from '../lib/gather/types'
import {
  buildOcrPrompt, canBackfillOcr, canOcr, normaliseOcrLines, ocrBackfillBatch, ocrCoverFrame, needsOcr,
} from '../lib/pipeline/ocr'
import {
  MODEL_PRICING, OCR_BACKFILL_CAP, OCR_BATCH, OCR_MODEL, SEALAND_CLIENT_ID,
} from '../lib/config'

// On-screen-text inspector and YouTube backfill (WP7b, 2026-09-12).
//
// Dry-run by default: it prints, per platform, what has been read, what is
// still unread, and what reading the rest would cost — and it spends nothing.
//
//   node --env-file=.env.local --import tsx scripts/ocr-videos.ts [--client <uuid>]
//   node --env-file=.env.local --import tsx scripts/ocr-videos.ts --client <uuid> --probe --limit 4 [--platform tiktok]
//   node --env-file=.env.local --import tsx scripts/ocr-videos.ts --client <uuid> --apply --limit 50
//
// THE ASYMMETRY THIS SCRIPT EXISTS TO MAKE VISIBLE: only YouTube can be
// backfilled. Its cover is https://i.ytimg.com/vi/<id>/hqdefault.jpg, derived
// from the id and durable. TikTok's `video.cover` and Instagram's `displayUrl`
// are signed CDN links stored inside video_raw, and they expire within days —
// the same wall transcription hit in production (468 of 574 Sealand Instagram
// videos with a NULL transcript). So for those two the dry run REPORTS
// reachability rather than offering to fix it: it HEADs up to REACH_SAMPLE of
// the stored covers and tells you how many still answer. Reading their history
// would mean re-fetching every video through Apify at ~$0.05 a head, which is a
// separate, costed decision — not something a script should slip into.
//
// --probe spends on the model and writes NOTHING (no videos row, no
// ai_call_log): it prints the lines the model read off each cover so they can be
// compared against the actual image. That is the bounded live check.
// --apply writes, and is YouTube-only for the reason above.

/** Covers HEADed to estimate how much of the TikTok/Instagram backlog is still
 *  reachable. Twenty is enough to tell "basically all" from "basically none",
 *  which is the only question being asked, and it keeps the check free. */
const REACH_SAMPLE = 20

/** How deep --probe looks for videos that still have a cover, on the platforms
 *  whose urls expire. The probe judges READ QUALITY; unreachable rows are the
 *  dry-run table's subject, not its. */
const PROBE_WINDOW = 400

const PLATFORMS: Platform[] = ['tiktok', 'instagram', 'youtube']

export function parseArgs(argv: string[]): {
  clientId: string; limit: number | null; apply: boolean; probe: boolean; platform: Platform | null
} {
  const args = {
    clientId: SEALAND_CLIENT_ID as string,
    limit: null as number | null,
    apply: false,
    probe: false,
    platform: null as Platform | null,
  }
  let named = false
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--client') { args.clientId = argv[++i]; named = true }
    else if (argv[i] === '--limit') args.limit = Number(argv[++i])
    else if (argv[i] === '--apply') args.apply = true
    else if (argv[i] === '--probe') args.probe = true
    else if (argv[i] === '--platform') {
      const p = argv[++i] as Platform
      if (!PLATFORMS.includes(p)) throw new Error(`--platform must be one of ${PLATFORMS.join(', ')}`)
      args.platform = p
    } else throw new Error(`unknown flag: ${argv[i]}`)
  }
  if (args.limit !== null && (!Number.isInteger(args.limit) || args.limit < 1)) throw new Error('--limit must be a positive integer')
  if (args.apply && args.probe) throw new Error('--apply and --probe are different things: one writes, one does not')
  // Spending defaults are not defaults (translate-transcripts.ts's rule). Both
  // paths call a paid model, so both say which tenant and how many, out loud.
  for (const [flag, on] of [['--apply', args.apply], ['--probe', args.probe]] as const) {
    if (on && !named) throw new Error(`${flag} requires an explicit --client <uuid> — it spends on a real tenant`)
    if (on && args.limit === null) throw new Error(`${flag} requires an explicit --limit N — it spends per image`)
  }
  return args
}

// Cost is a RANGE, not a number, and deliberately so (translate-transcripts.ts's
// rule). gpt-4.1-mini prices an image by its PIXEL DIMENSIONS — it ignores
// `detail: 'low'`, measured live 2026-09-12 — so what a cover costs depends on
// what resolution the platform serves, and that varies 10x within Instagram
// alone. Quoting one number would understate the corpus this script exists to
// price. Billing is the truth; these are bounds, taken from eight real covers:
//
//   youtube hqdefault 480x360   576 prompt tokens        $0.00024 - $0.00029
//   instagram p360x360          673 prompt tokens        $0.00030
//   instagram e15 cover frame  4121 prompt tokens        $0.00165
//   instagram full-resolution  5676 prompt tokens        $0.00241 - $0.00341
//
// OpenAI's own patch cap is what bounds the top end; nothing here can exceed it.
const IMAGE_TOKENS: Record<Platform, { lo: number; hi: number }> = {
  // Every YouTube cover is the same hqdefault, so its range is a point.
  youtube: { lo: 311, hi: 311 },
  // The two scraped platforms serve whatever the poster uploaded.
  instagram: { lo: 400, hi: 5400 },
  tiktok: { lo: 400, hi: 5400 },
  reddit: { lo: 0, hi: 0 },
}
/** Output: a few short lines wrapped in JSON, but a cover dense with body copy
 *  measured 714 completion tokens, so the high end allows for one. */
const COMPLETION_TOKENS = { lo: 10, hi: 400 }

function estPerCall(platform: Platform): { lo: number; hi: number } {
  const price = MODEL_PRICING[OCR_MODEL]
  if (!price) throw new Error(`no MODEL_PRICING for ${OCR_MODEL}`)
  const { system, user } = buildOcrPrompt()
  const textTokens = Math.ceil((system.length + user.length) / 4)
  const img = IMAGE_TOKENS[platform]
  const usd = (imgTokens: number, out: number) =>
    ((textTokens + imgTokens) / 1e6) * price.inputPer1M + (out / 1e6) * price.outputPer1M
  return { lo: usd(img.lo, COMPLETION_TOKENS.lo), hi: usd(img.hi, COMPLETION_TOKENS.hi) }
}

interface VideoRowLite {
  id: string
  platform: string
  video_id: string
  video_url: string | null
  comments_count: number | null
  ocr_status: string | null
}

/** True once the migration has been applied. Until then every video is
 *  unread by definition, and the dry run is still the number that matters —
 *  this script's whole job is to say what reading the corpus WOULD cost, and
 *  that answer must not depend on the schema change having landed first. */
let ocrColumnExists = true

async function loadVideos(clientId: string): Promise<VideoRowLite[]> {
  const admin = createAdminClient()
  try {
    return await selectAll<VideoRowLite>(() =>
      admin.from('videos')
        .select('id, platform, video_id, video_url, comments_count, ocr_status')
        .eq('client_id', clientId)
        .in('platform', PLATFORMS)
        .order('id', { ascending: true }),
    )
  } catch (e) {
    if (!/ocr_status/.test(e instanceof Error ? e.message : String(e))) throw e
    ocrColumnExists = false
    console.log('\nNOTE: videos.ocr_status does not exist yet — the migration has not been applied. Every video counts as unread below.')
    const rows = await selectAll<Omit<VideoRowLite, 'ocr_status'>>(() =>
      admin.from('videos')
        .select('id, platform, video_id, video_url, comments_count')
        .eq('client_id', clientId)
        .in('platform', PLATFORMS)
        .order('id', { ascending: true }),
    )
    return rows.map((v) => ({ ...v, ocr_status: null }))
  }
}

/** The newest stored raw item per video id, for one platform — the only place a
 *  TikTok/Instagram cover URL exists at all. */
async function loadCovers(clientId: string, platform: Platform, videoIds: string[]): Promise<Map<string, string>> {
  const admin = createAdminClient()
  const adapter = adapters[platform]
  const out = new Map<string, string>()
  if (!canOcr(adapter)) return out
  for (const part of chunk(videoIds, 100)) {
    const rows = await selectAll<{ video_id: string; raw: RawItem }>(() =>
      admin.from('video_raw')
        .select('video_id, raw')
        .eq('client_id', clientId)
        .eq('platform', platform)
        .in('video_id', part)
        // Ascending, so the LAST row written for a video wins — the most
        // recently captured item carries the least-expired cover.
        .order('id', { ascending: true }),
    )
    for (const r of rows) {
      const url = adapter.coverUrl!(r.raw)
      if (url) out.set(r.video_id, url)
    }
  }
  return out
}

/** How many of a sample of covers still answer. A HEAD is free and settles the
 *  only question: is this backlog reachable at all, or has it expired? */
async function reachable(urls: string[]): Promise<{ tried: number; alive: number; firstStatus: string }> {
  const sample = urls.slice(0, REACH_SAMPLE)
  let alive = 0
  let firstStatus = ''
  for (const url of sample) {
    try {
      const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(10_000) })
      if (res.ok) alive++
      else if (!firstStatus) firstStatus = String(res.status)
    } catch (e) {
      if (!firstStatus) firstStatus = e instanceof Error ? e.message.slice(0, 60) : 'fetch failed'
    }
  }
  return { tried: sample.length, alive, firstStatus }
}

async function report(clientId: string): Promise<Map<Platform, VideoRowLite[]>> {
  const videos = await loadVideos(clientId)
  const pending = new Map<Platform, VideoRowLite[]>()
  let loTotal = 0
  let hiTotal = 0

  console.log(`\nclient ${clientId}`)
  console.log(`model ${OCR_MODEL} · cost per cover is a RANGE: this model prices an image by its pixel size, so it moves with what the platform serves\n`)
  console.log('platform     videos      ok    none  no_img  failed   unread    est $ low   est $ high   backfillable')
  for (const platform of PLATFORMS) {
    const est = estPerCall(platform)
    const rows = videos.filter((v) => v.platform === platform)
    const by = (s: string) => rows.filter((v) => v.ocr_status === s).length
    const unread = rows.filter(needsOcr)
    // Richest-first, the order the plan steps use, so --probe/--apply take the
    // same videos a run would.
    unread.sort((a, b) => (b.comments_count ?? 0) - (a.comments_count ?? 0) || a.video_id.localeCompare(b.video_id))
    pending.set(platform, unread)
    const backfillable = canBackfillOcr(adapters[platform]) ? 'yes (durable url)' : 'no (signed url)'
    loTotal += unread.length * est.lo
    hiTotal += unread.length * est.hi
    console.log(
      `${platform.padEnd(11)}${String(rows.length).padStart(7)}${String(by('ok')).padStart(8)}` +
      `${String(by('none')).padStart(8)}${String(by('no_image')).padStart(8)}${String(by('failed')).padStart(8)}` +
      `${String(unread.length).padStart(9)}${('$' + (unread.length * est.lo).toFixed(2)).padStart(12)}${('$' + (unread.length * est.hi).toFixed(2)).padStart(13)}   ${backfillable}`,
    )
  }
  const totalUnread = [...pending.values()].reduce((n, r) => n + r.length, 0)
  console.log(`${'total'.padEnd(11)}${String(videos.length).padStart(7)}${''.padStart(32)}${String(totalUnread).padStart(9)}${('$' + loTotal.toFixed(2)).padStart(12)}${('$' + hiTotal.toFixed(2)).padStart(13)}`)

  // Reachability, for the two platforms whose covers expire. This is the number
  // that decides whether their backlog is worth anything at all.
  for (const platform of PLATFORMS) {
    if (canBackfillOcr(adapters[platform])) continue
    const unread = pending.get(platform) ?? []
    if (!unread.length) continue
    const covers = await loadCovers(clientId, platform, unread.map((v) => v.video_id))
    const r = await reachable([...covers.values()])
    console.log(
      `\n${platform}: ${covers.size} of ${unread.length} unread videos still have a stored cover url; ` +
      `${r.alive}/${r.tried} sampled urls still answer${r.firstStatus ? ` (first failure: ${r.firstStatus})` : ''}.`,
    )
    if (r.tried && r.alive === 0) {
      console.log(`  → expired, as designed. ${platform} covers are only readable during the run that gathered them; the wave does that from now on.`)
    }
  }

  const yt = pending.get('youtube') ?? []
  if (yt.length) {
    console.log(`\nyoutube backfill: ${yt.length} unread · one run reads at most ${OCR_BACKFILL_CAP} (${Math.ceil(Math.min(yt.length, OCR_BACKFILL_CAP) / OCR_BATCH)} steps of ${OCR_BATCH}) · ${Math.max(0, yt.length - OCR_BACKFILL_CAP)} would wait for the next run`)
  }
  return pending
}

/** Read covers through the model and print what came back. Writes NOTHING —
 *  not the videos row, not ai_call_log — so it can be pointed at a live tenant
 *  to judge quality before anything is stored. */
async function probe(clientId: string, unread: VideoRowLite[], platform: Platform, limit: number): Promise<void> {
  const adapter = adapters[platform]
  // Only videos that actually HAVE a cover are worth a probe: this is a quality
  // check on what the model reads, and spending the limit on rows whose signed
  // url expired months ago measures nothing. The dry-run table above is where
  // "how much of the backlog is unreachable" is already answered.
  const window = canBackfillOcr(adapter) ? unread.slice(0, limit) : unread.slice(0, PROBE_WINDOW)
  const covers = canBackfillOcr(adapter)
    ? new Map(window.map((v) => [v.video_id, adapter.coverUrlById!(v.video_id)]))
    : await loadCovers(clientId, platform, window.map((v) => v.video_id))
  const rows = window.filter((v) => covers.has(v.video_id)).slice(0, limit)
  if (!rows.length) {
    console.log(`\nprobe ${platform}: none of the ${window.length} richest unread videos still has a stored cover url.`)
    return
  }

  console.log(`\nPROBE ${platform}: ${rows.length} cover(s) through ${OCR_MODEL}. Real money, no writes.\n`)
  const price = MODEL_PRICING[OCR_MODEL]!
  let spent = 0
  for (const v of rows) {
    const url = covers.get(v.video_id) ?? null
    if (!url) {
      console.log(`- ${platform} ${v.video_id} · ${v.video_url ?? ''}\n  status: no_image (no stored cover url)\n`)
      continue
    }
    try {
      const r = await ocrCoverFrame(url)
      const text = normaliseOcrLines(r.lines)
      const usd = (r.usage.prompt_tokens / 1e6) * price.inputPer1M + (r.usage.completion_tokens / 1e6) * price.outputPer1M
      spent += usd
      console.log(`- ${platform} ${v.video_id} · ${v.video_url ?? ''}`)
      console.log(`  cover: ${url}`)
      console.log(`  status: ${text ? 'ok' : 'none'} · ${r.usage.prompt_tokens}+${r.usage.completion_tokens} tok · $${usd.toFixed(5)} · ${r.durationMs}ms`)
      console.log(text ? text.split('\n').map((l) => `    | ${l}`).join('\n') : '    (no legible text)')
      console.log('')
    } catch (e) {
      console.log(`- ${platform} ${v.video_id}\n  status: failed — ${e instanceof Error ? e.message.slice(0, 200) : String(e)}\n`)
    }
  }
  const est = estPerCall(platform)
  console.log(`probe total: $${spent.toFixed(5)} · estimated range was $${(est.lo * rows.length).toFixed(5)}-$${(est.hi * rows.length).toFixed(5)} for ${rows.length}`)
}

async function main() {
  const { clientId, limit, apply, probe: doProbe, platform } = parseArgs(process.argv.slice(2))
  const pending = await report(clientId)
  const targets = platform ? [platform] : PLATFORMS

  if (doProbe) {
    for (const p of targets) {
      const unread = pending.get(p) ?? []
      if (unread.length) await probe(clientId, unread, p, limit!)
      else console.log(`\nprobe ${p}: nothing unread.`)
    }
    console.log('\nnothing written — probe reads the model, not the database.')
    return
  }

  if (apply) {
    if (!ocrColumnExists) throw new Error('videos.ocr_status does not exist — apply supabase/migrations/20260912100000_ocr_text.sql first')
    // YouTube only, and loudly so: TikTok and Instagram have no durable cover,
    // so "backfilling" them would mean reading expired urls and writing
    // 'no_image' across the history — a permanent wrong answer, since every
    // status is terminal.
    const refused = targets.filter((p) => !canBackfillOcr(adapters[p]))
    for (const p of refused) console.log(`\nskipping ${p}: no durable cover url — its covers are only readable during the run that gathered them.`)
    if (!targets.includes('youtube')) { console.log('\nnothing to apply.'); return }
    const rows = (pending.get('youtube') ?? []).slice(0, limit!)
    if (!rows.length) { console.log('\nnothing to apply.'); return }
    console.log(`\nAPPLY: reading ${rows.length} youtube cover(s) with ${OCR_MODEL} — this spends real money and writes.\n`)
    let n = 0
    const totals = { ok: 0, none: 0, noImage: 0, failed: 0, cost: 0 }
    for (const batch of chunk(rows.map((v) => v.video_id), OCR_BATCH)) {
      n++
      const r = await ocrBackfillBatch({ clientId, runId: null, videoIds: batch, batchNo: n })
      totals.ok += r.ok
      totals.none += r.none
      totals.noImage += r.noImage
      totals.failed += r.failed
      totals.cost += r.costUsd
      console.log(`  batch ${n}: ${r.ok} with text · ${r.none} no text · ${r.failed} failed · $${r.costUsd.toFixed(4)}`)
      for (const e of r.errors) console.log(`    ! ${e}`)
    }
    console.log(`\ntotal: ${totals.ok} with text · ${totals.none} no legible text · ${totals.noImage} no cover · ${totals.failed} failed · $${totals.cost.toFixed(4)} actual`)
    return
  }

  console.log('\ndry run — nothing read, nothing written. Add --probe (reads the model, writes nothing) or --apply (youtube backfill), each with --limit.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
