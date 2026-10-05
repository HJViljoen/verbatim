import type { BriefFinding, BriefItem, BriefQuote, BriefRole, BriefSection, MonthlyBriefData } from '@/lib/reports/briefs/types'

// Made-up briefs for the deck's tests: a company that sells packs, its
// rivals, the market. Shaped like a stored brief after its quotes resolve
// (the words are in `text`); nothing here is a reading.

const who = (market: number, rival = 0) => [
  { about: 'market' as const, videos: market },
  ...(rival ? [{ about: 'rival:Ridgeline' as const, videos: rival }] : []),
]

export const item = (title: string, text: string, o: Partial<BriefItem> = {}): BriefItem => ({
  title, text, videos: 6, who: who(5, 1), basedOn: ['G1'], videoIds: ['v1', 'v2', 'v3', 'v4', 'v5', 'v6'], ...o,
})

export const quote = (text: string, o: Partial<BriefQuote> = {}): BriefQuote => ({
  ref: `e:${text.length}-${o.platform ?? 'reddit'}`, text: text as '', date: '2026-09-21', platform: 'reddit', about: 'market', ownPost: false, lang: null, ...o,
})

export const finding = (headline: string, o: Partial<BriefFinding> = {}): BriefFinding => ({
  ideaId: 'I1',
  headline,
  basedOn: ['G1', 'G2'],
  saw: [
    'Buyers ask where the pack is sold, which link to use and what shipping looks like before they commit.',
    'Owners describe the hip belt and the side pockets as the parts they check first.',
  ],
  means: 'The route to buy is part of the product here: a buyer who cannot find it moves on to a pack they can order today.',
  practice: ['Questions about stock and shipping come with questions about size.'],
  months: [{ month: '2026-08-01', videos: 4 }, { month: '2026-09-01', videos: 9 }],
  videos: 12,
  who: who(10, 2),
  quotes: [
    quote('I would buy it today if I could find where it ships from and how long it takes.'),
    quote('Mine has done two years of commuting and the zips still run smooth.', { platform: 'youtube', about: 'rival:Ridgeline' }),
  ],
  ...o,
})

const section = (key: BriefSection['key'], title: string, groups: BriefSection['groups'], o: Partial<BriefSection> = {}): BriefSection => ({ key, title, groups, ...o })

