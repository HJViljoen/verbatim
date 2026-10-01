import type { AboutPart } from '@/lib/brands/attribution'
import { convKindLabel, makerPostsPhrase, type ConvKind, type ConversationExtras } from '@/lib/pages/voice-conversation'
import type { VoiceSurfaceData } from '@/lib/pages/voice-surface'
import { SEALAND_CLIENT_ID } from '@/lib/config'
import { voiceFixture } from './fixture'

// The artboard's additions (the pages build, 1 Oct) over Conversation's
// staging fixture (`./fixture.ts`).
//
// REAL, FROM TWO READS, SAID SO: the board rows and the pane are staging's
// September (the fixture's own header); the kind analysis is PRODUCTION's
// September as the approved artboard printed it (Page-Conversation.dc.html,
// pages_rev_data.json `conv_kinds`, read 1 Oct: month_theme_readings x
// theme_observations, month_kind_readings by audience, brand_mentions one
// brand per video). Who the board's rows are about is the staging rows'
// own videos, the market's but for the two the artboard splits.

const market = (videos: number): AboutPart[] => [{ about: 'market', videos }]

/** Who the staging board's rows are about (the artboard's rule). */
const WHO: Record<string, AboutPart[]> = {
  '03cabe7e': market(88),
  '0b05fdf0': market(60),
  '4c312c8b': [{ about: 'rival:The North Face', videos: 1 }, { about: 'market', videos: 19 }],
  '22e2445c': market(18),
  '2c7238b7': market(13),
  'f329a7dd': market(12),
  'd812ace3': market(12),
  '056a478a': market(12),
  '0c0784d8': [{ about: 'rival:Patagonia', videos: 2 }, { about: 'rival:The North Face', videos: 2 }, { about: 'market', videos: 7 }],
  '8285e151': market(11),
  'daf7426d': market(10),
  'ce659d82': market(10),
  '4f4bc420': market(10),
  'aed3a6d0': market(10),
}
const SUBJECT: Record<string, string> = { '03cabe7e': 'Buying & delivery', '22e2445c': 'Price', '0c0784d8': 'Comfort', 'daf7426d': 'Comfort' }

