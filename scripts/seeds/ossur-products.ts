import type { CatalogueSeed } from '../../lib/products/seed'

// Össur's product catalogue (depth v2, T12): the categories, products and the
// names people use for them, compiled from ossur.com on 2026-10-13 for
// Heinrich's review. Nothing here is loaded until he has read it.
//
// HOW IT IS LOADED: scripts/products.ts --client <uuid> --seed
// scripts/seeds/ossur-products.ts reads it and prints what it would write (dry
// by default); --apply writes it (scriptActor, config_changes surface
// 'products'). lib/products/seed.ts says what each list becomes and checks it
// (seedProblems) before anything is written.
//
// REVIEW IT BEFORE THE BACK-READ. The back-read of closed months is one shot: a
// product added after it has no history for those months, and a word wrongly
// left in places talk it should not. The review sheet beside the plan
// (t12-catalogue-review.md) lists what is uncertain.
//
// needsConfirm marks a GENERIC word (an ordinary word, or a name other brands
// or other topics use too: "Unity", "Rebound", "Total Knee", "socket"). Its hit
// places nothing by rule; the confirm call reads the text first and only a
// confirmed hit counts.
//
// SOURCES. Every product carries the en-us page it comes from. ossur.com draws
// its product pages and category grids in the browser, so a plain fetch reads
// only the site shell: each URL below is one the en-us sitemap lists, and each
// name is the page title as search engines hold it (en-us where indexed;
// otherwise the English page named in the comment). Order: the category page's
// own featured names first, then the rest in the en-us sitemap's order.

