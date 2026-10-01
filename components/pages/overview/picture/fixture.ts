import type { MarketPictureData } from '@/lib/pages/overview-picture'
import type { LongRunReadData } from '@/lib/written/types'

// Your market's fixture: the approved artboard's own Sealand September
// (scratchpad design `pages_rev_data.json`, `Page-Your-market.dc.html`), so
// a render test reads what the design reads. Words and figures only; no read.

export const LONG_RUN_FIXTURE: LongRunReadData = {
  version: 1,
  kind: 'longrun',
  promptVersion: 'longrun_read_v1',
  month: '2026-09-01',
  months: ['2026-08-01', '2026-09-01'],
  window: { from: '2026-08-01T00:00:00.000Z', to: '2026-10-01T00:00:00.000Z' },
  inShort: 'Buyers like the idea of a sustainable bag but ask harder questions before they commit. Sealand is warmly regarded for its mission and its community work; the bags themselves still have to show how they carry, wear and last.',
  ideas: [
    {
      headline: 'Interest stalls when the way to buy isn’t clear',
      body: [
        'People who already want the bag stop on basic buying questions: where it is sold, which link to use, whether it ships to them and whether it is in stock.',
        'Price, size, measurements and colour options are asked for in the same breath. For a distinctive bag, the route to order is part of the product.',
      ],
      basedOn: ['th-a'],
      videos: 42,
      months: [{ month: '2026-08-01', videos: 7 }, { month: '2026-09-01', videos: 35 }],
      who: [{ about: 'rival:The North Face', videos: 1 }, { about: 'market', videos: 41 }],
      sure: 'strong',
    },
    {
      headline: 'Rivals are known for concrete jobs; Sealand is heard for its values',
      body: [
        'Cotopaxi is talked about as a travel tool: durable over repeated trips, well organised and colourful, with its weak spots named just as plainly. Patagonia is trusted for ethics backed by gear that lasts.',
        'Under Sealand’s own posts, the warmest talk is about responsibility, clean-ups and events rather than a particular bag.',
      ],
      basedOn: ['th-c'],
      videos: 30,
      months: [{ month: '2026-08-01', videos: 9 }, { month: '2026-09-01', videos: 23 }],
      who: [{ about: 'client', videos: 6 }, { about: 'rival:Cotopaxi', videos: 10 }, { about: 'rival:The North Face', videos: 2 }, { about: 'rival:Patagonia', videos: 1 }, { about: 'market', videos: 11 }],
      sure: 'strong',
    },
  ],
  held: [],
  model: 'gpt-5.4',
  costUsd: 0.13,
}

export const PICTURE_FIXTURE: MarketPictureData = {
  brand: 'Sealand',
  noun: 'bags',
  month: '2026-09-01',
  soFar: true,
  monthText: 'September so far',
  longRun: LONG_RUN_FIXTURE,
  stands: {
    n: 852,
    rows: [
      {
        subjectId: 's1', name: 'Buying & delivery',
        level: { k: 196, n: 852, text: '23%', kind: 'share', pct: 23 },
        sentence: 'People look for a specific bag or a replacement, naming size, colour, condition and features, and they ask for reviews of other sizes and versions before buying.',
        contents: ['Ready to buy the bag', 'Questions about shipping and availability', 'Specific color choices matter'],
        quote: { text: 'I think it’s time to buy the bluey purple smaller backpack! Great color and easier for me to fly with, as a personal bag.', lang: 'en', english: null, platform: 'youtube', date: '2026-09-21' },
      },
      {
        subjectId: 's2', name: 'Looks & style',
        level: { k: 145, n: 852, text: '17%', kind: 'share', pct: 17 },
        sentence: null,
        contents: ['Design turns some shoppers away', 'Praise for creative personal styling'],
        quote: { text: 'Ik wou dat ze de rits bij de kleur van de tas pasten.', lang: 'nl', english: 'I wish they matched the zip to the colour of the bag.', platform: 'tiktok', date: '2026-09-26' },
      },
      { subjectId: 's6', name: 'Community & purpose', level: null, sentence: null, contents: [], quote: null },
      { subjectId: 's7', name: 'Repair & warranty', level: null, sentence: null, contents: [], quote: null },
      { subjectId: 's8', name: 'Waterproofing', level: null, sentence: null, contents: [], quote: null },
    ],
  },
  conversations: {
    n: 814,
    rows: [
      { registryId: 't1', label: 'Ready to buy the bag', k: 90, text: '11%', kind: 'share', pct: 11, who: [{ about: 'market', videos: 90 }] },
      { registryId: 't2', label: 'Questions about shipping and availability', k: 33, text: '4%', kind: 'share', pct: 4, who: [{ about: 'rival:Cotopaxi', videos: 2 }, { about: 'market', videos: 31 }] },
    ],
    makers: { labels: ['admiration for handmade bag design', 'love for creative upcycling ideas', 'requests for patterns and tutorials'], inTopFive: 3 },
  },
  kinds: {
    n: 852,
    rows: [
      { kind: 'praise', label: 'Praised a bag', k: 627, text: '74%', kindOfLevel: 'share', pct: 74, who: [{ about: 'market', videos: 599 }, { about: 'rival:Patagonia', videos: 11 }, { about: 'rival:The North Face', videos: 8 }, { about: 'rival:Cotopaxi', videos: 5 }, { about: 'rival:Freitag', videos: 4 }] },
      { kind: 'objection', label: 'Pushed back', k: 158, text: '19%', kindOfLevel: 'share', pct: 19, who: [{ about: 'market', videos: 147 }, { about: 'rival:Patagonia', videos: 8 }, { about: 'rival:The North Face', videos: 3 }] },
    ],
  },
}
