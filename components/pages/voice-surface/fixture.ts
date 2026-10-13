import { horizonWindow } from '@/lib/reading/horizon'
import type { ReadingMonth } from '@/lib/reading/reading-month'
import type { OtherMonth } from '@/lib/reading/reading-view'
import { buildConversationBoard, makerShareSentence, marketKindLabel, type MarketTheme } from '@/lib/pages/overview-market'
import type { Voice } from '@/lib/pages/overview'
import { PERSONA_VIDEO_FLOOR, askAboutTheme, voiceSurfaceHref, type CastPersona, type VoiceSurfaceData } from '@/lib/pages/voice-surface'
import type { WordsBlock } from '@/lib/pages/voice-surface-words'
import { ACCOUNT_ROWS, type WhereBlock } from '@/lib/pages/voice-surface-where'

// Conversation's block fixtures (market-first WP2.4).
//
// REAL NUMBERS, NONE INVENTED: every figure, label, kind, maker share, flag,
// provenance count, quote and persona here is what `loadVoiceSurface` returned
// on STAGING (zfmxrrugaihxpubunleu, data to 20 Sep) for Sealand and Össur with
// the clock at 2026-10-11T06:00Z, read-only through `scripts/loader-dump.ts`
// on 26 Sep. The registry ids are shortened to their first eight characters;
// identity is only ever compared inside one fixture. Staging's category read
// 625 videos in September (production 626) and 351 in August.
//
// FOUR STATES:
//   - `voiceFixture()`: Sealand's September, MF1 measured: 21 themes at 10+,
//     7 of them maker-led, the lead "Price and sale questions" open; the
//     market's words in six kinds, and 17 accounts listed at the floor (10
//     printed) with the military-dog channel and a poker channel set aside;
//   - `ossurVoiceFixture()`: Össur (paused, no maker rule, §2.13): 12 themes,
//     "Brand boycott over politics" New; nothing set aside or marked;
//   - `refusedVoiceFixture()`: Sealand's same month before MF1 is applied
//     (segments not measured, no provenance, no union of theme videos) and with
//     no themed update or profile behind the pane and the cast, so neither the
//     words nor where it talks is read. Every absence is a null the loader
//     returns, never a zero;
//   - `allAccountsVoiceFixture()`: Sealand with every account at the floor
//     listed (`?accounts=all`).

type Row = [id: string, label: string, k: number, prevK: number | null, kind: string | null, maker: number | null, noise: number | null, flags: MarketTheme['flags'], provenance: [number, number] | null]

