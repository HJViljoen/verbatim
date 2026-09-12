import { createAdminClient, selectAll } from '../lib/supabase-admin'
import { chunk } from '../lib/chunk'
import { clipText } from '../lib/gather/transcript'
import { needsTranslation, isEnglishLang, translateBatch, planTranslation, type TranslatableVideo } from '../lib/pipeline/translate'
import { usableTranscript, usableTranslation } from '../lib/pipeline/transcript-input'
import { buildUserPrompt } from '../lib/pipeline/pass-a'
import {
  MODEL_PRICING, SEALAND_CLIENT_ID, TRANSCRIPT_PROMPT_CHARS, TRANSLATE_BATCH, TRANSLATE_CAP, TRANSLATE_MODEL,
} from '../lib/config'
import type { VideoRow } from '../lib/pipeline/types'

// Transcript translation inspector and backfill (WP6, 2026-09-11).
//
// This is the measurement the 2026-08-08 decision asked for ("build translation
// only if measurement demands it") — nobody ever ran it, because no script
// grouped transcript_lang by client. Dry-run by default: it prints the language
// mix of the untranslated backlog and what translating it would cost, and
// spends nothing. --apply translates up to --limit videos and writes the rows.
//
//   node --env-file=.env.local --import tsx scripts/translate-transcripts.ts [--client <uuid>] [--limit N] [--apply] [--prompt]
//
// --prompt assembles the Pass A user prompt for one already-translated video
// and prints its SHAPE with the texts elided, so the two-block wiring can be
// checked without putting client transcript text on a terminal or in a file.
//
// Token estimates are a RANGE, not a number, and deliberately so: OpenAI's
// tokenizer costs Latin text about 4 characters a token and Chinese, Telugu or
// Arabic closer to 1.5, and this backlog is mostly the second kind. Quoting a
// single chars/4 figure would under-state the non-English corpus — the one
// corpus this script exists for — by roughly 2.5x. Billing is the truth; this
// is a bound.

export function parseArgs(argv: string[]): { clientId: string; limit: number | null; apply: boolean; prompt: boolean } {
  const args = { clientId: SEALAND_CLIENT_ID as string, limit: null as number | null, apply: false, prompt: false }
  let named = false
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--client') { args.clientId = argv[++i]; named = true }
    else if (argv[i] === '--limit') args.limit = Number(argv[++i])
    else if (argv[i] === '--apply') args.apply = true
    else if (argv[i] === '--prompt') args.prompt = true
    else throw new Error(`unknown flag: ${argv[i]}`)
  }
  if (args.limit !== null && (!Number.isInteger(args.limit) || args.limit < 1)) throw new Error('--limit must be a positive integer')
  // Spending defaults are not defaults. Dry-run may fall back to Sealand and
  // read the whole backlog; --apply writes gpt-4.1 output to a real tenant, so
  // it says which tenant and how many, out loud, every time.
  if (args.apply && !named) throw new Error('--apply requires an explicit --client <uuid> — it writes to a real tenant')
  if (args.apply && args.limit === null) throw new Error('--apply requires an explicit --limit N — it spends per video')
  return args
}

const CHARS_PER_TOKEN_LATIN = 4
const CHARS_PER_TOKEN_OTHER = 1.5
/** Scripts the tokenizer handles at roughly Latin density. Everything else —
 *  CJK, Indic, Arabic, Cyrillic, Thai — costs far more tokens per character. */
const LATIN_ISH = new Set(['es', 'pt', 'fr', 'de', 'it', 'nl', 'af', 'id', 'ms', 'tl', 'pl', 'sv', 'da', 'no', 'fi', 'hu', 'cs', 'ro', 'tr', 'vi'])

interface Row extends TranslatableVideo {
  id: string
  video_url: string | null
  comments_count: number | null
}

