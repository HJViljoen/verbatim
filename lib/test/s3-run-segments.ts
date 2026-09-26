// label-segments' own segments_v1 output on staging (WP1.4's hand-check sheet,
// ~/.claude/plans/verbatim-market-first/data/hand-check-segments-staging-20260926T223931Z.json:
// September category videos, written by scripts/label-segments.ts on the 26 Sep
// staging rehearsal). Sixteen of its forty, as they were: text, the searches that
// found them, and the reason label-segments gave each. `unjudged` marks a video
// a gate verdict admitted unjudged (the reason carries 'unjudged_admission').

export interface LabelledVideo {
  id: string
  platform: string
  caption: string | null
  hashtags: string[] | null
  topics: string[] | null
  sourceKeywords: string[] | null
  reason: string | null
  unjudged: boolean
}

export const LABEL_SEGMENTS_STAGING: readonly LabelledVideo[] = [
  {
    "id": "1b4ceb99-e777-467e-a375-78249af0c01a",
    "platform": "tiktok",
    "caption": "🌷🇧🇴  #diy #reciclaje #reciclagem #upcycling #ecobags",
    "hashtags": [
      "diy",
      "reciclaje",
      "reciclagem",
      "upcycling",
      "ecobags"
    ],
    "topics": [
      "DIY",
      "upcycling",
      "eco bags",
      "recycling",
      "handmade fashion"
    ],
    "sourceKeywords": [
      "upcycled bag"
    ],
    "reason": "maker_regex:diy",
    "unjudged": false
  },
  {
    "id": "cefe435f-a476-40b3-bfd2-bc13da3b6976",
    "platform": "tiktok",
    "caption": "De un jean viejo sale este bolso de dos compartimentos para el celular 👜 Solo necesitas media bota: 32 cm desde el ruedo, esquinas redondeadas, 6 cm de tapa y una tira de 1,20 m para la correa. Adentro quedan dos espacios separados: en uno el celular, en el otro la batería, los audífonos y las llaves. Guárdalo antes de botar el próximo pantalón. #costura #reciclajedejeans #diycostura #handmade #bolsos",
    "hashtags": [
      "costura",
      "reciclajedejeans",
      "diycostura",
      "handmade",
      "bolsos"
    ],
    "topics": [
      "upcycling",
      "DIY bag",
      "sewing",
      "recycled jeans",
      "handmade bag",
      "sustainable fashion"
    ],
    "sourceKeywords": [
      "recycled bag"
    ],
    "reason": "maker_regex:costura",
    "unjudged": false
  },
  {
    "id": "c04061d4-312b-4a50-9e0f-ea0146c2d99e",
    "platform": "tiktok",
    "caption": "I Turned Plastic bottle Into This Stunning handbag! #RecycledCrafts  #DIYbag #CreativeCrafts #CraftInspiration",
    "hashtags": [
      "recycledcrafts",
      "diybag",
      "creativecrafts",
      "craftinspiration"
    ],
    "topics": [
      "recycled crafts",
      "DIY bag",
      "creative crafts",
      "handmade bag",
      "upcycled bag",
      "sustainable fashion"
    ],
    "sourceKeywords": [
      "recycled bag"
    ],
    "reason": "maker_regex:crafts",
    "unjudged": false
  },
  {
    "id": "fd702216-097a-4d92-a0a1-0df88c40db60",
    "platform": "tiktok",
    "caption": "ပုလင်းတင် ဖြတ် တာ မဟုတ် သရုပ်ဆောင် လဲ လုပ် တယ် သီချင်း လဲဆို တယ် bottle cutter လဲ ရောင်း တယ် သင်လဲ သင် ပေး တယ် 😝😝😝#bottlecutter #recyclecraft #alternate_art_by_nart_recycle_craft #UpcycledBottle",
    "hashtags": [
      "bottlecutter",
      "recyclecraft",
      "alternate_art_by_nart_recycle_craft",
      "upcycledbottle"
    ],
    "topics": [
      "bottle cutting",
      "recycling",
      "crafting",
      "upcycling",
      "DIY",
      "customer support"
    ],
    "sourceKeywords": [
      "recycled sailcloth"
    ],
    "reason": "maker_regex:crafting",
    "unjudged": false
  },
  {
    "id": "198fe575-7da6-4d88-93ec-43f5d1447675",
    "platform": "instagram",
    "caption": "Jasmine in dusty purple + golden details = the perfect autumn combo 🍂\n\n💌Dm to make it yours or to customise in your fav colour\n\npurple crochet bag, gold crochet bag, handmade crochet bag, autumn bag, crochet handbag, statement bag, slow fashion accessories.\n\n#crochetbag #autumnbag #purplebag #lanzarote #fallaccessories",
    "hashtags": [
      "crochetbag",
      "autumnbag",
      "purplebag",
      "lanzarote",
      "fallaccessories"
    ],
    "topics": [
      "crochet bag",
      "autumn fashion",
      "handmade accessories",
      "slow fashion"
    ],
    "sourceKeywords": [
      "handmade bag"
    ],
    "reason": "maker_regex:crochet",
    "unjudged": false
  },
  {
    "id": "c30ce3f3-ca76-4109-96c3-41682d3ca8b5",
    "platform": "instagram",
    "caption": "這條牛仔褲當初懷飯飯的時候穿了好多次，但後來就一直被我收在衣櫃裡。因為是阿嬤的褲子，我也捨不得捐出去或送人，所以這次就決定來改造啦！！！🤩\nI am so happy that I will be able to keep my grandmother's jeans in my closet in this brand new form, knowing that it will be worn again and again ✨\n\n#thriftflip #upcycle #upcyclefashion  #sustainablefashion",
    "hashtags": [
      "thriftflip",
      "upcycle",
      "upcyclefashion",
      "sustainablefashion"
    ],
    "topics": [
      "upcycling",
      "denim sewing",
      "sustainable fashion",
      "personal transformation",
      "DIY fashion"
    ],
    "sourceKeywords": [
      "sustainable fashion"
    ],
    "reason": "maker_regex:sewing;unjudged_admission",
    "unjudged": true
  },
  {
    "id": "31a107aa-75db-4a81-b127-8a3e4d8a4116",
    "platform": "tiktok",
    "caption": "DIY Japanese silk knot bag. Challenging myself to make these bags for my friends instead of buying something. #sewingtiktok #silkbag #japaneseknotbag #silk #custommade",
    "hashtags": [
      "sewingtiktok",
      "silkbag",
      "japaneseknotbag",
      "silk",
      "custommade"
    ],
    "topics": [
      "DIY bag making",
      "Japanese knot bag",
      "silk fabric",
      "custom handmade bags",
      "gift making",
      "sewing challenge"
    ],
    "sourceKeywords": [
      "sailcloth bag"
    ],
    "reason": "maker_regex:diy",
    "unjudged": false
  },
  {
    "id": "eb1a6359-180c-48b1-90ae-a9105c9c4a1a",
    "platform": "instagram",
    "caption": "🛑 Stop hoarding 🛑 I literally can’t help it with vintage and antique textiles. . . They are my weekness!!! A couple of these pieces are in my shop 👀. . . #sustainablefashion #vintage #sewing #shopsmall #oneofakind",
    "hashtags": [
      "sustainablefashion",
      "vintage",
      "sewing",
      "shopsmall",
      "oneofakind"
    ],
    "topics": [
      "vintage textiles",
      "upcycling",
      "sustainable fashion",
      "sewing",
      "thrifting",
      "clothing made from tea towels"
    ],
    "sourceKeywords": [
      "sustainable fashion"
    ],
    "reason": "maker_regex:sewing;unjudged_admission",
    "unjudged": true
  },
  {
    "id": "3a9ab0d1-c489-4a22-9082-4c8ea4848c39",
    "platform": "youtube",
    "caption": "Le LUMA full camel 🐪 #crochet #crochet #faitmain",
    "hashtags": [],
    "topics": [
      "crochet",
      "handmade",
      "fashion"
    ],
    "sourceKeywords": [
      "handmade bag"
    ],
    "reason": "maker_regex:crochet",
    "unjudged": false
  },
  {
    "id": "f75af071-e59f-4fc2-a4b0-31e57da04930",
    "platform": "tiktok",
    "caption": "How to transform old jeans into totebag Easily✂️🪡#cutting #totebag #stitchingideas786 #sewingtips #fypviralシ",
    "hashtags": [
      "cutting",
      "totebag",
      "stitchingideas786",
      "sewingtips",
      "fypviralシ"
    ],
    "topics": [
      "upcycling",
      "DIY fashion",
      "tote bag",
      "sewing",
      "sustainable fashion"
    ],
    "sourceKeywords": [
      "upcycled bag"
    ],
    "reason": "maker_regex:diy",
    "unjudged": false
  },
  {
    "id": "f8a33715-2202-4a98-a311-0ee8f80b8029",
    "platform": "youtube",
    "caption": "Patagonia & Vuori in the same bin 🙌🏻 Patagonia & Vuori in the same bin 🙌🏻\n.\n.\n.\n#goodwillbins #goodwilloutlet #goodwillfinds #resellingcommunity #resellerlife",
    "hashtags": [],
    "topics": [
      "reselling",
      "thrift shopping",
      "brand finds",
      "Patagonia",
      "Vuori",
      "Goodwill",
      "outlet shopping"
    ],
    "sourceKeywords": [
      "patagonia"
    ],
    "reason": "bare_name_only:patagonia",
    "unjudged": false
  },
  {
    "id": "0792e40f-413c-4c16-a31f-bb28fa862959",
    "platform": "youtube",
    "caption": "My Tote Bag Collection 👜✨| Office Bags #workwear #brownbag #miraggio #shoppingbag #ethnicbag #haul",
    "hashtags": [],
    "topics": [
      "tote bags",
      "bag collection",
      "personal favorites",
      "bag brands",
      "bag uses"
    ],
    "sourceKeywords": [
      "sustainable backpack"
    ],
    "reason": null,
    "unjudged": false
  },
  {
    "id": "04ab6388-114c-4554-aa37-bdd16100370a",
    "platform": "reddit",
    "caption": "Am I missing anything for a 3-day trip?\n\nThree days, two nights, one carry-on. Here’s what I’m planning to pack. I really don’t want to check a bag, so I’m trying to keep it light.",
    "hashtags": [],
    "topics": [
      "packing",
      "travel gear",
      "carry-on",
      "minimalist packing",
      "travel essentials"
    ],
    "sourceKeywords": [
      "r/onebag"
    ],
    "reason": null,
    "unjudged": false
  },
  {
    "id": "f25cb416-f476-4451-ae8b-a660d45f63e7",
    "platform": "youtube",
    "caption": "Low Battery & One Watt: K4SWL's Unintentional Morning POTA Challenge! ***GEAR USED IN THIS ACTIVATION VIDEO***\nNote: Some Amazon and ABR Industries links below are affiliate links that support QRPer.com at no cost to you.\n\nRadio\n• Elecraft KX2: https://swling.com/blog/2016/12/a-review-of-the-elecraft-kx2-general-coverage-qrp-transceiver/\n• SideKX Panels: https://gemsproducts.com/product/kx2-end-panels/\n   ↳ G7UFO USB-C Charging Board: https://shop.g7ufo.radio/\n   ↳ Tufteln KX2 Protective Cover: http://tufteln.com\n   ↳ KXPD2 Paddles: https://elecraft.com/products/kxpd2-attached-precision-keyer-paddle\n   ↳ Elecraft KXBT2 Li-Ion Battery Pack: https://elecraft.com/products/kxbt2-lithium-ion-battery-pack-11v-2-6ah\n   ↳ LowePro CS60 Hard Side Case: https://amzn.to/3UiuOyD\n\nKey and Key Accessories\n• Retractable Key Cable - 2.5 Feet: https://amzn.to/3OUUNri\n• Modern Morse Nameless Key: https://www.modernmorse.com/\n\nAntenna\n• GW5SAW homebrew end-fed half-wave\n\nCable Assembly\n• ABR BNC/BNC RG-174 25' Cable with in-line ferrite RF choke (via the ABR cable assembly builder): https://abrind.com/shop/cable-builder/amateur-radio-coax-builder/?sld=5\n• Use Coupon Code ABR10QRPER for 10% Discount!: https://abrind.com/shop/cable-builder/amateur-radio-coax-builder/?sld=5\n\nThrow Line\n• Weaver arborist throw line/weight: https://amzn.to/3e6xKb3\n• storage bag: https://amzn.to/3ggKO0q\n\nLogging Supplies\n• Rhodia Bloc Dot Pad No 13 A6: https://amzn.to/433zFHj\n• TWSBI ECO Fountain Pen: https://amzn.to/3RB6IA1\n• Ham2K Polo App: https://polo.ham2k.com/\n\nBackpack\n• Savotta Niukka 20L: https://www.savotta.fi/products/niukka-20l\n• from this UK distributor: https://camouflagestore.uk/products/savotta-niukka-20l?variant=56669913842037\n\nCamera/Audio Gear\n• DJI OSMO 4: https://amzn.to/3Tf89TH\n• Joby Telepod Sport Tripod: https://amzn.to/3Qlv652\n• DJI Wireless Microphones: https://amzn.to/3UFoqQB\n\nhttps://qrper.com/2026/09/morning-pota-at-umstead-low-battery-forces-one-watt-cw-with-poor-bands/?swcfpc=1\nClick the link above to read full details about this activation, including all equipment links, at QRPer.com.\n\nHOW TO SUPPORT:\nYou'll notice I have no ads in my videos. If you'd like to directly support me you can do so via Patreon or my PayPal Coffee Fund.\n\nQRPer and SWLing Post on Patreon:\nhttps://www.patreon.com/qrpswl\n\nCoffee Fund:\nhttps://paypal.me/k4swl\n\nThanks for watching!\n72,\nThomas\nK4SWL\n\nChapters\n\nIntro: 0:00:00\nSetup: 0:03:17\nSetup Message Memory: 0:15:48\nLowering Power to 1 Watt to Save Battery: 0:16:42\nActivation: 0:17:02\nQRT & Summary: 0:42:23\nPack-Up: 0:43:37\nThank you!: 0:52:48",
    "hashtags": [
      "QRPp",
      "Low Power",
      "Ham Radio",
      "K4SWL",
      "Parks On The Air",
      "Elecraft KX2"
    ],
    "topics": [
      "amateur radio",
      "field activation",
      "low battery",
      "POTA",
      "Elecraft KX2",
      "radio gear",
      "outdoor activity"
    ],
    "sourceKeywords": [
      "eco backpack"
    ],
    "reason": "unjudged_admission",
    "unjudged": true
  },
  {
    "id": "2bf91bbe-bd1c-464c-bdb5-8109f0d7c76c",
    "platform": "tiktok",
    "caption": "Next Black Owned Bags you should purchase 🤎🫶🏽 @©uatro  @Rare Diamond Co.  #blackownedbusiness #blackownenbag #fyp #blackowned #curvesseanbrown",
    "hashtags": [
      "blackownedbusiness",
      "blackownenbag",
      "fyp",
      "blackowned",
      "curvesseanbrown"
    ],
    "topics": [
      "black owned bags",
      "bag brands",
      "support black owned businesses",
      "bag recommendations"
    ],
    "sourceKeywords": [
      "rareform bag"
    ],
    "reason": null,
    "unjudged": false
  },
  {
    "id": "f8066415-43ec-461d-8c63-ad514334d7a7",
    "platform": "instagram",
    "caption": "RE:VERSE Backpack \nEvery piece has a past ,Every journey adds a story✨\n\n#UpcycledBackpack #PatchworkBackpack # #SlowFashion #HandmadeBackpack CircularDesign",
    "hashtags": [
      "UpcycledBackpack",
      "PatchworkBackpack",
      "SlowFashion",
      "HandmadeBackpack"
    ],
    "topics": [
      "upcycled backpack",
      "patchwork backpack",
      "slow fashion",
      "handmade backpack",
      "circular design"
    ],
    "sourceKeywords": [
      "upcycled backpack"
    ],
    "reason": null,
    "unjudged": false
  }
]
