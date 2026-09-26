import { horizonWindow } from '@/lib/reading/horizon'
import type { ReadingMonth } from '@/lib/reading/reading-month'
import type { OtherMonth } from '@/lib/reading/reading-view'
import { buildConversationBoard, makerShareSentence, marketKindLabel, type MarketTheme } from '@/lib/pages/overview-market'
import type { Voice } from '@/lib/pages/overview'
import { PERSONA_VIDEO_FLOOR, askAboutTheme, voiceSurfaceHref, type CastPersona, type VoiceSurfaceData } from '@/lib/pages/voice-surface'

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
// THREE STATES:
//   - `voiceFixture()`: Sealand's September, MF1 measured: 21 themes at 10+,
//     7 of them maker-led, the lead "Price and sale questions" open;
//   - `ossurVoiceFixture()`: Össur (paused, no maker rule, §2.13): 12 themes,
//     "Brand boycott over politics" New;
//   - `refusedVoiceFixture()`: Sealand's same month before MF1 is applied
//     (segments not measured, no provenance, no union of theme videos) and with
//     no themed update or profile behind the pane and the cast. Every absence
//     is a null the loader returns, never a zero.

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
      askHref: askAboutTheme(open.label, MONTH),
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
    ...over,
  }
}