const SEALAND_THEMES: Row[] = [
  ["03cabe7e", "Buying interest and ordering questions", 88, 33, "purchase_intent", 0.3523, 0, [], [57, 88]],
  ["0b05fdf0", "Praise for beautiful bag design", 60, 23, "praise", 0.35, 0, [], [44, 60]],
  ["4c312c8b", "More colors and variants wanted", 20, 2, "feature_request", 0.3, 0.05, ["now_10"], [11, 20]],
  ["22e2445c", "Price and sale questions", 18, 7, "purchase_intent", 0.2222, 0.0556, ["now_10"], [11, 18]],
  ["2c7238b7", "Interest in shipping and locations", 13, 10, "purchase_intent", 0, 0.0769, [], [8, 13]],
  ["f329a7dd", "Confusion about airline size rules", 12, 6, "question", 0.0833, 0, ["now_10"], [11, 12]],
  ["d812ace3", "Shopping interest from featured items", 12, 5, "purchase_intent", 0.3333, 0.0833, ["now_10"], [6, 12]],
  ["056a478a", "Appreciation for smart packing tips", 12, 3, "praise", 0.1667, 0, ["now_10"], [9, 12]],
  ["0c0784d8", "Frustration with bag weight", 11, 6, "pain_point", 0, 0.0909, ["now_10"], [9, 11]],
  ["8285e151", "Praise for laptop carry features", 11, 3, "praise", 0, 0.1818, ["now_10"], [6, 11]],
  ["daf7426d", "Comfort problems when carrying", 10, 7, "pain_point", 0, 0, ["now_10"], [5, 10]],
  ["ce659d82", "Appreciation for thrifting value", 10, 2, "praise", 0.1, 0.2, ["now_10"], [8, 10]],
  ["4f4bc420", "Laundry planning for travel", 10, 0, "question", 0.1, 0, ["new"], [8, 10]],
  ["aed3a6d0", "Preference for secondhand fashion", 10, 0, "purchase_intent", 0.2, 0, ["new"], [8, 10]],
  ["faaa44da", "Love for creative upcycling", 72, 42, "praise", 0.875, 0, [], [9, 72]],
  ["184e2461", "Admiration for handmade craftsmanship", 65, 32, "praise", 0.7077, 0, [], [29, 65]],
  ["e514443f", "Requests for step-by-step tutorials", 28, 15, "question", 0.8214, 0, [], [13, 28]],
  ["fb4361bb", "Questions about materials and tools", 25, 15, "question", 0.96, 0, [], [10, 25]],
  ["c32c2efd", "Need for exact measurements", 15, 6, "question", 0.8, 0, ["now_10"], [4, 15]],
  ["daf78e91", "Tutorial praised as easy to follow", 14, 7, "praise", 1, 0, ["now_10"], [5, 14]],
  ["8b33a663", "Requests for the sewing pattern", 11, 6, "question", 1, 0, ["now_10"], [6, 11]],
]
const SEALAND_OPEN = "22e2445c"
const SEALAND_KINDS = [{"kind": "purchase_intent", "label": "Ready to buy", "videos": 13}, {"kind": "question", "label": "Asking how it works", "videos": 4}, {"kind": "feature_request", "label": "Asking for something", "videos": 1}]
const SEALAND_VOICES: Voice[] = [
  {
    "cite": "TikTok · 18 Sep · under a category video",
    "href": "https://www.tiktok.com/@bataray.ng/video/7686980095516462356",
    "onScreen": null,
    "quote": {
      "english": null,
      "lang": "en",
      "ref": "e:8746e05e-95d7-46fc-b29f-34c084f9b091",
      "text": "Wow so your bags cost K363 in Zambia? Definitely adding this to my future purchases"
    }
  },
  {
    "cite": "TikTok · 9 Sep · under a category video",
    "href": "https://www.tiktok.com/@nina.na.0209/video/7679766371944746260",
    "onScreen": null,
    "quote": {
      "english": "Very beautiful 🩷🩷 How much do you sell each leaf for?",
      "lang": "th",
      "ref": "e:87841c6c-74bc-4dad-8639-8663199d2a27",
      "text": "สวยมากค่ะ🩷🩷ขายใบเท่าไหร่ค่ะ"
    }
  }
]
const SEALAND_MARKET = {"category": 625, "comments": 16204, "platformMix": [{"label": "YouTube", "pct": 44.3, "platform": "youtube", "videos": 277}, {"label": "TikTok", "pct": 28.8, "platform": "tiktok", "videos": 180}, {"label": "Reddit", "pct": 18.4, "platform": "reddit", "videos": 115}, {"label": "Instagram", "pct": 8.5, "platform": "instagram", "videos": 53}], "rivalFiled": 29, "videos": 654}
const SEALAND_BOARD = {"n": 625, "prev": {"month": "2026-08-01", "n": 351}, "segments": "measured", "atTen": 21, "inThemes": 325, "chip": "not read as a change: we changed our searches in September", "belowCount": 83}
const SEALAND_READING: ReadingMonth = {"asAt": "2026-09-20T08:33:47.358+00:00", "current": {"daysIn": 11, "month": "2026-10-01", "updates": 0, "videos": null}, "leadsWithCurrent": false, "month": "2026-09-01", "nextUpdate": null, "paused": true, "readTo": "2026-09-20T08:33:47.358+00:00", "readToEnd": false, "reason": "current_thin", "settles": {"boundary": "2026-10-31T00:00:00.000Z", "withUpdateOn": "2026-11-01T04:00:00.000Z"}, "state": "ended"}
const SEALAND_OTHERS: OtherMonth[] = [{"isDefault": false, "month": "2026-08-01", "tooFew": false, "videos": 377}, {"isDefault": false, "month": "2026-07-01", "tooFew": true, "videos": 36}, {"isDefault": false, "month": "2026-06-01", "tooFew": true, "videos": 50}]
const SEALAND_PERSONAS = [
  {
    "key": "bag-lover",
    "name": "Bag lover",
    "oneLiner": "This person is drawn in by bags as self-expression and is deciding whether a design feels distinctive enough to own.",
    "videos": 261,
    "wants": "They want a bag that reflects their taste while still earning a place in everyday life. Sustainability and function matter when they add character and story, because they want something that feels personal rather than interchangeable.",
    "blockers": "They lose interest when a bag feels generic, awkward-looking, or boxed into the wrong colors and formats. Price becomes harder to accept when the emotional pull is missing, because they are buying identity as much as utility.",
    "triggers": "They move when a bag looks original, usable, and expressive at the same time. Creative materials, appealing colorways, and styling that helps them picture the bag on themselves make the choice feel natural.",
    "platformMix": [
      {
        "label": "TikTok",
        "pct": 47.9,
        "platform": "tiktok",
        "videos": 125
      },
      {
        "label": "Instagram",
        "pct": 26.1,
        "platform": "instagram",
        "videos": 68
      },
      {
        "label": "YouTube",
        "pct": 21.8,
        "platform": "youtube",
        "videos": 57
      },
      {
        "label": "Reddit",
        "pct": 4.2,
        "platform": "reddit",
        "videos": 11
      }
    ],
    "quote": {
      "english": null,
      "lang": "en",
      "ref": "e:29504a62-bd96-4fa7-97b8-a72c0cc9b04c",
      "text": "SO PRETTY, I WANT ONE!!"
    },
    "quoteCite": "one of this group’s own comments",
    "selected": true
  },
  {
    "key": "supporter",
    "name": "Supporter",
    "oneLiner": "This person sees bags as a way to live their values and is deciding which brands feel authentic enough to back.",
    "videos": 265,
    "wants": "They want their purchase or praise to support repair, reuse, and a credible environmental story. Consumption only feels right when it aligns with their ethics, so they are drawn to products that give waste a second life without losing beauty or usefulness.",
    "blockers": "They pull back when sustainability looks like a surface claim or when reuse feels wasteful, inauthentic, or short-lived. Higher prices create tension when the mission sounds good but the proof feels thin.",
    "triggers": "They engage when the rescue story is tangible and the craftsmanship makes the product feel built to last. Repair culture, material transparency, and visible transformation work because they show the values are embedded in the product itself.",
    "platformMix": [
      {
        "label": "YouTube",
        "pct": 37,
        "platform": "youtube",
        "videos": 98
      },
      {
        "label": "TikTok",
        "pct": 30.6,
        "platform": "tiktok",
        "videos": 81
      },
      {
        "label": "Instagram",
        "pct": 23.4,
        "platform": "instagram",
        "videos": 62
      },
      {
        "label": "Reddit",
        "pct": 9.1,
        "platform": "reddit",
        "videos": 24
      }
    ],
    "quote": {
      "english": null,
      "lang": "en",
      "ref": "e:7a40f329-c74f-4cc9-9ef1-2873a1b2056c",
      "text": "That bag is so stylish without being cartoonish. I would definitely purchase it."
    },
    "quoteCite": "one of this group’s own comments",
    "selected": false
  },
  {
    "key": "maker",
    "name": "Maker",
    "oneLiner": "This person sees the bag as a project and is deciding whether they can realistically make it themselves.",
    "videos": 140,
    "wants": "They want the confidence that comes from understanding how the bag is built, not just admiring the finished result. The appeal is both creative and practical: if they can get the pattern, materials, and construction logic right, they can turn inspiration into something personal.",
    "blockers": "They stall when the process feels hidden, rushed, or too dependent on tools they do not have. Thick materials and tricky assembly make the project feel like an equipment problem instead of a satisfying build.",
    "triggers": "They respond to instruction that removes guesswork and makes the result feel achievable. Exact measurements, named materials, and slower explanations land because they turn curiosity into a plan.",
    "platformMix": [
      {
        "label": "TikTok",
        "pct": 46.4,
        "platform": "tiktok",
        "videos": 65
      },
      {
        "label": "YouTube",
        "pct": 37.9,
        "platform": "youtube",
        "videos": 53
      },
      {
        "label": "Instagram",
        "pct": 12.9,
        "platform": "instagram",
        "videos": 18
      },
      {
        "label": "Reddit",
        "pct": 2.9,
        "platform": "reddit",
        "videos": 4
      }
    ],
    "quote": {
      "english": "how do you do it",
      "lang": "pt",
      "ref": "e:e041fe0d-9f69-466e-b52d-d0429f203108",
      "text": "como faz"
    },
    "quoteCite": "one of this group’s own comments",
    "selected": false
  },
  {
    "key": "traveler",
    "name": "Traveler",
    "oneLiner": "This person judges bags by how calmly they get them through movement, transit, and changing conditions.",
    "videos": 106,
    "wants": "They want a bag that reduces friction on the road and helps them carry only what they need without discomfort. Control matters to them because travel already brings enough uncertainty, so the bag should remove decisions rather than create them.",
    "blockers": "They are held back by anything that adds strain or trip risk, from awkward carry to unclear airline fit to pockets that fail in real use. They also feel the trade-off between packing enough and staying light, so a bag that solves one problem by creating another does not win them.",
    "triggers": "They respond to proof that a bag works in motion, under airline rules, and across weather and daily routines. Practical packing advice, compliance reassurance, and layouts that keep essentials accessible land because they promise a smoother trip.",
    "platformMix": [
      {
        "label": "Reddit",
        "pct": 46.2,
        "platform": "reddit",
        "videos": 49
      },
      {
        "label": "YouTube",
        "pct": 38.7,
        "platform": "youtube",
        "videos": 41
      },
      {
        "label": "TikTok",
        "pct": 14.2,
        "platform": "tiktok",
        "videos": 15
      },
      {
        "label": "Instagram",
        "pct": 0.9,
        "platform": "instagram",
        "videos": 1
      }
    ],
    "quote": {
      "english": null,
      "lang": "en",
      "ref": "e:db637627-7b1a-43d2-8be7-ca13b9594185",
      "text": "Ok, on under 20 lbs., for a 3 night is fairly easy when there is plenty of water around and mild temps and you’re old and don’t eat much anyway."
    },
    "quoteCite": "one of this group’s own comments",
    "selected": false
  },
  {
    "key": "researcher",
    "name": "Researcher",
    "oneLiner": "This person is in evaluation mode, narrowing options and trying not to make a bad call.",
    "videos": 131,
    "wants": "They want enough evidence to feel certain the bag fits their routine, budget, and standards before they commit. They are trying to reduce regret by comparing details, reviews, and brand claims until the choice feels defensible.",
    "blockers": "They get stuck when key information is missing or when performance and sustainability claims feel vague. Doubt grows when size, layout, and value are hard to judge, because the wrong choice feels expensive and annoying to live with.",
    "triggers": "They move when information feels concrete, complete, and easy to compare. Real-use detail, clear pricing, and proof that the product is what it claims to be turn browsing into confidence.",
    "platformMix": [
      {
        "label": "TikTok",
        "pct": 42.7,
        "platform": "tiktok",
        "videos": 56
      },
      {
        "label": "YouTube",
        "pct": 24.4,
        "platform": "youtube",
        "videos": 32
      },
      {
        "label": "Reddit",
        "pct": 17.6,
        "platform": "reddit",
        "videos": 23
      },
      {
        "label": "Instagram",
        "pct": 15.3,
        "platform": "instagram",
        "videos": 20
      }
    ],
    "quote": {
      "english": null,
      "lang": "en",
      "ref": "e:32039985-dd94-4481-a92e-4f118b71fbbd",
      "text": "Okay but how much????"
    },
    "quoteCite": "one of this group’s own comments",
    "selected": false
  }
]
const SEALAND_PROFILE = {"profileDate": "2026-09-20", "population": 3719, "selected": "bag-lover"}
const SEALAND_BRAND = "Sealand"

