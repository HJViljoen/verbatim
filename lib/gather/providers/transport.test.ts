import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { providerGet, providerTransport, ProviderError, type ProviderEndpoint } from './transport'

// The provider transport (28 Nov 2026), with an injected fetch: no network.
// The bodies are the shapes TikHub answered with on 28 Nov, trimmed: a
// success with its public cache link, and a 400's `detail`.

const EP: ProviderEndpoint = {
  provider: 'tikhub',
  job: 'instagram.hashtag',
  tregId: 'tikhub.x.instagram-v2-fetch-hashtag-posts',
  direct: { url: 'https://api.tikhub.io/api/v1/instagram/v2/fetch_hashtag_posts' },
  priceUsd: 0.002,
}

const OK_BODY = {
  code: 200,
  request_id: '00000000-0000-0000-0000-000000000000',
  message: 'Request successful. This request will incur a charge.',
  cache_message: 'This response is cached and accessible via the URL below for 24 hours at no extra charge.',
  cache_message_zh: '此响应已缓存',
  cache_url: 'https://cache.tikhub.io/api/v1/cache/public/00000000-0000-0000-0000-000000000000?sign=placeholder',
  router: '/api/v1/instagram/v2/fetch_hashtag_posts',
  params: { keyword: 'travelgear', feed_type: 'reels' },
  data: { data: { additional_data: [], count: 0, items: [] }, pagination_token: null },
}

const BAD_REQUEST = {
  detail: {
    code: 400,
    request_id: '00000000-0000-0000-0000-000000000000',
    message: 'Request failed. Please retry. Check the docs below to verify your parameters. You won\'t be charged for this request.',
    router: '/api/v1/instagram/v2/fetch_hashtag_posts',
    params: { keyword: '' },
  },
}

type Call = { url: string; headers: Record<string, string> }

/** A fetch that answers from a script, one entry a call. */
function scripted(...answers: (Response | Error | 'hang')[]) {
  const calls: Call[] = []
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), headers: { ...(init?.headers as Record<string, string>) } })
    const next = answers.shift()
    if (!next) throw new Error('no scripted answer left')
    if (next === 'hang') {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal!.reason))
      })
    }
    if (next instanceof Error) throw next
    return next
  }) as typeof fetch
  return { impl, calls }
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

const KEYS = ['TIKHUB_API_KEY', 'TREG_API_KEY'] as const
let saved: Record<string, string | undefined>
beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]))
  for (const k of KEYS) delete process.env[k]
})
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe('providerTransport — which route a provider takes', () => {
  it('is unavailable with no key at all', () => {
    expect(providerTransport('tikhub')).toBeNull()
    expect(providerTransport('scrapecreators')).toBeNull()
  })

  it('goes through treg when only treg’s key is set', () => {
    process.env.TREG_API_KEY = 'treg-test'
    expect(providerTransport('tikhub')).toBe('treg')
    expect(providerTransport('scrapecreators')).toBe('treg')
  })

  it('goes direct when the provider’s own key is set, treg’s or not', () => {
    process.env.TIKHUB_API_KEY = 'tikhub-test'
    expect(providerTransport('tikhub')).toBe('direct')
    process.env.TREG_API_KEY = 'treg-test'
    expect(providerTransport('tikhub')).toBe('direct')
    // TikHub's key opens nothing for ScrapeCreators.
    delete process.env.TREG_API_KEY
    expect(providerTransport('scrapecreators')).toBeNull()
  })

  it('treats a blank key as no key', () => {
    process.env.TIKHUB_API_KEY = '  '
    expect(providerTransport('tikhub')).toBeNull()
  })
})