async function loadPending(clientId: string): Promise<Row[]> {
  const admin = createAdminClient()
  // Ids first, without the text: the candidate filter is the same one
  // planTranslateBatches uses, and it answers from the partial index.
  const ids = (await selectAll<{ id: string }>(() =>
    admin.from('videos').select('id')
      .eq('client_id', clientId)
      .eq('transcript_status', 'ok')
      .is('transcript_en', null)
      .is('transcript_en_error', null)
      .order('id', { ascending: true }),
  )).map((r) => r.id)
  const rows: Row[] = []
  for (const part of chunk(ids, 100)) {
    const { data, error } = await admin.from('videos')
      .select('id, video_url, comments_count, transcript, transcript_lang, transcript_status, transcript_en, transcript_en_error')
      .eq('client_id', clientId).in('id', part)
    if (error) throw new Error(`load pending: ${error.message}`)
    rows.push(...((data ?? []) as Row[]))
  }
  return rows.filter(needsTranslation)
}

async function report(clientId: string): Promise<Row[]> {
  const admin = createAdminClient()
  // The whole language mix, for context — a lang-only read, no transcript text.
  const all = await selectAll<{ transcript_lang: string | null; transcript_en_error: string | null }>(() =>
    admin.from('videos').select('transcript_lang, transcript_en_error')
      .eq('client_id', clientId).eq('transcript_status', 'ok').order('id', { ascending: true }),
  )
  const english = all.filter((r) => isEnglishLang(r.transcript_lang)).length
  const unknown = all.filter((r) => !r.transcript_lang || !r.transcript_lang.trim()).length
  const errored = all.filter((r) => r.transcript_en_error !== null).length
  // Unknown-language rows are candidates since 2026-09-12: the model reports
  // what it detected, so an English one costs one call and stores only its
  // language, while a Chinese one — Sealand's largest untranslated block — gets
  // translated. They are estimated at the non-Latin rate, which is the
  // pessimistic half of the range for them.

  const pending = await loadPending(clientId)
  const byLang = new Map<string, { n: number; chars: number }>()
  for (const r of pending) {
    const lang = (r.transcript_lang ?? 'unknown').toLowerCase()
    const chars = [...clipText(r.transcript ?? '', TRANSCRIPT_PROMPT_CHARS)].length
    const e = byLang.get(lang) ?? { n: 0, chars: 0 }
    byLang.set(lang, { n: e.n + 1, chars: e.chars + chars })
  }

  const price = MODEL_PRICING[TRANSLATE_MODEL]
  if (!price) throw new Error(`no MODEL_PRICING for ${TRANSLATE_MODEL}`)
  console.log(`\nclient ${clientId}`)
  console.log(`transcripts with status 'ok': ${all.length} · English ${english} · unknown language ${unknown} · previously failed ${errored}`)
  console.log(`needing translation now: ${pending.length}\n`)
  if (!pending.length) return pending

  console.log('lang   videos   avg chars   est $ low   est $ high')
  let loTotal = 0
  let hiTotal = 0
  for (const [lang, e] of [...byLang.entries()].sort((a, b) => b[1].n - a[1].n)) {
    const perVideoChars = e.chars / e.n
    const lo = costFor(e.chars, CHARS_PER_TOKEN_LATIN, price)
    const hi = costFor(e.chars, LATIN_ISH.has(lang) ? CHARS_PER_TOKEN_LATIN : CHARS_PER_TOKEN_OTHER, price)
    // 'unknown' is a mixed bag by definition — some of it is English and will
    // cost one detection call and no translation. The range covers both.

    loTotal += lo
    hiTotal += hi
    console.log(
      `${lang.padEnd(7)}${String(e.n).padStart(6)}${String(Math.round(perVideoChars)).padStart(12)}` +
      `${('$' + lo.toFixed(3)).padStart(12)}${('$' + hi.toFixed(3)).padStart(13)}`,
    )
  }
  console.log(`${'total'.padEnd(7)}${String(pending.length).padStart(6)}${''.padStart(12)}${('$' + loTotal.toFixed(2)).padStart(12)}${('$' + hiTotal.toFixed(2)).padStart(13)}`)
  console.log(`\nmodel ${TRANSLATE_MODEL} · $${price.inputPer1M}/$${price.outputPer1M} per 1M in/out · clipped at ${TRANSCRIPT_PROMPT_CHARS} chars (the span Pass A can quote from)`)
  const capped = planTranslation(pending, { cap: TRANSLATE_CAP, batch: TRANSLATE_BATCH })
  console.log(`one run translates at most ${TRANSLATE_CAP} (${capped.length} steps of ${TRANSLATE_BATCH}); ${Math.max(0, pending.length - TRANSLATE_CAP)} would wait for the next run`)
  return pending
}