const OSSUR_THEMES: Row[] = [
  ["29837c1a", "Audience identities and amputation types", 44, 102, "demographic_signal", null, null, [], [0, 44]],
  ["2418f4d7", "Admiration for personal resilience", 34, 87, "praise", null, null, [], [0, 34]],
  ["3c28b5fe", "Questions about prosthetic function", 28, 51, "question", null, null, [], [0, 28]],
  ["86349219", "Requests for prosthetic help", 20, 45, "purchase_intent", null, null, [], [0, 20]],
  ["19c24f49", "Brand boycott over politics", 16, 0, "objection", null, null, ["new"], [0, 16]],
  ["559bbc8c", "Praise for prosthetic look", 15, 28, "praise", null, null, [], [0, 15]],
  ["140e43a7", "Price and availability questions", 14, 19, "question", null, null, [], [0, 14]],
  ["b6db00ac", "Cost blocks access", 14, 14, "pain_point", null, null, [], [0, 14]],
  ["d548dd42", "Excitement about prosthetic innovation", 12, 19, "praise", null, null, [], [0, 12]],
  ["57d9a5a3", "Prosthetics need more personalization", 11, 16, "pain_point", null, null, [], [0, 11]],
  ["515ca100", "Socket fit keeps changing", 11, 13, "pain_point", null, null, [], [0, 11]],
  ["4e506728", "Insurance delays and denials", 10, 10, "pain_point", null, null, [], [0, 10]],
]
const OSSUR_OPEN = "2418f4d7"
const OSSUR_KINDS = [{"kind": "praise", "label": "Praising it", "videos": 34}]
const OSSUR_VOICES: Voice[] = [
  {
    "cite": "Instagram · 10 Sep · under a category video",
    "href": "https://www.instagram.com/p/DdFRHRHBW4Q/",
    "onScreen": null,
    "quote": {
      "english": "You are an example of strength! 👏👏❤️",
      "lang": "pt",
      "ref": "e:28a54e80-9f7a-468e-9763-b936394c60b6",
      "text": "Você é exemplo de força! 👏👏❤️"
    }
  },
  {
    "cite": "TikTok · 1 Sep · under a category video",
    "href": "https://www.tiktok.com/@theoneleggedpsych/video/7680253109402111252",
    "onScreen": null,
    "quote": {
      "english": null,
      "lang": "en",
      "ref": "e:569fdf04-d253-410f-91a2-9ee5470ad2bc",
      "text": "Oh I’m so going to hell for laughing. Please keep up the humor with more life hacks. ❤️"
    }
  },
  {
    "cite": "TikTok · 7 Sep · under a category video",
    "href": "https://www.tiktok.com/@megsdixon/video/7682654836902366486",
    "onScreen": null,
    "quote": {
      "english": null,
      "lang": "en",
      "ref": "e:949029a8-c8b1-40c9-aaec-2bdf444fa77c",
      "text": "You are a strong woman, you got this."
    }
  }
]
const OSSUR_MARKET = {"category": 338, "comments": 10726, "platformMix": [{"label": "TikTok", "pct": 34.3, "platform": "tiktok", "videos": 116}, {"label": "YouTube", "pct": 26.9, "platform": "youtube", "videos": 91}, {"label": "Reddit", "pct": 19.5, "platform": "reddit", "videos": 66}, {"label": "Instagram", "pct": 19.2, "platform": "instagram", "videos": 65}], "rivalFiled": 24, "videos": 362}
const OSSUR_BOARD = {"n": 338, "prev": {"month": "2026-08-01", "n": 537}, "segments": "no_rule", "atTen": 12, "inThemes": 146, "chip": "not read as a change: we changed our searches in September", "belowCount": 52}
const OSSUR_READING: ReadingMonth = {"asAt": "2026-09-13T06:26:49.308+00:00", "current": {"daysIn": 11, "month": "2026-10-01", "updates": 0, "videos": null}, "leadsWithCurrent": false, "month": "2026-09-01", "nextUpdate": null, "paused": true, "readTo": "2026-09-13T06:26:49.308+00:00", "readToEnd": false, "reason": "current_thin", "settles": {"boundary": "2026-10-31T00:00:00.000Z", "withUpdateOn": null}, "state": "ended"}
const OSSUR_OTHERS: OtherMonth[] = [{"isDefault": false, "month": "2026-08-01", "tooFew": false, "videos": 585}, {"isDefault": false, "month": "2026-07-01", "tooFew": false, "videos": 128}, {"isDefault": false, "month": "2026-06-01", "tooFew": false, "videos": 216}]
const OSSUR_PERSONAS = [
  {
    "key": "first-time-buyer",
    "name": "First-time buyer",
    "oneLiner": "First-time buyer is the person trying to move from interest to action and is still working out what prosthetic care even looks like in real life.",
    "videos": 230,
    "wants": "They want a path back to independence they can trust, not just a device. Underneath the questions is a need to make a life-changing decision without wasting time, money, or hope on the wrong option.",
    "blockers": "They are trying to choose in a system that feels opaque, with scattered information, unclear contacts, and affordability questions all landing at once. That uncertainty makes every next step feel riskier than it should.",
    "triggers": "They move when someone makes the process legible in plain language and shows a believable route from inquiry to everyday use. Clear human guidance lands because it reduces the fear of getting trapped in confusion or making the wrong call.",
    "platformMix": [
      {
        "label": "TikTok",
        "pct": 55.2,
        "platform": "tiktok",
        "videos": 127
      },
      {
        "label": "Instagram",
        "pct": 25.2,
        "platform": "instagram",
        "videos": 58
      },
      {
        "label": "YouTube",
        "pct": 14.8,
        "platform": "youtube",
        "videos": 34
      },
      {
        "label": "Reddit",
        "pct": 4.8,
        "platform": "reddit",
        "videos": 11
      }
    ],
    "quote": {
      "english": null,
      "lang": "en",
      "ref": "e:00636b0a-6eb5-43cb-85c8-d6387b1f6e43",
      "text": "Are they difficult to put on and use??"
    },
    "quoteCite": "one of this group’s own comments",
    "selected": true
  },
  {
    "key": "caretaker",
    "name": "Caretaker",
    "oneLiner": "Caretaker is the family member or close supporter trying to help someone through treatment, rehab, or day-to-day adjustment without losing hope.",
    "videos": 231,
    "wants": "They want to protect someone they love while helping them keep dignity and momentum. Their deeper aim is to be useful in a hard situation without becoming helpless, intrusive, or shut out of the recovery process.",
    "blockers": "They carry worry and responsibility while often navigating a world of care decisions they did not choose or fully understand. The tension is between wanting to fix things and learning that support often means patience, advocacy, and emotional steadiness instead.",
    "triggers": "They respond to guidance and stories that show what supportive presence looks like in practice. Recognition of the family role lands because it makes them feel seen as part of the recovery journey rather than bystanders to it.",
    "platformMix": [
      {
        "label": "TikTok",
        "pct": 55.4,
        "platform": "tiktok",
        "videos": 128
      },
      {
        "label": "Instagram",
        "pct": 24.2,
        "platform": "instagram",
        "videos": 56
      },
      {
        "label": "YouTube",
        "pct": 13.4,
        "platform": "youtube",
        "videos": 31
      },
      {
        "label": "Reddit",
        "pct": 6.9,
        "platform": "reddit",
        "videos": 16
      }
    ],
    "quote": null,
    "quoteCite": null,
    "selected": false
  },
  {
    "key": "long-term-user",
    "name": "Long-term user",
    "oneLiner": "Long-term user is the person already living with a prosthetic and judging every option by whether it holds up to the realities of daily wear.",
    "videos": 92,
    "wants": "They want reliability they do not have to think about, because prosthetic use is already woven into work, movement, and routine. What matters is preserving control over the day instead of constantly managing discomfort, fit, or failure.",
    "blockers": "What wears them down is the gap between having a prosthetic and being able to depend on it without negotiation. Fit changes, sweat, pain, breakage, and compatibility worries make everyday function feel conditional.",
    "triggers": "They respond to people who speak from lived wear experience and acknowledge the maintenance reality without sugarcoating it. Practical credibility matters here because they have already learned that inspiration does not solve day-to-day friction.",
    "platformMix": [
      {
        "label": "TikTok",
        "pct": 50,
        "platform": "tiktok",
        "videos": 46
      },
      {
        "label": "Instagram",
        "pct": 26.1,
        "platform": "instagram",
        "videos": 24
      },
      {
        "label": "Reddit",
        "pct": 13,
        "platform": "reddit",
        "videos": 12
      },
      {
        "label": "YouTube",
        "pct": 10.9,
        "platform": "youtube",
        "videos": 10
      }
    ],
    "quote": {
      "english": null,
      "lang": "en",
      "ref": "e:88afd077-8e8f-49be-9d92-e33902b6fb6a",
      "text": "I want to love it. But I hate that it only pumps from the back and shoves my bony limb into my socket."
    },
    "quoteCite": "one of this group’s own comments",
    "selected": false
  },
  {
    "key": "new-amputee",
    "name": "New amputee",
    "oneLiner": "New amputee is the person in early recovery, learning how to carry grief, rehab, and a changed body at the same time.",
    "videos": 71,
    "wants": "They want to believe life can become manageable again, not just medically possible. They are looking for self-trust, a sense of forward motion, and proof that today’s fear does not define the rest of the story.",
    "blockers": "Grief collides with pain, falls, slow progress, and the shock of not yet knowing what the body can do. That makes even basic milestones feel emotionally loaded, because each setback can read like a verdict on the future.",
    "triggers": "They are moved by calm reassurance from people who have already been through the first stretch of adaptation. Honest progress stories work because they make recovery feel possible without pretending it is simple.",
    "platformMix": [
      {
        "label": "TikTok",
        "pct": 59.2,
        "platform": "tiktok",
        "videos": 42
      },
      {
        "label": "Instagram",
        "pct": 21.1,
        "platform": "instagram",
        "videos": 15
      },
      {
        "label": "YouTube",
        "pct": 18.3,
        "platform": "youtube",
        "videos": 13
      },
      {
        "label": "Reddit",
        "pct": 1.4,
        "platform": "reddit",
        "videos": 1
      }
    ],
    "quote": {
      "english": null,
      "lang": "en",
      "ref": "e:e8197e02-ea78-4712-8956-5500c7d743b5",
      "text": "And then I get overwhelmed and start crying"
    },
    "quoteCite": "one of this group’s own comments",
    "selected": false
  },
  {
    "key": "athlete",
    "name": "Athlete",
    "oneLiner": "Athlete is the person who sees prosthetics through performance and wants movement to feel expansive, skilled, and self-defining.",
    "videos": 50,
    "wants": "They want capability that lets them pursue challenge, identity, and pride on their own terms. Competition and training matter because they stand for a larger refusal to be reduced to limitation.",
    "blockers": "What gets in the way is the sense that ambition is always negotiating with comfort, durability, and other people’s assumptions about what is possible. When trust in the body or equipment feels conditional, performance stops feeling free.",
    "triggers": "They are moved by visible mastery and by engineering that proves itself under pressure. Performance stories land because they collapse inspiration and credibility into the same moment.",
    "platformMix": [
      {
        "label": "TikTok",
        "pct": 38,
        "platform": "tiktok",
        "videos": 19
      },
      {
        "label": "Instagram",
        "pct": 36,
        "platform": "instagram",
        "videos": 18
      },
      {
        "label": "YouTube",
        "pct": 16,
        "platform": "youtube",
        "videos": 8
      },
      {
        "label": "Reddit",
        "pct": 10,
        "platform": "reddit",
        "videos": 5
      }
    ],
    "quote": {
      "english": "Great, my friend, congratulations, great video, I am a femoral amputee and I have a 3R 80 knee and it works very well and that's exactly it👍👍👍",
      "lang": "pt",
      "ref": "e:b0b83d7f-adfa-4267-a584-6b97b9cf8f32",
      "text": "show de bola meu amigo parabéns ótimo vídeo eu sou amputado femoral e tenho joelho 3R 80 e funciona muito bem e é isso aí mesmo👍👍👍"
    },
    "quoteCite": "one of this group’s own comments",
    "selected": false
  }
]
const OSSUR_PROFILE = {"profileDate": "2026-09-13", "population": 3129, "selected": "first-time-buyer"}
const OSSUR_BRAND = "Össur"

