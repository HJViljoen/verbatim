/* SocialLens Mock Data — v4.1 schema-aligned
 * Tenant: Ossur (prosthetics)
 * Tracked competitor: Ottobock
 * Regions: ZA, IN, BR
 * Single run, dated Apr 22-28, 2026
 */

const CLIENT = {
  client_id: "e52cac94-30e1-426a-9a36-31b11e0b30b6",
  company_name: "Össur",
  plan: "design_partner",
  tracking: {
    brand_keywords: ["ossur", "össur", "pro-flex", "power knee", "cheetah", "symbionic"],
    competitor_names: ["ottobock"],
    competitor_keywords: ["c-leg", "genium", "empower"],
    industry_keywords: ["prosthetic", "amputee", "limb-loss", "prosthetist", "cosmetic-cover", "residual-limb"],
    platforms: ["tiktok", "youtube", "instagram"],
    regions: ["ZA", "IN", "BR"]
  }
};

const RUN = {
  run_id: "a1b2c3d4-e5f6-4789-a012-3456789abcde",
  status: "complete",
  started_at: "2026-04-28T08:00:00Z",
  completed_at: "2026-04-28T08:42:00Z",
  run_date: "2026-04-28",
  period: "weekly",
  week_start: "2026-04-22",
  week_end: "2026-04-28"
};

/* run_summary row — populated by Step 2b (combined metrics + sentiment + top insights) */
const RUN_SUMMARY = {
  total_videos: 247,
  total_comments: 8431,
  client_videos: 94,
  competitor_videos: 102,
  platforms_covered: ["tiktok", "youtube", "instagram"],
  avg_engagement_rate: 6.82,
  top_video_id: "v_top_001",
  top_video_views: 1417000,
  top_video_platform: "tiktok",

  share_of_voice: {
    "Össur": 38,
    "Ottobock": 41,
    "industry-other": 21
  },
  share_of_voice_caption: "Ottobock leads on YouTube; Össur leads on TikTok and Instagram.",

  platforms_summary: {
    tiktok:    { videos: 112, comments: 5840, avg_engagement: 7.4 },
    youtube:   { videos: 59,  comments: 1245, avg_engagement: 4.8 },
    instagram: { videos: 76,  comments: 1346, avg_engagement: 5.9 }
  },

  overall_sentiment_positive: 64,
  overall_sentiment_neutral: 23,
  overall_sentiment_negative: 13,

  sentiment_drivers: {
    text: "Sentiment driven by personal-story content and milestone reveals; negativity concentrated in cost / insurance threads."
  },

  top_insights: [
    {
      id: "mi_001",
      title: "Insurance-denial content drives 3x the engagement of product features",
      type: "industry_signal",
      priority: "high"
    },
    {
      id: "mi_002",
      title: "Strong unmet demand for affordable cosmetic covers — neither brand serves this",
      type: "unmet_need",
      priority: "high"
    },
    {
      id: "mi_004",
      title: "Pediatric content gap: Ottobock dominates, Össur near-silent",
      type: "cross_platform_synthesis",
      priority: "medium"
    }
  ],

  /* P5 / longitudinal — null on first run per Architecture/Overview */
  wow_sentiment_change: null,
  wow_engagement_change: null,
  wow_highlights: null
};

/* market_insights — Pass D output */
const MARKET_INSIGHTS = [
  {
    id: "mi_001",
    insight_type: "industry_signal",
    title: "Insurance-denial content drives 3x the engagement of product features",
    description: "Across 247 videos analysed, posts about insurance battles, denial reasons, and appeal processes generated an average engagement rate of 12.4% — vs. 4.1% for product-led content. Comments cluster around frustration with pre-authorisation and confusion about coverage. Neither Össur nor Ottobock currently produce content in this space, leaving the topic uncontested.",
    evidence: { supporting_theme_ids: ["ai_pp_002", "ai_obj_001"] },
    confidence_score: 9,
    opportunity_score: 9
  },
  {
    id: "mi_002",
    insight_type: "unmet_need",
    title: "Strong unmet demand for affordable cosmetic covers",
    description: "Cosmetic skin and cover content surfaces 47 times across the comment corpus, with strong purchase-intent language (\"would buy if it didn't cost X\", \"why aren't there more options\"). Neither tracked brand has a content presence here. Most existing creator content is third-party DIY solutions.",
    evidence: { supporting_theme_ids: ["ai_fr_001", "ai_pi_002"] },
    confidence_score: 8,
    opportunity_score: 8
  },
  {
    id: "mi_003",
    insight_type: "platform_pattern",
    title: "TikTok rewards emotion, YouTube rewards comparison",
    description: "Personal-story and before-after hooks dominate top-performing TikTok content (avg 7.2% engagement). YouTube top performers are long-form product comparisons and educational content (avg 4.8% engagement, but 6x dwell time). Same audience, different intent per platform — buyers discover on TikTok and research on YouTube.",
    evidence: { supporting_theme_ids: ["ai_pr_001"] },
    confidence_score: 9,
    opportunity_score: 7
  },
  {
    id: "mi_004",
    insight_type: "cross_platform_synthesis",
    title: "Discovery → research → decision splits cleanly across platforms",
    description: "Younger amputees (under 35) discover brands on TikTok, deepen research via YouTube comparison videos, and finalise the decision through their prosthetist. Comment language pattern: TikTok = \"I want this\", YouTube = \"how does X compare to Y\", Instagram = \"check this out\" sharing-mode. Pediatric content space is underserved on TikTok specifically.",
    evidence: { supporting_theme_ids: ["ai_q_001", "ai_pi_001"] },
    confidence_score: 8,
    opportunity_score: 7
  },
  {
    id: "mi_005",
    insight_type: "industry_signal",
    title: "Veterans community on TikTok is highly engaged but underserved",
    description: "Veteran-creator content averages 9.1% engagement, well above category benchmark. Össur appears in 4 such videos; Ottobock in 11. Sentiment is overwhelmingly positive on veteran-led content regardless of brand mentioned. Existing relationships with VA programs are not reflected in the social presence.",
    evidence: { supporting_theme_ids: ["ai_ds_001"] },
    confidence_score: 7,
    opportunity_score: 8
  }
];