/** Cost of translating `chars` source characters.
 *
 *  BOTH sides are script-dependent, which the first version got half right.
 *  Input: `charsPerToken` (4 for Latin, ~1.5 otherwise). Output: English is
 *  Latin, so /4 — but a non-Latin source expands into far MORE English than it
 *  has characters. Measured 2026-09-12: 2,051 Chinese characters produced 1,425
 *  output tokens; a flat chars×1.2/4 predicts 615, a 2.3x under-estimate on
 *  exactly the corpus this script exists for. The expansion factor moves with
 *  the same script split as the input side. */
function costFor(chars: number, charsPerToken: number, price: { inputPer1M: number; outputPer1M: number }): number {
  const inTokens = chars / charsPerToken
  const expansion = charsPerToken === CHARS_PER_TOKEN_LATIN ? 1.2 : 3.2
  const outTokens = (chars * expansion) / CHARS_PER_TOKEN_LATIN
  return (inTokens / 1e6) * price.inputPer1M + (outTokens / 1e6) * price.outputPer1M
}

/** Print the Pass A block SHAPE for one translated video — every line of the
 *  transcript blocks replaced by a character count. Client transcript text
 *  never reaches this output. */
async function showPrompt(clientId: string): Promise<void> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('videos')
    .select('*').eq('client_id', clientId).not('transcript_en', 'is', null).limit(1)
  if (error) throw new Error(`prompt sample: ${error.message}`)
  const v = (data ?? [])[0] as VideoRow | undefined
  if (!v) { console.log('\nno translated video to show a prompt for yet (run --apply first)'); return }
  const transcript = usableTranscript(v)
  const translation = usableTranslation(v)
  const refs = [{ label: 'c1', realId: 'sample', text: '(a comment)' }]
  const prompt = buildUserPrompt(v, refs, transcript, translation)
  const elide = (t: string | null) => (t ? `«${[...t].length} chars of ${v.transcript_lang ?? '?'} elided»` : '')
  const shape = prompt
    .replace(transcript ?? ' ', elide(transcript))
    .replace(translation ?? ' ', translation ? `«${[...translation].length} chars of English elided»` : '')
  console.log(`\n--- Pass A user prompt shape (video ${v.id}, lang ${v.transcript_lang}) ---`)
  console.log(shape)
  console.log('--- end shape ---')
}

async function main() {
  const { clientId, limit, apply, prompt } = parseArgs(process.argv.slice(2))
  const pending = await report(clientId)

  if (apply && pending.length) {
    const take = pending.slice(0, limit ?? TRANSLATE_CAP) // limit is required by parseArgs on this path
    console.log(`\nAPPLY: translating ${take.length} video(s) with ${TRANSLATE_MODEL} — this spends real money.\n`)
    let n = 0
    const totals = { translated: 0, failed: 0, skipped: 0, cost: 0 }
    for (const batch of chunk(take.map((v) => v.id), TRANSLATE_BATCH)) {
      n++
      const r = await translateBatch({ clientId, runId: null, videoIds: batch, batchNo: n })
      totals.translated += r.translated
      totals.failed += r.failed
      totals.skipped += r.skipped
      totals.cost += r.costUsd
      console.log(`  batch ${n}: ${r.translated} translated · ${r.failed} failed · $${r.costUsd.toFixed(4)}`)
      for (const e of r.errors) console.log(`    ! ${e}`)
    }
    console.log(`\ntotal: ${totals.translated} translated · ${totals.failed} failed · ${totals.skipped} skipped · $${totals.cost.toFixed(4)} actual`)
  } else if (apply) {
    console.log('\nnothing to translate.')
  } else if (pending.length) {
    console.log('\ndry run — nothing written. Add --apply (with --limit) to translate.')
  }

  if (prompt) await showPrompt(clientId)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