export function briefFixture(role: BriefRole): MonthlyBriefData {
  const base = {
    version: 1 as const,
    kind: 'monthly_brief' as const,
    role,
    title: 'brief',
    company: 'Acme',
    noun: 'packs',
    month: '2026-09-01',
    heardMonths: ['2026-08-01', '2026-09-01'],
    inShort: {
      summary: 'Buyers like the idea of a pack that lasts, and ask plain questions before they commit: where to buy it, what it costs to ship and whether the zips hold.',
      figures: [{ value: '900', label: 'videos in your market in September, with 20,000 comments' }, { value: '23%', label: 'of them about Buying & delivery, the biggest subject' }],
      also: [{ headline: 'People ask to see the pack carried on a long day', brief: (role === 'content' ? 'sales' : 'content') as BriefRole }],
    },
    findings: [finding('The route to buy decides whether interest becomes an order')],
    held: [],
    promptVersion: 'monthly_brief_v1',
    model: 'gpt-5.4',
    costUsd: 0,
  }
  const sections: Record<BriefRole, BriefSection[]> = {
    sales: [
      section('sales.buyers', 'Who is buying', [{ items: [
        item('Commuters with a laptop', 'People who carry a laptop every day want a pack that holds its shape and keeps the laptop apart.', { detail: 'They ask about the sleeve and the back panel first.' }),
        item('Weekend walkers', 'People who walk at weekends want a light pack with room for a jacket and water.'),
      ] }]),
      section('sales.deciders', 'Who else is in the decision', [{ items: [item('Shop staff', 'Staff in outdoor shops are asked which pack fits a long torso.')] }]),
      section('sales.stops', 'What stops them', [{ items: [
        item('Price that has to earn its keep', 'Shoppers ask whether the pack is worth paying more for than one from a supermarket.'),
        item('Doubt about daily wear', 'People ask whether the fabric tears, how it cleans and whether it smells after rain.', { tag: 'Argued in the Content brief' }),
      ] }], { quote: quote('Why is it worth what people are saying it is worth, I am so lost.') }),
      section('sales.settle', 'What they want settled first', [{ items: [item('', 'Will the pack keep rain out?', { detail: 'Owners compare it with the one they own.' })] }]),
      section('sales.triggers', 'What tips them into buying', [{ items: [
        item('The old pack gives out', 'Replacement starts when the pack people own fails or is discontinued.'),
        item('Back to school', 'Back to school is a moment people weigh reusing a pack against buying one.'),
      ] }], { quote: quote('I picked the one with the padded straps because my shoulders hurt.') }),
      section('sales.rivals', 'What each rival is bought for', [{ items: [item('Ridgeline', 'Ridgeline is chosen for travel and its warranty.', { detail: 'People pass on it when the pack loses its shape.', who: who(0, 4), videos: 4 })] }]),
      section('sales.care', 'Language to handle with care', [{ items: [item('waterproof', 'Owners separate weather resistance from true waterproof performance.')] }]),
    ],
    marketing: [
      section('marketing.believe', 'What the market believes, and what it doubts', [
        { label: 'What it believes', items: [item('', 'Buyers expect a pack to last for years and judge the price against that.')] },
        { label: 'What it doubts', items: [item('', 'People question whether recycled fabric holds up under load.')] },
      ], { quote: quote('A good pack will outlast a cheap one by years.') }),
      section('marketing.words', 'In its own words', [
        { label: 'What they praise', items: [item('', 'Comments praise packs that look tidy and feel light.')] },
        { label: 'How they describe it', items: [item('', 'People call a good pack roomy, light and easy to clean.')] },
      ], { voices: [quote('So roomy and still light on the back.', { platform: 'tiktok' })] }),
      section('marketing.say_hear', 'What Acme says, and what comes back', [{ items: [item('Built to last a lifetime of commutes.', 'Owners repeat the promise when they describe years of use.', { who: [{ about: 'client', videos: 4 }], videos: 4 })] }]),
      section('marketing.recall', 'How Acme is remembered', [
        { label: 'Praised for', items: [item('', 'People under Acme posts praise the repairs service.', { who: [{ about: 'client', videos: 3 }], videos: 3 })] },
        { label: 'Criticised for', items: [item('', 'People under Acme posts ask why stock runs out.', { who: [{ about: 'client', videos: 3 }], videos: 3 })] },
      ]),
      section('marketing.rivals', 'How the rivals are heard', [{ items: [item('Ridgeline', 'Owners know Ridgeline for travel packs that keep their shape.', { who: who(0, 3), videos: 3 })] }]),
    ],
    content: [
      section('content.questions', 'The questions people ask', [{ items: [item('', 'Where can I buy this pack, and is this one in stock?', { detail: 'Interest is ready but the route is unclear.' }), item('', 'How does it sit on the back when it is full?')] }]),
      section('content.formats', "What works in the market's videos", [
        { label: 'Formats', base: 'Shares of 2,000 videos in the market · counts of 12 Acme posts', items: [
          item('Story', '12% of the market\'s videos published in September, at a median engagement of 5.0%.', { measure: { pct: 12.5, median: 5, own: 3, ownOf: 12 }, videos: undefined, who: undefined }),
          item('Review', '13% of the market\'s videos published in September.', { measure: { pct: 13.3, median: null, own: 0, ownOf: 12 }, videos: undefined, who: undefined }),
        ], lines: ['Story videos run at a median engagement of 5.0%, against 2.1% for all the market\'s videos.'] },
      ], { lead: "The videos published in the market in September, by format and by how they open, with Acme's own posts beside them." }),
      section('content.watch', 'What comments say about the videos', [
        { label: 'What the comments praise', items: [item('Clear teaching', 'People praise videos that show how the pack opens and packs.')] },
        { label: 'What the comments complain about', items: [item('Hard to follow steps', 'Viewers complain when a tutorial skips steps.')] },
      ]),
      section('content.more', 'What people want to be shown', [{ items: [item('How it carries', 'Viewers ask to see the pack full, on a walk and on a bus.')] }], { quote: quote('Show it with a laptop and lunch in it please.', { platform: 'youtube' }) }),
      section('content.confusion', 'Where the confusion starts', [{ items: [item('Soft means badly made', 'People read a soft shape as weak until they see it carry weight.')] }], { lead: 'People misread soft packs as weak and recycled fabric as thin.' }),
      section('content.borrow', 'Words to borrow', [], { voices: [quote('Light on the back and holds everything.', { platform: 'tiktok' })] }),
    ],
    leadership: [
      section('leadership.market', 'Where the market stands', [{ items: [
        item('Buying & delivery', 'Buyers ask where to buy a pack and whether a colour is in stock.', { detail: '23% of September\'s videos in the market, the biggest subject.', measure: { pct: 23 }, videos: undefined, who: undefined, tag: 'Argued in the Sales brief' }),
        item('Comfort', 'Owners judge packs by padded straps and fit under load.', { detail: '7% of September\'s videos in the market, the third biggest subject.', measure: { pct: 7 }, videos: undefined, who: undefined }),
      ] }], { base: 'Share of the 900 videos in your market in September' }),
      section('leadership.shares', 'Where Acme stands', [
        { label: 'Talk about each brand in September', items: [item('Ridgeline', '1.6% of the market\'s comments and 1.4% of its videos, on videos about Ridgeline.', { measure: { comments: 1.6, videos: 1.4 }, videos: undefined, who: undefined })], lines: ["Acme's own posts drew 245 comments in September."] },
        { label: 'Praised for', items: [item('', 'People under Acme posts praise the repairs service.', { who: [{ about: 'client', videos: 3 }], videos: 3 })] },
      ]),
      section('leadership.weigh', 'What buyers weigh, and what makes them switch', [
        { label: 'What they weigh', items: [item('Practical fit', 'Buyers weigh size, pockets and laptop fit.')] },
        { label: 'What keeps them', items: [item('Years of use', 'Owners stay with a brand whose pack has lasted.')] },
        { label: 'What moves them', items: [item('Poor value', 'Owners leave when the pack feels poor value.')] },
      ], { lead: 'Buyers weigh a pack as a set of trade-offs.', quote: quote('Comfort is the reason I left my old pack.') }),
      section('leadership.risks', 'The risks, in business terms', [{ items: [item('Interest that stalls before the sale', 'Demand turns into admin questions when buying details are missing.', { tag: 'Argued in the Sales brief' })] }]),
      section('leadership.decisions', 'Questions for the business', [{ items: [item('', 'Which models are buyers comparing against Ridgeline?')] }]),
    ],
  }
  return { ...base, sections: sections[role] }
}
