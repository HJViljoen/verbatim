import { LengthFinishReasonError } from 'openai/core/error'
import { describe, expect, it } from 'vitest'
import {
  askSplittingOnLength,
  buildClassifySystemPrompt,
  buildClassifyUserPrompt,
  CLASSIFY_META_BATCH,
  CLASSIFY_META_ITEM_MAX_TOKENS,
  CLASSIFY_META_MAX_OUTPUT_TOKENS,
  CLASSIFY_META_OWNED_CAP,
  CLASSIFY_META_SOURCES,
  classifyMetaLabels,
  isMissingColumnError,
  planClassifyBatches,
  validateClassifyResponse,
  type ClassifyInput,
} from './classify-meta'
import { CLASSIFIED_TYPES, HOOK_STYLES, VIDEO_SENTIMENTS, type ClassifyMetaItem, type ClassifyMetaOutput } from './schemas'

const input = (id: string, over: Partial<ClassifyInput> = {}): ClassifyInput => ({
  id,
  platform: 'tiktok',
  account_name: 'acc',
  caption: 'A day with my new running blade',
  hashtags: ['#runningblade'],
  transcript: null,
  transcript_en: null,
  transcript_status: null,
  ocr_text: null,
  ocr_status: null,
  ...over,
})

describe('planClassifyBatches', () => {
  it('takes only unclassified videos, chunked in order', () => {
    const videos = [
      { id: 'a', classified_type: 'story' },
      { id: 'b', classified_type: null },
      { id: 'c', classified_type: null },
      { id: 'd', classified_type: null },
    ]
    expect(planClassifyBatches(videos, 2)).toEqual([['b', 'c'], ['d']])
    expect(planClassifyBatches([{ id: 'a', classified_type: 'story' }])).toEqual([])
  })

  // depth v2 T14: the client's own posts join the plan, a rival's do not.
  it('takes the client’s own posts and the gathered corpus, never a rival’s own posts', () => {
    expect([...CLASSIFY_META_SOURCES]).toEqual(['discovered', 'owned'])
    expect(CLASSIFY_META_SOURCES).not.toContain('competitor_owned')
    const videos = [
      { id: 'disc', classified_type: null, source: 'discovered' },
      { id: 'own-photo', classified_type: null, source: 'owned' },
      { id: 'own-done', classified_type: 'story', source: 'owned' },
    ]
    expect(planClassifyBatches(videos, 25)).toEqual([['disc', 'own-photo']])
  })

  it('caps own posts a run and never the gathered corpus', () => {
    const own = Array.from({ length: 5 }, (_, i) => ({ id: `own-${i}`, classified_type: null, source: 'owned' }))
    const disc = Array.from({ length: 4 }, (_, i) => ({ id: `disc-${i}`, classified_type: null, source: 'discovered' }))
    expect(planClassifyBatches([...own, ...disc], 25, 2)).toEqual([['own-0', 'own-1', 'disc-0', 'disc-1', 'disc-2', 'disc-3']])
    expect(CLASSIFY_META_OWNED_CAP).toBe(100)
  })
})

describe('classifyMetaLabels', () => {
  const item: ClassifyMetaItem = {
    ref: 'v1', classified_type: 'testimonial', hook_style: 'demonstration',
    hook_text: 'Meet the Navii', topics: ['prosthetic knee'], sentiment: 'positive',
  }

  it('gives a gathered video the framing sentiment, stamped framing', () => {
    expect(classifyMetaLabels(item, { ...input('a', { caption: 'Meet the Navii' }), source: 'discovered' })).toMatchObject({
      classified_type: 'testimonial', hook_style: 'demonstration', hook_text: 'Meet the Navii',
      hook_source: 'caption', topics: ['prosthetic knee'], sentiment: 'positive', sentiment_source: 'framing',
    })
  })

  it('gives an own post its format, opening and topics, and no sentiment at all', () => {
    const labels = classifyMetaLabels(item, { ...input('a', { caption: 'Meet the Navii' }), source: 'owned' })
    expect(labels).toMatchObject({ classified_type: 'testimonial', hook_style: 'demonstration', topics: ['prosthetic knee'] })
    expect(labels).not.toHaveProperty('sentiment')
    expect(labels).not.toHaveProperty('sentiment_source')
  })

  it('keeps the discovered behaviour for a row it cannot see', () => {
    expect(classifyMetaLabels({ ...item, sentiment: null, topics: [] }, undefined)).toMatchObject({
      hook_source: null, topics: null, sentiment: null, sentiment_source: null,
    })
  })
})

