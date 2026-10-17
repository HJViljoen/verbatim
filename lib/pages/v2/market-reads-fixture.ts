// THE SUBJECTS' OWN READS AS `subject_read_v3` WROTE THEM (16 Oct): the real
// words of the lead's dry runs for Össur's run 41024b9e and Sealand's run
// 78a6eb3c (`ossur-subject-reads-v3e-dry.md`, `sealand-subject-reads-v3e-dry.md`),
// as the scrub left them: each written read's headline, what people said and
// what it means, and code's one line for a thin one. Market's render fixtures
// put them on the published read (`withSubjectReadsV3`), so the subject cards
// and pages are drawn from real stored text, at its real lengths.

export interface FixtureSubjectRead {
  name: string
  status: 'ready' | 'thin'
  saying: string[]
  means: string
  headline?: string
}

/** Össur's six, by subject name. */
export const OSSUR_SUBJECT_READS: readonly FixtureSubjectRead[] = [
  {
    name: "Cost & access",
    status: 'ready',
    saying: ["People describe prosthetic cost in the parts they have to pay for: bionic hands, sockets, liners and full prosthetic legs. The price is set beside cars and laptops, and replacement makes the bill feel never finished. Even with insurance, people say the remaining cost still blocks a new socket or replacement limb, and some ask to pay in instalments or ask what insurance covers.", "That is why price and place are asked together. People ask what a transtibial leg, a fibreglass leg or the socket and liner cost in São Paulo, Mauritius and elsewhere, and where to buy for themselves or family. Insurance denial, paperwork, vocational rehab delays and warranty disputes with clinics sit in the same account, while prosthetic legs made from bike parts are praised because access starts with a price they can pay."],
    means: "The socket and liner carry the judgement on cost. Access is settled where insurance approval, warranty rules and the clinic bill meet, even for parts people name as necessary replacements. Legs made from bike parts are praised for putting a prosthetic within reach.",
    headline: "The socket and liner bill decides whether replacement is possible",
  },
  {
    name: "Function & movement",
    status: 'ready',
    saying: ["People want the mechanics of movement explained in practical terms: how a prosthetic bends and attaches, what long walks feel like, how different types affect balance and the back and hips, and how a prosthetic hand grips, carries water and is controlled. The same need for detail appears in questions about kayaking, with steering and rudder control named, and in doubt about what extra use plug in hands, hooks and claws add.", "Balance is where admiration and doubt meet. People describe balancing on the prosthetic side as hard, especially in dance, and ask whether the difficulty shown comes from balance itself or from the prosthetic foot. Smooth, fast movement in dance, golf and walking is praised when the change between prosthetic and biological limb looks natural, while feats such as pole vaulting draw questions about what wrist, hand and forearm power can really do."],
    means: "Natural looking movement still has to be explained through a named task. Balance on the prosthetic side, the prosthetic foot, and hand grip and control are the parts people use to test carrying water, dancing, steering and walking.",
    headline: "A named task makes natural movement feel real",
  },
  {
    name: "Choosing the right device",
    status: 'thin',
    saying: ["In October so far, talk about Choosing the right device sat in “Value of a skilled prosthetist”."],
    means: "",
  },
  {
    name: "Look & style",
    status: 'ready',
    saying: ["People treat the look of a prosthetic as personal style as well as realism. A leg cover or tattooed finish is praised as pretty, cool and part of identity, and the magnetic setup prompts ideas for custom pieces and jewellery. Some people ask where to order similar leg covers, and a cover made as a tribute to a mother draws praise for carrying personal meaning.", "At the same time, the same question sits behind praise for realism and the wish to hide a prosthetic leg in some situations. People admire a leg or fingers that look natural enough to be mistaken for a tattoo or to prompt surprise, while some amputees want to hide the prosthetic leg when they want calmness and normalcy in social situations. Alongside that, some people want a prosthetic arm with a metallic, mechanical look."],
    means: "The look of a prosthesis sets its visibility in public. Realistic skin tones, tattooed covers and a metallic arm look each answer the same need, to choose between blending in and making the limb part of personal style. Leg covers and magnetic custom parts are the pieces people want to order and personalise.",
    headline: "The look sets what others notice first",
  },
  {
    name: "Fit & comfort",
    status: 'ready',
    saying: ["People describe fit as something that keeps being worked on. The talk runs from socket or bed adjustability to exact leg length and alignment, with owners saying small changes turn into repeat tweaks and with viewers trying to understand how a new socket is cast, tested and refined before it feels right.", "The same uncertainty appears in wear over a full day. People mention pressure points, sore spots and discomfort in a current socket, ask about pressure sores from wearing silicone sockets for long periods, and look at posture, jeans and whether the prosthetic side seems too long. Heat and sweat are part of the same judgement, especially in hot weather."],
    means: "Fit is treated as something settled through socket adjustments and the exact leg length. The socket, suspension system and long wear in silicone are the points people want settled before buying or refitting. Pressure spots, heat, sweat and posture are the checks they use.",
    headline: "Socket fit and exact leg length decide all day comfort",
  },
  {
    name: "Community & encouragement",
    status: 'ready',
    saying: ["People answered stories of amputation, loss and prosthetic use with praise for faith, courage, resilience and determination. A child facing amputation, a woman rebuilding life after losing her husband and leg, and creators learning to walk with prosthetics or rebuilding independence were treated as examples of grit, while athletes in a triathlon on crutches, a rowing test, pole vault, a marathon and a hard mountain hike were praised for skill, discipline and the right to compete.", "The same encouragement followed people who brought humour, a smile, dancing, style and confidence to recovery and to life with a prosthetic limb, including pride in scars and an amputee body. New amputees valued reassurance, practical advice and belonging from other amputees, and viewers also praised honest sharing about the prosthetic experience, family support around disability and employment, a husband helping manage prosthetic limbs, and the message of standing by someone through a wrong choice."],
    means: "New amputees value other amputees for walking advice, honest prosthetic stories and reassurance that they belong. A prosthetic leg, blade or crutches are taken for granted in stories about sport, dancing and independence. The support people name is reassurance from someone already living with a prosthetic.",
    headline: "New amputees value advice and belonging from other amputees",
  },
]