/* recommendations — Pass D output. Rec 1 is featured on Dashboard. */
const RECOMMENDATIONS = [
  {
    id: "rec_001",
    type: "content_idea",
    title: "Launch an insurance-navigation content series",
    reasoning: "Insurance-denial and pre-authorisation content generated 12.4% average engagement across 247 videos analysed — 3x the average for product-led posts. No tracked brand currently produces content in this space, so the topic is uncontested. Recommended lane: short explainer videos on denial reasons, appeal templates, and prosthetist letters of medical necessity. Goodwill-positive (helping users vs. selling), and the content compounds across regions because insurance friction is universal.",
    priority: "high",
    status: "new",
    based_on: ["mi_001"],
    is_featured: true
  },
  {
    id: "rec_002",
    type: "hook_strategy",
    title: "Lead with personal-story hooks on TikTok",
    reasoning: "Personal-story hooks averaged 4.2x engagement of product-led hooks across both Össur and Ottobock content. Össur's TikTok output is currently 38% product-led — an immediate optimisation lever with no production cost.",
    priority: "high",
    status: "new",
    based_on: ["mi_003"]
  },
  {
    id: "rec_003",
    type: "urgent_topic",
    title: "Address sweating + skin-breakdown concerns directly",
    reasoning: "Top pain points across the audience corpus, surfaced 78 times. No brand response exists. Practical liner-care content (multi-liner days, antiperspirant routines, summer-specific guidance for ZA/BR) would fill an obvious gap.",
    priority: "medium",
    status: "new",
    based_on: ["ai_pp_001"]
  },
  {
    id: "rec_004",
    type: "competitive_move",
    title: "Enter the pediatric content space",
    reasoning: "Ottobock posts pediatric milestone content 3.5x more frequently than Össur. Comment audience for pediatric content includes parents researching options 12+ months out — long sales cycle but high-intent. Pro-Flex Junior could anchor a content lane around \"first steps\" milestones.",
    priority: "medium",
    status: "new",
    based_on: ["mi_004"]
  },
  {
    id: "rec_005",
    type: "audience_target",
    title: "Partner with veteran creators on TikTok",
    reasoning: "Veteran-led content out-performs the category, sentiment is positive, and Ottobock has 2.7x the brand presence here. Underserved high-intent audience. Existing VA program partnerships could surface 5-10 candidate creators.",
    priority: "medium",
    status: "new",
    based_on: ["mi_005"]
  },
  {
    id: "rec_006",
    type: "platform_strategy",
    title: "Invest in YouTube long-form Pro-Flex vs. competitor comparisons",
    reasoning: "YouTube top performers are direct product comparisons. Össur currently has none. Existing prosthetist-led education channels are a natural distribution partner — sponsorship cost is meaningfully lower than paid social.",
    priority: "low",
    status: "new",
    based_on: ["mi_003"]
  }
];

/* audience_insights — Pass A per-video output, then bucketed by Step A2.
 * 8 categories per v4.1 enum. ~3 themes per category for the demo.
 * Entity is DERIVED (per Architecture/Overview decision) — shown via JOIN with videos.
 */