describe('buildClassifyUserPrompt', () => {
  it('numbers blocks and includes transcript only when usable', () => {
    const prompt = buildClassifyUserPrompt([
      input('a'),
      input('b', { transcript: 'hello from the transcript', transcript_status: 'ok' }),
      input('c', { transcript: 'la la la', transcript_status: 'lyrics', caption: null, hashtags: null }),
    ])
    expect(prompt).toContain('[v1] platform: tiktok')
    expect(prompt).toContain('[v2]')
    expect(prompt).toContain('transcript: hello from the transcript')
    expect(prompt).not.toContain('la la la') // lyrics-status transcript excluded
    expect(prompt).toContain('caption: (none)')
  })

  it('shows the cover frame\'s text, before the transcript, only when usable', () => {
    const prompt = buildClassifyUserPrompt([
      input('a', { ocr_text: 'DAY 3 OF 30', ocr_status: 'ok', transcript: 'spoken words', transcript_status: 'ok' }),
      input('b', { ocr_text: 'ignored', ocr_status: 'none' }),
    ])
    expect(prompt).toContain('on-screen text (cover frame): DAY 3 OF 30')
    // AFTER the transcript, matching the order the hook_text rule lists them in.
    // Leading with it biased the model toward the first thing on the frame,
    // which on TikTok is as often the platform watermark as the hook.
    expect(prompt.indexOf('transcript: spoken words')).toBeLessThan(prompt.indexOf('on-screen text'))
    expect(prompt).not.toContain('ignored') // 'none' means the frame carried no text
  })

  it('flattens the blocks with a separator so one video stays one block', () => {
    const prompt = buildClassifyUserPrompt([input('a', { ocr_text: 'LINE ONE\nline two', ocr_status: 'ok' })])
    expect(prompt).toContain('on-screen text (cover frame): LINE ONE / line two')
  })

  it('a silent video with a title card still carries something to classify', () => {
    const prompt = buildClassifyUserPrompt([input('a', { ocr_text: 'I QUIT MY JOB', ocr_status: 'ok' })])
    expect(prompt).toContain('I QUIT MY JOB')
    expect(prompt).not.toContain('transcript:')
  })

  it('the system prompt says a typed hook IS the hook — but never a watermark', () => {
    const sys = buildClassifySystemPrompt()
    expect(sys).toContain('the text printed on the cover frame')
    expect(sys).toContain('the hook is very often TYPED on the cover rather than spoken')
    // Sample 7673087098886376718's block is `PERSONAL OPINIONS. / TikTok /
    // @seriouslyinez`: one real hook and two pieces of platform furniture.
    expect(sys).toContain('a watermark, a platform name, a channel name or an @handle is NEVER the hook')
  })

  it('system prompt carries the enum vocabularies', () => {
    const sys = buildClassifySystemPrompt()
    expect(sys).toContain('tutorial')
    expect(sys).toContain('personal-story')
    expect(sys).toContain('null')
  })
})

describe('validateClassifyResponse', () => {
  const ids = ['id-a', 'id-b']
  const item = (ref: string): ClassifyMetaOutput['videos'][number] => ({
    ref,
    classified_type: 'story',
    hook_style: null,
    hook_text: '  My journey ',
    topics: [' Amputee ', 'Running', '', 'x', 'y', 'z'],
    sentiment: 'positive',
  })

  it('maps refs to batch ids, trims hook_text, normalizes and caps topics', () => {
    const out = validateClassifyResponse({ videos: [item('v1')] }, ids)
    const got = out.get('id-a')
    expect(got?.hook_text).toBe('My journey')
    expect(got?.topics).toEqual(['amputee', 'running', 'x', 'y'])
  })

  it('drops unknown, out-of-range and duplicate refs — never guesses', () => {
    const out = validateClassifyResponse(
      { videos: [item('v0'), item('v3'), item('nope'), item('v2'), item('v2')] },
      ids,
    )
    expect([...out.keys()]).toEqual(['id-b'])
  })
})