const MONTH = '2026-09-01'
const PREV = '2026-08-01'
const NOW = '2026-10-11T06:00:00.000Z'

// C5 and C6 (WP3.8), from the same staging read on 27 Sep at the 11 Oct clock
// (`loadVoiceSurface` through `scripts/loader-dump.ts`; the expanded list off
// `loadMonthVideos` and `loadMemory` the same day). Registry ids shortened as
// above; quote refs are the comments’ own ids, whole.
const SEALAND_WORDS: WordsBlock = {
 "kinds": [
  {
   "kind": "praise",
   "label": "Praising it",
   "quotes": [
    {
     "date": "2026-09-06T00:00:00+00:00",
     "href": "https://www.tiktok.com/@miritamgb/video/7682479419323223298",
     "likes": 38,
     "maker": true,
     "platform": "tiktok",
     "quote": {
      "english": "How original and how beautiful! ❤️",
      "lang": "es",
      "ref": "c:0626605f-51ce-46d9-90c4-b74b9832b51f",
      "text": "qué original y qué precioso! ❤️"
     },
     "theme": "Praise for beautiful bag design",
     "themeId": "0b05fdf0"
    },
    {
     "date": "2026-09-07T00:00:00+00:00",
     "href": "https://www.youtube.com/watch?v=0kYYPl6H66s&lc=UgxAu0-OzrQFULUoqgV4AaABAg",
     "likes": 5,
     "maker": false,
     "platform": "youtube",
     "quote": {
      "english": null,
      "lang": "en",
      "ref": "c:c6af8527-18ea-4afd-b68a-5aa3bfe03a50",
      "text": "I always bring an iPad to watch things as well 👍"
     },
     "theme": "Appreciation for smart packing tips",
     "themeId": "056a478a"
    },
    {
     "date": "2026-09-18T00:00:00+00:00",
     "href": "https://www.reddit.com/r/backpacks/comments/1wjewal/is_this_camel_backpack_actually_practical_day_to/",
     "likes": 2,
     "maker": false,
     "platform": "reddit",
     "quote": {
      "english": null,
      "lang": "en",
      "ref": "c:09f45ef5-470e-496f-aea6-89d1c20a8cf8",
      "text": "This is an excellent backpack and it will serve you well in the city. As said you can modify it and make it more sleek"
     },
     "theme": "Praise for laptop carry features",
     "themeId": "8285e151"
    }
   ],
   "videos": 468
  },
  {
   "kind": "purchase_intent",
   "label": "Ready to buy",
   "quotes": [
    {
     "date": "2026-09-16T00:00:00+00:00",
     "href": "https://www.youtube.com/watch?v=ooYV2pm5kRc&lc=UgxfbP8vv2NFPAMnC3p4AaABAg",
     "likes": 189,
     "maker": true,
     "platform": "youtube",
     "quote": {
      "english": null,
      "lang": "en",
      "ref": "c:01e65d97-34f6-40e6-b0f5-aa63b12d15d2",
      "text": "OF COURSE I WOULD DIE FOR THAT BAGG"
     },
     "theme": "Buying interest and ordering questions",
     "themeId": "03cabe7e"
    },
    {
     "date": "2026-09-09T00:00:00+00:00",
     "href": "https://www.tiktok.com/@ayotinuwabagcreation/video/7683455256092478727",
     "likes": 18,
     "maker": true,
     "platform": "tiktok",
     "quote": {
      "english": null,
      "lang": "en",
      "ref": "c:a23efc78-9e33-4755-89ed-b293ec4f6380",
      "text": "That first bag is how much in black"
     },
     "theme": "Price and sale questions",
     "themeId": "22e2445c"
    },
    {
     "date": "2026-09-19T00:00:00+00:00",
     "href": "https://www.tiktok.com/@bataray.ng/video/7686980095516462356",
     "likes": 6,
     "maker": false,
     "platform": "tiktok",
     "quote": {
      "english": null,
      "lang": "en",
      "ref": "c:3f8dcdd8-c459-4297-a3aa-808e7a8bb2a8",
      "text": "wow i want some I'm in Zambia though how can I reach you"
     },
     "theme": "Interest in shipping and locations",
     "themeId": "2c7238b7"
    }
   ],
   "videos": 381
  },
  {
   "kind": "question",
   "label": "Asking how it works",
   "quotes": [
    {
     "date": "2026-09-07T00:00:00+00:00",
     "href": "https://www.youtube.com/watch?v=uKEdtq_BCwc&lc=Ugyp7CCASLR2PrpepWt4AaABAg",
     "likes": 3,
     "maker": false,
     "platform": "youtube",
     "quote": {
      "english": null,
      "lang": "en",
      "ref": "c:386ea6aa-c49f-4d9c-b13f-0d96198e8a3f",
      "text": "My carry-on has a side 1.5 inches over the limit, another side is one inch under, and the third is two inches under. Passes or no ?"
     },
     "theme": "Confusion about airline size rules",
     "themeId": "f329a7dd"
    },
    {
     "date": "2026-09-09T00:00:00+00:00",
     "href": "https://www.reddit.com/r/onebag/comments/1wb3h91/trip_report_8_days_in_switzerland_personal_item/",
     "likes": 1,
     "maker": false,
     "platform": "reddit",
     "quote": {
      "english": null,
      "lang": "en",
      "ref": "c:7852673e-e2ed-48e0-9b17-6d47f7f6bda6",
      "text": "Hmm…I’m curious about what items were still damp after sink laundry?"
     },
     "theme": "Laundry planning for travel",
     "themeId": "4f4bc420"
    },
    {
     "date": "2026-09-10T00:00:00+00:00",
     "href": "https://www.tiktok.com/@kenaroseee_/video/7683939765028179214",
     "likes": 4,
     "maker": false,
     "platform": "tiktok",
     "quote": {
      "english": null,
      "lang": "en",
      "ref": "c:57851348-89ba-40bf-964f-ce2cf9c89912",
      "text": "Where did you order the first one from?"
     },
     "theme": "Buying interest and ordering questions",
     "themeId": "03cabe7e"
    }
   ],
   "videos": 334
  },
  {
   "kind": "pain_point",
   "label": "Hitting a problem",
   "quotes": [
    {
     "date": "2026-09-17T00:00:00+00:00",
     "href": "https://www.reddit.com/r/onebag/comments/1wiu2cf/psa_osprey_sojourn_porter_46_99_on_sierra/",
     "likes": 2,
     "maker": false,
     "platform": "reddit",
     "quote": {
      "english": null,
      "lang": "en",
      "ref": "c:2d73a9a0-6dc1-4e07-9c17-9f342b1af2dc",
      "text": "I want this pack, but it weighs almost 3.5 lbs? Is that right?"
     },
     "theme": "Frustration with bag weight",
     "themeId": "0c0784d8"
    },
    {
     "date": "2026-09-12T00:00:00+00:00",
     "href": "https://www.youtube.com/watch?v=7nSE0b5iiSc&lc=UgybnTjEUflasXMSAal4AaABAg",
     "likes": 1,
     "maker": false,
     "platform": "youtube",
     "quote": {
      "english": "If a lot of stuff goes into the bag, doesn't the shoulder get heavy??",
      "lang": "ko",
      "ref": "c:17944403-4b8d-400b-8a36-6db3fa08f9cb",
      "text": "가방 물건 많이 들어가게 되면 어깨가 무겁지는 않나여??"
     },
     "theme": "Comfort problems when carrying",
     "themeId": "daf7426d"
    },
    {
     "date": "2026-09-08T00:00:00+00:00",
     "href": "https://www.reddit.com/r/clinicalresearch/comments/1waek1f/best_travel_luggage_and_misc_gear/",
     "likes": 7,
     "maker": false,
     "platform": "reddit",
     "quote": {
      "english": null,
      "lang": "en",
      "ref": "c:4a13f627-b4a9-44d8-b6ba-d63360ca368e",
      "text": "It also fits in EVERY overhead bin, even the smallest regional jet, which is amazing."
     },
     "theme": "Confusion about airline size rules",
     "themeId": "f329a7dd"
    }
   ],
   "videos": 263
  },
  {
   "kind": "feature_request",
   "label": "Asking for something",
   "quotes": [
    {
     "date": "2026-09-19T00:00:00+00:00",
     "href": "https://www.tiktok.com/@bataray.ng/video/7686980095516462356",
     "likes": 78,
     "maker": false,
     "platform": "tiktok",
     "quote": {
      "english": null,
      "lang": "en",
      "ref": "c:2b0c1fa4-695e-4f9f-a5ff-2f74bc69ba4a",
      "text": "If you made it in pink and a bigger size I would buy it immediately 😭"
     },
     "theme": "More colors and variants wanted",
     "themeId": "4c312c8b"
    },
    {
     "date": "2026-09-16T00:00:00+00:00",
     "href": "https://www.tiktok.com/@lewkearnsy/video/7685735355978501398",
     "likes": 3,
     "maker": false,
     "platform": "tiktok",
     "quote": {
      "english": null,
      "lang": "en",
      "ref": "c:9552a634-5cc0-46bf-a085-fcdc81aaa9f3",
      "text": "Prices would be nice"
     },
     "theme": "Price and sale questions",
     "themeId": "22e2445c"
    },
    {
     "date": "2026-09-13T00:00:00+00:00",
     "href": "https://www.youtube.com/watch?v=65CDjTTXHPo&lc=UgypbKp09YP3TH9ZHs94AaABAg",
     "likes": 0,
     "maker": true,
     "platform": "youtube",
     "quote": {
      "english": null,
      "lang": "en",
      "ref": "c:28141594-d655-4531-b6ae-1ad88850a26a",
      "text": "Yes a packing style video would be awesome"
     },
     "theme": "Appreciation for smart packing tips",
     "themeId": "056a478a"
    }
   ],
   "videos": 151
  },
  {
   "kind": "objection",
   "label": "Pushing back",
   "quotes": [
    {
     "date": "2026-09-07T00:00:00+00:00",
     "href": "https://www.youtube.com/watch?v=uKEdtq_BCwc&lc=UgzdppKXC6rq8JPVJ9R4AaABAg",
     "likes": 0,
     "maker": false,
     "platform": "youtube",
     "quote": {
      "english": null,
      "lang": "en",
      "ref": "c:3b17dca8-8863-4262-867c-21d63721a917",
      "text": "Another way the TSA is protecting the airline industry more than anyone else."
     },
     "theme": "Confusion about airline size rules",
     "themeId": "f329a7dd"
    },
    {
     "date": "2026-09-18T00:00:00+00:00",
     "href": "https://www.reddit.com/r/onebag/comments/1wiu2cf/psa_osprey_sojourn_porter_46_99_on_sierra/",
     "likes": 3,
     "maker": false,
     "platform": "reddit",
     "quote": {
      "english": null,
      "lang": "en",
      "ref": "c:fe565c1d-b6a5-47f0-a91c-a9c87489d8b9",
      "text": "I returned it. It didn't feel comfortable and I did not appreciate the straight jacket feature."
     },
     "theme": "Comfort problems when carrying",
     "themeId": "daf7426d"
    },
    {
     "date": "2026-09-12T00:00:00+00:00",
     "href": "https://www.youtube.com/watch?v=yCeqWQUQvec&lc=UgyYHIwKFDH8wm2bFPt4AaABAg",
     "likes": 1,
     "maker": false,
     "platform": "youtube",
     "quote": {
      "english": null,
      "lang": "en",
      "ref": "c:678877de-f746-4e89-9c9f-e008aded5b16",
      "text": "Except for the fact that nothing goes back to the Comunity from thrift stores anymore"
     },
     "theme": "Appreciation for thrifting value",
     "themeId": "ce659d82"
    }
   ],
   "videos": 115
  }
 ],
 "month": "2026-09-01",
 "segments": "measured",
 "themes": 14
}
const SEALAND_WHERE_ALL: WhereBlock = {
 "accounts": 469,
 "atFloor": 19,
 "comments": 15792,
 "expanded": true,
 "largest": {
  "comments": 701,
  "key": "reddit|r/onebag"
 },
 "listed": 17,
 "memory": [
  "2026-07-01",
  "2026-08-01",
  "2026-09-01"
 ],
 "month": "2026-09-01",
 "rows": [
  {
   "comments": 701,
   "foundBy": null,
   "key": "reddit|r/onebag",
   "maker": false,
   "name": "r/onebag",
   "platform": "reddit",
   "seen": {
    "n": 2,
    "of": 3
   },
   "videos": 28
  },
  {
   "comments": 171,
   "foundBy": null,
   "key": "reddit|r/backpacks",
   "maker": false,
   "name": "r/backpacks",
   "platform": "reddit",
   "seen": {
    "n": 2,
    "of": 3
   },
   "videos": 15
  },
  {
   "comments": 128,
   "foundBy": null,
   "key": "reddit|r/ManyBaggers",
   "maker": false,
   "name": "r/ManyBaggers",
   "platform": "reddit",
   "seen": {
    "n": 2,
    "of": 3
   },
   "videos": 10
  },
  {
   "comments": 317,
   "foundBy": null,
   "key": "youtube|ReBorn Creations",
   "maker": true,
   "name": "ReBorn Creations",
   "platform": "youtube",
   "seen": {
    "n": 2,
    "of": 3
   },
   "videos": 9
  },
  {
   "comments": 227,
   "foundBy": null,
   "key": "tiktok|Shining Echoes",
   "maker": true,
   "name": "Shining Echoes",
   "platform": "tiktok",
   "seen": {
    "n": 3,
    "of": 3
   },
   "videos": 6
  },
  {
   "comments": 105,
   "foundBy": null,
   "key": "youtube|Backpacking & Blisters Podcast",
   "maker": false,
   "name": "Backpacking & Blisters Podcast",
   "platform": "youtube",
   "seen": {
    "n": 2,
    "of": 3
   },
   "videos": 6
  },
  {
   "comments": 43,
   "foundBy": null,
   "key": "youtube|Miarti - Clever Sewing",
   "maker": true,
   "name": "Miarti - Clever Sewing",
   "platform": "youtube",
   "seen": {
    "n": 2,
    "of": 3
   },
   "videos": 6
  },
  {
   "comments": 229,
   "foundBy": null,
   "key": "tiktok|Luisa | Reworking Textiles ✂️",
   "maker": true,
   "name": "Luisa | Reworking Textiles ✂️",
   "platform": "tiktok",
   "seen": {
    "n": 3,
    "of": 3
   },
   "videos": 4
  },
  {
   "comments": 156,
   "foundBy": null,
   "key": "youtube|Nomads Nation",
   "maker": false,
   "name": "Nomads Nation",
   "platform": "youtube",
   "seen": {
    "n": 2,
    "of": 3
   },
   "videos": 4
  },
  {
   "comments": 63,
   "foundBy": null,
   "key": "reddit|r/HerOneBag",
   "maker": false,
   "name": "r/HerOneBag",
   "platform": "reddit",
   "seen": {
    "n": 2,
    "of": 3
   },
   "videos": 4
  },
  {
   "comments": 62,
   "foundBy": null,
   "key": "youtube|Pack Hacker",
   "maker": false,
   "name": "Pack Hacker",
   "platform": "youtube",
   "seen": {
    "n": 2,
    "of": 3
   },
   "videos": 4
  },
  {
   "comments": 39,
   "foundBy": null,
   "key": "youtube|Ire Heart Crafting",
   "maker": true,
   "name": "Ire Heart Crafting",
   "platform": "youtube",
   "seen": {
    "n": 2,
    "of": 3
   },
   "videos": 4
  },
  {
   "comments": 190,
   "foundBy": null,
   "key": "tiktok|ItsElijahAgain",
   "maker": false,
   "name": "ItsElijahAgain",
   "platform": "tiktok",
   "seen": {
    "n": 1,
    "of": 3
   },
   "videos": 3
  },
  {
   "comments": 128,
   "foundBy": null,
   "key": "tiktok|Ama crafts",
   "maker": true,
   "name": "Ama crafts",
   "platform": "tiktok",
   "seen": {
    "n": 1,
    "of": 3
   },
   "videos": 3
  },
  {
   "comments": 114,
   "foundBy": null,
   "key": "tiktok|HandmadeByJamal",
   "maker": false,
   "name": "HandmadeByJamal",
   "platform": "tiktok",
   "seen": {
    "n": 1,
    "of": 3
   },
   "videos": 3
  },
  {
   "comments": 35,
   "foundBy": null,
   "key": "youtube|Pack Hacker Reviews",
   "maker": false,
   "name": "Pack Hacker Reviews",
   "platform": "youtube",
   "seen": {
    "n": 1,
    "of": 3
   },
   "videos": 3
  },
  {
   "comments": 17,
   "foundBy": null,
   "key": "tiktok|TheCreativeBarnUS",
   "maker": false,
   "name": "TheCreativeBarnUS",
   "platform": "tiktok",
   "seen": {
    "n": 2,
    "of": 3
   },
   "videos": 3
  }
 ],
 "segments": "measured",
 "setAside": [
  {
   "comments": 73,
   "foundBy": "sealand gear",
   "key": "youtube|Mike Ritland",
   "maker": false,
   "name": "Mike Ritland",
   "platform": "youtube",
   "seen": null,
   "videos": 8
  },
  {
   "comments": 14,
   "foundBy": "poler",
   "key": "youtube|The Poker Academy",
   "maker": false,
   "name": "The Poker Academy",
   "platform": "youtube",
   "seen": null,
   "videos": 3
  }
 ]
}
const SEALAND_WHERE: WhereBlock = { ...SEALAND_WHERE_ALL, rows: SEALAND_WHERE_ALL.rows.slice(0, ACCOUNT_ROWS), expanded: false }
const OSSUR_WORDS: WordsBlock = {
 "kinds": [
  {
   "kind": "praise",
   "label": "Praising it",
   "quotes": [
    {
     "date": "2026-09-07T00:00:00+00:00",
     "href": "https://www.youtube.com/watch?v=z2PvC9F6Y6Y&lc=Ugy6GuVRGHRcVVxTQwZ4AaABAg",
     "likes": 1005,
     "maker": false,
     "platform": "youtube",
     "quote": {
      "english": null,
      "lang": "en",
      "ref": "c:4288cf48-d6ef-4aca-a9e0-59f4fba6ac77",
      "text": "She didnt touch her🤦‍♂️"
     },
     "theme": "Admiration for personal resilience",
     "themeId": "2418f4d7"
    },
    {
     "date": "2026-09-12T00:00:00+00:00",
     "href": "https://www.tiktok.com/@hey_jer.ome/video/7684456764284194069",
     "likes": 7,
     "maker": false,
     "platform": "tiktok",
     "quote": {
      "english": null,
      "lang": "en",
      "ref": "c:fd1ae323-8258-42cf-b2b7-f6d05de8d67a",
      "text": "Bro this is the smoothest prosthetic I’ve seen"
     },
     "theme": "Praise for prosthetic look",
     "themeId": "559bbc8c"
    },
    {
     "date": "2026-09-04T00:00:00+00:00",
     "href": "https://www.tiktok.com/@sabia.and.loren/video/7681721616308374814",
     "likes": 28,
     "maker": false,
     "platform": "tiktok",
     "quote": {
      "english": null,
      "lang": "en",
      "ref": "c:23f3919c-b108-4d5f-8ccc-9bf389e480fd",
      "text": "That’s a game changer for you guys I’m so happy you’ve got this 💪🏻"
     },
     "theme": "Excitement about prosthetic innovation",
     "themeId": "d548dd42"
    }
   ],
   "videos": 206
  },
  {
   "kind": "pain_point",
   "label": "Hitting a problem",
   "quotes": [
    {
     "date": "2026-09-10T00:00:00+00:00",
     "href": "https://www.youtube.com/watch?v=HUoL5xTcxZM&lc=Ugz5o042hKiwdOXNo1h4AaABAg",
     "likes": 7,
     "maker": false,
     "platform": "youtube",
     "quote": {
      "english": null,
      "lang": "en",
      "ref": "c:c2e3011f-5258-43de-a6cb-83c4536880b0",
      "text": "All prosthetic devices break, and Murphy's Law sees to it that it is at the most inconvenient time. How much does it cost to maintain, this after the initial cost?"
     },
     "theme": "Cost blocks access",
     "themeId": "b6db00ac"
    },
    {
     "date": "2026-09-11T00:00:00+00:00",
     "href": "https://www.youtube.com/watch?v=ytx_SKhU5I0&lc=UgwCrGf6d0lRWqL76G14AaABAg",
     "likes": 38,
     "maker": false,
     "platform": "youtube",
     "quote": {
      "english": null,
      "lang": "en",
      "ref": "c:15f2f34d-a908-48f6-b863-13a3d251db90",
      "text": "Imagine running for a marathon and your leg falls off and not you beat your ass and lost"
     },
     "theme": "Socket fit keeps changing",
     "themeId": "515ca100"
    },
    {
     "date": "2026-09-09T00:00:00+00:00",
     "href": "https://www.reddit.com/r/FrontiersOfPandora/comments/1waxt7b/i_just_noticed_anufis_arm_prosthetic_who_do_you/",
     "likes": 4,
     "maker": false,
     "platform": "reddit",
     "quote": {
      "english": null,
      "lang": "en",
      "ref": "c:0d2b1e52-36d7-4f2f-9fa1-8b7ae15933ea",
      "text": "That is…really creepy actually; actually startled me a little once I fully noticed."
     },
     "theme": "Prosthetics need more personalization",
     "themeId": "57d9a5a3"
    }
   ],
   "videos": 159
  },
  {
   "kind": "question",
   "label": "Asking how it works",
   "quotes": [
    {
     "date": "2026-09-09T00:00:00+00:00",
     "href": "https://www.tiktok.com/@brennahuckabyofficial/video/7683455599933132045",
     "likes": 61,
     "maker": false,
     "platform": "tiktok",
     "quote": {
      "english": null,
      "lang": "en",
      "ref": "c:e4cd74e9-006f-45ef-918f-ccaa8123edb4",
      "text": "There have to be lighter ones."
     },
     "theme": "Questions about prosthetic function",
     "themeId": "3c28b5fe"
    },
    {
     "date": "2026-09-01T00:00:00+00:00",
     "href": "https://www.tiktok.com/@mfuentes9/video/7680192035256585486",
     "likes": 3,
     "maker": false,
     "platform": "tiktok",
     "quote": {
      "english": "How much did your prosthesis cost? Beautiful",
      "lang": "es",
      "ref": "c:40ac0097-7534-45ca-a10d-cefc0b8f3a7c",
      "text": "cuánto te costó tú prótesis? hermosa"
     },
     "theme": "Price and availability questions",
     "themeId": "140e43a7"
    },
    {
     "date": "2026-09-01T00:00:00+00:00",
     "href": "https://www.youtube.com/watch?v=cT73M7cveI8&lc=UgztLNT-iaOpkqOMz454AaABAg",
     "likes": 12,
     "maker": false,
     "platform": "youtube",
     "quote": {
      "english": null,
      "lang": "en",
      "ref": "c:d2cacc7d-0f6b-4099-bf70-55bd4cc880ba",
      "text": "My brother also wish to stand like this can you help my brother"
     },
     "theme": "Requests for prosthetic help",
     "themeId": "86349219"
    }
   ],
   "videos": 151
  },
  {
   "kind": "purchase_intent",
   "label": "Ready to buy",
   "quotes": [
    {
     "date": "2026-09-09T00:00:00+00:00",
     "href": "https://www.reddit.com/r/dancingwiththestars/comments/1wbr62z/an_informative_video_made_by_disability_advocate/",
     "likes": 23,
     "maker": false,
     "platform": "reddit",
     "quote": {
      "english": null,
      "lang": "en",
      "ref": "c:5dc0309d-b565-4023-9e86-0e96dc415621",
      "text": "Benefits and drawbacks of each type of leg etc is super interesting, medical technology is awesome."
     },
     "theme": "Requests for prosthetic help",
     "themeId": "86349219"
    },
    {
     "date": "2026-09-08T00:00:00+00:00",
     "href": "https://www.tiktok.com/@ajplus/video/7683181189171072269",
     "likes": 28,
     "maker": false,
     "platform": "tiktok",
     "quote": {
      "english": null,
      "lang": "en",
      "ref": "c:03d2d915-bd4c-41a8-a6bf-f2908f3964dd",
      "text": "I'll definitely be buying adidas at some point now, wasn't planning on it before"
     },
     "theme": "Brand boycott over politics",
     "themeId": "19c24f49"
    },
    {
     "date": "2026-09-12T00:00:00+00:00",
     "href": "https://www.tiktok.com/@hey_jer.ome/video/7684456764284194069",
     "likes": 3,
     "maker": false,
     "platform": "tiktok",
     "quote": {
      "english": null,
      "lang": "en",
      "ref": "c:838c2229-fe75-4771-bfab-4ccd89e90049",
      "text": "what's the cost for a about know prosthetic 🦿"
     },
     "theme": "Price and availability questions",
     "themeId": "140e43a7"
    }
   ],
   "videos": 57
  },
  {
   "kind": "objection",
   "label": "Pushing back",
   "quotes": [
    {
     "date": "2026-09-07T00:00:00+00:00",
     "href": "https://www.reddit.com/r/OrphanCrushingMachine/comments/1w9vf8s/new_adidas_ad_features_amputated_soldier_from_an/",
     "likes": 80,
     "maker": false,
     "platform": "reddit",
     "quote": {
      "english": null,
      "lang": "en",
      "ref": "c:b73ce959-8fa8-4300-a02f-114868a644a5",
      "text": "Alternatively, they’ll also sell you a pair without any shoes. All you have to do is continue to boycott Adidas, and pay 0%."
     },
     "theme": "Brand boycott over politics",
     "themeId": "19c24f49"
    },
    {
     "date": "2026-09-04T00:00:00+00:00",
     "href": "https://www.tiktok.com/@johnmabry_speaker/video/7681480155906182414",
     "likes": 0,
     "maker": false,
     "platform": "tiktok",
     "quote": {
      "english": null,
      "lang": "en",
      "ref": "c:b581896a-90a1-4dcb-a23c-683e8e1938be",
      "text": "I’ve tried a lot of liners and ossurs I have found to be the best for me. I was gonna buy some out-of-pocket without a script, but they’re over $700 apiece."
     },
     "theme": "Cost blocks access",
     "themeId": "b6db00ac"
    },
    {
     "date": "2026-09-08T00:00:00+00:00",
     "href": "https://www.tiktok.com/@astepaheadprosthetics/video/7683207568453422366",
     "likes": 5,
     "maker": false,
     "platform": "tiktok",
     "quote": {
      "english": null,
      "lang": "en",
      "ref": "c:83548516-6239-4e41-b11a-42eacb8d1ead",
      "text": "But unfortunately insurance doesn’t cover it 😭"
     },
     "theme": "Insurance delays and denials",
     "themeId": "4e506728"
    }
   ],
   "videos": 43
  },
  {
   "kind": "feature_request",
   "label": "Asking for something",
   "quotes": [
    {
     "date": "2026-09-04T00:00:00+00:00",
     "href": "https://www.tiktok.com/@goalrush941/video/7681299885856918815",
     "likes": 5,
     "maker": false,
     "platform": "tiktok",
     "quote": {
      "english": null,
      "lang": "en",
      "ref": "c:86b916a5-af9f-426e-bda0-d48acf48d55c",
      "text": "They should be free"
     },
     "theme": "Cost blocks access",
     "themeId": "b6db00ac"
    },
    {
     "date": "2026-09-03T00:00:00+00:00",
     "href": "https://www.reddit.com/r/hypotheticalsituation/comments/1w43hd5/prosthetic_arm_appears_totally_real_or_fully/",
     "likes": 1,
     "maker": false,
     "platform": "reddit",
     "quote": {
      "english": null,
      "lang": "en",
      "ref": "c:1f4a09ff-543b-4f2b-843f-22d8462fabbb",
      "text": "Easily 2, I prefer the functionality over feeling shame or the need to hide it, plus I could customize the arm this way its be sick"
     },
     "theme": "Prosthetics need more personalization",
     "themeId": "57d9a5a3"
    }
   ],
   "videos": 42
  }
 ],
 "month": "2026-09-01",
 "segments": "no_rule",
 "themes": 12
}
const OSSUR_WHERE: WhereBlock = {
 "accounts": 248,
 "atFloor": 19,
 "comments": 10125,
 "expanded": false,
 "largest": {
  "comments": 182,
  "key": "reddit|r/amputee"
 },
 "listed": 19,
 "memory": [
  "2026-07-01",
  "2026-08-01",
  "2026-09-01"
 ],
 "month": "2026-09-01",
 "rows": [
  {
   "comments": 182,
   "foundBy": null,
   "key": "reddit|r/amputee",
   "maker": false,
   "name": "r/amputee",
   "platform": "reddit",
   "seen": {
    "n": 2,
    "of": 3
   },
   "videos": 12
  },
  {
   "comments": 302,
   "foundBy": null,
   "key": "instagram|siliconfingerco",
   "maker": false,
   "name": "siliconfingerco",
   "platform": "instagram",
   "seen": {
    "n": 3,
    "of": 3
   },
   "videos": 6
  },
  {
   "comments": 279,
   "foundBy": null,
   "key": "tiktok|A L I S",
   "maker": false,
   "name": "A L I S",
   "platform": "tiktok",
   "seen": {
    "n": 3,
    "of": 3
   },
   "videos": 6
  },
  {
   "comments": 154,
   "foundBy": null,
   "key": "youtube|MRSACHINVERMA",
   "maker": false,
   "name": "MRSACHINVERMA",
   "platform": "youtube",
   "seen": {
    "n": 2,
    "of": 3
   },
   "videos": 6
  },
  {
   "comments": 80,
   "foundBy": null,
   "key": "reddit|r/Prosthetics",
   "maker": false,
   "name": "r/Prosthetics",
   "platform": "reddit",
   "seen": {
    "n": 2,
    "of": 3
   },
   "videos": 6
  },
  {
   "comments": 322,
   "foundBy": null,
   "key": "tiktok|Eldiara 🦾🪲⚔️",
   "maker": false,
   "name": "Eldiara 🦾🪲⚔️",
   "platform": "tiktok",
   "seen": {
    "n": 2,
    "of": 3
   },
   "videos": 4
  },
  {
   "comments": 235,
   "foundBy": null,
   "key": "instagram|semibionicbarbie",
   "maker": false,
   "name": "semibionicbarbie",
   "platform": "instagram",
   "seen": {
    "n": 3,
    "of": 3
   },
   "videos": 4
  },
  {
   "comments": 105,
   "foundBy": null,
   "key": "tiktok|shahybxska8",
   "maker": false,
   "name": "shahybxska8",
   "platform": "tiktok",
   "seen": {
    "n": 1,
    "of": 3
   },
   "videos": 4
  },
  {
   "comments": 71,
   "foundBy": null,
   "key": "tiktok|saahegazvb",
   "maker": false,
   "name": "saahegazvb",
   "platform": "tiktok",
   "seen": {
    "n": 2,
    "of": 3
   },
   "videos": 4
  },
  {
   "comments": 47,
   "foundBy": null,
   "key": "youtube|TYTANOVI (ТИТАНОВІ)",
   "maker": false,
   "name": "TYTANOVI (ТИТАНОВІ)",
   "platform": "youtube",
   "seen": {
    "n": 2,
    "of": 3
   },
   "videos": 4
  }
 ],
 "segments": "no_rule",
 "setAside": []
}

