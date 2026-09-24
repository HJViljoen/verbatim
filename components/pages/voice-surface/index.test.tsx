import { describe, expect, it } from 'vitest'

import { blockAnswers, figureConflicts, figureCount, mergeFigures, type RenderMode } from '@/lib/blocks/types'
import { DIRECTION_WORDS_BY_READER } from '@/lib/config'
import { copyViolations } from '@/lib/test/copy-contract'
import { render, renderText } from '@/lib/test/render'
import { VOICE_BLOCKS, VoiceSurfacePage, voiceContext, voiceHorizonRange } from './index'
import { refusedVoiceFixture, voiceFixture } from './fixture'
import VoiceLoading from '@/app/dashboard/voice/loading'

// Voice — the page (Phase 1 WP13).

const MODES: RenderMode[] = ['app', 'print', 'email']

describe('VOICE_BLOCKS', () => {
  it('is the four the design names, in the order a reader asks them', () => {
    expect(VOICE_BLOCKS.map((b) => b.key)).toEqual(['voice.audience', 'voice.moved', 'voice.theme', 'voice.cast'])
  })

  it('every block renders in every mode, in both states, with no copy violation', () => {
    const ctx = voiceContext({ audience: 'industry-other' })
    for (const data of [voiceFixture(), refusedVoiceFixture()]) {
      for (const block of VOICE_BLOCKS) {
        for (const mode of MODES) {
          expect(copyViolations(block.render(data, mode, ctx)), `${block.key} · ${data.brand} · ${mode}`).toEqual([])
        }
      }
    }
  })

  it('no two blocks print the same figure token with two different values', () => {
    for (const data of [voiceFixture(), refusedVoiceFixture()]) {
      const tables = VOICE_BLOCKS.map((b) => blockAnswers(b, data).figures)
      expect(figureConflicts(tables), data.brand).toEqual([])
    }
  })

  it('keeps the page inside the 30-number budget in both states', () => {
    for (const data of [voiceFixture(), refusedVoiceFixture()]) {
      const tables = VOICE_BLOCKS.map((b) => blockAnswers(b, data).figures)
      expect(figureCount(tables), `${data.brand}: ${Object.keys(mergeFigures(tables)).join(', ')}`).toBeLessThanOrEqual(30)
    }
  })

  it('every block has an honest sentence for its own emptiness', () => {
    const bare = refusedVoiceFixture()
    for (const block of VOICE_BLOCKS) {
      const empty = block.emptyState(bare)
      expect(typeof empty === 'string' || empty === null, block.key).toBe(true)
    }
  })
})

describe('the skeleton at app/dashboard/voice/loading.tsx', () => {
  it('draws the same four growing sections the page does, and asks for no row', () => {
    // It drew four SkeletonTiles at row spans 2/4/6/4 after the page had
    // stopped drawing a fixed grid at all — the layout shift a skeleton exists
    // to prevent, under a comment saying it followed the page.
    const markup = render(<VoiceLoading />)
    expect(markup.match(/data-tile=""/g)).toHaveLength(VOICE_BLOCKS.length)
    expect(markup).not.toMatch(/row-span-\d/)
    expect(markup).toContain('Loading Voice')
  })
})

