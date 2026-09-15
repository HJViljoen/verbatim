import { describe, it, expect } from 'vitest'
import { markupText, decodeEntities } from './render'
import { copyNodes, copyViolations, assertCopyContract, DIRECTION_WORDS, directionRe } from './copy-contract'

// The contract's own tests. Markup strings rather than JSX so this file stays
// under the pure-logic include (`lib/**/*.test.ts`) and the scanner is tested
// on exactly the shapes renderToStaticMarkup emits — self-closed voids, HTML
// entities, nested marked nodes. The tier is exercised end to end on a real
// component in components/copy-contract.test.tsx.

describe('markupText', () => {
  it('drops tags and comments, decodes entities, collapses whitespace', () => {
    expect(markupText('<p class="a">Össur &amp; Sealand<!-- note -->\n  hold  21%</p>')).toBe('Össur & Sealand hold 21%')
  })

  it('does not weld two adjacent elements into one word', () => {
    expect(markupText('<b>one</b><b>two</b>')).toBe('one two')
  })

  it('decodes the numeric forms React emits for quotes', () => {
    expect(decodeEntities('it&#x27;s &quot;fine&quot;')).toBe(`it's "fine"`)
  })
})

describe('copyNodes', () => {
  it('reads a node\'s own words without its marked children', () => {
    const nodes = copyNodes('<p data-copy="prose">Comfort leads, heard across <span data-copy="figure">21 conversations</span>.</p>')
    expect(nodes).toHaveLength(2)
    expect(nodes[0].kind).toBe('prose')
    expect(nodes[0].text).toBe('Comfort leads, heard across 21 conversations .')
    expect(nodes[0].ownText).toBe('Comfort leads, heard across .')
    expect(nodes[1]).toMatchObject({ kind: 'figure', text: '21 conversations' })
  })

  it('cuts an outermost marked child once, grandchild included', () => {
    const [prose] = copyNodes('<p data-copy="prose">a <span data-copy="figure">21 <b data-copy="figure">of 36</b></span> b</p>')
    expect(prose.ownText).toBe('a b')
  })

  it('is not confused by self-closed voids', () => {
    const nodes = copyNodes('<div data-copy="level"><img src="x.png"/>Dominant · 21 of 36<br/></div>')
    expect(nodes).toHaveLength(1)
    expect(nodes[0].text).toBe('Dominant · 21 of 36')
  })

  it('does NOT survive a raw angle bracket inside an attribute value', () => {
    // The honest bound of the scanner, asserted so nobody reads the title
    // above and assumes more. markupText strips tags with /<[^>]*>/g
    // (lib/test/render.ts), so an unescaped `>` in an attribute ends the tag
    // early and its tail lands in the text. Harmless while every input comes
    // from renderToStaticMarkup — React escapes `>` in attribute values — so
    // the fix is "render the block", not a parser; a raw string fixture or a
    // dangerouslySetInnerHTML block is what would break it.
    expect(copyNodes('<span data-copy="level">Dominant · 21 of 36</span>')[0].text).toBe('Dominant · 21 of 36')
    expect(markupText('<span title="a > b">Dominant</span>')).toBe('b">Dominant')
  })

  it('ignores a data-copy value it does not know', () => {
    expect(copyNodes('<p data-copy="headline">hi</p>')).toEqual([])
  })
})

describe('copyViolations — (a) no digit in a model-prose node', () => {
  it('passes prose whose figures are code\'s, in a figure node', () => {
    expect(copyViolations('<p data-copy="prose">Feeling sits at <span data-copy="figure">64%</span> positive.</p>')).toEqual([])
  })

  it('fails a digit the model typed into its own sentence', () => {
    const bad = copyViolations('<p data-copy="prose">Complaints outnumber praise 3 to 1.</p>')
    expect(bad.map((v) => v.rule)).toEqual(['prose-digit'])
    expect(bad[0].text).toContain('3 to 1')
  })

  it('fails an unsubstituted figure token that reached the page', () => {
    const bad = copyViolations('<p data-copy="prose">heard across [[n]].</p>')
    expect(bad.map((v) => v.rule)).toEqual(['prose-figure-token'])
  })

  it('says nothing about digits outside model prose', () => {
    expect(copyViolations('<p>2,341 comments</p>')).toEqual([])
  })
})

describe('copyViolations — (b) every level prints "of N"', () => {
  it('passes a level carrying its denominator', () => {
    expect(copyViolations('<span data-copy="level">Dominant · 21 of 36 Össur conversations</span>')).toEqual([])
  })

  it('passes a denominator written with separators', () => {
    expect(copyViolations('<span data-copy="level">Widespread · 412 of 2,341 conversations</span>')).toEqual([])
  })

  it('fails a calibrated word on its own', () => {
    const bad = copyViolations('<span data-copy="level">Dominant</span>')
    expect(bad.map((v) => v.rule)).toEqual(['level-denominator'])
  })

  it('fails a level that shows a share instead of its evidence', () => {
    expect(copyViolations('<span data-copy="level">Dominant · 58%</span>').map((v) => v.rule)).toEqual(['level-denominator'])
  })
})