describe('providerGet — one call, either route', () => {
  it('calls treg with the token header, drops unset params, and takes the cost from the header', async () => {
    process.env.TREG_API_KEY = 'treg-test'
    const f = scripted(json(OK_BODY, 200, { 'X-Treg-Cost-Micro': '2000', 'X-Treg-Call-Id': 'abc' }))
    const r = await providerGet(EP, { keyword: 'travelgear', feed_type: 'reels', pagination_token: undefined }, { fetchImpl: f.impl })
    expect(f.calls).toHaveLength(1)
    expect(f.calls[0].url).toBe('https://treg.to/call/tikhub.x.instagram-v2-fetch-hashtag-posts?keyword=travelgear&feed_type=reels')
    expect(f.calls[0].headers).toEqual({ 'X-Treg-Token': 'treg-test' })
    expect(r).toMatchObject({ status: 200, transport: 'treg', costUsd: 0.002, attempts: 1 })
  })

  it('calls TikHub directly with a bearer token and charges the list price on a 200', async () => {
    process.env.TIKHUB_API_KEY = 'tikhub-test'
    process.env.TREG_API_KEY = 'treg-test'
    const f = scripted(json(OK_BODY))
    const r = await providerGet(EP, { keyword: 'travelgear', feed_type: 'recent', pagination_token: 'TOKEN' }, { fetchImpl: f.impl })
    expect(f.calls[0].url).toBe('https://api.tikhub.io/api/v1/instagram/v2/fetch_hashtag_posts?keyword=travelgear&feed_type=recent&pagination_token=TOKEN')
    expect(f.calls[0].headers).toEqual({ Authorization: 'Bearer tikhub-test' })
    expect(r).toMatchObject({ transport: 'direct', costUsd: 0.002 })
  })

  it('never puts a key in the URL', async () => {
    process.env.TREG_API_KEY = 'treg-secret'
    const f = scripted(json(OK_BODY))
    await providerGet(EP, { keyword: 'x' }, { fetchImpl: f.impl })
    expect(f.calls[0].url).not.toContain('treg-secret')
  })

  it('removes the public cache link and its messages, and keeps the rest', async () => {
    process.env.TREG_API_KEY = 'treg-test'
    const r = await providerGet(EP, { keyword: 'x' }, { fetchImpl: scripted(json(OK_BODY)).impl })
    const body = r.body as Record<string, unknown>
    expect(body).not.toHaveProperty('cache_url')
    expect(body).not.toHaveProperty('cache_message')
    expect(body).not.toHaveProperty('cache_message_zh')
    expect(JSON.stringify(body)).not.toContain('cache.tikhub.io')
    expect(body.router).toBe('/api/v1/instagram/v2/fetch_hashtag_posts')
    expect(body.data).toEqual(OK_BODY.data)
  })

  it('falls back to the list price on treg when the cost header is missing', async () => {
    process.env.TREG_API_KEY = 'treg-test'
    const r = await providerGet(EP, { keyword: 'x' }, { fetchImpl: scripted(json(OK_BODY)).impl })
    expect(r.costUsd).toBe(0.002)
  })
})

describe('providerGet — retries and failures', () => {
  beforeEach(() => { process.env.TREG_API_KEY = 'treg-test' })

  it('retries a 5xx and returns the answer that came', async () => {
    const f = scripted(json({ detail: 'bad gateway' }, 502, { 'X-Treg-Cost-Micro': '0' }), json(OK_BODY, 200, { 'X-Treg-Cost-Micro': '2000' }))
    const r = await providerGet(EP, { keyword: 'x' }, { fetchImpl: f.impl, backoffMs: 0 })
    expect(f.calls).toHaveLength(2)
    expect(r).toMatchObject({ status: 200, attempts: 2, costUsd: 0.002 })
  })

  it('retries a 429 and a network error', async () => {
    const f = scripted(json({}, 429), new TypeError('fetch failed'), json(OK_BODY))
    const r = await providerGet(EP, { keyword: 'x' }, { fetchImpl: f.impl, backoffMs: 0 })
    expect(f.calls).toHaveLength(3)
    expect(r.attempts).toBe(3)
  })

  it('gives up after two retries with an http error that names the status', async () => {
    const f = scripted(json({}, 503), json({}, 503), json({}, 503))
    const e = await providerGet(EP, { keyword: 'x' }, { fetchImpl: f.impl, backoffMs: 0 }).catch((x) => x)
    expect(f.calls).toHaveLength(3)
    expect(e).toBeInstanceOf(ProviderError)
    expect(e).toMatchObject({ kind: 'http', status: 503, attempts: 3, message: 'TikHub answered HTTP 503' })
  })

  it('never retries a 400, and says what the provider said', async () => {
    const f = scripted(json(BAD_REQUEST, 400))
    const e = await providerGet(EP, { keyword: '' }, { fetchImpl: f.impl, backoffMs: 0 }).catch((x) => x)
    expect(f.calls).toHaveLength(1)
    expect(e).toMatchObject({ kind: 'http', status: 400, costUsd: 0 })
    expect(e.message).toMatch(/^TikHub answered HTTP 400: Request failed\. Please retry\./)
  })

  it('reads treg’s own refusal too (402, out of credit)', async () => {
    const e = await providerGet(EP, { keyword: 'x' }, { fetchImpl: scripted(json({ error: { message: 'insufficient balance' } }, 402)).impl }).catch((x) => x)
    expect(e).toMatchObject({ kind: 'http', status: 402, message: 'TikHub answered HTTP 402: insufficient balance' })
  })

  it('times out once and does not retry the timeout', async () => {
    const f = scripted('hang', json(OK_BODY))
    const e = await providerGet(EP, { keyword: 'x' }, { fetchImpl: f.impl, timeoutMs: 20, backoffMs: 0 }).catch((x) => x)
    expect(f.calls).toHaveLength(1)
    expect(e).toMatchObject({ kind: 'timeout', attempts: 1 })
  })

  it('calls a 200 that is not JSON a schema error', async () => {
    const e = await providerGet(EP, { keyword: 'x' }, { fetchImpl: scripted(new Response('<html>oops</html>', { status: 200 })).impl }).catch((x) => x)
    expect(e).toMatchObject({ kind: 'schema' })
  })

  it('is unavailable with no key, and calls nothing', async () => {
    delete process.env.TREG_API_KEY
    const f = scripted(json(OK_BODY))
    const e = await providerGet(EP, { keyword: 'x' }, { fetchImpl: f.impl }).catch((x) => x)
    expect(e).toMatchObject({ kind: 'unavailable', message: 'TikHub is not set up' })
    expect(f.calls).toHaveLength(0)
  })
})
