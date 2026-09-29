import { describe, expect, it } from 'vitest'

import {
  brandOfAccount, isCarryVideo, isMakerPost, isSellerPost, pickEligible, quoteGate, readableEnglish, readClaim,
  relevanceTo, whyNot, type GateInput, type GateOptions, type QuoteVideo,
} from './quote-gate'

// THE WALKTHROUGH'S KNOWN-BAD QUOTES, WITH THE VIDEOS THEY SAT UNDER.
//
// Every text and every video field below is a real row: the comment as
// written, the translation cache's language and English, and the caption,
// hashtags, topics, account and filing of the video behind it (production,
// 29 Sep 2026, and the staging copy it was taken from). Captions are cut
// where the rest says nothing the gate reads. These are the quotes a Sealand
// reader met on Your market, Subjects, Conversation, This week and Brands;
// each must now fail, for the reason named.

const SEALAND: GateOptions = { market: 'carry', makerRule: true }

const NEWS_BEARS_EARS: QuoteVideo = {
  platform: 'reddit', videoId: '1w5r3rp', accountName: 'r/news', source: 'discovered', isClient: false, isCompetitor: false,
  caption: 'Patagonia Sues Trump Over Reduction of Bears Ears National Monument in Utah (Gift Article)',
  hashtags: [], topics: ['environmental conservation', 'legal action', 'Patagonia brand', 'public land protection', 'corporate activism'],
  segment: 'noise',
}
const CHUPPS_BILLBOARD: QuoteVideo = {
  platform: 'youtube', videoId: 'c6TLF3-HtTE', accountName: 'iSmart Shiva', source: 'discovered', isClient: false, isCompetitor: false,
  caption: 'ఈ Billboard ఎందుకు కరిగిపోయింది? #iSmartShiva #Chupps #SustainableFashion A billboard made to disappear in the rain! Mumbai-based footwear brand Chupps created this biodegradable billboard using mud, cow dung, hay, sawdust and bamboo to visually prove its sustainability message.',
  hashtags: ['ismart shiva', 'shorts', 'chupps', 'chupps footwear', 'branding', 'marketing', 'eco friendly', 'biodegradable'],
  topics: ['biodegradable billboard', 'sustainable footwear', 'eco-friendly marketing', 'fashion waste', 'environmental protection'],
  segment: 'market',
}
const OLDHAG_OOTD: QuoteVideo = {
  platform: 'reddit', videoId: '1waavwe', accountName: 'r/oldhagfashion', source: 'discovered', isClient: false, isCompetitor: false,
  caption: 'OOTD: Presentation Hag (they/them)\n\nDisclaimer: I have over a decade of mass-produced clothing, primarily Torrid and Hot Topic, in my closet from before I started researching how clothes are truly made. I am continuing to love, wear, and repair these pieces because I believe this to be the most ethical action I can take.',
  hashtags: [], topics: ['sustainable fashion', 'slow fashion', 'ethical clothing', 'secondhand shopping', 'presentation outfit', 'personal style'],
  segment: 'market',
}
const TURKISH_KNIT_BAG: QuoteVideo = {
  platform: 'instagram', videoId: 'DdmFVg0uuDH', accountName: 'trend_orgu4', source: 'discovered', isClient: false, isCompetitor: false,
  caption: 'Pullu çanta modeli❣️❣️❣️\n\n…\n#pulluçanta \n#handmade \n#çantamodeli \n#handmadebag \n#kesfetedüş',
  hashtags: ['pulluçanta', 'handmade', 'çantamodeli', 'handmadebag', 'kesfetedüş'],
  topics: ['handmade bag', 'fashion accessory', 'bag model', 'color variety'],
  segment: 'market',
}
const IBADAN_SELLER: QuoteVideo = {
  platform: 'tiktok', videoId: '7686980095516462356', accountName: 'SLIPPERS/SHOES/BAGS IN IBADAN.', source: 'discovered', isClient: false, isCompetitor: false,
  caption: 'Viral TASSEL bag in nude colour combo.A forever best seller . Available to order.  PRICE: 25,000 #handmadebagsinibadan #corporatebags #bagsforwomen #handmadebagsinlagos #nudebag',
  hashtags: ['handmadebagsinibadan', 'corporatebags', 'bagsforwomen', 'handmadebagsinlagos', 'nudebag'],
  topics: ['handmade bags', 'fashion', 'sales', 'viral product'],
  segment: 'market',
}
const PACK_HACKER_TECH: QuoteVideo = {
  platform: 'youtube', videoId: 'Ja_80mT854M', accountName: 'Pack Hacker', source: 'discovered', isClient: false, isCompetitor: false,
  caption: 'Travel Tech Essentials That Make Your Phone More Useful Get an exclusive 15% discount on Saily data plans with code PACKHACKER at checkout.',
  hashtags: ['pack hacker', 'travel gear', 'travel bag', 'minimal packing', 'carry on', 'iphone', 'portable charger', 'travel tech'],
  topics: ['travel tech', 'phone accessories', 'portable SSD hub', 'charging technology', 'travel gear'],
  segment: 'market',
}
const CARRY_ON_ESSENTIALS: QuoteVideo = {
  platform: 'youtube', videoId: '0kYYPl6H66s', accountName: 'Alex Nicoll', source: 'discovered', isClient: false, isCompetitor: false,
  caption: 'My carry-on travel essentials ✈️ you guys can find everything in my bio under travel! #tech #travel #organization #traveltech',
  hashtags: [], topics: ['travel essentials', 'tech gear', 'organization', 'personal care', 'travel comfort'],
  segment: 'market',
}
const SARAH_PACKING: QuoteVideo = {
  platform: 'youtube', videoId: '_unOliNizDI', accountName: 'Sarah Burns', source: 'discovered', isClient: false, isCompetitor: false,
  caption: 'Relaxing packing video ✶ art supplies, knitting, clothes, accessories I am on my way to France, and I’ll be visiting Paris, Avignon, and several beautiful towns in Provence for 3 weeks. In this video we will hang out and pack my bags.',
  hashtags: [], topics: ['packing', 'art supplies', 'travel', 'vacation', 'France', 'painting workshops', 'clothes', 'organization'],
  segment: 'market',
}
const THRIFT_OPINIONS: QuoteVideo = {
  platform: 'tiktok', videoId: '7684617469801155871', accountName: 'refashionedhippie', source: 'discovered', isClient: false, isCompetitor: false,
  caption: 'These are my opinions and I’m sticking to them.  it is almost impossible to buy something that is truly ethical. #Sustainability #SustainableFashion #Consumption #EthicalConsumption #Fashion',
  hashtags: ['sustainability', 'sustainablefashion', 'consumption', 'ethicalconsumption', 'fashion'],
  topics: ['sustainability', 'secondhand shopping', 'ethical consumption', 'fashion', 'environmental impact'],
  segment: 'market',
}
const HERMES_HAUL: QuoteVideo = {
  platform: 'tiktok', videoId: '7686515124630228246', accountName: 'LifeWithMe', source: 'discovered', isClient: false, isCompetitor: false,
  caption: 'Humiliation ritual  #hermes #hermesunboxing #novideosallowed #hermesbags #hermeshaul',
  hashtags: ['hermes', 'hermesunboxing', 'novideosallowed', 'hermesbags', 'hermeshaul'],
  topics: ['luxury handbags', 'Hermes brand', 'customer experience', 'retail rituals', 'luxury fashion'],
  segment: 'market',
}
const DIY_VASELINE_BAG: QuoteVideo = {
  platform: 'youtube', videoId: 'cbpG5Z52DeE', accountName: 'The inner archive', source: 'discovered', isClient: false, isCompetitor: false,
  caption: 'DIY Mini Bag from Vaseline✨ Inspired by @ruchikarathore DIY #DIYCraft #MiniBag #VaselineBottleDIY Made this cute mini bag from a Vaseline bottle',
  hashtags: [], topics: ['DIY mini bag', 'upcycling', 'crafting', 'waste reuse', 'creative reuse'],
  segment: 'maker',
}
const THINK_TANK_OWN: QuoteVideo = {
  platform: 'youtube', videoId: '3NOey1CGVig', accountName: 'Think Tank', source: 'discovered', isClient: false, isCompetitor: false,
  caption: 'Think Tank FocusPoint Crossbody Camera Bag The FocusPoint Crossbody is made for photographers and creators who move through their day with confidence.',
  hashtags: [], topics: ['camera bag', 'crossbody bag', 'photography gear', 'recycled materials', 'daily carry', 'organization', 'travel gear'],
  segment: 'market',
}
const COTOPAXI_ALLPA_TIKTOK: QuoteVideo = {
  platform: 'tiktok', videoId: '7688127580100136214', accountName: 'lara', source: 'discovered', isClient: false, isCompetitor: true, competitorName: 'Cotopaxi',
  caption: '5 countries in 50 days and I probably still packed too much oops 🧚‍♀️  Backpack is the @Cotopaxi_UK Allpa 50l Adventure Travel Pack 🥾  #backpacking #asia #packwithme',
  hashtags: ['backpacking', 'asia', 'packwithme'],
  topics: ['backpacking', 'travel packing', 'Asia trip', 'travel gear', 'adventure travel pack'],
  segment: 'market',
}
const LA_SANA_RANA: QuoteVideo = {
  platform: 'tiktok', videoId: '7683223975417122062', accountName: 'La Sana Rana', source: 'discovered', isClient: false, isCompetitor: false,
  caption: 'Blood orange faux suede shoulder bag 🍊 Available on my website Lasanarana.com  #bloodorange #handmadebag',
  hashtags: ['bloodorange', 'handmadebag'],
  topics: ['handmade bag', 'fashion accessory', 'shoulder bag', 'blood orange color', 'faux suede material'],
  segment: 'market',
}