/** Production's September, kind by kind, as the artboard prints it. */
export const SEALAND_KINDS: ConvKind[] = [
  {
    kind: "praise",
    label: "Praised a bag",
    videos: 627,
    split: [
      {
        about: "market",
        videos: 599
      },
      {
        about: "rival:Patagonia",
        videos: 11
      },
      {
        about: "rival:The North Face",
        videos: 8
      },
      {
        about: "rival:Cotopaxi",
        videos: 5
      },
      {
        about: "rival:Freitag",
        videos: 4
      }
    ],
    items: [
      {
        themeId: "fd12ae68-8ccc-45c9-9e75-0f193ba50ebd",
        label: "Praise for organized bag features",
        videos: 20,
        who: [
          {
            about: "market",
            videos: 20
          }
        ]
      },
      {
        themeId: "056a478a-ea54-4ab7-97d4-82681d263c82",
        label: "Packing light feels achievable",
        videos: 18,
        who: [
          {
            about: "market",
            videos: 18
          }
        ]
      },
      {
        themeId: "5f28f90b-5fd8-4168-9d0f-fb3094061a29",
        label: "Trust in long-lasting bag quality",
        videos: 13,
        who: [
          {
            about: "rival:The North Face",
            videos: 3
          },
          {
            about: "rival:Cotopaxi",
            videos: 1
          },
          {
            about: "market",
            videos: 9
          }
        ]
      },
      {
        themeId: "c89678e9-c923-42cf-bfa2-2699c5bed811",
        label: "Sustainable fashion feels appealing",
        videos: 12,
        who: [
          {
            about: "market",
            videos: 12
          }
        ]
      },
      {
        themeId: "ce659d82-892e-4383-ae50-1ecca451833b",
        label: "Secondhand shopping feels rewarding",
        videos: 10,
        who: [
          {
            about: "market",
            videos: 10
          }
        ]
      }
    ],
    brandItems: [
      {
        about: "client",
        themeId: "praise-b0",
        label: "Praise for Sealand’s mission",
        videos: 4
      },
      {
        about: "client",
        themeId: "praise-b1",
        label: "Support for community cleanups",
        videos: 3
      },
      {
        about: "rival:Patagonia",
        themeId: "praise-b2",
        label: "Ethical activism builds trust",
        videos: 6
      },
      {
        about: "rival:Patagonia",
        themeId: "praise-b3",
        label: "Durability proven over time",
        videos: 2
      },
      {
        about: "rival:Freitag",
        themeId: "praise-b4",
        label: "Liking the look and style",
        videos: 2
      },
      {
        about: "rival:Patagonia",
        themeId: "praise-b5",
        label: "Warmth without the weight",
        videos: 2
      }
    ],
    quote: null
  },
  {
    kind: "purchase_intent",
    label: "Said they want to buy",
    videos: 509,
    split: [
      {
        about: "market",
        videos: 490
      },
      {
        about: "rival:Patagonia",
        videos: 6
      },
      {
        about: "rival:Cotopaxi",
        videos: 5
      },
      {
        about: "rival:The North Face",
        videos: 4
      },
      {
        about: "rival:Freitag",
        videos: 3
      },
      {
        about: "rival:Freedom of Movement",
        videos: 1
      }
    ],
    items: [
      {
        themeId: "03cabe7e-c7df-40f1-a056-a6c01ee57939",
        label: "Ready to buy the bag",
        videos: 92,
        who: [
          {
            about: "market",
            videos: 92
          }
        ]
      },
      {
        themeId: "ca624469-4a71-43ea-8ea0-8a00e9b8e44d",
        label: "Questions about shipping and availability",
        videos: 34,
        who: [
          {
            about: "market",
            videos: 34
          }
        ]
      },
      {
        themeId: "22e2445c-e334-49f5-8b6d-55d0ead000c1",
        label: "Price and sale status questions",
        videos: 21,
        who: [
          {
            about: "market",
            videos: 21
          }
        ]
      },
      {
        themeId: "4c312c8b-572c-4462-a758-1e7d22dc6135",
        label: "Specific color choices matter",
        videos: 19,
        who: [
          {
            about: "rival:The North Face",
            videos: 1
          },
          {
            about: "market",
            videos: 18
          }
        ]
      },
      {
        themeId: "d812ace3-47a1-405d-a7c0-0b5b0e4dbe82",
        label: "Intent to shop the brand",
        videos: 18,
        who: [
          {
            about: "market",
            videos: 18
          }
        ]
      }
    ],
    brandItems: [
      {
        about: "client",
        themeId: "purchase_intent-b0",
        label: "Eagerness to join Sealand events",
        videos: 3
      },
      {
        about: "rival:Freitag",
        themeId: "purchase_intent-b1",
        label: "Asking about the price",
        videos: 2
      },
      {
        about: "rival:Cotopaxi",
        themeId: "purchase_intent-b2",
        label: "Desire to buy the gear",
        videos: 2
      },
      {
        about: "rival:Patagonia",
        themeId: "purchase_intent-b3",
        label: "Sale excitement and scam doubts",
        videos: 2
      }
    ],
    quote: null
  },
  {
    kind: "question",
    label: "Asked a question",
    videos: 449,
    split: [
      {
        about: "market",
        videos: 426
      },
      {
        about: "rival:Patagonia",
        videos: 8
      },
      {
        about: "rival:Cotopaxi",
        videos: 7
      },
      {
        about: "rival:Freitag",
        videos: 4
      },
      {
        about: "rival:The North Face",
        videos: 4
      }
    ],
    items: [
      {
        themeId: "6977b4c0-9a4e-4a8b-b2ec-101e93740d01",
        label: "Curiosity about featured product details",
        videos: 22,
        who: [
          {
            about: "market",
            videos: 22
          }
        ]
      },
      {
        themeId: "e5f4b1da-be1b-4e79-a3ea-ee9511f5b42f",
        label: "Seeking brand and model recommendations",
        videos: 20,
        who: [
          {
            about: "rival:Cotopaxi",
            videos: 2
          },
          {
            about: "rival:Patagonia",
            videos: 2
          },
          {
            about: "market",
            videos: 16
          }
        ]
      },
      {
        themeId: "f329a7dd-7afe-4710-80e3-f4ba6e63b708",
        label: "Confusion over airline size rules",
        videos: 15,
        who: [
          {
            about: "market",
            videos: 15
          }
        ]
      },
      {
        themeId: "4f4bc420-8906-44ac-878d-2855c1011485",
        label: "Laundry shapes packing choices",
        videos: 9,
        who: [
          {
            about: "market",
            videos: 9
          }
        ]
      },
      {
        themeId: "89b54d7f-9985-44c2-aaca-f44a94b5679f",
        label: "Need help comparing backpack options",
        videos: 5,
        who: [
          {
            about: "rival:Patagonia",
            videos: 1
          },
          {
            about: "market",
            videos: 4
          }
        ]
      },
      {
        themeId: "eaa7e6ee-9817-4877-b18a-6ec460207988",
        label: "Questions about laptop fit protection",
        videos: 5,
        who: [
          {
            about: "market",
            videos: 5
          }
        ]
      },
      {
        themeId: "aefc37ca-daf0-4e96-b9a2-fb7e0e58745c",
        label: "Questions about rain protection",
        videos: 5,
        who: [
          {
            about: "rival:Patagonia",
            videos: 1
          },
          {
            about: "rival:The North Face",
            videos: 1
          },
          {
            about: "market",
            videos: 3
          }
        ]
      }
    ],
    brandItems: [
      {
        about: "rival:Cotopaxi",
        themeId: "question-b0",
        label: "Questions about bag size and brand",
        videos: 3
      },
      {
        about: "rival:The North Face",
        themeId: "question-b1",
        label: "Backpack shopping recommendations",
        videos: 2
      }
    ],
    quote: {
      quote: {
        ref: "c:design-question",
        text: "Would you also recommend the next size down for the backpack? I have heard that this version is too big for some airlines to fit under the seat?"
      },
      source: "YouTube · 15 Sep",
      who: [
        {
          about: "market",
          videos: 1
        }
      ]
    }
  },
  {
    kind: "pain_point",
    label: "Complained about something",
    videos: 333,
    split: [
      {
        about: "market",
        videos: 317
      },
      {
        about: "rival:Patagonia",
        videos: 9
      },
      {
        about: "rival:Cotopaxi",
        videos: 5
      },
      {
        about: "rival:The North Face",
        videos: 2
      }
    ],
    items: [
      {
        themeId: "daf7426d-d60c-47f8-8498-4cf677ae33ae",
        label: "Comfort depends on structure and straps",
        videos: 18,
        who: [
          {
            about: "rival:Patagonia",
            videos: 2
          },
          {
            about: "rival:The North Face",
            videos: 2
          },
          {
            about: "market",
            videos: 14
          }
        ]
      },
      {
        themeId: "b486ced0-bc96-4ac7-b3e3-8c3076c9c9e5",
        label: "Carry-on weight limits are frustrating",
        videos: 8,
        who: [
          {
            about: "rival:Patagonia",
            videos: 1
          },
          {
            about: "market",
            videos: 7
          }
        ]
      },
      {
        themeId: "541543c9-eecb-4a16-b043-9c2c259da3c0",
        label: "Frustration with declining product quality",
        videos: 8,
        who: [
          {
            about: "rival:Cotopaxi",
            videos: 1
          },
          {
            about: "rival:The North Face",
            videos: 1
          },
          {
            about: "market",
            videos: 6
          }
        ]
      },
      {
        themeId: "52383c6b-28e3-46e8-9b3d-b3acf4e84a31",
        label: "Overpacking makes travel harder",
        videos: 7,
        who: [
          {
            about: "market",
            videos: 7
          }
        ]
      },
      {
        themeId: "1278fd4c-9671-4248-8095-356f4782e6e2",
        label: "Concern about fashion waste",
        videos: 6,
        who: [
          {
            about: "market",
            videos: 6
          }
        ]
      },
      {
        themeId: "cf14829b-d82b-421d-a463-e56b7f6f4389",
        label: "Concerns about wear and mess",
        videos: 6,
        who: [
          {
            about: "rival:The North Face",
            videos: 1
          },
          {
            about: "market",
            videos: 5
          }
        ]
      },
      {
        themeId: "c28f3903-0a46-498d-844a-7b5f2459a4e1",
        label: "Faux leather ages badly",
        videos: 6,
        who: [
          {
            about: "market",
            videos: 6
          }
        ]
      },
      {
        themeId: "a0af61b1-bac7-4f49-8e5d-a145cfd8e7e4",
        label: "Water bottle storage falls short",
        videos: 6,
        who: [
          {
            about: "rival:Cotopaxi",
            videos: 1
          },
          {
            about: "market",
            videos: 5
          }
        ]
      }
    ],
    brandItems: [
      {
        about: "rival:Patagonia",
        themeId: "pain_point-b0",
        label: "Anger over public land rollbacks",
        videos: 2
      },
      {
        about: "rival:Cotopaxi",
        themeId: "pain_point-b1",
        label: "Budget airline carry-on anxiety",
        videos: 2
      },
      {
        about: "rival:Cotopaxi",
        themeId: "pain_point-b2",
        label: "Clothes shopping fit concerns in Japan",
        videos: 2
      }
    ],
    quote: {
      quote: {
        ref: "c:design-pain_point",
        text: "The bottle compartments are 2 inches too short and my things always fall out of them."
      },
      source: "Reddit · 16 Sep",
      who: [
        {
          about: "market",
          videos: 1
        }
      ]
    }
  },
  {
    kind: "feature_request",
    label: "Wished for something",
    videos: 190,
    split: [
      {
        about: "market",
        videos: 185
      },
      {
        about: "rival:Cotopaxi",
        videos: 2
      },
      {
        about: "rival:Patagonia",
        videos: 2
      },
      {
        about: "rival:The North Face",
        videos: 1
      }
    ],
    items: [
      {
        themeId: "add42bd3-22c5-46d0-84c0-cdb8935f6526",
        label: "Requests for bigger size options",
        videos: 8,
        who: [
          {
            about: "market",
            videos: 8
          }
        ]
      },
      {
        themeId: "e3298869-a763-4577-838b-df2604cd449a",
        label: "Requests for better strap management",
        videos: 6,
        who: [
          {
            about: "market",
            videos: 6
          }
        ]
      },
      {
        themeId: "688d8cae-4ed5-456c-9bda-c6943b255358",
        label: "Wish list for added features",
        videos: 6,
        who: [
          {
            about: "rival:Patagonia",
            videos: 1
          },
          {
            about: "market",
            videos: 5
          }
        ]
      },
      {
        themeId: "1bf3b6a1-0919-4e1a-b08b-7278f454b720",
        label: "Different opening styles preferred",
        videos: 5,
        who: [
          {
            about: "market",
            videos: 5
          }
        ]
      },
      {
        themeId: "667df5cb-3b69-401d-813a-be9b62770433",
        label: "Longer shoulder strap options",
        videos: 4,
        who: [
          {
            about: "market",
            videos: 4
          }
        ]
      },
      {
        themeId: "26892cf0-dd96-4fd3-9f46-92a086653b86",
        label: "Requests for better weather protection",
        videos: 4,
        who: [
          {
            about: "rival:Patagonia",
            videos: 1
          },
          {
            about: "market",
            videos: 3
          }
        ]
      }
    ],
    brandItems: [
      {
        about: "rival:Cotopaxi",
        themeId: "feature_request-b0",
        label: "Packing light for long trips",
        videos: 3
      }
    ],
    quote: {
      quote: {
        ref: "c:design-feature_request",
        text: "I'm tired of how unstructured the back panel is the whole thing sags and pokes you in the bag when you put anything hard or heavy in the bag."
      },
      source: "Reddit · 26 Sep",
      who: [
        {
          about: "market",
          videos: 1
        }
      ]
    }
  },
  {
    kind: "objection",
    label: "Pushed back",
    videos: 158,
    split: [
      {
        about: "market",
        videos: 147
      },
      {
        about: "rival:Patagonia",
        videos: 8
      },
      {
        about: "rival:The North Face",
        videos: 3
      }
    ],
    items: [
      {
        themeId: "03ceaa7a-7ae6-49bd-85d1-ba4371a06b4c",
        label: "Design turns some shoppers away",
        videos: 10,
        who: [
          {
            about: "market",
            videos: 10
          }
        ]
      },
      {
        themeId: "90823508-ccdc-41a5-bfc2-d2520dd38949",
        label: "Price feels hard to justify",
        videos: 9,
        who: [
          {
            about: "market",
            videos: 9
          }
        ]
      },
      {
        themeId: "6b40df52-4769-40cc-9c8e-cc672d611d97",
        label: "Ethics of fast fashion",
        videos: 4,
        who: [
          {
            about: "market",
            videos: 4
          }
        ]
      },
      {
        themeId: "4048ff4f-4a82-4e62-8499-9b21ff848234",
        label: "Natural fibers versus affordability",
        videos: 4,
        who: [
          {
            about: "market",
            videos: 4
          }
        ]
      },
      {
        themeId: "bfd66a21-ed0a-45a7-b9cd-165e4414b5a4",
        label: "Protecting designs from copying",
        videos: 4,
        who: [
          {
            about: "market",
            videos: 4
          }
        ]
      }
    ],
    brandItems: [
      {
        about: "rival:The North Face",
        themeId: "objection-b0",
        label: "Debate over brand value",
        videos: 2
      },
      {
        about: "rival:Patagonia",
        themeId: "objection-b1",
        label: "High prices block purchase",
        videos: 2
      }
    ],
    quote: null
  }
] as ConvKind[]

