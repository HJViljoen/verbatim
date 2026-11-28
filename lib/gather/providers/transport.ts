// Direct scraping providers (28 Nov 2026): one HTTP GET to a provider's API,
// either straight to the provider or through treg, which relays the same call
// at the same price and passes the provider's body and status through
// unchanged.
//
// Why a layer of our own: from about 17 Nov Instagram's hashtag pages stopped
// handing apify/instagram-scraper a dense recent feed (lib/gather/platforms/
// instagram.ts), and TikHub's hashtag feed, paged and filtered to the window,
// gives back roughly seven times more recent posts (live test, 28 Nov). Apify
// stays behind it as the last fallback (router.ts).
//
// Which transport: TIKHUB_API_KEY set → TikHub directly; otherwise
// TREG_API_KEY set → through treg; neither → the provider is unavailable and
// the caller moves on. Keys are read per call, never logged, and never part
// of a URL (they travel in a header).
//
// NEVER STORED OR LOGGED: every TikHub success carries a top-level `cache_url`
// that anyone can open for 24 hours without credentials, so it and its
// `cache_message*` siblings are removed here, before any caller sees the body.

export type ProviderEndpoint = {
  provider: 'tikhub' | 'scrapecreators'
  /** The job as the ledger names it, e.g. 'instagram.hashtag'. */
  job: string
  /** treg's catalogue id for the same call. */
  tregId: string
  /** The full URL of the provider's own API for this call. */
  direct: { url: string }
  /** List price per billed call, used when no cost header says otherwise. */
  priceUsd: number
}

export type ProviderResponse = {
  status: number
  /** Parsed JSON, with any top-level cache_url / cache_message removed. */
  body: unknown
  /** treg: X-Treg-Cost-Micro / 1e6; direct: priceUsd when status is 200, else
   *  0. Summed over every attempt the call took. */
  costUsd: number
  transport: 'treg' | 'direct'
  ms: number
  /** HTTP requests this call made, retries included. */
  attempts: number
}

export type ProviderErrorKind = 'unavailable' | 'http' | 'timeout' | 'soft' | 'schema'

/** A provider call that did not give a usable answer. `message` is written to
 *  be read in a run warning: plain words, no body dump, no URL. */
export class ProviderError extends Error {
  readonly kind: ProviderErrorKind
  readonly status?: number
  /** What the failed call was charged, where it was (a charged soft failure). */
  costUsd: number
  attempts: number
  constructor(kind: ProviderErrorKind, message: string, opts: { status?: number; costUsd?: number; attempts?: number } = {}) {
    super(message)
    this.name = 'ProviderError'
    this.kind = kind
    if (opts.status != null) this.status = opts.status
    this.costUsd = opts.costUsd ?? 0
    this.attempts = opts.attempts ?? 0
  }
}

const TREG_BASE = 'https://treg.to/call'

/** Per attempt, unless the caller passes less (the hashtag fetch passes what
 *  is left of its own deadline). Measured 28 Nov: p95 17 s, max 25 s. */
export const PROVIDER_TIMEOUT_MS = 30_000
const RETRIES = 2
const BACKOFF_MS = 1_000

/** The direct route's key and header per provider. ScrapeCreators has none
 *  yet: it goes through treg until its own build adds the direct call. */
const DIRECT: Partial<Record<ProviderEndpoint['provider'], { env: string; header: (key: string) => Record<string, string> }>> = {
  tikhub: { env: 'TIKHUB_API_KEY', header: (key) => ({ Authorization: `Bearer ${key}` }) },
}

const envKey = (name: string): string | null => {
  const v = process.env[name]?.trim()
  return v ? v : null
}

/** How a provider would be reached right now: its own API when its key is set,
 *  treg when treg's is, otherwise null (unavailable). Read per call. */
export function providerTransport(provider: ProviderEndpoint['provider']): 'treg' | 'direct' | null {
  const direct = DIRECT[provider]
  if (direct && envKey(direct.env)) return 'direct'
  if (envKey('TREG_API_KEY')) return 'treg'
  return null
}

/** The body without its public cache link. */
function stripCache(body: unknown): unknown {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(body)) if (!k.startsWith('cache_')) out[k] = v
  return out
}

/** The one-line reason an error body gives, where it gives one. TikHub puts it
 *  at `detail.message`; treg's own refusals at `error.message` or `message`. */