// Three market threads whose voices must still print.
const ROLLERBLADE_BAGS: QuoteVideo = {
  platform: 'reddit', videoId: '1w2ked1', accountName: 'r/rollerblading', source: 'discovered', isClient: false, isCompetitor: false,
  caption: 'Looking for bag recommendations\n\nWhat bag is everyone using? I’m looking for a small/slim bag to strap my skates to and maybe carry just a pair of shoes and a water inside.',
  hashtags: [], topics: [], segment: 'market',
}
const OSPREY_PORTER_DEAL: QuoteVideo = {
  platform: 'reddit', videoId: '1wiu2cf', accountName: 'r/onebag', source: 'discovered', isClient: false, isCompetitor: false,
  caption: 'PSA: Osprey Sojourn Porter 46 $99 on Sierra\n\nI see that Sierra dot com has the Osprey Porter 46 for $99. The caveat is the fixed torso length. Very duffel like bag with a tuckable harness.',
  hashtags: [], topics: [], segment: 'market',
}
const COTOPAXI_BIFL: QuoteVideo = {
  platform: 'reddit', videoId: '1w5ruw0', accountName: 'r/BuyItForLife', source: 'discovered', isClient: false, isCompetitor: true, competitorName: 'Cotopaxi',
  caption: 'Cotopaxi Allpa 70L vs Fjällräven Färden 80L\n\nI currently have both of these sitting in my house and need to decide which one to keep.',
  hashtags: [], topics: [], segment: 'noise',
}
const OSPREY_REVIEW_FILED_COTOPAXI: QuoteVideo = {
  platform: 'youtube', videoId: 'vqPMnl0iTk4', accountName: 'Danny Packs', source: 'discovered', isClient: false, isCompetitor: true, competitorName: 'Cotopaxi',
  caption: 'Osprey Flare 27 Review - Incredible Value EDC Pack! What do you think of the Osprey Flare 27? What do you think is the best current backpack value?',
  hashtags: [], topics: [], segment: 'market',
}
const KOREAN_WORK_BAG: QuoteVideo = {
  platform: 'youtube', videoId: '7nSE0b5iiSc', accountName: '조은fine', source: 'discovered', isClient: false, isCompetitor: false,
  caption: '도대체 무슨 짐을 그렇게 많이 들고 다녀요...?🫨♨️보부상 직장인 출근 브이로그 | 10만원 이하 직장인 만능 가방 추천🧳',
  hashtags: [], topics: ['work bag', 'commute', 'bag recommendation'], segment: 'market',
}