describe('VoiceSurfacePage', () => {
  it('draws four tiles and the page bar', () => {
    const markup = render(<VoiceSurfacePage data={voiceFixture()} params={{ audience: 'industry-other' }} />)
    expect(markup.match(/data-tile=""/g)).toHaveLength(4)
    expect(markup).not.toContain('Who is saying what in this category?')
  })

  it('gives no block a fixed height, so nothing on this page can be cut in silence', () => {
    // The first production render of this page, drawn in row-spanned tiles,
    // lost three of six quotes, every action link, the search box and three of
    // five groups in the cast — `Tile` is overflow-hidden on a 116px row grid.
    // None of these four blocks has a bounded height.
    const markup = render(<VoiceSurfacePage data={voiceFixture()} params={{}} />)
    // `overflow-hidden` is not checked: the proportion bar clips its own
    // segments to a rounded end, which is the primitive doing its job. What
    // must not appear is a ROW SPAN — the thing that fixes a box's height.
    expect(markup).not.toMatch(/data-row=/)
    expect(markup).not.toMatch(/row-span-/)
  })

  it('prints everything the blocks hold — the evidence at the bottom of the longest one included', () => {
    const text = renderText(<VoiceSurfacePage data={voiceFixture()} params={{}} />)
    expect(text).toContain('Track this')
    expect(text).toContain('Have we seen this before?')
    expect(text).toContain('A video can carry more than one group')
  })

  it('prints no method footnote; soundness is the page bar\u2019s (copy de-clutter ruling B)', () => {
    const text = renderText(<VoiceSurfacePage data={voiceFixture()} params={{}} />)
    expect(text).not.toContain('Prepared for Sealand with Verbatim')
    expect(text).not.toContain('read in this window')
    expect(text).not.toContain('Of everything we have ever read for you, not just this window')
    expect(text).not.toContain('Reddit comments are capped at')
    expect(text).not.toContain('Every figure above reads')
    // The privacy line is legal, not method, and stays.
    expect(text).toContain('Commenters are never identified; quotes carry platform and date only.')
  })

  it('takes the page bar\u2019s right-hand control from its caller, never from a hook', () => {
    // `HowToRead` reads useSearchParams; this page also renders under
    // renderToStaticMarkup and inside Chrome on the print path, where no
    // router is mounted. The route passes the pill in.
    const text = renderText(<VoiceSurfacePage data={voiceFixture()} params={{}} controls={<span>How to read this page</span>} />)
    expect(text).toContain('How to read this page')
  })

  it('prints the window in the page bar, where the artboard puts it', () => {
    // It printed only in the method footnote, on the stated grounds that the
    // bar has no room beside four horizon pills and the legend and that the
    // bar is main's file. Measured at 1440 the pill row ends at x≈657 of an
    // 1,180px bar — ~520px free — and `SurfacePageBar` has taken a `range`
    // prop since wave 2. Neither half of that argument held.
    expect(voiceHorizonRange(voiceFixture())).toBe('1 Jul → 30 Sep')
    const text = renderText(<VoiceSurfacePage data={voiceFixture()} params={{}} />)
    expect(text).toContain('1 Jul → 30 Sep')
  })

  it('says the workspace has been read at all before it says anything else', () => {
    const text = renderText(<VoiceSurfacePage data={null} params={{}} />)
    expect(text).toContain('Nothing has been read for this workspace yet')
  })

  it('says a run of months caveat once, for the page', () => {
    const base = voiceFixture()
    const text = renderText(
      <VoiceSurfacePage
        data={{ ...base, notes: [{ kind: 'clustering_changed', months: ['2026-07-01', '2026-08-01'], text: 'Two of these months were grouped under a clustering nobody recorded.' }] }}
        params={{}}
      />,
    )
    expect(text.split('Two of these months')).toHaveLength(2)
  })

  it('renders the whole page in the state production is in', () => {
    const text = renderText(<VoiceSurfacePage data={refusedVoiceFixture()} params={{}} />)
    expect(text).toContain('not recorded month by month for this workspace yet')
    expect(text).toContain('Reading who is talking is not switched on for this workspace yet.')
  })
})

describe('the direction map', () => {
  it('leaves voice.movers false — it gates the LEGACY module, and VO2 reads no map', () => {
    // WP13's own decision, written beside the key in lib/config.ts. VO2 earns
    // its direction words from three consecutive months of the comment-dated
    // series; flipping this key would re-register the run-indexed legacy tile
    // into the Studio and the report starters, which is what D1 forbids.
    expect(DIRECTION_WORDS_BY_READER['voice.movers']).toBe(false)
  })
})