describe('isMissingColumnError — surviving a deploy that lands before its migration', () => {
  // The model call is billed before the update runs, so a throw here loses the
  // classification, re-bills it on every Inngest retry and closes the run
  // `partial`. A bookkeeping column that does not exist yet must not cost that.
  it('recognises the undefined-column error for that column', () => {
    expect(isMissingColumnError({ code: '42703', message: `column "classified_prompt_version" of relation "videos" does not exist` }, 'classified_prompt_version')).toBe(true)
  })

  it('recognises the PostgREST schema-cache spelling of it', () => {
    expect(isMissingColumnError({ code: 'PGRST204', message: "Could not find the 'classified_prompt_version' column of 'videos' in the schema cache" }, 'classified_prompt_version')).toBe(true)
  })

  it('does not swallow a real write failure', () => {
    expect(isMissingColumnError({ code: '23502', message: 'null value in column "source" violates not-null constraint' }, 'classified_prompt_version')).toBe(false)
    expect(isMissingColumnError({ code: '42703', message: `column "hook_style" does not exist` }, 'classified_prompt_version')).toBe(false)
    expect(isMissingColumnError({ message: 'classified_prompt_version' }, 'classified_prompt_version')).toBe(false)
    expect(isMissingColumnError(null, 'classified_prompt_version')).toBe(false)
    expect(isMissingColumnError('42703', 'classified_prompt_version')).toBe(false)
  })
})

describe('transcript blocks — English to understand, original to copy (2026-09-12)', () => {
  it('shows BOTH, original first and labelled `transcript:`', () => {
    // hook_text is a verbatim column. Feeding only the English made every
    // translated video's stored hook an English rendering of its own words.
    const p = buildClassifyUserPrompt([
      input('a', { transcript: 'Hola, probé esta mochila', transcript_en: 'Hi, I tried this backpack', transcript_status: 'ok' }),
    ])
    expect(p).toContain('transcript: Hola, probé esta mochila')
    expect(p).toContain('Hi, I tried this backpack')
    expect(p.indexOf('Hola')).toBeLessThan(p.indexOf('Hi, I tried'))
  })

  it('tells the model which line the hook comes from', () => {
    expect(buildClassifySystemPrompt()).toContain('copy the hook from the "transcript" line')
    expect(buildClassifyUserPrompt([
      input('a', { transcript: 'Hola', transcript_en: 'Hi', transcript_status: 'ok' }),
    ])).toContain('never copy the hook from this line')
  })

  it('falls back to the original when nothing was translated — the shape it has always had', () => {
    const p = buildClassifyUserPrompt([
      input('a', { transcript: 'Hola, probé esta mochila', transcript_en: null, transcript_status: 'ok' }),
    ])
    expect(p).toContain('transcript: Hola, probé esta mochila')
  })

  it('a translation cannot smuggle past the content gate', () => {
    const p = buildClassifyUserPrompt([
      input('a', { transcript: '♪♪ ♪♪', transcript_en: 'la la la', transcript_status: 'lyrics' }),
    ])
    expect(p).not.toContain('transcript:')
    expect(p).not.toContain('la la la')
  })
})