const q = (text: string, video: QuoteVideo | null | undefined, reading: Pick<GateInput, 'lang' | 'english'> = { lang: 'en', english: null }): GateInput =>
  ({ text, video, ...reading })

describe('the known-bad quotes no longer print (walkthrough, 29 Sep)', () => {
  it('Subjects › Durability: Patagonia Provisions food under an r/news lawsuit thread', () => {
    const o = { ...SEALAND, claim: 'Durability. Comments about how long the products last, their toughness, or ability to withstand outdoor use, excluding comments about style or comfort.', requireRelevance: true }
    expect(whyNot(q('Their canned food is actually pretty good too', NEWS_BEARS_EARS), o)).toBe('off_topic')
    expect(whyNot(q('Their canned fish is great. Though canned fish is an acquired taste (smell?) for a lot of people.', NEWS_BEARS_EARS), o)).toBe('off_topic')
    expect(whyNot(q('their sardines with coconut curry over rice is fantastic', NEWS_BEARS_EARS), o)).toBe('off_topic')
  })

  it('Subjects › Durability: the Telugu flip-flop line, the waterproof aside and the "translation" that is its own original', () => {
    const o = { ...SEALAND, claim: 'Durability', requireRelevance: true }
    expect(whyNot(q('Nenu use chesa bro flipflops type kani vanalaki tadichi padaipoyayi oka 2 months lo', CHUPPS_BILLBOARD,
      { lang: 'te', english: 'I used flipflops type bro but they got bitten and worn out in about 2 months.' }), o)).toBe('off_topic')
    expect(whyNot(q('Ante Waterproof కాదు కదా \nఅలా అయితే ఎవరు కొనరు', CHUPPS_BILLBOARD,
      { lang: 'te', english: 'Ante is not waterproof, right? If it were, no one would buy it.' }), o)).toBe('off_topic')
    expect(whyNot(q('Super kani cost akuba, andaru use cheileru😢😢😢😢', CHUPPS_BILLBOARD,
      { lang: 'or', english: 'Super kani cost akuba, andaru use cheileru😢😢😢😢' }), o)).toBe('unreadable')
  })

  it('Subjects › Looks & style: the outfit post supplies none, and never more than one', () => {
    const o = { ...SEALAND, claim: 'Looks & style. Comments about the aesthetic appeal, beauty, or fashionability of the products, excluding functionality or comfort.', requireRelevance: true }
    const ootd = [
      'Ugh this look is AMAZING. I LOVE what you did with the skirt!',
      'IMO, that makes the skirt',
      'wow another amazing look with cool suspendery garter belty hardware!! i love it.   \nyour husband seems so sweet, the doodles 😭',
      'You look fantastic. I have to steal the "garter belt in the outside hiking the skirt up" idea.',
      'I love the tie! Daisy/floral anything gets me all the time.',
    ]
    for (const text of ootd) expect(whyNot(q(text, OLDHAG_OOTD), o), text).not.toBeNull()
    expect(pickEligible(ootd.map((text) => q(text, OLDHAG_OOTD)), (x) => x, 6, o)).toHaveLength(0)
  })

  it('Your market › Two voices: the Turkish maker compliment and the Ibadan seller’s sale post', () => {
    const o = { ...SEALAND, claim: 'Price and sale status questions', requireRelevance: true }
    expect(whyNot(q('Ellerinize sağlık model çok güzel fiyat nedir ? 😍', TURKISH_KNIT_BAG,
      { lang: 'tr', english: 'Bless your hands, the model is very beautiful, what is the price? 😍' }), o)).toBe('maker_praise')
    // Without the praise, the post is still a maker's (handmade, a knitting account).
    expect(whyNot(q('Çok şık zarif bir çanta fiyat nedir 😍', TURKISH_KNIT_BAG,
      { lang: 'tr', english: 'Very stylish elegant bag what is the price 😍' }), o)).toBe('maker_video')
    expect(whyNot(q('Wow so your bags cost K363 in Zambia? Definitely adding this to my future purchases', IBADAN_SELLER), o)).toBe('maker_video')
    expect(isSellerPost(IBADAN_SELLER)).toBe(true)
    expect(isMakerPost(TURKISH_KNIT_BAG, true)).toBe(true)
  })

  it('Conversation: the eSIM question, the iPad, the printer, the Goodwill line, the dress meme', () => {
    expect(whyNot(q('Does Saily cap data from a tethered device such as a tablet when using the phone hotspot ? This happened to me recently in Brazil with Holafly and I wasn’t aware of it and had to figure out what was happening.', PACK_HACKER_TECH),
      { ...SEALAND, claim: 'Seeking brand and model recommendations' })).toBe('off_topic')
    expect(whyNot(q('Very cool, I always bring an iPad to watch things as well 👍', CARRY_ON_ESSENTIALS), { ...SEALAND, claim: 'Packing light feels achievable' })).toBe('off_topic')
    expect(whyNot(q('Hi Sarah, what make is your portable printer please', SARAH_PACKING), { ...SEALAND, claim: 'Curiosity about featured product details' })).toBe('off_topic')
    expect(whyNot(q('Shop at thrifts that support local seniors or animal rescues. Goodwill is for profit and only supports a rich CEO.', THRIFT_OPINIONS),
      { ...SEALAND, claim: 'Secondhand shopping feels rewarding' })).toBe('off_topic')
    expect(whyNot(q('It looks like the dress everyone said was white and gold but was blue and black', HERMES_HAUL), { ...SEALAND, claim: 'Design turns some shoppers away' })).toBe('off_topic')
  })

  it('This week › For Sales: "Bahut ganda hai → Very dirty"', () => {
    const verdict = whyNot(q('Bahut ganda hai', DIY_VASELINE_BAG, { lang: 'hi', english: 'Very dirty' }), { ...SEALAND, claim: 'Aesthetic appeal' })
    expect(verdict).toBe('too_short')
  })

  it('This week › Worth a reply: the Wotancraft line under Think Tank’s own post', () => {
    const text = 'Finally a serious option to Wotancraft (Overpriced brand).  I have their Pilot 10L bag and although I like it, the Sloooooow shipping/premium pricing makes this TT bag a serious option for me for getting any of their other bags.'
    expect(brandOfAccount('Think Tank')).toBe('Think Tank')
    expect(whyNot(q(text, THINK_TANK_OWN), { ...SEALAND, allowOwn: true })).toBe('brand_post')
  })

  it('Brands: "What kind of bag is thatttt" does not illustrate "Organization, measurements, and packing proof"', () => {
    const o = { ...SEALAND, brand: 'Cotopaxi', claim: 'Organization, measurements, and packing proof', requireRelevance: true }
    expect(whyNot(q('What kind of bag is thatttt😍😍😍 i need to knoww', COTOPAXI_ALLPA_TIKTOK), o)).toBe('not_relevant')
  })

  it('Subjects › Buying & delivery: hype under a maker’s shop post, and hype that says nothing about buying', () => {
    const o = { ...SEALAND, claim: 'Buying & delivery. Comments about buying, ordering, shipping and delivery.', requireRelevance: true }
    expect(whyNot(q('GIVE IT TO ME RIGHT NOW', LA_SANA_RANA), o)).toBe('maker_video')
    expect(whyNot(q('I will sell my first born I couldn’t be more serious', LA_SANA_RANA), o)).toBe('maker_video')
    expect(whyNot(q('YOUR BAG IS SOOOO COOL', COTOPAXI_ALLPA_TIKTOK), o)).toBe('not_relevant')
    expect(whyNot(q('What kind of bag is thatttt😍😍😍 i need to knoww', COTOPAXI_ALLPA_TIKTOK), o)).toBe('not_relevant')
    // …and a voice that does speak to it prints.
    expect(whyNot(q('You’re right - I decided to get a smaller bag. Thanks though!', COTOPAXI_BIFL), o)).toBeNull()
  })
})