const AUDIENCE_INSIGHTS = [
  // pain_point
  {
    id: "ai_pp_001",
    category: "pain_point",
    theme: "Socket sweating in heat",
    description: "Recurring complaint across TikTok and Instagram comments — wearers describe daily socket sweating during ZA and BR summers, leading to skin issues and fit drift. No brand currently posts liner-care content addressing this.",
    strength_score: 8,
    emotion: "frustrated",
    sentiment_impact: "negative",
    derived_entity: "industry-other",
    platforms: ["tiktok", "instagram"],
    evidence: [
      { quote: "this socket gets so hot in cape town summer i can't wear it past noon", comment_id: "c_001" },
      { quote: "anyone else's liner literally swimming by 2pm? gross", comment_id: "c_002" },
      { quote: "best advice my prosthetist gave me was 2 liners a day, game changer", comment_id: "c_003" }
    ]
  },
  {
    id: "ai_pp_002",
    category: "pain_point",
    theme: "Insurance pre-authorisation battles",
    description: "High-emotion comment volume around denial letters, appeal processes, and pre-auth delays. Crosses regions and brands. Top driver of negative sentiment in the corpus.",
    strength_score: 9,
    emotion: "angry",
    sentiment_impact: "negative",
    derived_entity: "industry-other",
    platforms: ["tiktok", "youtube", "instagram"],
    evidence: [
      { quote: "third denial in a row. they want a letter from a 'qualified specialist' but won't say which one counts", comment_id: "c_004" },
      { quote: "took 9 months of appeals to get my socket replacement approved. nine. months.", comment_id: "c_005" },
      { quote: "if anyone has a template for a letter of medical necessity please share, mine keeps getting denied", comment_id: "c_006" }
    ]
  },
  {
    id: "ai_pp_003",
    category: "pain_point",
    theme: "Cost vs. perceived value gap",
    description: "Cost-focused comments split between two camps: those who received a brand-name prosthetic via insurance and call it life-changing, and those paying out of pocket frustrated by the price-to-feature ratio.",
    strength_score: 8,
    emotion: "disappointed",
    sentiment_impact: "negative",
    derived_entity: "industry-other",
    platforms: ["tiktok", "youtube"],
    evidence: [
      { quote: "30k usd for a leg that needs servicing every 18 months feels insane", comment_id: "c_007" },
      { quote: "my insurance covered the pro-flex and honestly worth every cent of the copay", comment_id: "c_008" },
      { quote: "wish there was a clear breakdown of what costs what. socket vs foot vs alignment", comment_id: "c_009" }
    ]
  },
  // question
  {
    id: "ai_q_001",
    category: "question",
    theme: "Can I swim with my prosthetic?",
    description: "Frequently asked across all platforms, especially in summer months. Confusion between waterproof, water-resistant, and dedicated swim prosthetics. Most brands have water-specific lines but creator content rarely mentions them.",
    strength_score: 7,
    emotion: "curious",
    sentiment_impact: "neutral",
    derived_entity: "industry-other",
    platforms: ["tiktok", "instagram"],
    evidence: [
      { quote: "going to durban for the holidays, can my pro-flex actually go in the ocean?", comment_id: "c_010" },
      { quote: "do i need a separate leg just for swimming? can't afford 2", comment_id: "c_011" },
      { quote: "my prosthetist showed me the swim foot attachment, why isn't this advertised more?", comment_id: "c_012" }
    ]
  },
  {
    id: "ai_q_002",
    category: "question",
    theme: "Best prosthetic for running?",
    description: "Comparison-heavy questions about running blades vs daily-use feet. Cheetah and competing flex feet most named. Buyers want clear use-case guidance, not feature lists.",
    strength_score: 7,
    emotion: "curious",
    sentiment_impact: "neutral",
    derived_entity: "client",
    platforms: ["tiktok", "youtube"],
    evidence: [
      { quote: "cheetah xtreme vs flex run, which one is actually better for trail?", comment_id: "c_013" },
      { quote: "do you switch legs to run or just push through with your daily?", comment_id: "c_014" },
      { quote: "is there a beginner-friendly running blade or am i jumping ahead", comment_id: "c_015" }
    ]
  },
  {
    id: "ai_q_003",
    category: "question",
    theme: "How do I clean the liner?",
    description: "Daily-care questions about silicone liner maintenance, smell prevention, and longevity. Surprisingly underserved by brand content; mostly answered by prosthetists in comments.",
    strength_score: 6,
    emotion: "curious",
    sentiment_impact: "neutral",
    derived_entity: "industry-other",
    platforms: ["tiktok", "instagram"],
    evidence: [
      { quote: "what do you actually wash your liner with? mine smells after a week", comment_id: "c_016" },
      { quote: "rotating 3 liners changed my life, no more skin problems", comment_id: "c_017" }
    ]
  },
  // purchase_intent
  {
    id: "ai_pi_001",
    category: "purchase_intent",
    theme: "C-Leg vs Power Knee for active lifestyle",
    description: "Active amputees comparing microprocessor knees, often with strong brand opinions. Decision driven by prosthetist recommendation more than marketing. Pro-Flex foot pairing frequently mentioned.",
    strength_score: 8,
    emotion: "hopeful",
    sentiment_impact: "positive",
    derived_entity: "client",
    platforms: ["youtube", "tiktok"],
    evidence: [
      { quote: "my prosthetist is pushing power knee but everyone online has c-leg, am i missing something?", comment_id: "c_018" },
      { quote: "switched from c-leg to power knee last year, the stair function is unreal", comment_id: "c_019" },
      { quote: "anyone got a head-to-head walking comparison? all the brand videos look the same", comment_id: "c_020" }
    ]
  },
  {
    id: "ai_pi_002",
    category: "purchase_intent",
    theme: "Cosmetic cover comparison shopping",
    description: "Buyers actively comparing cosmetic skin/cover options across brands and aftermarket. Strong willingness-to-pay signal but consistent frustration with options.",
    strength_score: 7,
    emotion: "hopeful",
    sentiment_impact: "neutral",
    derived_entity: "industry-other",
    platforms: ["instagram", "tiktok"],
    evidence: [
      { quote: "can someone link the realistic skin covers, my insurance won't touch them and im comparing", comment_id: "c_021" },
      { quote: "alleles makes the prettiest covers but they're $$$$ - any cheaper that don't look medical?", comment_id: "c_022" }
    ]
  },
  // feature_request
  {
    id: "ai_fr_001",
    category: "feature_request",
    theme: "Waterproofing should be standard",
    description: "Repeated request that waterproof use should be the default rather than a premium add-on. Highest-strength feature_request theme in the corpus.",
    strength_score: 7,
    emotion: "hopeful",
    sentiment_impact: "neutral",
    derived_entity: "industry-other",
    platforms: ["tiktok", "instagram"],
    evidence: [
      { quote: "in 2026 my $40k leg shouldn't be afraid of a thunderstorm", comment_id: "c_023" },
      { quote: "why is the waterproof version always more expensive, water exists everywhere lol", comment_id: "c_024" }
    ]
  },
  {
    id: "ai_fr_002",
    category: "feature_request",
    theme: "More cosmetic skin tone options",
    description: "Specific to skin/cover product lines. Comments cluster around darker skin tones being underrepresented across the category.",
    strength_score: 6,
    emotion: "hopeful",
    sentiment_impact: "negative",
    derived_entity: "industry-other",
    platforms: ["instagram", "tiktok"],
    evidence: [
      { quote: "the 'realistic' skin colours are all the same 3 shades, where's anything that matches actual brown skin?", comment_id: "c_025" },
      { quote: "i want a cover, not a tan", comment_id: "c_026" }
    ]
  },
  // praise
  {
    id: "ai_pr_001",
    category: "praise",
    theme: "First walk after Pro-Flex fit — life-changing",
    description: "High-volume positive theme in TikTok and Instagram. Comments overwhelmingly emotional, often tied to milestone moments. Top driver of positive sentiment in the run.",
    strength_score: 9,
    emotion: "joyful",
    sentiment_impact: "positive",
    derived_entity: "client",
    platforms: ["tiktok", "instagram"],
    evidence: [
      { quote: "first time in 4 years i cried because i could feel the floor again", comment_id: "c_027" },
      { quote: "the way the foot rolls forward is unreal compared to my old one", comment_id: "c_028" },
      { quote: "literally walked out of the prosthetist's office grinning, didn't expect this", comment_id: "c_029" }
    ]
  },
  {
    id: "ai_pr_002",
    category: "praise",
    theme: "Customer service responsiveness",
    description: "Praise specifically about prosthetist + brand support pipeline when issues arise. More common around Power Knee and Symbionic lines.",
    strength_score: 6,
    emotion: "joyful",
    sentiment_impact: "positive",
    derived_entity: "client",
    platforms: ["youtube", "instagram"],
    evidence: [
      { quote: "got a replacement liner shipped within 3 days, didn't expect that level of support", comment_id: "c_030" }
    ]
  },
  // objection
  {
    id: "ai_obj_001",
    category: "objection",
    theme: "Looks too obviously fake",
    description: "Specific to high-tech mechanical knees with exposed components. Younger users especially want a more covered/aesthetic finish. Tied to cosmetic cover demand.",
    strength_score: 6,
    emotion: "disappointed",
    sentiment_impact: "negative",
    derived_entity: "industry-other",
    platforms: ["tiktok", "instagram"],
    evidence: [
      { quote: "i love what it can do but i hate how it looks. why does every knee look like a transformer", comment_id: "c_031" },
      { quote: "in summer i don't want to wear pants every day to hide the joint", comment_id: "c_032" }
    ]
  },
  {
    id: "ai_obj_002",
    category: "objection",
    theme: "Too expensive without insurance",
    description: "Cost objection separate from the value-gap pain point. Pure affordability complaint, often paired with regional context (BR, IN especially).",
    strength_score: 7,
    emotion: "disappointed",
    sentiment_impact: "negative",
    derived_entity: "industry-other",
    platforms: ["tiktok", "youtube"],
    evidence: [
      { quote: "in india the import duty alone is 30%. price out of pocket: a small house", comment_id: "c_033" },
      { quote: "lobbying SUS for years to cover the symbionic and still nothing", comment_id: "c_034" }
    ]
  },
  // misinformation
  {
    id: "ai_mi_001",
    category: "misinformation",
    theme: "Belief that running blades are illegal in everyday use",
    description: "Persistent confusion (especially TikTok comments) that running blades cannot be worn outside of athletic events or competitions. Origin appears to be misreporting of paralympic eligibility rules.",
    strength_score: 5,
    emotion: "confused",
    sentiment_impact: "neutral",
    derived_entity: "industry-other",
    platforms: ["tiktok"],
    evidence: [
      { quote: "wait you're allowed to wear those running blades on the street?", comment_id: "c_035" },
      { quote: "thought blades were only for racing, learn something every day", comment_id: "c_036" }
    ]
  },
  // demographic_signal
  {
    id: "ai_ds_001",
    category: "demographic_signal",
    theme: "Veteran-creator content over-indexes",
    description: "Videos posted by veteran amputee creators average 9.1% engagement vs 6.8% category average. Audience signals strong interest in service-related amputation stories. Ottobock has 2.7x the brand presence in this slice.",
    strength_score: 7,
    emotion: "neutral",
    sentiment_impact: "positive",
    derived_entity: "industry-other",
    platforms: ["tiktok", "youtube"],
    evidence: [
      { quote: "watched every single one of @vetalex's videos in one sitting", comment_id: "c_037" },
      { quote: "the iraq vet community on here is so supportive, helps a lot when you're new to this", comment_id: "c_038" }
    ]
  },
  {
    id: "ai_ds_002",
    category: "demographic_signal",
    theme: "Younger amputees concentrated on TikTok, older on YouTube",
    description: "Clear age-platform split. Sub-30 amputees post and comment primarily on TikTok and Instagram. 40+ users comment heavily on YouTube comparison videos.",
    strength_score: 7,
    emotion: "neutral",
    sentiment_impact: "neutral",
    derived_entity: "industry-other",
    platforms: ["tiktok", "youtube", "instagram"],
    evidence: [
      { quote: "55, lost mine 8 years ago, this is the first generation that can talk about it openly online", comment_id: "c_039" }
    ]
  }
];

