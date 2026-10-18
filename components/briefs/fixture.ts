import {
  buyersSection, groupsSection, hooksSection, ideasSection, movesSection, namedSection, productsSection, subjectWords, subjectsBase,
  type BriefAppInputs, type BriefSubjectRead,
} from '@/lib/reports/briefs/app'
import { OSSUR_APP, OSSUR_SUBJECT_FACTS, SEALAND_APP } from '@/lib/reports/briefs/app-fixture'
import type { BriefFinding, BriefItem, BriefQuote, BriefRole, BriefSection, MonthlyBriefData } from '@/lib/reports/briefs/types'

// Made-up briefs for the deck's tests and its canvas comparison: a company
// that sells packs, its rivals, the market. Shaped like a stored brief after
// its quotes resolve (the words are in `text`), and filling EVERY component
// the canvas draws for each role, at about the canvas's lengths, so a render
// of one shows each component drawing. Nothing here is a reading.

const who = (market: number, rival = 0) => [
  { about: 'market' as const, videos: market },
  ...(rival ? [{ about: 'rival:Ridgeline' as const, videos: rival }] : []),
]

export const item = (title: string, text: string, o: Partial<BriefItem> = {}): BriefItem => ({
  ...(title ? { title } : {}), text, videos: 6, who: who(5, 1), basedOn: ['G1'], videoIds: ['v1', 'v2', 'v3', 'v4', 'v5', 'v6'], ...o,
})

let refs = 0
export const quote = (text: string, o: Partial<BriefQuote> = {}): BriefQuote => ({
  ref: `e:q${++refs}-${text.length}`, text: text as '', date: '2026-09-21', platform: 'reddit', about: 'market', ownPost: false, lang: null, ...o,
})

export const finding = (headline: string, o: Partial<BriefFinding> = {}): BriefFinding => ({
  ideaId: 'I1',
  headline,
  short: 'The route to buy',
  basedOn: ['G1', 'G2'],
  saw: [
    'Some shoppers are already past admiration and into ordering, but they stop on the basics. They ask where the pack is sold, which link to use, whether there is local pickup, what shipping looks like and whether the pack is in stock, next to direct requests for price, size, measurements and colours.',
    'The one-off quality that makes a pack memorable also leaves buyers unsure what is ready to buy, what is made to order and what personalisation is possible. In this market, product detail and buying detail are the same decision.',
  ],
  means: 'The talk shows demand that is not blocked by inspiration, but by missing buying basics. For a distinctive pack the path to order is part of the product, because shoppers use price, size, colours and custom rules to decide whether the pack fits their life.',
  practice: ['Ready-to-buy interest depends on one visible buying route and one visible custom route.', 'Measurements, colours, stock and worn photos are buying information, not extra detail.'],
  months: [{ month: '2026-08-01', videos: 4 }, { month: '2026-09-01', videos: 9 }],
  videos: 12,
  who: who(10, 2),
  quotes: [
    quote('I was especially interested in the pack! That colour is only for this season, right? I like this colour combination and was wondering whether to buy it.', { platform: 'youtube', date: '2026-09-23', lang: 'ja', english: 'I was especially interested in the pack! That colour is only for this season, right? I like this colour combination and was wondering whether to buy it.' } as Partial<BriefQuote>),
  ],
  ...o,
})

const section = (key: BriefSection['key'], title: string, groups: BriefSection['groups'], o: Partial<BriefSection> = {}): BriefSection => ({ key, title, groups, ...o })