describe('staging’s second look (29 Sep): what the first cut of the gate still let through', () => {
  const RUNWAY: QuoteVideo = { platform: 'reddit', videoId: '1wfdxbq', accountName: 'r/ProjectRunway', caption: 'Anna reveals her collection’s second look is made of upcycled materials from shopping throughout the season', hashtags: [], topics: [], segment: 'market' }
  const TRAVEL_TALK: QuoteVideo = { platform: 'youtube', videoId: 'nomad-1', accountName: 'Nomads Nation', caption: 'One bag travel for a year: what I packed in my 35L backpack', hashtags: [], topics: ['one bag travel'], segment: 'market' }
  const BOTTLE_BAG: QuoteVideo = { platform: 'tiktok', videoId: '7679766371944746260', accountName: 'Ni na', caption: 'กระเป๋าขวดน้ำดื่ม#กระเป๋าถือผู้หญิง #ขยะรีไซเคิล', hashtags: [], topics: ['recycled bottle bag'], segment: 'market' }

  it('a strap on a runway look is not a bag', () => {
    expect(whyNot(q('The trash bags that looks like trash bags and the cheap straps, if she had tailored the straps and used better materials it could have been great', RUNWAY), SEALAND)).toBe('off_topic')
    expect(whyNot(q('I like Jude but I wish Anna won. She’s so unique', RUNWAY), SEALAND)).toBe('off_topic')
  })

  it('a long comment under a bag video has to be about the bag, not say "that"', () => {
    expect(whyNot(q('Vietnam 🇻🇳 would be my home at that time. None of the limitations that exist in the Philippines. None of the unpredictability, instability or the heat that I had there for years.', TRAVEL_TALK), SEALAND)).toBe('off_topic')
    expect(whyNot(q('a steamdeck in that anker travel adapter is going to be slow charging due it only doing 20w', TRAVEL_TALK), SEALAND)).toBe('off_topic')
    // A boxing bag is not a carry good; "use it" under a packing video still
    // points at the thing shown, and stays.
    expect(whyNot(q('The boxing bags at my gym are the heaviest thing I own', undefined), SEALAND)).toBe('off_topic')
  })

  it('an emoji the translator wrote out is not a colour, and a question mark alone is not a product question', () => {
    expect(whyNot(q('Perfect walk through and post! Thank you! [Red heart]', TRAVEL_TALK), { ...SEALAND, claim: 'Praise for beautiful bag design' })).toBe('off_topic')
    expect(whyNot(q('Forget shark tank, where can I invest?', TRAVEL_TALK), { ...SEALAND, claim: 'Shopping interest from featured items' })).toBe('off_topic')
  })

  it('a reseller\u2019s offer in a comment is a sale ad, and a helmet is not a bag', () => {
    expect(whyNot(q('Hi I\u2019m unable to DM you, could you send me a chat request please I have one with authentic material up for rehome. I\u2019ll show you pictures. I\u2019m from EU', TRAVEL_TALK), SEALAND)).toBe('sale_ad')
    expect(whyNot(q('Can I have the location of the helmet please?', TRAVEL_TALK), { ...SEALAND, claim: 'Where to buy the items in the video' })).toBe('off_topic')
  })

  it('a wallet named in passing in a gadget thread is not the market', () => {
    const GADGETS: QuoteVideo = { platform: 'youtube', videoId: 'gadget-1', accountName: 'jon gadget', caption: 'Best Apple accessories for travel: chargers, trackers and cases', hashtags: [], topics: ['apple accessories', 'chargers'], segment: 'market' }
    expect(whyNot(q('Interesting but why the total focus on Apple? ... Ugreen Magflow ("Charge your iPhone and Air pods"). JLab (Apple Find my Tracking) and Alumu Wallet for Apple Tag and case for iPod 3 Pro.', GADGETS), SEALAND)).toBe('off_topic')
    // …while the same wallet under a video about wallets is a carry good.
    expect(whyNot(q('That wallet fits my phone and three cards, love it', { ...GADGETS, caption: 'My everyday wallet and slim card holder' }), SEALAND)).toBeNull()
  })

  it('"is there a way to do it?" is asking the maker', () => {
    expect(whyNot(q('มีวิธีทำมั้ยคะ', BOTTLE_BAG, { lang: 'th', english: 'Is there a way to do it?' }), SEALAND)).toBe('maker_praise')
  })
})