/* competitive_insights — Pass C output. Folded into Market Intelligence + Content Analysis. */
const COMPETITIVE_INSIGHTS = [
  {
    id: "ci_001",
    category: "content_gap",
    competitor_name: "Ottobock",
    title: "Ottobock owns pediatric content; Össur near-silent",
    finding: "Ottobock posts pediatric milestone content 3.5x more frequently than Össur. Parent audience is high-intent and researches 12+ months out before fitting decisions.",
    impact_level: "medium",
    metrics: { ottobock_value: 14, ossur_value: 2 }
  },
  {
    id: "ci_002",
    category: "competitive_threat",
    competitor_name: "Ottobock",
    title: "Ottobock dominant in YouTube long-form education",
    finding: "Ottobock has invested in 30-90 minute prosthetist Q&A and product walkthrough content. Ranks for high-intent comparison queries Össur does not appear on.",
    impact_level: "medium",
    metrics: { ottobock_value: 7, ossur_value: 1 }
  },
  {
    id: "ci_003",
    category: "topic_ownership",
    competitor_name: null,
    title: "Insurance-navigation lane uncontested",
    finding: "Industry-wide insurance content gets 3x average category engagement. No tracked brand currently produces it. First-mover claim available.",
    impact_level: "high",
    metrics: { client_value: 0, ottobock_value: 0, industry_value: 23 }
  },
  {
    id: "ci_004",
    category: "sentiment_differential",
    competitor_name: "Ottobock",
    title: "Same fitting topic, different emotional tone",
    finding: "Comments on fitting/adjustment content are more frustrated when discussing Ottobock's process (mostly C-Leg fit articles), more positive on Össur's Pro-Flex-related content.",
    impact_level: "low",
    metrics: { client_sentiment: 72, competitor_sentiment: 58 }
  }
];

/* videos table — sample of 30 rows for Content Analysis catalog.
 * Mix of Össur, Ottobock, and industry creators.
 * Schema-aligned: platform, video_url, account_name, account_followers,
 * is_client, is_competitor, competitor_name, caption, hashtags,
 * views, likes, shares, comments_count, engagement_rate,
 * classified_type, hook_style, hook_text, topics, sentiment,
 * upload_date, duration_seconds, comment_quality_score, is_sponsored, audio_name.
 */