const persona = (want: string, stops: string, moves: string, forSale: string) => ({ want, stops, moves, forSale })

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
    held: [],
    promptVersion: 'monthly_brief_v2',
    model: 'gpt-5.4',
    costUsd: 0,
  }
  const also = (except: BriefRole) => ([
    { headline: 'Interest stalls when the route to buy stays unclear', brief: 'sales' as BriefRole },
    { headline: 'Reuse wins attention, but proof is judged in wear and origin', brief: 'marketing' as BriefRole },
    { headline: 'Acme\'s community work is remembered more clearly than its product case', brief: 'marketing' as BriefRole },
    { headline: 'A distinctive shape needs use proof before it feels practical', brief: 'content' as BriefRole },
    { headline: 'Rivals own concrete jobs, Acme is heard more for values', brief: 'leadership' as BriefRole },
  ]).filter((a) => a.brief !== except)
  const summary = {
    sales: 'The talk shows a buyer who already likes the idea of a reused pack, but uses material questions and buying questions to decide whether that interest can become a purchase. Ridgeline meets that buyer through travel use and Northpeak through ethics and long life. Acme is getting warmth for its community work, but the sale depends on making the pack itself easier to trust and easier to buy.',
    marketing: 'The category treats a reused or handmade pack as everyday gear first and a values object second. People arrive liking inventive reuse and visible craft, but they test those cues against rain, spills, smell, load, comfort and whether the price buys years of use. For Acme, the clearest live asset is its community clean-up work, which people repeat back as real work rather than polished brand language.',
    content: 'Buyers ask what the pack is made from, whether the reuse and handmade claims are real, how it carries, how long it lasts, what it costs and where to buy it. The talk is not asking for bigger purpose language. It is asking for proof and a buying path, and the open questions are basic enough to slow a purchase.',
    leadership: 'The talk shows a buyer who likes reused, handmade packs but asks harder questions before committing. The demand is practical: pockets, laptop fit, comfort, rain, lifespan, price, stock and how to buy. Acme is warmer around mission, community and team than around proved product performance, while Ridgeline is tested in concrete travel terms.',
  }[role]
  const figures = {
    sales: [{ value: '852', label: 'videos in your market in September' }, { value: '23%', label: 'of them about Buying & delivery, the biggest subject' }],
    marketing: [{ value: '852', label: 'videos in your market in September' }, { value: '25', label: 'posts Acme published in September' }],
    content: [{ value: '852', label: 'videos in your market in September' }, { value: '4.7%', label: 'median engagement on the category\'s story videos, against 2.1% for all its videos' }],
    leadership: [{ value: '852', label: 'videos and 21,468 comments in your market in September' }, { value: '1.1%', label: 'of September\'s comments were under Acme\'s posts; Northpeak held 1.7%' }],
  }[role]
  const findings: Record<BriefRole, BriefFinding[]> = {
    sales: [finding('Interest stalls when the route to buy stays unclear', { subjectLine: 'Part of Buying & delivery, the biggest subject in your market: 23% of September\'s videos.' })],
    marketing: [
      finding('Reuse wins attention, but proof is judged in wear and origin', {
        short: 'Proof in wear and origin',
        saw: [
          'Discarded material turned into a wearable pack stops people. The appeal is not only the reuse: buyers talk about inventive reuse, visible handwork and a pack that still looks stylish and useful.',
          'Some doubt reused claims when the inputs look new or the process is hidden. Buyers also test the idea against daily use, asking about tearing, rain, spills, smell, strap feel and whether the materials will feel cheap or hard to clean.',
          'The gap in Acme\'s own story sits here. Reuse language draws attention, but the talk answers it with requests for proof of the source material and lived performance.',
        ],
        means: 'Reuse is heard as a claim that must survive practical use and genuine reuse questions. Buyers do not separate ethics from weather, mess, comfort or lifespan when judging a pack.',
        practice: ['Material origin and day-to-day behaviour are the proof points buyers reach for before belief hardens.'],
        quotes: [quote('Whenever my old pack starts peeling I will start looking for a new travel pack and I will keep this one in mind.', { date: '2026-09-26' })],
      }),
      finding('Acme\'s community work is remembered more clearly than its product case', {
        ideaId: 'I2',
        short: 'Community work, heard back',
        saw: [
          'When Acme talks about its clean-up days and local action, people answer in kind. People praise the clean-up work, the responsibility stance and the sense that the brand is rooted in a real place.',
          'Some talk shows goodwill toward Acme\'s team. The language is about mission, events and the people behind the brand, while some public talk asks what Acme is and where it comes from.',
          'Certification and award language does not come back in people\'s own words, and the product itself is less defined in the talk than the brand.',
        ],
        means: 'Community action is being heard as lived behaviour, which is an asset. Mission recall does not become product clarity on its own, and goodwill can sit apart from buying confidence.',
        practice: ['Community credibility is a live asset, but it does not answer the product questions buyers use to compare packs.'],
        quotes: [quote('Such an amazing team and inspiring company to be working with', { platform: 'instagram', about: 'client', ownPost: true, date: '2026-09-18' })],
      }),
    ],
    content: [finding('A distinctive shape needs use proof before it feels practical', {
      short: 'Show how it carries',
      saw: [
        'Unusual shapes and soft construction are judged against ordinary pack expectations unless the post explains how the pack works. Comments ask how it wears, what it carries, whether it stands on its own and whether it feels sweaty against the back.',
        'What buyers ask for instead is practical proof: pocket layout, inside organisation, size differences, bottle storage, laptop carry, comfort and travel use. Some are frustrated when videos move too fast or stay at mood level.',
      ],
      means: 'A pack like this is not being judged only on style. Buyers want the design put into everyday terms: how it sits on the body, what fits inside, what trade-offs come with the materials and how the build affects comfort.',
      practice: ['On-body carry, packed use and inside layout are the language practical buyers ask for.'],
      quotes: [
        quote('the small one doesn\'t have a water bottle holder which was a deal breaker for me.', { platform: 'tiktok', date: '2026-09-14' }),
        quote('I do not like the carry handle design on the top part of the straps. I\'m short and like to wear my packs high and it digs into your neck.', { platform: 'youtube', date: '2026-09-09' }),
      ],
    })],
    leadership: [finding('Rivals own concrete jobs, Acme is heard more for values', {
      short: 'Rivals own concrete jobs',
      saw: [
        'Ridgeline is talked about as a travel tool with personality. Buyers and owners praise its durability over repeated trips, useful organisation, colour and repair or warranty cues. The objections are concrete too: price for the rain protection, strap shape, inside layout and models that lose structure.',
        'Northpeak is heard through ethics and performance together, where environmental action feels credible because the gear is expected to last. Fieldwork is admired for one-off identity, everyday style and reused materials with visible past lives.',
        'On Acme\'s own posts, the warmest response centres on responsibility, clean-up work, events and general encouragement, rather than talk about a model.',
      ],
      means: 'The standard near Acme is practical proof, not mission language alone. Acme enters the set as a brand to approve of and support. That is an asset for affinity, but it leaves the product comparison open to rivals unless the pack itself is easier to picture in daily use.',
      practice: [],
      quotes: [quote('I\'ve never had a pack that didn\'t destroy my shoulders until two weeks ago because I got one with a thick waist belt that rests on my hips.', { date: '2026-09-27' })],
      heardFor: [
        { name: 'Ridgeline', you: false, phrase: 'Travel use' },
        { name: 'Northpeak', you: false, phrase: 'Long-life ethical gear' },
        { name: 'Fieldwork', you: false, phrase: 'Identity-led everyday style' },
        { name: 'Acme', you: true, phrase: 'A brand to approve of and support' },
      ],
    })],
  }
  const sections: Record<BriefRole, BriefSection[]> = {
    sales: [
      section('sales.buyers', 'Who is buying', [{ items: [
        item('Researcher', 'The Researcher is trying to choose one pack that will hold up in real life, so they test every option against their routine before they trust it.', {
          persona: persona(
            'They want confidence that the pack will fit the job without daily trouble, because a wrong choice shows up every time they pack, carry or travel. Their questions are about avoiding a compromise on comfort, room and organisation.',
            'They stall when brands leave the basics vague or when the pack seems to trade usefulness for a cleaner shape. Unclear sizes, pocket layouts and carry rules make the purchase feel like a gamble.',
            'They move when they see practical proof instead of general praise, especially details that place the pack in believable use. Honest trade-offs land because they help them choose with fewer surprises.',
            'This buyer is trying to avoid a bad daily compromise. Room, pocket layout, carry comfort and travel fit are the questions that have to feel answered before style or mission can close the choice.'),
        }),
        item('Pack lover', 'The Pack lover is drawn to shape, colour and personality first, then looks for the quickest path from admiration to owning one.', {
          persona: persona(
            'They want a pack that feels expressive as well as useful, because carrying it is part of how they show taste. New colours, styling and original details matter because they make the object worth chasing.',
            'Interest stops when the buying path is unclear or when the design they want is out of stock, missing in the right format or hard to find. If the pack cannot be bought quickly, the feeling passes.',
            'They respond to styling, close detail and clear access because desire starts with a look and needs little reasoning. Variants and new colours work because they extend the feeling that drew them in.',
            'This buyer decides from shape, colour and personality first, then needs an easy path to buy before interest passes. New variants and visible details move the decision.'),
        }),
        item('Supporter', 'The Supporter wants their pack to say something about how they buy, and looks for proof that the story and the object deserve each other.', {
          persona: persona(
            'They want a purchase that reduces waste, backs credible makers and still feels like something they will be proud to use. If they are going to buy, they want the decision to line up with their values.',
            'They pull back when reuse claims sound vague, the origin story feels staged, or the brand seems to trade on purpose without substance. Doubt turns a feel-good purchase into a trust question.',
            'Visible craft, local making, open sourcing and repair move them because those signals make the values plain. They respond when the mission feels lived in rather than pasted on.',
            'This buyer wants the object and the ethics to match. Proof of sourcing, craft and repair matters because vague purpose claims turn the sale into a trust test.'),
        }),
        item('Maker', 'The Maker watches pack videos as a project to learn from and is deciding whether they can make the idea with what they have.', {
          muted: true,
          pill: 'Mostly makes, rarely buys',
          persona: persona(
            'They want the satisfaction of turning discarded material into something useful and beautiful, because doing it themselves makes the idea feel real. The pack is as much a lesson as an object.',
            'They lose confidence when the process feels rushed, key measurements are missing, or the skill seems hidden behind polished results. That gap turns inspiration into a project that may be harder than it looks.',
            'Clear, grounded teaching moves them because it turns tools, scraps and steps into something they can picture in their own hands. Exact materials and slower explanations land better than lifestyle polish.',
            'Mostly makes rather than buys. When a maker praises a pack, it is admiration for the idea, not demand for the product.'),
        }),
      ] }]),
      section('sales.deciders', 'Who else is in the decision', [{ items: [item('Shop staff', 'Staff in outdoor shops are asked which pack fits a long torso.')] }]),
      section('sales.stops', 'What stops them', [{ items: [
        item('Price that has to earn its keep', 'Once the product looks credible and suitable, shoppers ask about price, stock, shipping or location, and whether the pack is worth paying more for.'),
        item('Doubt about daily wear', 'People question whether these packs hold up in daily life: tearing, cleaning, smell, rain, spills, strap feel, and whether lighter materials trade away a long life.'),
        item('A story that feels off', 'Trust breaks when the reuse story feels off: inputs that look new, new materials in place of reused ones, or a pack that seems fake.', { tag: 'Argued in the Marketing brief' }),
        item('The wrong fit or look', 'Hesitation comes when a pack looks awkward on the body, fails the buyer\'s style standard, seems cheap in its details, feels insecure for travel or is awkward to carry.'),
        item('No way to act', 'Some buyers are willing in principle but cannot move without price, where to order, stock, shipping, and photos that show the size or how the pack looks worn.'),
      ] }], { quote: quote('Why is it worth what people are saying it\'s worth, I\'m so lost, looks like a plain cheap pack no offense intended', { date: '2026-09-23' }) }),
      section('sales.settle', 'What they want settled first', [{ items: [
        item('', 'What it is made from: the fabric, handles and reinforcement.'),
        item('', 'Whether the material will hold up, and not tear, peel or wear out.'),
        item('', 'How it handles cleaning, rain and smells.'),
        item('', 'Whether it fits the job: room, laptop, pockets, access, strap comfort when loaded.'),
        item('', 'Price, stock, shipping, and whether it is worth paying more for.'),
      ] }]),
      section('sales.triggers', 'What tips them into buying', [{ items: [
        item('The old pack gives out', 'Replacement purchases start when the pack people own fails, feels cheaply made, is discontinued, or no longer offers the durability and features people want next.'),
        item('Back to school', 'Back to school creates a decision point, but not an automatic one: people weigh reusing a pack against the habit of buying a fresh one.', { quote: quote('I picked the one with padded straps because the back padding has saved my shoulders from carrying notebooks and a textbook!', { platform: 'tiktok', date: '2026-09-26' }) }),
        item('A new stage of life', 'Graduation, moving into school-and-work use, switching back to packs for comfort, or resizing for travel all set the timing.'),
        item('Money in hand', 'What people can afford shapes when interest becomes a purchase: people buy after getting a job, after saving up, in a sale, or second hand.', { quote: quote('The one I want is 209€, still above budget.', { date: '2026-09-26' }) }),
        item('The design that lands', 'Seeing a pack with unusual materials, craft or styling can itself create the buying moment, with people moving from admiration to asking how to get one.', { quote: quote('I\'d move heaven and Earth for this pack.', { date: '2026-09-21' }) }),
      ] }]),
      section('sales.rivals', 'Who buyers compare you with', [{ items: [
        item('Ridgeline', 'Packs that last through travel and hard use, organisation that works on trips, a front pocket that stays usable when packed, bright colour, and warranty or repair cues.', {
          pill: 'Bought for travel use', detail: 'Premium money without matching weight, rain resistance or waterproof zips; weak inside materials and space planning; strap shape, and packs that lose structure.', who: who(0, 4), videos: 4,
          quote: quote('I second ridgeline. I have their duffel and have had their travel pack and both are solid', { about: 'rival:Ridgeline', date: '2026-09-23' }),
        }),
        item('Northpeak', 'Environmental action that feels credible because the gear is expected to last. Some shoppers who doubt Ridgeline\'s durability prefer Northpeak for repair and replacement confidence.', { pill: 'Bought for long-life ethical gear' }),
        item('Fieldwork', 'A mission paired with packs that feel individual, each made from reused material with a visible past life. Linked to students and young adults, for school and everyday carry.', { pill: 'Bought for identity-led everyday style' }),
      ] }], { also: 'Buyers place Ridgeline alongside Trailmark, Pakt and Bellrow, comparing simplicity, room, locking, materials and carry comfort before deciding.' }),
      section('sales.care', 'Language to handle with care', [{ items: [
        item('reused or recycled', 'These words set off authenticity tests if the inputs look new or partly new.'),
        item('waterproof', 'Buyers and owners separate rain resistance from true waterproof performance.'),
        item('handmade or one-off', 'Interest runs high, and so do questions about stock, price and custom orders.'),
        item('award-winning and certified', 'People do not repeat this back as a reason to trust the pack.'),
        item('sustainable', 'The label alone does not settle lifespan, sourcing or value for money.'),
      ] }]),
    ],
    marketing: [
      section('marketing.believe', 'What the market believes, and what it doubts', [
        { label: 'What it believes', items: [
          item('', 'Reused packs already mean care for waste and inventive design: people like old jeans, bottles, shopping bags and worn packs turned into something useful and wearable.'),
          item('', 'Handmade packs carry meaning around skill, effort, beauty and uniqueness, and some connect that craft to why a handmade pack can be worth its price.'),
          item('', 'Packs are judged first on durability and use, and price is treated as something that should buy a long life.'),
          item('', 'Style matters alongside function: people want a pack to feel cute, cool or expressive.'),
          item('', 'The category is measured against established pack brands and trusted makers when people decide what quality should look like.'),
        ] },
        { label: 'What it doubts', items: [
          item('', 'Whether reused products are genuine at all: some read them as fake, vanity-led, or green talk that needs checking.'),
          item('', 'Whether the wider logic holds: materials that are not replaced, plastic fabric that sheds, a fashion business that depends on selling new goods.'),
          item('', 'Whether handmade quality is real when finishing looks uneven, with criticism aimed at lining and stitching.'),
          item('', 'Whether unfamiliar reused materials are clean enough to carry against the body.'),
        ] },
      ], { quote: quote('A good quality expensive pack will almost certainly last a lot longer than a cheap one from the supermarket.', { date: '2026-09-27' }) }),
      section('marketing.words', 'In its own words', [], {
        chips: [
          { label: 'What they call it', words: ['pack', 'bag', 'handbag', 'accessory', 'reused pack', 'handmade pack', 'eco pack', 'non-toxic', 'denim pack', 'packs made from old jeans', 'bottle-based', 'sack style'] },
          { label: 'How they praise it', words: ['practical', 'useful', 'cute', 'stylish', 'beautiful'] },
          { label: 'The problem, in their words', words: ['rips', 'tears under load', 'smells', 'soaks through', 'cleans badly', 'feels awkward to wear', 'fails the style test', 'not weatherproof'] },
        ],
        lead: 'The problem is described less as an abstract cause and more as replacing packs that rip, smell, soak through, clean badly, feel awkward to wear or fail the style test, while turning discarded material into something useful.',
        panel: { title: 'What makes them stop, share and argue', rows: [
          item('They stop on', 'An ordinary waste material turned into a pack that looks stylish, useful and clearly handmade.'),
          item('They share', 'A repair, DIY or reuse idea they can copy.'),
          item('They argue over', 'Posts that challenge handmade value, or leave durability, cleaning, rain, price or looks unanswered.'),
        ] },
      }),
      section('marketing.say_hear', 'What Acme says, and what comes back', [{ items: [
        item('Clean Paths: a community clean-up, asking everyone to pick up at least one piece of litter outdoors.', 'People praise the clean-up work, the responsibility stance and a brand rooted in a real place that invites people in.', { status: 'heard_back', who: [{ about: 'client', videos: 4 }], videos: 4 }),
        item('An award-winning certified company, proving business can be a force for good.', 'Certification and award language does not come back in people\'s own words, and is not repeated as a reason to trust the pack.', { status: 'not_echoed' }),
        item('Great design and responsible making can coexist.', 'Warmth for the mission and the team; the product itself is less defined in the talk than the brand.', { status: 'heard_as_values' }),
        item('Dead stock fabric reborn with purpose, built for the outdoors and the street.', 'Across the market, reuse claims meet two tests: are the inputs genuine, and does the pack hold up in rain and wear.', { status: 'tested' }),
        item('Acme Gear, the brand name.', 'Some public talk asks what Acme is, where it comes from, or whether a pack marked Acmé is the same brand at all.', { status: 'confused' }),
      ] }]),
      section('marketing.recall', 'How Acme is remembered', [
        { label: 'Praised for', items: [item('', 'People under Acme posts praise the repairs service.', { who: [{ about: 'client', videos: 3 }], videos: 3 })] },
      ]),
      section('marketing.rivals', 'How rivals are heard', [{ items: [
        item('Ridgeline', 'Durable over repeated trips, well organised, playful colour; some connect the look with its use of leftover materials and a mission story.', { pill: 'A travel tool with personality', who: who(0, 3), videos: 3 }),
        item('Northpeak', 'Environmental action feels credible because the gear is expected to last.', { pill: 'Ethics plus performance' }),
        item('Fieldwork', 'A mission and reused materials with visible past lives; cool everyday style for school and city.', { pill: 'One-off identity' }),
        item('Acme', 'Responsibility, clean-up work, events and the team; less talk about a model.', { pill: 'Values', you: true }),
      ] }], { posts: { title: 'Own posts published in September', rows: [
        { name: 'Acme', you: true, posts: 25, five: 11, pct: 44 },
        { name: 'Trailmark', you: false, posts: 29, five: 24, pct: 83 },
        { name: 'Northpeak', you: false, posts: 38, five: 19, pct: 50 },
        { name: 'Ridgeline', you: false, posts: 29, five: 8, pct: 28 },
        { name: 'Freewheel', you: false, posts: 50, five: 14, pct: 28 },
        { name: 'Fieldwork', you: false, posts: 20, five: 5, pct: 25 },
      ] } }),
    ],
    content: [
      section('content.questions', 'The questions people ask', [{ items: [
        item('', 'Where can I actually buy this pack, and is this exact one still available?', { detail: 'Admiration is turning into buying intent, but the path to order is unclear.' }),
        item('', 'Do you ship to my country, what does it cost, and how long does it take?', { detail: 'Ready buyers do not know whether checkout is possible from where they live.' }),
        item('', 'What is this pack really made from?', { detail: 'The reuse claim is being tested through fabric, trims, lining and joins.' }),
        item('', 'Is it actually reused and handmade, or is this just made to look that way?', { detail: 'Buyers do not want to mistake image for proof.' }),
        item('', 'Will it hold up in daily use, or get messy, sweaty or wet?', { detail: 'Unfamiliar materials and soft construction raise doubts about performance.' }),
        item('', 'How does it sit on the body, and what actually fits inside?', { detail: 'Soft shapes are judged as impractical when use is not shown.' }),
        item('', 'Can I get it in this colour, size or a custom version?', { detail: 'The exact version in the post is often what people want to buy.' }),
        item('', 'If there is a pattern, tutorial or dimensions, where are they?', { detail: 'Makers are inspired but do not want to waste fabric guessing.', muted: true }),
      ] }]),
      section('content.formats', 'Hooks and formats that work', [
        { label: 'Format', base: 'Shares of 2,623 category videos · counts of 12 Acme posts and 120 Ridgeline videos', items: [
          item('Promotional', '28% of the category\'s videos published in September.', { measure: { pct: 28.1, median: 2.1, own: 9, ownOf: 12, rival: 29, rivalOf: 120 }, videos: undefined, who: undefined }),
          item('Tutorial', '21% of the category\'s videos published in September.', { measure: { pct: 20.5, median: 1.8, own: 0, ownOf: 12, rival: 4, rivalOf: 120 }, videos: undefined, who: undefined }),
          item('Story', '13% of the category\'s videos published in September.', { measure: { pct: 13.3, median: 4.7, above: true, own: 3, ownOf: 12, rival: 11, rivalOf: 120 }, videos: undefined, who: undefined }),
          item('Review', '13% of the category\'s videos published in September.', { measure: { pct: 12.9, median: 2.0, own: 0, ownOf: 12, rival: 45, rivalOf: 120 }, videos: undefined, who: undefined }),
          item('Testimonial', '3% of the category\'s videos published in September.', { measure: { pct: 3.3, median: 3.8, above: true, own: 0, ownOf: 12, rival: 13, rivalOf: 120 }, videos: undefined, who: undefined }),
        ] },
        { label: 'Opening', base: 'Shares of 2,439 category videos · counts of 12 Acme posts and 118 Ridgeline videos', items: [
          item('Bold claim', '44% of them open this way.', { measure: { pct: 43.8, median: 1.8, own: 6, ownOf: 12, rival: 29, rivalOf: 118 }, videos: undefined, who: undefined }),
          item('Personal story', '32% of them open this way.', { measure: { pct: 32.1, median: 3.4, above: true, own: 5, ownOf: 12, rival: 70, rivalOf: 118 }, videos: undefined, who: undefined }),
          item('Question', '9% of them open this way.', { measure: { pct: 9.1, median: 2.1, own: 1, ownOf: 12, rival: 9, rivalOf: 118 }, videos: undefined, who: undefined }),
        ] },
      ], {
        rival: 'Ridgeline',
        lines: [
          'Story videos run at 4.7% median engagement in the category, against 2.1% for all its videos.',
          'Personal story openings run at 3.4%. The most common opening, bold claim, runs at 1.8%.',
          'Of these 12 Acme posts, 9 were promotional posts and 6 opened with a bold claim. Ridgeline\'s videos are most often review videos, and most often open with a personal story.',
        ],
        note: 'Median engagement across all the category\'s videos: 2.1%',
      }),
      section('content.watch', 'What viewers come for, and what loses them', [
        { label: 'What earns a response', items: [
          item('Inventive reuse', 'Turning discarded or natural materials into packs people see as original, stylish and smart.'),
          item('Visible work', 'Handmade craft, uniqueness and the work behind the product.'),
          item('Something to act on', 'Product guidance, repair or remake ideas, or a practical benefit of the pack.'),
        ] },
        { label: 'What loses them', items: [
          item('Rushed or shallow', 'Comments complain when a post is rushed, poorly explained, incomplete, or feels shallow or misleading.'),
          item('Performance left open', 'Spill resistance, durability, design trade-offs, and whether a pack looks good enough to use.'),
        ] },
      ], { lead: 'People come to these posts for two things: inspiration from reused, handmade design, and practical answers about how the pack is made, where to buy it, what it costs and whether it will hold up.' }),
      section('content.more', 'What people want to be shown', [{ items: [
        item('What it is made of', 'The exact fabric or reused input, what trims and handles are made from, and how the parts are attached.'),
        item('How it is made', 'The making process, the construction steps, and the techniques behind turning old material into a pack.'),
        item('How it works', 'Pocket layout, inside organisation, size differences, bottle storage, laptop carry, rain, comfort and travel use.'),
        item('How to buy it', 'Price, stock, ordering, shipping or location, and direct links.'),
        item('What else it comes in', 'Colours, formats, and custom or personalised versions.'),
      ] }], { quote: quote('It would be nice if you included more personal item packs for the Asian and EU airlines, which have smaller sizes and weights than American ones', { platform: 'youtube', date: '2026-09-24' }) }),
      section('content.confusion', 'Where the confusion starts', [{ items: [
        item('New-looking inputs', 'Some separate true reuse from unusual but new-looking materials; when inputs look unused, they question the claim.'),
        item('Unclear sourcing', 'Unclear sourcing and process make people doubt what the pack is made from and whether the reuse story holds.'),
        item('Waste means weak', 'Waste-derived materials suggest residue, weakness or quick failure to some, while others call the same products weatherproof, durable and repairable.'),
        item('Soft means badly made', 'Unusual shapes and soft construction are misread as bad design when people cannot tell how the pack wears or what it carries.'),
        item('Price without the labour', 'Price confuses when shoppers do not connect handmade labour or reuse to value; others point to the work and local making as the value.'),
      ] }], {
        lead: 'People misread packs like Acme\'s in two ways: they confuse reused-looking materials with fake claims or poor quality, and they judge handmade or soft designs by factory-pack expectations.',
        note: 'The confusion starts at first sight, when the source material, construction, carry shape and labour behind the product are not obvious before people judge authenticity, practicality and price.',
      }),
      section('content.borrow', 'Words to borrow', [], { voices: [quote('Light on the back and holds everything.', { platform: 'tiktok' })] }),
    ],
    leadership: [
      section('leadership.market', 'Where the market stands', [{ items: [
        item('Buying & delivery', 'People look for a specific pack or a replacement, naming size, colour, condition and features, and they ask for reviews of other sizes and versions before buying.', { detail: '23% of September\'s videos in the market, the biggest subject.', measure: { pct: 23 }, videos: undefined, who: undefined }),
        item('Looks & style', '', { detail: '17% of September\'s videos in the market, the second biggest subject.', measure: { pct: 17 }, videos: undefined, who: undefined, quote: quote('I wish they would match the hardware and zips to the colour of the pack. Looks wise it cheapens the look of it.', { platform: 'tiktok', date: '2026-09-26' }) }),
        item('Comfort', 'Comfort talk centres on padded straps, shape, laptop carry, chest straps and hip belts, with people wanting to try a pack on with weight before choosing it.', { measure: { pct: 7 }, videos: undefined, who: undefined }),
        item('Durability', 'People trust packs that survive years of use, weather and flights, and they call out cheap packs that wear out or break too soon.', { measure: { pct: 6 }, videos: undefined, who: undefined }),
        item('Price', 'Price talk turns on whether a pack feels worth it beside other options, with buyers questioning expensive models that do not show clear space, function or build.', { measure: { pct: 4 }, videos: undefined, who: undefined }),
        item('Repair & warranty', 'Owners ask who fixes a broken zip.', { measure: { pct: 3 }, videos: undefined, who: undefined }),
      ] }], {
        base: 'Share of the 852 videos in your market in September',
        kinds: { base: 'Share of the 852 videos in your market in September', rows: [{ label: 'Saying it worked', pct: 73.6 }, { label: 'Asking how it works', pct: 52.3 }, { label: 'Hitting a problem', pct: 38.9 }] },
        mood: { base: 'The same 852 videos', rows: [{ mood: 'positive', label: 'Positive', pct: 77 }, { mood: 'mixed', label: 'Mixed', pct: 13.5 }, { mood: 'neutral', label: 'Neutral', pct: 6.9 }, { mood: 'negative', label: 'Negative', pct: 2.6 }] },
      }),
      section('leadership.shares', 'Where Acme stands against its rivals', [{ items: [
        item('Northpeak', '1.7% of September\'s comments and 1.5% of its videos.', { detail: 'Reddit, TikTok, YouTube', measure: { comments: 1.7, videos: 1.5 }, videos: undefined, who: undefined }),
        item('Acme (you)', '1.1% of September\'s comments and 1.2% of its videos.', { detail: 'Its own Instagram posts', you: true, measure: { comments: 1.1, videos: 1.2 }, videos: undefined, who: undefined }),
        item('Ridgeline', '0.6% of September\'s comments and 1.0% of its videos.', { detail: 'Reddit, TikTok, YouTube', measure: { comments: 0.6, videos: 1.0 }, videos: undefined, who: undefined }),
        item('Trailmark', '0.6% of September\'s comments and 1.0% of its videos.', { detail: 'Reddit, YouTube, TikTok', measure: { comments: 0.6, videos: 1.0 }, videos: undefined, who: undefined }),
        item('Fieldwork', '0.2% of September\'s comments and 0.7% of its videos.', { detail: 'TikTok, Reddit, Instagram', measure: { comments: 0.2, videos: 0.7 }, videos: undefined, who: undefined }),
        item('Freewheel', '0.0% of September\'s comments and 0.1% of its videos.', { detail: 'TikTok', measure: { comments: 0.0, videos: 0.1 }, videos: undefined, who: undefined }),
      ] }], {
        sub: 'Share of September\'s conversation: 21,713 comments and 862 videos, Acme\'s own posts included.',
        shares: {
          comments: { client: 1.1, rivals: 3.1, rest: 95.7, line: 'Acme 1.1% · its five rivals 3.1% · the rest of the category 95.7%' },
          videos: { client: 1.2, rivals: 4.3, rest: 94.4, line: 'Acme 1.2% · its five rivals 4.3% · the rest of the category 94.4%' },
        },
        lines: [
          'Acme holds 1.1% of the month\'s comments, second of these six brands, behind Northpeak\'s 1.7%.',
          'Acme and its five rivals together hold 4.3% of the month\'s comments. The rest of the category holds 95.7%.',
          'Acme\'s comments sit under its own Instagram posts. Its rivals are talked about on Reddit, YouTube and TikTok.',
        ],
      }),
      section('leadership.weigh', 'What buyers weigh, and what makes them switch', [
        { label: 'What they weigh', items: [
          item('Craft and looks', 'Construction and design that feel skilled and distinctive.'),
          item('Practical design', 'Size, pockets, closures, room, and fit for travel or office.'),
          item('Proof in ownership', 'Durability, repair, rain handling, stain resistance, carry comfort.'),
          item('Price against others', 'Whether a premium changes the experience enough to justify it.'),
          item('Brand trust', 'Warranty, consistency across the line, and model by model comparison.'),
        ] },
        { label: 'What holds them', items: [
          item('Proof that lasts', 'Packs that last, brands that have not failed them, and warranty confidence.'),
          item('Design and craft', 'Handmade quality, originality, local making and the character of the work.'),
          item('Access', 'Some stay with brands they can find locally and try in person.'),
        ] },
        { label: 'What moves them', items: [
          item('Practical fit', 'Organisation, room, comfort, weight, range of use, and a format that suits the load.'),
          item('Poor value', 'Some leave premium brands when the product feels poor value for the money.'),
          item('A claim that rings false', 'The mission pushes people away when materials seem fake to the reuse claim or uncomfortable against the body.'),
        ] },
      ], {
        lead: 'What feels settled is that a pack has to be attractive and useful. What remains open is whether a reused or handmade option can prove rain resistance, comfort, a long life and a price premium as clearly as established rivals.',
        quote: quote('Comfort is so important that it\'s kinda the main reason I don\'t use my old one anymore, I find it uncomfortable when I\'m walking for too long.', { date: '2026-09-19' }),
      }),
      section('leadership.risks', 'The risks, in business terms', [{ items: [
        item('The mission is taken as interest, not as a reason to pay', 'Attractive and responsible is expected, but the sale is decided on whether the pack looks dependable in rain, wear, loaded carry and everyday organisation. Where those proofs are missing, the mission is treated as interest rather than a reason. Purpose gives people permission to look; durability and care decide whether the pack feels safe to buy.', { tag: 'Argued in the Marketing brief' }),
        item('Interest that stalls before the sale', 'Demand in this market is not blocked by inspiration but by missing buying basics. When buying information is missing, interest turns into admin questions, and a brand is heard as harder to buy than it needs to be. For a distinctive pack, the path to order is part of the product.', { tag: 'Argued in the Sales brief' }),
      ] }]),
      section('leadership.decisions', 'Questions for the business', [{ items: [
        item('', 'Which Acme models are buyers comparing against Ridgeline, Fieldwork or Trailmark when they decide?'),
        item('', 'Do Acme owners show rain handling, stain resistance, comfort and long wear in their own words, not only in brand stories?'),
        item('', 'Are Acme\'s price, stock, shipping and custom-order details easy to find at the moment a buyer wants to act?'),
        item('', 'How much do in-person access, try-on and local stock matter for Acme against brands shoppers know from stores?'),
      ] }]),
      section('leadership.holds', 'What holds so far', [{ items: [
        item('', 'The category treats a reused or handmade pack as everyday gear first and a values object second.', { videos: 42 }),
        item('', 'Buyers like reused, handmade packs but ask harder questions before committing: pockets, laptop fit, comfort, rain, lifespan, price, stock and how to buy.', { videos: 37 }),
        item('', 'Acme is warmer around mission, community and team than around proved product performance, while Ridgeline is tested in concrete travel terms.', { videos: 30 }),
      ] }], {
        sub: 'Patterns here describe August and September. Each was heard in both months.',
        position: item('', 'Well regarded for what it stands for, with product proof the open question.', { who: [{ about: 'client', videos: 5 }], videos: 5 }),
      }),
    ],
  }
  return { ...base, inShort: { summary, figures, also: also(role) }, findings: findings[role], sections: sections[role] }
}