// 13 Oct: Sealand's run 78a6eb3c closed partial on one classify-meta batch
// whose answer ran to the model's 32,768-token window ("Could not parse
// response content as the length limit was reached"). The call now has a
// ceiling, and a batch that runs into it fails alone.
describe('the output ceiling', () => {
  it('fits a full batch of the widest honest entries, and is a quarter of the window', () => {
    expect(CLASSIFY_META_BATCH * CLASSIFY_META_ITEM_MAX_TOKENS).toBeLessThanOrEqual(CLASSIFY_META_MAX_OUTPUT_TOKENS)
    expect(CLASSIFY_META_MAX_OUTPUT_TOKENS).toBeLessThanOrEqual(32_768 / 4)
  })

  it('the widest honest entry fits its allowance, at a pessimistic three characters a token', () => {
    const longest = (xs: readonly string[]) => xs.reduce((a, b) => (b.length > a.length ? b : a))
    const widest: ClassifyMetaItem = {
      ref: `v${CLASSIFY_META_BATCH}`,
      classified_type: longest(CLASSIFIED_TYPES) as ClassifyMetaItem['classified_type'],
      hook_style: longest(HOOK_STYLES) as ClassifyMetaItem['hook_style'],
      // About forty words: a long spoken or typed opening, copied verbatim.
      hook_text: 'Okay so I have been carrying this exact bag every single day for the last three years through airports, rain and two cross-country moves, and today I am finally going to tell you what actually held up and what fell apart',
      topics: ['carry-on travel backpack', 'waterproof recycled sailcloth', 'everyday commuter bag', 'long-term durability review'],
      sentiment: longest(VIDEO_SENTIMENTS) as ClassifyMetaItem['sentiment'],
    }
    expect(Math.ceil(JSON.stringify(widest).length / 3)).toBeLessThanOrEqual(CLASSIFY_META_ITEM_MAX_TOKENS)
  })
})

describe('askSplittingOnLength: one batch that overruns fails alone', () => {
  // The SDK's own error, as `chat.completions.parse` throws it on
  // finish_reason 'length'.
  const overrun = () => new LengthFinishReasonError()
  const batch = Array.from({ length: CLASSIFY_META_BATCH }, (_, i) => `v${i + 1}`)

  it('asks once for a batch that fits', async () => {
    const asked: string[][] = []
    const out = await askSplittingOnLength(batch, async (part) => { asked.push(part); return part.length })
    expect(asked).toEqual([batch])
    expect(out).toEqual({ results: [25], split: false, skipped: [] })
  })

  it('asks again in halves when the whole batch runs into the ceiling, and keeps both answers', async () => {
    const asked: number[] = []
    const out = await askSplittingOnLength(batch, async (part) => {
      asked.push(part.length)
      if (part.length === 25) throw overrun()
      return part
    })
    expect(asked).toEqual([25, 13, 12])
    expect(out.split).toBe(true)
    expect(out.skipped).toEqual([])
    expect(out.results.flat()).toEqual(batch)
  })

  it('leaves a half that runs into it again unclassified, keeps the other, and throws nothing', async () => {
    const out = await askSplittingOnLength(batch, async (part) => {
      if (part.length === 25 || part[0] === 'v14') throw overrun()
      return part
    })
    expect(out.split).toBe(true)
    expect(out.results).toEqual([batch.slice(0, 13)])
    expect(out.skipped).toEqual(batch.slice(13))
  })

  it('never goes a third level: two halves that both overrun leave the batch unclassified after three asks', async () => {
    let asks = 0
    const out = await askSplittingOnLength(batch, async () => { asks++; throw overrun() })
    expect(asks).toBe(3)
    expect(out).toEqual({ results: [], split: true, skipped: batch })
  })

  it('a batch of one cannot be halved: it is left unclassified after one ask', async () => {
    let asks = 0
    const out = await askSplittingOnLength(['v1'], async () => { asks++; throw overrun() })
    expect(asks).toBe(1)
    expect(out).toEqual({ results: [], split: false, skipped: ['v1'] })
  })

  it('matches the error by its message too, as a re-thrown copy keeps it', async () => {
    const out = await askSplittingOnLength(['a', 'b'], async (part) => {
      if (part.length === 2) throw new Error('Could not parse response content as the length limit was reached')
      return part[0]
    })
    expect(out).toEqual({ results: ['a', 'b'], split: true, skipped: [] })
  })

  it('throws any other failure, for Inngest to retry the step: the whole batch\'s, or a half\'s once the other half has finished', async () => {
    await expect(askSplittingOnLength(batch, async () => { throw new Error('429 rate limit exceeded') })).rejects.toThrow('429')
    let written = false
    await expect(askSplittingOnLength(batch, async (part) => {
      if (part.length === 25) throw overrun()
      if (part[0] === 'v14') throw new Error('classify-meta persist: connection reset')
      await new Promise((r) => setTimeout(r, 5))
      written = true
      return part
    })).rejects.toThrow('connection reset')
    expect(written).toBe(true)
  })
})