export function conversationExtras(data: VoiceSurfaceData = voiceFixture()): ConversationExtras {
  const rows: ConversationExtras['rows'] = {}
  for (const t of data.board.rows) {
    rows[t.registryId] = { who: WHO[t.registryId] ?? market(t.k), subject: SUBJECT[t.registryId] ?? null, makers: makerPostsPhrase(t.makerShare) }
  }
  return {
    names: { client: 'Sealand', market: { long: 'Other bags in your market', short: 'other bags' } },
    monthWords: 'in September',
    rows,
    voices: data.theme.voices.map((v, i) => ({ quote: v.quote, source: i === 0 ? 'TikTok · 6 Sep' : 'YouTube · 20 Sep', who: market(1) })),
    kinds: SEALAND_KINDS,
    kindLabels: Object.fromEntries(['praise', 'purchase_intent', 'question', 'pain_point', 'feature_request', 'objection', 'buying_trigger', 'switching_signal', 'demographic_signal'].map((k) => [k, convKindLabel(k, SEALAND_CLIENT_ID)])),
  }
}

/** Sealand's September with the artboard's additions. */
export function conversationFixture(over: Partial<VoiceSurfaceData> = {}): VoiceSurfaceData {
  const base = voiceFixture(over)
  return { ...base, conversation: conversationExtras(base), ...over }
}