function themesOf(rows: readonly Row[], n: number, prevN: number): MarketTheme[] {
  return rows.map(([registryId, label, k, prevK, kind, maker, noise, flags, provenance]) => ({
    registryId,
    label,
    labelStripped: false,
    kind,
    k,
    n,
    prev: prevK == null ? null : { month: PREV, k: prevK, n: prevN },
    makerShare: maker,
    noiseShare: noise,
    identityNewThisRun: false,
    flags,
    provenance: provenance ? { fromNewSearches: provenance[0], of: provenance[1] } : null,
  }))
}

function build(input: {
  brand: string
  rows: readonly Row[]
  board: { n: number; prev: { month: string; n: number }; segments: 'measured' | 'unknown' | 'no_rule'; atTen: number; inThemes: number | null; chip: string | null; belowCount: number }
  open: string
  kinds: { kind: string; label: string; videos: number }[] | null
  voices: Voice[]
  market: VoiceSurfaceData['market']
  reading: ReadingMonth
  others: OtherMonth[]
  personas: Omit<CastPersona, 'href'>[]
  profile: { profileDate: string; population: number; selected: string }
}): VoiceSurfaceData {
  const params = {}
  const window = horizonWindow('this_month', `${MONTH}T12:00:00.000Z`, '2021-02-01')
  const themes = themesOf(input.rows, input.board.n, input.board.prev.n)
  const board = buildConversationBoard(themes, input.board.n, MONTH, input.board.segments, input.board.prev, {
    belowCount: input.board.belowCount,
    inThemes: input.board.inThemes,
    chip: input.board.chip,
  })
  const open = themes.find((t) => t.registryId === input.open) as MarketTheme
  return {
    brand: input.brand,
    month: MONTH,
    monthStatus: 'filling',
    readingAt: NOW,
    reading: input.reading,
    otherMonths: input.others,
    horizon: 'this_month',
    window,
    axis: window.months,
    substrate: 'seeded',
    notes: [],
    params,
    market: input.market,
    board,
    theme: {
      state: 'ready',
      id: open.registryId,
      label: open.label,
      kind: open.kind,
      kindLabel: open.kind ? marketKindLabel(open.kind) : null,
      makerSentence: input.board.segments === 'measured' ? makerShareSentence(open.makerShare) : null,
      flags: open.flags,
      k: open.k,
      n: open.n,
      prev: open.prev,
      provenance: open.provenance,
      kinds: input.kinds,
      voices: input.voices,
      chip: input.board.chip,
      isLead: true,
      videosHref: `/dashboard/videos?theme=${open.registryId}`,
      askHref: askAboutTheme(open),
      notes: [],
    },
    cast: {
      state: 'ready',
      personas: input.personas.map((p) => ({ ...p, href: voiceSurfaceHref(params, { persona: p.key }) })),
      selected: input.profile.selected,
      population: input.profile.population,
      overlapNote: 'A video can carry more than one group, so these counts overlap and do not add up to a whole.',
      profileDate: input.profile.profileDate,
      stale: false,
      floorNote: `${PERSONA_VIDEO_FLOOR}-video floor`,
      empty: null,
    },
  }
}