const VIDEOS = [
  { id: "v_top_001", platform: "tiktok", account_name: "@aliciaonwheels", account_followers: 412000,
    is_client: true, is_competitor: false, competitor_name: null,
    caption: "POV: first walk on the new Pro-Flex after 18 months of fittings 🥹",
    hashtags: ["amputee", "proflex", "ossur", "amputeestrong", "fyp"],
    views: 1417000, likes: 218000, shares: 31200, comments_count: 4831,
    engagement_rate: 17.92, classified_type: "testimonial", hook_style: "personal-story",
    hook_text: "POV: first walk on the new Pro-Flex after 18 months of fittings",
    topics: ["pro-flex", "first-fitting", "milestone"],
    sentiment: "positive", upload_date: "2026-04-26", duration_seconds: 47,
    comment_quality_score: 4, is_sponsored: false, audio_name: "Heat Waves – Glass Animals (slowed)" },
  { id: "v_002", platform: "tiktok", account_name: "@richardrolls",
    account_followers: 89000, is_client: false, is_competitor: true, competitor_name: "Ottobock",
    caption: "5 things i wish someone told me before getting the C-Leg",
    hashtags: ["cleg", "ottobock", "amputeelife", "ablebodied"],
    views: 412000, likes: 38400, shares: 6120, comments_count: 1247,
    engagement_rate: 11.10, classified_type: "educational", hook_style: "listicle",
    hook_text: "5 things i wish someone told me before getting the C-Leg",
    topics: ["c-leg", "fitting", "advice"],
    sentiment: "mixed", upload_date: "2026-04-25", duration_seconds: 89,
    comment_quality_score: 4, is_sponsored: false, audio_name: "original audio" },
  { id: "v_003", platform: "tiktok", account_name: "@rajprosthetic", account_followers: 156000,
    is_client: false, is_competitor: false, competitor_name: null,
    caption: "denied AGAIN. third appeal incoming. someone tell me i'm not alone",
    hashtags: ["insurance", "amputee", "denial", "fightforcoverage"],
    views: 891000, likes: 142000, shares: 18900, comments_count: 3120,
    engagement_rate: 18.40, classified_type: "story", hook_style: "personal-story",
    hook_text: "denied AGAIN. third appeal incoming.",
    topics: ["insurance", "appeal", "frustration"],
    sentiment: "negative", upload_date: "2026-04-24", duration_seconds: 62,
    comment_quality_score: 5, is_sponsored: false, audio_name: "original audio" },
  { id: "v_004", platform: "youtube", account_name: "Prosthetist Without Borders", account_followers: 247000,
    is_client: false, is_competitor: false, competitor_name: null,
    caption: "Pro-Flex vs C-Leg: 8 month head-to-head comparison (no sponsorship)",
    hashtags: ["proflex", "cleg", "comparison", "prosthetics"],
    views: 384000, likes: 28100, shares: 0, comments_count: 1840,
    engagement_rate: 7.81, classified_type: "comparison", hook_style: "bold-claim",
    hook_text: "Pro-Flex vs C-Leg: 8 month head-to-head comparison (no sponsorship)",
    topics: ["pro-flex", "c-leg", "comparison", "review"],
    sentiment: "neutral", upload_date: "2026-04-23", duration_seconds: 1842,
    comment_quality_score: 5, is_sponsored: false, audio_name: null },
  { id: "v_005", platform: "tiktok", account_name: "@tarynruns", account_followers: 198000,
    is_client: true, is_competitor: false, competitor_name: null,
    caption: "watch me try the cheetah xtreme on a real trail for the first time",
    hashtags: ["cheetah", "ossur", "running", "amputeerunner"],
    views: 642000, likes: 88400, shares: 9200, comments_count: 1841,
    engagement_rate: 15.51, classified_type: "story", hook_style: "demonstration",
    hook_text: "watch me try the cheetah xtreme on a real trail for the first time",
    topics: ["cheetah", "trail-running", "first-try"],
    sentiment: "positive", upload_date: "2026-04-23", duration_seconds: 58,
    comment_quality_score: 4, is_sponsored: false, audio_name: "Believer – Imagine Dragons" },
  { id: "v_006", platform: "instagram", account_name: "@brunolimbloss",
    account_followers: 67000, is_client: false, is_competitor: false, competitor_name: null,
    caption: "São Paulo summer + socket = misery. show me your liner routines",
    hashtags: ["amputeebr", "limbloss", "saopaulo"],
    views: null, likes: 14200, shares: 0, comments_count: 412,
    engagement_rate: 21.81, classified_type: "story", hook_style: "personal-story",
    hook_text: "São Paulo summer + socket = misery",
    topics: ["sweating", "liner-care", "summer"],
    sentiment: "negative", upload_date: "2026-04-22", duration_seconds: 31,
    comment_quality_score: 4, is_sponsored: false, audio_name: null },
  { id: "v_007", platform: "tiktok", account_name: "@vetalex", account_followers: 521000,
    is_client: false, is_competitor: false, competitor_name: null,
    caption: "things people say when they see my prosthetic (i'm a vet, i've heard it all)",
    hashtags: ["veteran", "amputee", "prosthetics"],
    views: 1208000, likes: 184000, shares: 22400, comments_count: 4127,
    engagement_rate: 17.41, classified_type: "entertainment", hook_style: "listicle",
    hook_text: "things people say when they see my prosthetic",
    topics: ["veteran", "stereotypes", "humour"],
    sentiment: "mixed", upload_date: "2026-04-22", duration_seconds: 54,
    comment_quality_score: 4, is_sponsored: false, audio_name: "original audio" },
  { id: "v_008", platform: "tiktok", account_name: "@littlelukeswalk",
    account_followers: 84000, is_client: false, is_competitor: true, competitor_name: "Ottobock",
    caption: "luke's first 10 steps with his runner pediatric foot 💙",
    hashtags: ["pediatricprosthetic", "ottobock", "amputeekid"],
    views: 542000, likes: 92800, shares: 11400, comments_count: 2104,
    engagement_rate: 19.39, classified_type: "story", hook_style: "before-after",
    hook_text: "luke's first 10 steps",
    topics: ["pediatric", "first-steps", "milestone"],
    sentiment: "positive", upload_date: "2026-04-25", duration_seconds: 38,
    comment_quality_score: 4, is_sponsored: false, audio_name: "Sunflower – Post Malone (slowed)" },
  { id: "v_009", platform: "youtube", account_name: "Ottobock", account_followers: 412000,
    is_client: false, is_competitor: true, competitor_name: "Ottobock",
    caption: "C-Leg 4: complete fitting walkthrough with prosthetist Dr. Kessler",
    hashtags: [],
    views: 198000, likes: 4920, shares: 0, comments_count: 312,
    engagement_rate: 2.64, classified_type: "tutorial", hook_style: "demonstration",
    hook_text: "C-Leg 4: complete fitting walkthrough",
    topics: ["c-leg", "fitting", "tutorial"],
    sentiment: "neutral", upload_date: "2026-04-24", duration_seconds: 2840,
    comment_quality_score: 3, is_sponsored: false, audio_name: null },
  { id: "v_010", platform: "instagram", account_name: "@össur", account_followers: 184000,
    is_client: true, is_competitor: false, competitor_name: null,
    caption: "Introducing the Pro-Flex LP+ — designed for moderate impact, all-day wear",
    hashtags: ["proflex", "ossur"],
    views: null, likes: 3120, shares: 0, comments_count: 84,
    engagement_rate: 1.73, classified_type: "promotional", hook_style: "bold-claim",
    hook_text: "Introducing the Pro-Flex LP+",
    topics: ["pro-flex", "product-launch"],
    sentiment: "neutral", upload_date: "2026-04-22", duration_seconds: 22,
    comment_quality_score: 2, is_sponsored: false, audio_name: null },
  { id: "v_011", platform: "tiktok", account_name: "@kayleigh.amputee", account_followers: 142000,
    is_client: false, is_competitor: false, competitor_name: null,
    caption: "rating prosthetic stereotypes from movies, ranked",
    hashtags: ["amputee", "stereotypes", "ranking"],
    views: 384000, likes: 52100, shares: 4820, comments_count: 1207,
    engagement_rate: 15.14, classified_type: "entertainment", hook_style: "listicle",
    hook_text: "rating prosthetic stereotypes from movies",
    topics: ["humour", "media-portrayal"],
    sentiment: "positive", upload_date: "2026-04-26", duration_seconds: 71,
    comment_quality_score: 4, is_sponsored: false, audio_name: "original audio" },
  { id: "v_012", platform: "tiktok", account_name: "@runwithdamian", account_followers: 84000,
    is_client: false, is_competitor: true, competitor_name: "Ottobock",
    caption: "first marathon training run with the Genium X3. honest review",
    hashtags: ["genium", "ottobock", "marathon"],
    views: 178000, likes: 21400, shares: 2120, comments_count: 612,
    engagement_rate: 13.55, classified_type: "review", hook_style: "personal-story",
    hook_text: "first marathon training run with the Genium X3",
    topics: ["genium", "running", "review"],
    sentiment: "mixed", upload_date: "2026-04-25", duration_seconds: 92,
    comment_quality_score: 4, is_sponsored: false, audio_name: "Run – Foo Fighters" },
  { id: "v_013", platform: "youtube", account_name: "Daily Prosthetic", account_followers: 89000,
    is_client: false, is_competitor: false, competitor_name: null,
    caption: "How to clean your silicone liner properly — full routine",
    hashtags: [],
    views: 142000, likes: 9100, shares: 0, comments_count: 412,
    engagement_rate: 6.70, classified_type: "how-to", hook_style: "demonstration",
    hook_text: "How to clean your silicone liner properly",
    topics: ["liner-care", "tutorial"],
    sentiment: "positive", upload_date: "2026-04-24", duration_seconds: 612,
    comment_quality_score: 4, is_sponsored: false, audio_name: null },
  { id: "v_014", platform: "tiktok", account_name: "@össur", account_followers: 312000,
    is_client: true, is_competitor: false, competitor_name: null,
    caption: "how the Pro-Flex Pivot adapts to your stride — engineering breakdown",
    hashtags: ["proflex", "ossur", "engineering"],
    views: 89000, likes: 4120, shares: 412, comments_count: 84,
    engagement_rate: 5.18, classified_type: "educational", hook_style: "demonstration",
    hook_text: "how the Pro-Flex Pivot adapts to your stride",
    topics: ["pro-flex", "engineering", "feature"],
    sentiment: "neutral", upload_date: "2026-04-23", duration_seconds: 84,
    comment_quality_score: 3, is_sponsored: false, audio_name: "original audio" },
  { id: "v_015", platform: "instagram", account_name: "@mumbai_amputee_collective", account_followers: 41000,
    is_client: false, is_competitor: false, competitor_name: null,
    caption: "the actual cost of import duty on a microprocessor knee in India — breakdown",
    hashtags: ["india", "amputee", "cost", "import"],
    views: null, likes: 8400, shares: 0, comments_count: 412,
    engagement_rate: 21.49, classified_type: "educational", hook_style: "bold-claim",
    hook_text: "the actual cost of import duty on a microprocessor knee in India",
    topics: ["cost", "india", "policy"],
    sentiment: "negative", upload_date: "2026-04-22", duration_seconds: 78,
    comment_quality_score: 5, is_sponsored: false, audio_name: null },
  { id: "v_016", platform: "tiktok", account_name: "@coversbycami",
    account_followers: 38000, is_client: false, is_competitor: false, competitor_name: null,
    caption: "diy prosthetic cover for under $50 (because no one makes them affordable)",
    hashtags: ["cosmeticcover", "diy", "amputee"],
    views: 124000, likes: 18400, shares: 1820, comments_count: 612,
    engagement_rate: 16.79, classified_type: "how-to", hook_style: "bold-claim",
    hook_text: "diy prosthetic cover for under $50",
    topics: ["cosmetic-cover", "diy", "affordability"],
    sentiment: "positive", upload_date: "2026-04-25", duration_seconds: 64,
    comment_quality_score: 4, is_sponsored: false, audio_name: "original audio" },
  { id: "v_017", platform: "youtube", account_name: "Ottobock", account_followers: 412000,
    is_client: false, is_competitor: true, competitor_name: "Ottobock",
    caption: "Genium X3 vs C-Leg 4: which is right for you? (long-form comparison)",
    hashtags: [],
    views: 142000, likes: 5840, shares: 0, comments_count: 412,
    engagement_rate: 4.40, classified_type: "comparison", hook_style: "question",
    hook_text: "Genium X3 vs C-Leg 4: which is right for you?",
    topics: ["genium", "c-leg", "comparison"],
    sentiment: "neutral", upload_date: "2026-04-22", duration_seconds: 1840,
    comment_quality_score: 4, is_sponsored: false, audio_name: null },
  { id: "v_018", platform: "tiktok", account_name: "@vetalex", account_followers: 521000,
    is_client: false, is_competitor: false, competitor_name: null,
    caption: "the VA finally approved my c-leg 4. here's how I got past the third denial",
    hashtags: ["va", "veteran", "insurance", "appeal"],
    views: 612000, likes: 84200, shares: 9120, comments_count: 1840,
    engagement_rate: 15.55, classified_type: "story", hook_style: "personal-story",
    hook_text: "the VA finally approved my c-leg 4",
    topics: ["insurance", "va", "appeal", "veteran"],
    sentiment: "positive", upload_date: "2026-04-26", duration_seconds: 102,
    comment_quality_score: 5, is_sponsored: false, audio_name: "original audio" },
  { id: "v_019", platform: "instagram", account_name: "@runwithdamian", account_followers: 84000,
    is_client: false, is_competitor: true, competitor_name: "Ottobock",
    caption: "swimming with the Genium X3 — what works, what doesn't",
    hashtags: ["genium", "ottobock", "swimming"],
    views: null, likes: 6840, shares: 0, comments_count: 247,
    engagement_rate: 8.44, classified_type: "review", hook_style: "demonstration",
    hook_text: "swimming with the Genium X3",
    topics: ["genium", "swimming", "waterproof"],
    sentiment: "mixed", upload_date: "2026-04-23", duration_seconds: 64,
    comment_quality_score: 4, is_sponsored: false, audio_name: null },
  { id: "v_020", platform: "youtube", account_name: "Tarryn Runs", account_followers: 47000,
    is_client: true, is_competitor: false, competitor_name: null,
    caption: "Cheetah Xtreme: 6 month review (the good and the bad)",
    hashtags: [],
    views: 184000, likes: 12400, shares: 0, comments_count: 612,
    engagement_rate: 7.07, classified_type: "review", hook_style: "personal-story",
    hook_text: "Cheetah Xtreme: 6 month review",
    topics: ["cheetah", "review", "running"],
    sentiment: "positive", upload_date: "2026-04-22", duration_seconds: 1240,
    comment_quality_score: 5, is_sponsored: false, audio_name: null },
  { id: "v_021", platform: "tiktok", account_name: "@littlelukeswalk", account_followers: 84000,
    is_client: false, is_competitor: true, competitor_name: "Ottobock",
    caption: "luke is 4 today and he picked his prosthetic colour himself 🎨",
    hashtags: ["pediatricprosthetic", "ottobock", "amputeekid"],
    views: 412000, likes: 68400, shares: 7820, comments_count: 1207,
    engagement_rate: 18.49, classified_type: "story", hook_style: "personal-story",
    hook_text: "luke is 4 today and he picked his prosthetic colour himself",
    topics: ["pediatric", "milestone", "personalisation"],
    sentiment: "positive", upload_date: "2026-04-23", duration_seconds: 28,
    comment_quality_score: 4, is_sponsored: false, audio_name: "good days – SZA" },
  { id: "v_022", platform: "instagram", account_name: "@coversbycami", account_followers: 38000,
    is_client: false, is_competitor: false, competitor_name: null,
    caption: "skin-tone matching for the most underrepresented part of the prosthetic industry",
    hashtags: ["cosmeticcover", "diversity", "amputee"],
    views: null, likes: 9120, shares: 0, comments_count: 312,
    engagement_rate: 24.82, classified_type: "story", hook_style: "bold-claim",
    hook_text: "skin-tone matching for the most underrepresented part of the prosthetic industry",
    topics: ["cosmetic-cover", "diversity", "skin-tone"],
    sentiment: "positive", upload_date: "2026-04-26", duration_seconds: 46,
    comment_quality_score: 5, is_sponsored: false, audio_name: null },
  { id: "v_023", platform: "tiktok", account_name: "@aliciaonwheels", account_followers: 412000,
    is_client: true, is_competitor: false, competitor_name: null,
    caption: "day 1 vs day 365 with my Pro-Flex",
    hashtags: ["proflex", "ossur", "before-after"],
    views: 824000, likes: 124000, shares: 14200, comments_count: 2840,
    engagement_rate: 17.10, classified_type: "story", hook_style: "before-after",
    hook_text: "day 1 vs day 365 with my Pro-Flex",
    topics: ["pro-flex", "milestone", "before-after"],
    sentiment: "positive", upload_date: "2026-04-24", duration_seconds: 42,
    comment_quality_score: 4, is_sponsored: false, audio_name: "365 – Charli XCX" },
  { id: "v_024", platform: "youtube", account_name: "Prosthetist Without Borders", account_followers: 247000,
    is_client: false, is_competitor: false, competitor_name: null,
    caption: "your insurance denied your prosthetic — here's exactly what to do next",
    hashtags: [],
    views: 247000, likes: 21400, shares: 0, comments_count: 1820,
    engagement_rate: 9.40, classified_type: "how-to", hook_style: "personal-story",
    hook_text: "your insurance denied your prosthetic — here's exactly what to do next",
    topics: ["insurance", "appeal", "tutorial"],
    sentiment: "positive", upload_date: "2026-04-23", duration_seconds: 942,
    comment_quality_score: 5, is_sponsored: false, audio_name: null },
  { id: "v_025", platform: "tiktok", account_name: "@kayleigh.amputee", account_followers: 142000,
    is_client: false, is_competitor: false, competitor_name: null,
    caption: "POV: hot girl summer but make it socket-friendly",
    hashtags: ["amputee", "summer", "socket"],
    views: 312000, likes: 41200, shares: 3840, comments_count: 824,
    engagement_rate: 14.50, classified_type: "entertainment", hook_style: "personal-story",
    hook_text: "POV: hot girl summer but make it socket-friendly",
    topics: ["sweating", "summer", "humour"],
    sentiment: "mixed", upload_date: "2026-04-22", duration_seconds: 38,
    comment_quality_score: 3, is_sponsored: false, audio_name: "Hot Girl Summer – Megan Thee Stallion" },
  { id: "v_026", platform: "tiktok", account_name: "@össur", account_followers: 312000,
    is_client: true, is_competitor: false, competitor_name: null,
    caption: "meet the Symbionic Leg — 30 second product tour",
    hashtags: ["symbionic", "ossur", "innovation"],
    views: 64000, likes: 1820, shares: 124, comments_count: 47,
    engagement_rate: 3.11, classified_type: "promotional", hook_style: "bold-claim",
    hook_text: "meet the Symbionic Leg",
    topics: ["symbionic", "product-tour"],
    sentiment: "neutral", upload_date: "2026-04-24", duration_seconds: 31,
    comment_quality_score: 2, is_sponsored: false, audio_name: "original audio" },
  { id: "v_027", platform: "instagram", account_name: "@vetalex", account_followers: 521000,
    is_client: false, is_competitor: false, competitor_name: null,
    caption: "the c-leg saved my civilian career. here's how",
    hashtags: ["veteran", "cleg", "careerchange"],
    views: null, likes: 18200, shares: 0, comments_count: 612,
    engagement_rate: 3.61, classified_type: "story", hook_style: "personal-story",
    hook_text: "the c-leg saved my civilian career",
    topics: ["c-leg", "veteran", "career"],
    sentiment: "positive", upload_date: "2026-04-25", duration_seconds: 92,
    comment_quality_score: 5, is_sponsored: false, audio_name: null },
  { id: "v_028", platform: "tiktok", account_name: "@brunolimbloss", account_followers: 67000,
    is_client: false, is_competitor: false, competitor_name: null,
    caption: "rating prosthetic foot designs from worst to best looking",
    hashtags: ["amputee", "design", "ranking"],
    views: 189000, likes: 24100, shares: 2120, comments_count: 612,
    engagement_rate: 14.21, classified_type: "entertainment", hook_style: "listicle",
    hook_text: "rating prosthetic foot designs",
    topics: ["aesthetics", "design", "humour"],
    sentiment: "mixed", upload_date: "2026-04-26", duration_seconds: 58,
    comment_quality_score: 3, is_sponsored: false, audio_name: "original audio" },
  { id: "v_029", platform: "youtube", account_name: "Ottobock", account_followers: 412000,
    is_client: false, is_competitor: true, competitor_name: "Ottobock",
    caption: "Pediatric prosthetics: from 18 months to 18 years (full guide)",
    hashtags: [],
    views: 84000, likes: 4120, shares: 0, comments_count: 247,
    engagement_rate: 5.20, classified_type: "educational", hook_style: "bold-claim",
    hook_text: "Pediatric prosthetics: from 18 months to 18 years",
    topics: ["pediatric", "guide"],
    sentiment: "positive", upload_date: "2026-04-23", duration_seconds: 2240,
    comment_quality_score: 4, is_sponsored: false, audio_name: null },
  { id: "v_030", platform: "instagram", account_name: "@tarynruns", account_followers: 198000,
    is_client: true, is_competitor: false, competitor_name: null,
    caption: "training for comrades 2026 with my running blade",
    hashtags: ["cheetah", "comrades", "running", "ossur"],
    views: null, likes: 12400, shares: 0, comments_count: 412,
    engagement_rate: 6.46, classified_type: "story", hook_style: "personal-story",
    hook_text: "training for comrades 2026 with my running blade",
    topics: ["cheetah", "running", "training"],
    sentiment: "positive", upload_date: "2026-04-22", duration_seconds: 64,
    comment_quality_score: 4, is_sponsored: false, audio_name: null }
];