/** Sealand's five, by subject name. */
export const SEALAND_SUBJECT_READS: readonly FixtureSubjectRead[] = [
  {
    name: "Comfort",
    status: 'ready',
    saying: ["People describe comfort as something a bag either keeps or loses once it is packed and worn for a full day. The talk stays on straps, hip belts and structure: thin straps that dig into shoulders, rigid bags that do not compress, and weight that is not spread well enough for travel between places or long walks.", "That links to the trade between capacity, bag weight and the features packed into the shell, such as laptop protection and a water bottle sleeve. Some buyers accept extra bag weight if the pack still feels light in use, and others praise a bag for comfort but question the space it gives once full. Because fit is seen as personal and tied to body shape and habits, people ask for model comparisons and even strap swaps to settle it."],
    means: "In this market, comfort is personal, but the judgement lands on the same parts: shoulder straps, hip belts and how the load sits once the bag is full. Buyers take useful capacity for granted and keep asking whether laptop padding, bottle sleeves and bag structure add weight that the straps can still carry for a long day.",
    headline: "A full pack is judged at the straps and hip belt",
  },
  {
    name: "Buying & delivery",
    status: 'ready',
    saying: ["People often start with a bag they already want to own: handmade styles, a purse with a similar strap, the East-West Mini and the medium duffle are all named. That intent then shifts to access. People ask where the bag is sold, watch the website for restocks, look for limited edition bags to return, and check which backpack colour or outlet has the version they want.", "The same search continues into the order itself. People ask how to order the analog bag, weigh retail against second hand or liquidated bags, and ask whether the small or medium crescent suits their use. Department store markings and wear make condition part of the purchase decision, while travel shoppers mention a foldable duffel, a packable daypack, a trolley bag, or an extra bag bought at the destination."],
    means: "Availability settles intent here. People usually name the exact bag, colour or size before they ask where to buy, whether it is restocked, or how to order it. Second hand and department store comments show that the condition of the bag at purchase matters alongside access.",
    headline: "Stock status decides if a chosen bag gets bought",
  },
  {
    name: "Price",
    status: 'thin',
    saying: ["In October so far, talk about Price sat in “Price questions before buying”."],
    means: "",
  },
  {
    name: "Looks & style",
    status: 'ready',
    saying: ["People describe style as the reason a bag stands out: the handmade look, thoughtful design, leather quality and colour all make it feel desirable. Specific colours get named, including pink and azalee, and people link the look to the bag’s size and to whether it matches a creator’s style and vibe.", "Once the look appeals, people inspect the details that shape it, including colour placement and whether parts are glued or sewn. The same test appears in doubts about upcycled bags, where reused material can put buyers off if the finish does not look good enough to buy."],
    means: "Style is taken for granted even in recycled bags. Buyers expect appealing colour, a handmade finish and design that looks thought through, then inspect colour placement and whether parts are glued or sewn as signs of care. Reused material needs the same good colour and finish before it looks good enough to buy.",
    headline: "Colour and finish decide whether reused material looks desirable",
  },
  {
    name: "Durability",
    status: 'ready',
    saying: ["People treat durability as proof that a bag is worth keeping. Praise centres on backpacks, tech bags and totes that still feel sturdy after years of travel, shopping and regular use, with rugged materials, neat stitching, good finishing and compartments that stay useful while the bag takes rough handling.", "The same standard is applied to the parts that take strain. Zips are asked about under heavy compression, suede is asked about for wear, colour change and colour transfer onto clothing, and replaceable straps and custom pouches are valued because repairable bags feel built to last."],
    means: "Long life is the basic proof of value in this market. Buyers still press on zips under heavy compression and suede over time, because those are the parts they use to decide whether the build lasts. Replaceable straps signal a bag that stays usable once wear appears.",
    headline: "Zips under compression make long life believable",
  },
]