/** Sealand's September on staging, read at the 11 Oct clock. */
export function voiceFixture(over: Partial<VoiceSurfaceData> = {}): VoiceSurfaceData {
  return {
    ...build({
      brand: SEALAND_BRAND, rows: SEALAND_THEMES, board: SEALAND_BOARD as never, open: SEALAND_OPEN, kinds: SEALAND_KINDS,
      voices: SEALAND_VOICES, market: SEALAND_MARKET, reading: SEALAND_READING, others: SEALAND_OTHERS,
      personas: SEALAND_PERSONAS, profile: SEALAND_PROFILE,
    }),
    words: SEALAND_WORDS,
    where: SEALAND_WHERE,
    ...over,
  }
}

/** Össur's September on staging (paused, read to 13 Sep, no maker rule). */
export function ossurVoiceFixture(over: Partial<VoiceSurfaceData> = {}): VoiceSurfaceData {
  return {
    ...build({
      brand: OSSUR_BRAND, rows: OSSUR_THEMES, board: OSSUR_BOARD as never, open: OSSUR_OPEN, kinds: OSSUR_KINDS,
      voices: OSSUR_VOICES, market: OSSUR_MARKET, reading: OSSUR_READING, others: OSSUR_OTHERS,
      personas: OSSUR_PERSONAS, profile: OSSUR_PROFILE,
    }),
    words: OSSUR_WORDS,
    where: OSSUR_WHERE,
    ...over,
  }
}