describe('the market’s own voices still print', () => {
  it('a strap complaint, a carry-on sizing question, a return, a price objection, a translated question', () => {
    expect(whyNot(q('I do not like the yoke/carry handle type design on the top part of the straps. I’m short and like to wear my bags high and it just digs into your neck.', ROLLERBLADE_BAGS),
      { ...SEALAND, claim: 'Comfort depends on structure and straps', requireRelevance: true })).toBeNull()
    expect(whyNot(q('My carry-on has a side 1.5 inches over the limit, another side is one inch under, and the third is two inches under. Passes or no ?', undefined), SEALAND)).toBeNull()
    expect(whyNot(q('I returned it. It didn’t feel comfortable and I did not appreciate the straight jacket feature.', OSPREY_PORTER_DEAL), SEALAND)).toBeNull()
    expect(whyNot(q('Man, I’ve really been underwhelmed with mine. It’s a nice bag, but the price tag was a bit ridiculous', OSPREY_PORTER_DEAL),
      { ...SEALAND, claim: 'Price', requireRelevance: true })).toBeNull()
    expect(whyNot(q('가방 물건 많이 들어가게 되면 어깨가 무겁지는 않나여??', KOREAN_WORK_BAG,
      { lang: 'ko', english: 'If you put a lot of things in the bag, doesn’t your shoulder get heavy??' }), { ...SEALAND, claim: 'Comfort', requireRelevance: true })).toBeNull()
  })

  it('a rival’s own voice in its brand block, and a line about another brand kept out of it', () => {
    const o = { ...SEALAND, brand: 'Cotopaxi', claim: 'Trust in long-lasting bag quality' }
    expect(whyNot(q('I have a Cotopaxi backpack that’s about 5 year old now. I’ve used it a ton for hiking, day pack, swimming gear, whatever. I’m happy with it', COTOPAXI_BIFL), o)).toBeNull()
    expect(whyNot(q('A mini version of the osprey nebula, upgrade to osprey day lite plus', OSPREY_REVIEW_FILED_COTOPAXI), o)).toBe('wrong_brand')
    expect(whyNot(q('I love my new pack, the straps are great and it carries well', ROLLERBLADE_BAGS), o)).toBe('wrong_brand')
  })

  it('a text-only caller (no video) keeps a carry-good line and drops one that names none', () => {
    expect(whyNot(q('Bottle pockets are so integral to our kids loadout I can’t imagine a bag without', undefined), SEALAND)).toBeNull()
    expect(whyNot(q('Another way the TSA is protecting the airline industry more than anyone else.', undefined), SEALAND)).toBe('off_topic')
  })

  it('a video looked for and not found fails closed', () => {
    expect(whyNot(q('Bottle pockets are so integral to our kids loadout I can’t imagine a bag without', null), SEALAND)).toBe('no_video')
  })

  it('another tenant gets no bag lexicon and no Sealand maker words', () => {
    const o: GateOptions = { market: null, makerRule: false }
    expect(whyNot(q('Waiting for my new leg, the socket fitting is on Monday and I cannot wait', { platform: 'tiktok', videoId: 'x', caption: 'handmade liner', segment: 'market' }), o)).toBeNull()
  })
})