export const OSSUR_PRODUCTS: CatalogueSeed = {
  seededFrom: 'ossur.com',
  compiledOn: '2026-10-13',
  groups: [
    {
      name: 'Liners',
      words: ['liner', 'prosthetic liner', 'silicone liner', 'gel liner', 'seal-in liner'],
      families: ['Iceross', 'Iceform', { alias: 'Seal-In', needsConfirm: true }],
      products: [
        // https://www.ossur.com/en-us/prosthetics/liners/iceross-seal-in-x (title from en-us iceross-seal-in-x-locking)
        { name: 'Iceross Seal-In X', aliases: ['Seal-In X'] },
        // https://www.ossur.com/en-us/prosthetics/liners/iceross-dermo-cushion (also Locking, Seal-In, Uniform)
        { name: 'Iceross Dermo', aliases: ['Dermo liner', 'Dermo Seal-In'] },
        // https://www.ossur.com/en-us/prosthetics/liners/iceross-seal-in-v
        { name: 'Iceross Seal-In V', aliases: ['Seal-In V'] },
        // https://www.ossur.com/en-us/prosthetics/liners/iceross-seal-in-x5 (title from en-in)
        { name: 'Iceross Seal-In X5', aliases: ['Seal-In X5'] },
        // https://www.ossur.com/en-us/prosthetics/liners/iceross-synergy-cushion (also Locking)
        { name: 'Iceross Synergy', aliases: ['Synergy liner'] },
        // https://www.ossur.com/en-us/prosthetics/liners/iceross-comfort-cushion (also Locking)
        { name: 'Iceross Comfort', aliases: [{ alias: 'Comfort liner', needsConfirm: true }] },
        // https://www.ossur.com/en-us/prosthetics/liners/iceross-original-locking
        { name: 'Iceross Original' },
        // https://www.ossur.com/en-us/prosthetics/liners/iceross-sport-locking
        { name: 'Iceross Sport' },
        // https://www.ossur.com/en-us/prosthetics/liners/iceross-upper-x-locking (title from en-gb)
        { name: 'Iceross Upper-X', aliases: ['Upper-X liner'] },
      ],
    },
    {
      name: 'Feet',
      words: [
        'prosthetic foot', 'prosthetic feet', 'carbon foot', 'carbon feet', 'running blade', 'sprint blade',
        { alias: 'blade', needsConfirm: true },
        'bionic foot', 'bionic ankle', 'prosthetic ankle', 'microprocessor ankle',
      ],
      families: [
        'Pro-Flex',
        { alias: 'Cheetah', needsConfirm: true },
        'Cheetah blade',
        'Cheetah blades',
        { alias: 'Flex-Foot', needsConfirm: true },
        { alias: 'Balance Foot', needsConfirm: true },
      ],
      products: [
        // https://www.ossur.com/en-us/prosthetics/feet/proprio-foot
        { name: 'Proprio Foot', aliases: [{ alias: 'Proprio', needsConfirm: true }] },
        // https://www.ossur.com/en-us/prosthetics/feet/pro-flex-pivot
        { name: 'Pro-Flex Pivot' },
        // https://www.ossur.com/en-us/prosthetics/feet/pro-flex-xc
        { name: 'Pro-Flex XC' },
        // https://www.ossur.com/en-us/prosthetics/feet/pro-flex-lp
        { name: 'Pro-Flex LP' },
        // https://www.ossur.com/en-us/prosthetics/feet/pro-flex-xc-torsion
        { name: 'Pro-Flex XC Torsion' },
        // https://www.ossur.com/en-us/prosthetics/feet/pro-flex-lp-torsion
        { name: 'Pro-Flex LP Torsion' },
        // https://www.ossur.com/en-us/prosthetics/feet/pro-flex-lp-align
        { name: 'Pro-Flex LP Align' },
        // https://www.ossur.com/en-us/prosthetics/feet/pro-flex-st (name from the Pro-Flex family pages; title not indexed)
        { name: 'Pro-Flex ST' },
        // https://www.ossur.com/en-us/prosthetics/feet/pro-flex-terra
        { name: 'Pro-Flex Terra' },
        // https://www.ossur.com/en-us/prosthetics/feet/balance-foot-s (also Balance Foot S Torsion)
        { name: 'Balance Foot S' },
        // https://www.ossur.com/en-us/prosthetics/feet/cheetah-xplore (title from en-gb)
        { name: 'Cheetah Xplore' },
        // https://www.ossur.com/en-us/prosthetics/feet/flex-foot-cheetah (title from en-gb)
        { name: 'Flex-Foot Cheetah' },
        // https://www.ossur.com/en-us/prosthetics/feet/cheetah-xtreme (title from en-gb)
        { name: 'Cheetah Xtreme' },
        // https://www.ossur.com/en-us/prosthetics/feet/cheetah-xtend
        { name: 'Cheetah Xtend' },
        // https://www.ossur.com/en-us/prosthetics/feet/cheetah-xcel
        { name: 'Cheetah Xcel' },
        // https://www.ossur.com/en-us/prosthetics/feet/cheetah-xceed
        { name: 'Cheetah Xceed' },
        // https://www.ossur.com/en-us/prosthetics/feet/re-flex-rotate (name from Össur's instructions for use; title not indexed)
        { name: 'Re-Flex Rotate' },
        // https://www.ossur.com/en-us/prosthetics/feet/k2-sensation
        { name: 'K2 Sensation' },
        // https://www.ossur.com/en-us/prosthetics/feet/flex-run
        { name: 'Flex-Run' },
        // https://www.ossur.com/en-us/prosthetics/feet/vari-flex
        { name: 'Vari-Flex' },
      ],
    },
    {
      name: 'Knees',
      words: [
        'prosthetic knee', 'microprocessor knee', 'bionic knee', 'hydraulic knee', 'mechanical knee', 'polycentric knee',
        { alias: 'MPK', needsConfirm: true },
      ],
      families: [{ alias: 'Rheo', needsConfirm: true }, { alias: 'Total Knee', needsConfirm: true }],
      products: [
        // https://www.ossur.com/en-us/prosthetics/knees/power-knee
        { name: 'Power Knee' },
        // https://www.ossur.com/en-us/prosthetics/knees/rheo-knee
        { name: 'Rheo Knee', aliases: ['Rheo Bionic Knee'] },
        // https://www.ossur.com/en-us/prosthetics/knees/rheo-knee-xc
        { name: 'Rheo Knee XC', aliases: ['Rheo XC'] },
        // https://www.ossur.com/en-us/prosthetics/knees/balance-knee-ofm2 (also balance-knee-ofm1)
        { name: 'Balance Knee', needsConfirm: true, aliases: ['Balance Knee OFM1', 'Balance Knee OFM2'] },
        // https://www.ossur.com/en-us/prosthetics/knees/cheetah-knee (title from en-in)
        { name: 'Cheetah Knee' },
        // https://www.ossur.com/en-us/prosthetics/knees/total-knee-2000 (title from en-ca)
        { name: 'Total Knee 2000' },
        // https://www.ossur.com/en-us/prosthetics/knees/total-knee-2100
        { name: 'Total Knee 2100' },
        // https://www.ossur.com/en-us/prosthetics/knees/mauch-knee (title from en-in)
        { name: 'Mauch Knee', aliases: [{ alias: 'Mauch', needsConfirm: true }] },
        // https://www.ossur.com/en-us/prosthetics/knees/paso-knee
        { name: 'Paso Knee' },
        // https://www.ossur.com/en-us/prosthetics/knees/navii (title from en-za and en-in)
        { name: 'Navii', aliases: ['Navi Knee'] },
      ],
    },
    {
      name: 'Sockets & Locks',
      words: [
        { alias: 'socket', needsConfirm: true },
        'prosthetic socket', 'socket fit', 'check socket', 'test socket', 'suction socket', 'vacuum socket',
        'elevated vacuum', 'vacuum suspension', 'pin lock', 'shuttle lock', 'suspension sleeve',
      ],
      families: ['Icelock'],
      products: [
        // https://www.ossur.com/en-us/prosthetics/sockets/direct-socket
        { name: 'Direct Socket', needsConfirm: true, aliases: ['Direct Socket TT', 'Direct Socket TF'] },
        // https://www.ossur.com/en-us/prosthetics/sockets/connect-tf
        { name: 'Connect TF' },
        // https://www.ossur.com/en-us/prosthetics/unity (read: heading "Össur Unity", title "Unity Sleeveless Vacuum System")
        { name: 'Unity', needsConfirm: true, aliases: ['Unity vacuum', 'Unity sleeveless', 'Össur Unity', 'Ossur Unity'] },
      ],
    },
    {
      name: 'Hands',
      words: [
        'prosthetic hand', 'bionic hand', 'myoelectric hand', 'prosthetic arm', 'bionic arm', 'myoelectric arm',
        'prosthetic finger',
      ],
      families: ['i-Limb', 'i-Digits', 'Touch Bionics'],
      products: [
        // https://www.ossur.com/en-us/prosthetics/arms/i-limb-access (title from en-gb; en-us also lists i-Limb Access titanium)
        { name: 'i-Limb Access' },
        // https://www.ossur.com/en-us/prosthetics/arms/i-limb-ultra (title from en-za)
        { name: 'i-Limb Ultra' },
        // https://www.ossur.com/en-us/prosthetics/arms/i-limb-quantum (title from en-au)
        { name: 'i-Limb Quantum' },
        // https://www.ossur.com/en-us/prosthetics/arms/i-digits-access
        { name: 'i-Digits Access' },
        // https://www.ossur.com/en-us/prosthetics/arms/i-digits-quantum
        { name: 'i-Digits Quantum' },
        // https://www.ossur.com/en-us/prosthetics/arms/livingskin
        { name: 'LivingSkin', aliases: [{ alias: 'Living Skin', needsConfirm: true }] },
      ],
    },
    {
      name: 'Bracing & Supports',
      words: [
        { alias: 'brace', needsConfirm: true },
        'knee brace', 'hip brace', 'back brace', 'neck brace', 'ankle brace', 'unloader brace', 'OA brace', 'ACL brace',
        'post-op brace', 'knee immobilizer', 'cervical collar', 'walking boot', 'walker boot', 'orthosis', 'orthoses',
      ],
      families: [
        { alias: 'Unloader', needsConfirm: true },
        { alias: 'Rebound', needsConfirm: true },
        { alias: 'Formfit', needsConfirm: true },
        'Formfit Pro',
        { alias: 'CTi', needsConfirm: true },
        'CTi brace',
      ],
      products: [
        // https://www.ossur.com/en-us/bracing-and-supports/knee/unloader-one
        { name: 'Unloader One' },
        // https://www.ossur.com/en-us/bracing-and-supports/knee/unloader-one-x
        { name: 'Unloader One X' },
        // https://www.ossur.com/en-us/bracing-and-supports/knee/cti-custom
        { name: 'CTi Custom' },
        // https://www.ossur.com/en-us/bracing-and-supports/knee/formfit-pro-knee (title from en-gb and en-in; also Formfit Pro Knee OA)
        { name: 'Formfit Pro Knee' },
        // https://www.ossur.com/en-us/bracing-and-supports/knee/rebound-dual (also Rebound DUAL ST)
        { name: 'Rebound DUAL' },
        // https://www.ossur.com/en-us/bracing-and-supports/knee/rebound-post-op-knee (title from en-au)
        { name: 'Rebound Post-Op Knee', aliases: ['Rebound Post-Op'] },
        // https://www.ossur.com/en-us/bracing-and-supports/knee/rebound-acl-custom (the US sells the custom one; "Rebound ACL" elsewhere)
        { name: 'Rebound ACL' },
        // https://www.ossur.com/en-us/bracing-and-supports/knee/oa-ease
        { name: 'OA Ease', needsConfirm: true },
        // https://www.ossur.com/en-us/bracing-and-supports/spine/miami-j-select
        { name: 'Miami J Select' },
        // https://www.ossur.com/en-us/bracing-and-supports/spine/miami-lso (name from the en-us Bracing & Supports page)
        { name: 'Miami LSO' },
        // https://www.ossur.com/en-us/bracing-and-supports/spine/miami-j (title from en-gb)
        { name: 'Miami J' },
        // https://www.ossur.com/en-us/bracing-and-supports/foot-and-ankle/rebound-air-walker (also Rebound Air Walker LT)
        { name: 'Rebound Air Walker' },
        // https://www.ossur.com/en-us/bracing-and-supports/foot-and-ankle/formfit-walker (also Formfit Walker Air)
        { name: 'Formfit Walker' },
        // https://www.ossur.com/en-us/bracing-and-supports/hip/unloader-hip
        { name: 'Unloader Hip' },
        // https://www.ossur.com/en-us/bracing-and-supports/hip/rebound-hip (title from en-au)
        { name: 'Rebound Hip' },
      ],
    },
  ],
}

export default OSSUR_PRODUCTS