describe('copyViolations — (c) no direction word outside a verdict node', () => {
  it('allows the word inside a verdict', () => {
    expect(copyViolations('<p>Strap comfort <span data-copy="verdict">rising, 4 pts on 312 conversations</span></p>')).toEqual([])
  })

  it('fails the same word in ordinary copy', () => {
    const bad = copyViolations('<p>Strap comfort is rising this update.</p>')
    expect(bad.map((v) => v.rule)).toEqual(['direction-word'])
    expect(bad[0].detail).toContain('"rising"')
  })

  it('fails it inside a prose node too — a verdict is the only exemption', () => {
    expect(copyViolations('<p data-copy="prose">The theme keeps gaining.</p>').map((v) => v.rule)).toEqual(['direction-word'])
  })

  it('reports each distinct word once, not each occurrence', () => {
    const bad = copyViolations('<p>gaining, gaining, and fading</p>')
    expect(bad.map((v) => v.rule)).toEqual(['direction-word', 'direction-word'])
  })

  it('leaves the words the product uses without claiming a direction', () => {
    // Bare "up"/"down" and "new" are deliberately out of the list: the pages
    // say "where each one turns up" and "New search term" without promising
    // anything about a series. The New chip is gated in lib/config.ts instead.
    expect(DIRECTION_WORDS).not.toContain('up')
    expect(DIRECTION_WORDS).not.toContain('down')
    expect(DIRECTION_WORDS).not.toContain('new')
    expect(copyViolations('<p>Where each one turns up · New search term</p>')).toEqual([])
  })

  it('catches the families the first list left half-written', () => {
    // Every one of these returned [] before: 'grown' while 'growing' and
    // 'grew' were listed, the whole decline family while increase/decrease
    // were, 'trend' while 'trending' was. A word list with a hole in it fails
    // open, which is the wrong direction for the guard that catches a
    // direction claim nobody marked.
    const words = [
      'grown', 'declined', 'declining', 'decline', 'dropped', 'dropping',
      'jumped', 'soared', 'spiked', 'plunged', 'dipped', 'doubled', 'halved',
      'improved', 'worsened', 'trend', 'trends', 'fell',
    ]
    for (const word of words) {
      const bad = copyViolations(`<p>Strap comfort ${word} this update.</p>`)
      expect(bad.map((v) => v.rule), word).toEqual(['direction-word'])
    }
  })

  it('leaves the bare nouns that double as ordinary verbs out', () => {
    // "rise" and "fall" join up/down/new: the product says "comments that fall
    // outside the window" and means nothing about a series.
    expect(DIRECTION_WORDS).not.toContain('rise')
    expect(DIRECTION_WORDS).not.toContain('fall')
    expect(copyViolations('<p>Comments that fall outside the window.</p>')).toEqual([])
  })

  it('hands out a fresh matcher, so a caller cannot carry lastIndex into the next call', () => {
    const first = directionRe()
    expect(first.exec('gaining and fading')?.[1]).toBe('gaining')
    expect(first.lastIndex).toBeGreaterThan(0)
    expect(directionRe().exec('gaining and fading')?.[1]).toBe('gaining')
  })

  it('matches whole words only', () => {
    expect(copyViolations('<p>Download the upgraded export.</p>')).toEqual([])
  })
})

describe('copyViolations — the marker itself', () => {
  it('fails a data-copy value that is not one of the four kinds', () => {
    const bad = copyViolations('<p data-copy="headline">hello</p>')
    expect(bad.map((v) => v.rule)).toEqual(['unknown-kind'])
  })

  it('sees a single-quoted marker, which used to be invisible', () => {
    // Before: copyNodes returned [] for this, so rules (a) and (b) skipped the
    // node and nothing was reported — a marked node that fails open.
    expect(copyNodes("<p data-copy='prose'>3 things</p>")).toHaveLength(1)
    expect(copyViolations("<p data-copy='prose'>3 things</p>").map((v) => v.rule)).toEqual(['prose-digit'])
  })

  it('reports a marker the scanner cannot resolve into a node', () => {
    // data-copy on a self-closed element: skipped by the scanner (it opens no
    // scope), so it is neither cut from its parent's ownText nor checked. It
    // is now counted and named instead of passing in silence.
    const bad = copyViolations('<p data-copy="prose">a <img data-copy="figure" src="x.png"/> 4</p>')
    expect(bad.map((v) => v.rule)).toContain('unscanned-marker')
    expect(bad.find((v) => v.rule === 'unscanned-marker')?.detail).toContain('2 data-copy markers declared but only 1 node')
  })

  it('counts a well-formed block as fully resolved', () => {
    expect(copyViolations('<p data-copy="prose">a <span data-copy="figure">4</span> b</p>')).toEqual([])
  })
})

describe('assertCopyContract', () => {
  it('is silent on a block that keeps the contract', () => {
    expect(() =>
      assertCopyContract(
        '<section><p data-copy="prose">Comfort leads, heard across <span data-copy="figure">21</span> conversations.</p>' +
          '<span data-copy="level">Dominant · 21 of 36 conversations</span>' +
          '<span data-copy="verdict">gaining, 4 pts on 312 conversations</span></section>',
      ),
    ).not.toThrow()
  })

  it('names every rule it broke, and the words that broke it', () => {
    let message = ''
    try {
      assertCopyContract('<p data-copy="prose">3 in 4 are fading.</p><span data-copy="level">Dominant</span>')
    } catch (e) {
      message = (e as Error).message
    }
    expect(message).toContain('3 violations')
    expect(message).toContain('prose-digit')
    expect(message).toContain('level-denominator')
    expect(message).toContain('direction-word')
  })
})
