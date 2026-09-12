import { describe, expect, it } from 'vitest'
import {
  buildClassifySystemPrompt,
  buildClassifyUserPrompt,
  isMissingColumnError,
  planClassifyBatches,
  validateClassifyResponse,
  type ClassifyInput,
} from './classify-meta'
import type { ClassifyMetaOutput } from './schemas'

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