describe('the shape of a block', () => {
  it('one quote per thread, the most relevant first, the caller’s order breaking ties', () => {
    const items = [
      { id: 'a', g: q('I love the colour of this bag, it looks so good', ROLLERBLADE_BAGS) },
      { id: 'b', g: q('The straps dig in after an hour, the bag is not comfortable at all', ROLLERBLADE_BAGS) },
      { id: 'c', g: q('The hip belt on this pack makes the weight disappear, so comfortable', OSPREY_PORTER_DEAL) },
      { id: 'd', g: q('Nice bag but I would want more pockets for a trip like that', KOREAN_WORK_BAG) },
    ]
    const picked = pickEligible(items, (x) => x.g, 3, { ...SEALAND, claim: 'Comfort depends on structure and straps' })
    expect(picked.map((p) => p.id)).toEqual(['b', 'c', 'd'])
  })

  it('never pads: a block with one eligible quote prints one', () => {
    const items = [q('Their canned food is actually pretty good too', NEWS_BEARS_EARS), q('I returned it. It didn’t feel comfortable at all', OSPREY_PORTER_DEAL)]
    expect(pickEligible(items, (x) => x, 6, SEALAND)).toHaveLength(1)
  })

  it('carries wordings across blocks when asked', () => {
    const used = new Set<string>()
    const one = q('I returned it. It didn’t feel comfortable at all', OSPREY_PORTER_DEAL)
    expect(pickEligible([one], (x) => x, 1, { ...SEALAND, used })).toHaveLength(1)
    expect(pickEligible([one], (x) => x, 1, { ...SEALAND, used })).toHaveLength(0)
  })
})