/* Aggregated content insights — built from videos table for Content Analysis page.
 * In the real product these are computed in code from videos.classified_type / hook_style + engagement_rate.
 */
const HOOK_PERFORMANCE = [
  { hook_style: "personal-story", avg_engagement: 8.4, video_count: 47, top_example: "POV: first walk on the new Pro-Flex after 18 months of fittings" },
  { hook_style: "before-after", avg_engagement: 7.1, video_count: 22, top_example: "day 1 vs day 365 with my Pro-Flex" },
  { hook_style: "demonstration", avg_engagement: 5.9, video_count: 38, top_example: "watch me try the cheetah xtreme on a real trail for the first time" },
  { hook_style: "listicle", avg_engagement: 4.2, video_count: 19, top_example: "things people say when they see my prosthetic" },
  { hook_style: "bold-claim", avg_engagement: 3.8, video_count: 11, top_example: "the actual cost of import duty on a microprocessor knee in India" }
];

const FORMAT_PERFORMANCE = [
  { classified_type: "story", avg_engagement: 7.8, video_count: 51 },
  { classified_type: "how-to", avg_engagement: 6.2, video_count: 34 },
  { classified_type: "comparison", avg_engagement: 5.6, video_count: 18 },
  { classified_type: "educational", avg_engagement: 4.9, video_count: 41 },
  { classified_type: "promotional", avg_engagement: 2.4, video_count: 36 }
];