/**
 * Sealand's same month with nothing optional read: MF1 not applied (no maker
 * shares, no provenance, no union of the themes' videos), no themed update
 * behind the pane (no kinds, no voices), and no profile for the cast. The
 * counts that remain are the month tables', which exist without MF1.
 */
export function refusedVoiceFixture(over: Partial<VoiceSurfaceData> = {}): VoiceSurfaceData {
  const rows: Row[] = SEALAND_THEMES.map(([id, label, k, prevK, kind, , , flags]) => [id, label, k, prevK, kind, null, null, flags, null])
  const base = build({
    brand: SEALAND_BRAND, rows, board: { ...(SEALAND_BOARD as never as { n: number; prev: { month: string; n: number }; chip: string | null; belowCount: number }), segments: 'unknown', atTen: 21, inThemes: null }, open: SEALAND_OPEN, kinds: null,
    voices: [], market: SEALAND_MARKET, reading: SEALAND_READING, others: SEALAND_OTHERS,
    personas: [], profile: SEALAND_PROFILE,
  })
  return {
    ...base,
    theme: { ...base.theme, makerSentence: null, provenance: null },
    cast: {
      ...base.cast,
      state: 'not_run',
      personas: [],
      selected: null,
      population: null,
      profileDate: null,
      empty: 'Reading who is talking is not switched on for this workspace yet.',
    },
    // C5 and C6 not read (no themed update, MF1 not applied).
    words: null,
    where: null,
    ...over,
  }
}

/** Sealand's September with every account at the floor listed
 *  (`?accounts=all`): 17 listed, 2 set aside. */
export function allAccountsVoiceFixture(over: Partial<VoiceSurfaceData> = {}): VoiceSurfaceData {
  return voiceFixture({ params: { accounts: 'all' }, where: SEALAND_WHERE_ALL, ...over })
}