describe('the parts', () => {
  it('reads a translation equal to its original as none', () => {
    expect(readableEnglish({ text: 'Fiyat nedir', lang: 'tr', english: 'What is the price' })).toBe('What is the price')
    expect(readableEnglish({ text: 'Super kani cost akuba', lang: 'or', english: 'Super kani cost akuba ' })).toBeNull()
    expect(readableEnglish({ text: 'como faz', lang: 'pt', english: null })).toBeNull()
  })

  it('knows a carry video by its words, its topics or its run-together hashtags', () => {
    expect(isCarryVideo(COTOPAXI_ALLPA_TIKTOK)).toBe(true)
    expect(isCarryVideo(HERMES_HAUL)).toBe(true)
    expect(isCarryVideo(NEWS_BEARS_EARS)).toBe(false)
    expect(isCarryVideo(CHUPPS_BILLBOARD)).toBe(false)
    expect(isCarryVideo({ caption: 'A new tent for the season', hashtags: ['backpacking', 'garbage'] })).toBe(false)
  })

  it('reads a subject’s claim without its "excluding" clause', () => {
    const claim = readClaim('Durability. Comments about how long the products last, excluding comments about style or comfort.')
    expect(relevanceTo(claim, 'Such a stylish bag, so comfortable')).toBe(0)
    expect(relevanceTo(claim, 'Mine has lasted five years and still holds up')).toBeGreaterThan(0)
  })

  it('knows a brand’s own account and a Reddit community apart', () => {
    expect(brandOfAccount('freitagjapan')).toBe('Freitag')
    expect(brandOfAccount('Osprey Packs')).toBe('Osprey')
    expect(brandOfAccount('r/PatagoniaClothing')).toBeNull()
    expect(brandOfAccount('Pack Hacker')).toBeNull()
    expect(brandOfAccount('Danny Packs')).toBeNull()
  })

  it('never reads a Reddit deal post as a seller, or a Reddit thread as a maker’s', () => {
    expect(isSellerPost(OSPREY_PORTER_DEAL)).toBe(false)
    expect(isMakerPost({ platform: 'reddit', caption: 'Recommendations for a handmade leather bag?', segment: 'market' }, true)).toBe(false)
  })

  it('scores a verdict the caller can read', () => {
    const v = quoteGate(q('The straps dig in after an hour, the bag is not comfortable at all', ROLLERBLADE_BAGS), { ...SEALAND, claim: 'Comfort' })
    expect(v.ok && v.relevance > 0 && v.thread === 'reddit::1w2ked1').toBe(true)
  })
})