const COMPETITOR_GAPS = [
  { topic: "Pediatric milestone content (kids fitting / first steps)", competitor_count: 14, ossur_count: 2 },
  { topic: "Knee adjustment / fitting walkthroughs", competitor_count: 9, ossur_count: 0 },
  { topic: "Prosthetist Q&A long-form (YouTube)", competitor_count: 7, ossur_count: 1 },
  { topic: "Adaptive sports event coverage", competitor_count: 6, ossur_count: 3 }
];

const RECOMMENDED_HOOKS = [
  { title: "Things they don't tell you about getting a Pro-Flex", reason: "Listicle hook, personal-story format. Top performer in category." },
  { title: "Day 1 vs Day 365", reason: "Before-after format averages 7.1% engagement. Replicable monthly." },
  { title: "POV: first time running since amputation", reason: "Personal-story + demonstration combo. Highest emotional payoff." }
];

/* weekly_reports table — 4 mock past emails */
const WEEKLY_REPORTS = [
  {
    id: "wr_001",
    run_id: "a1b2c3d4-e5f6-4789-a012-3456789abcde",
    subject: "Össur weekly · 1.4M views, 8.4K comments, 5 strategic insights",
    week_start: "2026-04-22",
    week_end: "2026-04-28",
    sent_to: ["marketing@ossur.com", "social@ossur.com"],
    sent_at: "2026-04-28T09:00:00Z",
    is_current: true
  },
  {
    id: "wr_002",
    run_id: "prev_run_002",
    subject: "Össur weekly · sentiment up 4 pts, pediatric gap widening",
    week_start: "2026-04-15",
    week_end: "2026-04-21",
    sent_to: ["marketing@ossur.com", "social@ossur.com"],
    sent_at: "2026-04-21T09:00:00Z",
    is_current: false
  },
  {
    id: "wr_003",
    run_id: "prev_run_003",
    subject: "Össur weekly · top hook this week, Ottobock content surge",
    week_start: "2026-04-08",
    week_end: "2026-04-14",
    sent_to: ["marketing@ossur.com"],
    sent_at: "2026-04-14T09:00:00Z",
    is_current: false
  },
  {
    id: "wr_004",
    run_id: "prev_run_004",
    subject: "Össur weekly · launch summary + first insights",
    week_start: "2026-04-01",
    week_end: "2026-04-07",
    sent_to: ["marketing@ossur.com"],
    sent_at: "2026-04-07T09:00:00Z",
    is_current: false
  }
];