// ---- The October canvas (the boards approved 18 Oct) ------------------------------------------

/** Where the market stands on the October canvas, as the compose step builds
 *  it (compose.ts `subjects`): each ready subject with its level, in its own
 *  read on Market, the panel under them. */
export function subjectsFixture(reads: readonly BriefSubjectRead[] | null, opts: { n?: number; facts?: typeof OSSUR_SUBJECT_FACTS; panel?: boolean } = {}): BriefSection {
  const n = opts.n ?? 902
  const byId = new Map((reads ?? []).map((r) => [r.id, r]))
  const items: BriefItem[] = (opts.facts ?? OSSUR_SUBJECT_FACTS).map((f) => {
    const words = subjectWords(byId.get(f.subjectId))
    const base = { title: f.name, measure: { pct: Math.round((100 * f.k) / n) }, href: `/dashboard/market/subjects/${f.subjectId}?period=month&month=2026-10` }
    return words
      ? { ...base, text: words.headline ?? words.meaning ?? '', ...(words.headline && words.meaning ? { detail: words.meaning } : {}), slot: 'week_read' as const }
      : { ...base, text: 'People ask which part does what before they trust it.' }
  })
  return {
    key: 'leadership.subjects', title: 'Where the market stands', groups: [{ items }], base: subjectsBase(n, '2026-10-01'),
    ...(opts.panel === false ? {} : {
      kinds: { base: `Share of the ${n} videos in your market in October`, rows: [{ label: 'Saying it worked', pct: 61 }, { label: 'Asking how it works', pct: 47 }, { label: 'Hitting a problem', pct: 44 }] },
      mood: { base: `The same ${n} videos`, rows: [{ mood: 'positive', label: 'Positive', pct: 74.8 }, { mood: 'mixed', label: 'Mixed', pct: 13.9 }, { mood: 'neutral', label: 'Neutral', pct: 7.2 }, { mood: 'negative', label: 'Negative', pct: 4.1 }] },
    }),
    foot: 'What people said inside each subject is on its Market page.',
    link: { href: '/dashboard/market?period=month&month=2026-10', text: 'Open October on Market →' },
  }
}

