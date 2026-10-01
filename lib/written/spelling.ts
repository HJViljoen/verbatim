import { quotedSpans } from '../calibration'

// British spelling for the written reads' own prose (`scrubWeekText`, and so
// the long-run read through `scrubLongRun`). The model mixes "color" and
// "colour" in one read; the house spelling is British.
//
// NEVER INSIDE A QUOTATION. Words in quotation marks are the speaker's, so a
// commenter's "color" stays "color". "Inside a quotation" is the one notion
// the digit and direction rules already use (`quotedSpans`, lib/calibration.ts):
// straight or curly double quotes, curly single quotes, and straight single
// quotes only where neither mark sits against a letter or digit, so the
// apostrophe in "Sealand's" never opens a quote.
//
// WHOLE WORDS ONLY, from an explicit list: no `-ize` to `-ise` rule, because
// "size", "prize" and "seize" are not American. A word with a letter on either
// side is a different word ("Colorado", "colorido"), and a hashtag, handle or
// domain ("#color", "@color", "color.com") is a name, not prose.
//
// CASE. Lower case and ALL CAPS convert with their case kept (color to colour,
// COLOR to COLOUR). A Capitalised word converts only where it opens a
// sentence: mid-sentence it is a name ("Honor", "Center Parcs", "Earl Gray")
// and stays as written. Mixed case ("ColorWay") is a product name and stays.
//
// "program" is left out on purpose: "a computer program" is British too, and
// the two senses cannot be told apart from the word.

/**
 * American spelling to British, lower case, whole words with their common
 * inflections. Add a line here to extend the rule; nothing else needs to
 * change.
 */
export const BRITISH_SPELLINGS: Readonly<Record<string, string>> = {
  // colour
  color: 'colour',
  colors: 'colours',
  colored: 'coloured',
  coloring: 'colouring',
  colorful: 'colourful',
  colorway: 'colourway',
  colorways: 'colourways',
  discolored: 'discoloured',
  discoloration: 'discolouration',
  // favourite, favour
  favorite: 'favourite',
  favorites: 'favourites',
  favorited: 'favourited',
  favor: 'favour',
  favors: 'favours',
  favored: 'favoured',
  favoring: 'favouring',
  favorable: 'favourable',
  favorably: 'favourably',
  unfavorable: 'unfavourable',
  // behaviour
  behavior: 'behaviour',
  behaviors: 'behaviours',
  behavioral: 'behavioural',
  // organise
  organize: 'organise',
  organizes: 'organises',
  organized: 'organised',
  organizing: 'organising',
  organizer: 'organiser',
  organizers: 'organisers',
  organization: 'organisation',
  organizations: 'organisations',
  organizational: 'organisational',
  // centre
  center: 'centre',
  centers: 'centres',
  centered: 'centred',
  // travel
  traveled: 'travelled',
  traveling: 'travelling',
  traveler: 'traveller',
  travelers: 'travellers',
  // label
  labeled: 'labelled',
  labeling: 'labelling',
  // grey, jewellery, fibre
  gray: 'grey',
  jewelry: 'jewellery',
  fiber: 'fibre',
  fibers: 'fibres',
  // customise
  customize: 'customise',
  customizes: 'customises',
  customized: 'customised',
  customizing: 'customising',
  customizable: 'customisable',
  customization: 'customisation',
  customizations: 'customisations',
  // personalise
  personalize: 'personalise',
  personalizes: 'personalises',
  personalized: 'personalised',
  personalizing: 'personalising',
  personalization: 'personalisation',
  // prioritise
  prioritize: 'prioritise',
  prioritizes: 'prioritises',
  prioritized: 'prioritised',
  prioritizing: 'prioritising',
  // recognise
  recognize: 'recognise',
  recognizes: 'recognises',
  recognized: 'recognised',
  recognizing: 'recognising',
  recognizable: 'recognisable',
  // realise
  realize: 'realise',
  realizes: 'realises',
  realized: 'realised',
  realizing: 'realising',
  // analyse
  analyze: 'analyse',
  analyzes: 'analyses',
  analyzed: 'analysed',
  analyzing: 'analysing',
  // honour, neighbour, catalogue
  honor: 'honour',
  honors: 'honours',
  honored: 'honoured',
  neighbor: 'neighbour',
  neighbors: 'neighbours',
  neighborhood: 'neighbourhood',
  neighborhoods: 'neighbourhoods',
  catalog: 'catalogue',
  catalogs: 'catalogues',
}

/** One alternation over the list, longest first. A letter, digit or `_` on
 *  either side makes it another word; `#`, `@` or `.` before it, or a `.word`
 *  or `@` after it, makes it a name. */
const US_RE = new RegExp(
  `(?<![\\p{L}\\p{N}_#@.])(?:${Object.keys(BRITISH_SPELLINGS).sort((a, b) => b.length - a.length).join('|')})(?![\\p{L}\\p{N}_@]|\\.[\\p{L}\\p{N}])`,
  'giu',
)

/** Does the word at `offset` open a sentence (start of text, or after a full
 *  stop, `!` or `?`, past any opening bracket or quotation mark)? */
const opensSentence = (text: string, offset: number): boolean =>
  /(?:^|[.!?]\s+)[(\[“‘"']*$/.test(text.slice(0, offset))

/**
 * The text with American spellings from `BRITISH_SPELLINGS` made British,
 * outside quotation marks only, case kept. Pure; a text with nothing to change
 * comes back unchanged.
 */
export function britishSpelling(text: string): string {
  const source = text ?? ''
  if (!source) return source
  const spans = quotedSpans(source)
  return source.replace(US_RE, (word: string, offset: number) => {
    if (spans.some(([a, b]) => offset >= a && offset < b)) return word
    const british = BRITISH_SPELLINGS[word.toLowerCase()]
    if (!british) return word
    if (word === word.toLowerCase()) return british
    if (word === word.toUpperCase()) return british.toUpperCase()
    const capitalised = word[0] + word.slice(1).toLowerCase() === word
    if (capitalised && opensSentence(source, offset)) return british[0].toUpperCase() + british.slice(1)
    return word
  })
}