/* Categories enum from v4.1 audience_insights.category */
const CATEGORIES = [
  { id: "pain_point", label: "Pain Points" },
  { id: "question", label: "Questions" },
  { id: "purchase_intent", label: "Purchase Intent" },
  { id: "feature_request", label: "Feature Requests" },
  { id: "praise", label: "Praise" },
  { id: "objection", label: "Objections" },
  { id: "misinformation", label: "Misinformation" },
  { id: "demographic_signal", label: "Demographic Signals" }
];

/* Insight type enum from v4.1 market_insights.insight_type */
const INSIGHT_TYPES = {
  unmet_need: "Unmet Need",
  platform_pattern: "Platform Pattern",
  industry_signal: "Industry Signal",
  cross_platform_synthesis: "Cross-Platform",
  sentiment_trajectory: "Sentiment Trajectory"
};

/* Recommendation type enum from v4.1 recommendations.type */
const REC_TYPES = {
  content_idea: "Content Idea",
  hook_strategy: "Hook Strategy",
  urgent_topic: "Urgent Topic",
  competitive_move: "Competitive Move",
  audience_target: "Audience Target",
  platform_strategy: "Platform Strategy"
};

/* Helpers */
function fmt(n) {
  if (n == null) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toString();
}

function fmtPct(n) { return n == null ? "—" : n.toFixed(1) + "%"; }

function platformIcon(p) {
  return ({tiktok: "♬", youtube: "▶", instagram: "◉"})[p] || "•";
}

function platformLabel(p) {
  return ({tiktok: "TikTok", youtube: "YouTube", instagram: "Instagram"})[p] || p;
}

function categoryById(id) {
  return CATEGORIES.find(c => c.id === id);
}

function getInsightsByCategory(category) {
  return AUDIENCE_INSIGHTS.filter(i => i.category === category);
}

function getVideoById(id) {
  return VIDEOS.find(v => v.id === id);
}

function getFeaturedRec() {
  return RECOMMENDATIONS.find(r => r.is_featured);
}