/** A brief on the October canvas: the v1 fixture's writer sections and
 *  findings, and the pages read from the app (`fromApp`) built by the
 *  builders the compose step calls, from Össur-shaped or Sealand-shaped parts
 *  (app-fixture.ts). */
export function octoberFixture(role: BriefRole, opts: { tenant?: 'ossur' | 'sealand'; app?: BriefAppInputs; subjects?: BriefSection | null } = {}): MonthlyBriefData {
  const base = briefFixture(role)
  const tenant = opts.tenant ?? 'ossur'
  const app = opts.app ?? (tenant === 'ossur' ? OSSUR_APP : SEALAND_APP)
  const company = tenant === 'ossur' ? 'Össur' : 'Sealand'
  const subjects = opts.subjects !== undefined ? opts.subjects : subjectsFixture(app.subjectReads)
  const fromApp: Record<BriefRole, (BriefSection | null)[]> = {
    sales: [buyersSection(app.people)],
    marketing: [productsSection(app.products), namedSection(app.named, company)],
    content: [ideasSection(app.ideas), hooksSection(app.hooks)],
    leadership: [subjects, groupsSection(app.people), movesSection(app.moves, null)],
  }
  return { ...base, company, noun: null, month: '2026-10-01', fromApp: fromApp[role].filter((x): x is BriefSection => x != null) }
}