function bodyReason(body: unknown): string | null {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const pick = (v: unknown): string | null => {
    if (typeof v === 'string' && v.trim()) return v.trim()
    if (v && typeof v === 'object' && typeof (v as { message?: unknown }).message === 'string') return (v as { message: string }).message.trim() || null
    return null
  }
  const reason = pick(b.detail) ?? pick(b.error) ?? pick(b.message)
  return reason ? reason.split('\n')[0].slice(0, 160) : null
}

const parseJson = (text: string): { ok: true; value: unknown } | { ok: false } => {
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return { ok: false }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * One GET to a provider. Retries a network error, a 5xx and a 429 (2 retries,
 * short backoff); never a 4xx, which is about the request, and never a
 * timeout, which would spend the caller's clock three times over. Throws
 * ProviderError: 'unavailable' (no key), 'http' (a 4xx, or a 5xx/429 out of
 * retries), 'timeout', 'schema' (a 2xx that is not JSON).
 */
export async function providerGet(
  ep: ProviderEndpoint,
  params: Record<string, string | undefined>,
  opts: { timeoutMs?: number; fetchImpl?: typeof fetch; backoffMs?: number } = {},
): Promise<ProviderResponse> {
  const transport = providerTransport(ep.provider)
  const name = providerLabel(ep.provider)
  if (!transport) throw new ProviderError('unavailable', `${name} is not set up`)
  const fetchImpl = opts.fetchImpl ?? fetch
  const timeoutMs = Math.max(1, opts.timeoutMs ?? PROVIDER_TIMEOUT_MS)
  const backoffMs = opts.backoffMs ?? BACKOFF_MS

  const query = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined) query.set(k, v)
  const url = transport === 'treg' ? `${TREG_BASE}/${ep.tregId}?${query}` : `${ep.direct.url}?${query}`
  const headers = transport === 'treg'
    ? { 'X-Treg-Token': envKey('TREG_API_KEY')! }
    : DIRECT[ep.provider]!.header(envKey(DIRECT[ep.provider]!.env)!)

  const t0 = Date.now()
  let costUsd = 0
  let attempts = 0
  let last: ProviderError | null = null
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    if (attempt > 0) await sleep(backoffMs * attempt)
    attempts++
    const signal = AbortSignal.timeout(timeoutMs)
    let res: Response
    try {
      res = await fetchImpl(url, { headers, signal })
    } catch (e) {
      if (signal.aborted) {
        throw new ProviderError('timeout', `${name} did not answer within ${Math.round(timeoutMs / 1000)} s`, { costUsd, attempts })
      }
      last = new ProviderError('http', `${name} could not be reached (${e instanceof Error ? e.message.slice(0, 80) : 'network error'})`, { costUsd, attempts })
      continue
    }
    costUsd += chargeOf(ep, transport, res)
    const text = await res.text().catch(() => '')
    if (res.status >= 500 || res.status === 429) {
      last = new ProviderError('http', `${name} answered HTTP ${res.status}${res.status === 429 ? ' (too many requests)' : ''}`, { status: res.status, costUsd, attempts })
      continue
    }
    const parsed = parseJson(text)
    if (res.status < 200 || res.status >= 300) {
      const reason = parsed.ok ? bodyReason(parsed.value) : null
      throw new ProviderError('http', `${name} answered HTTP ${res.status}${reason ? `: ${reason}` : ''}`, { status: res.status, costUsd, attempts })
    }
    if (!parsed.ok) throw new ProviderError('schema', `${name} answered with something that is not JSON`, { status: res.status, costUsd, attempts })
    return { status: res.status, body: stripCache(parsed.value), costUsd, transport, ms: Date.now() - t0, attempts }
  }
  if (last) {
    last.costUsd = costUsd
    last.attempts = attempts
    throw last
  }
  throw new ProviderError('http', `${name} gave no answer`, { costUsd, attempts })
}

/** What one response cost. treg says so in a header on every call it bills;
 *  the direct route has no such header, so a 200 is the list price and
 *  anything else is free (TikHub: "You won't be charged" on a 400). */
function chargeOf(ep: ProviderEndpoint, transport: 'treg' | 'direct', res: Response): number {
  if (transport === 'treg') {
    const micro = Number(res.headers.get('x-treg-cost-micro'))
    if (res.headers.has('x-treg-cost-micro') && Number.isFinite(micro) && micro >= 0) return micro / 1e6
  }
  return res.status === 200 ? ep.priceUsd : 0
}

const LABELS: Record<string, string> = { tikhub: 'TikHub', scrapecreators: 'ScrapeCreators', apify: 'Apify' }

/** A provider's name as a warning says it. */
export function providerLabel(provider: string): string {
  return LABELS[provider] ?? provider
}
