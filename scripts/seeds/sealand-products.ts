import type { CatalogueSeed } from '../../lib/products/seed'

// Sealand's product catalogue (depth v2, T12, the Össur seed's method): the
// categories, products and the names people use for them, compiled from
// sealandgear.com on 2026-11-17 for review. Nothing here is loaded until it
// has been read.
//
// HOW IT IS LOADED: scripts/products.ts --client <uuid> --seed
// scripts/seeds/sealand-products.ts reads it and prints what it would write
// (dry by default); --apply writes it (scriptActor, config_changes surface
// 'products'). lib/products/seed.ts says what each list becomes and checks it
// (seedProblems) before anything is written.
//
// REVIEW IT BEFORE THE BACK-READ. The back-read of closed months is one shot: a
// product added after it has no history for those months, and a word wrongly
// left in places talk it should not.
//
// needsConfirm marks a GENERIC word (an ordinary word, a phrase every bag
// brand uses, or a name another topic owns: "Mini Crossbody", "Slim Laptop
// Bag", "Moon Bag", "Toastie", "Zeplin"). Its hit places nothing by rule; the
// confirm call reads the text first and only a confirmed hit counts. Stricter
// than Össur's: Sealand's market already carried homonyms (Poler, Patagonia,
// Cotopaxi), so a name that is a plain description of a bag or a garment is
// flagged even where it is Sealand's own title.
//
// THE WORDS ARE NARROW ON PURPOSE. A category word places talk about the
// category in general AND makes every video whose words hold it
// category-relevant, which sends all its comments to the classifier. So no
// bare "bag", "tote" ("totes" is slang), "cap" ("no cap"), "carry-on" without
// "bag", "keychain" (bag-charm talk), "wallet" (crypto), "water bottle",
// "laptop sleeve", "card holder" or "key ring" (a backpack's own pocket and
// clip); apparel takes three garment words only, because Sealand's market is
// bags (lib/pages/market-frame.ts) and clothing talk in it is buyer-adjacent
// (lib/segments/hints.ts).
//
// NO CATEGORY WORD IS GENERIC, on purpose: the confirm call's prompt
// (lib/products/classify.ts buildConfirmSystemPrompt) reads a category word as
// "a prosthetic or orthotic product", so for Sealand it answers no to every one
// (17 Nov: "I just carry a small sling with my passport" read false). A word
// here either places by rule or is left out. The generic PRODUCT names are
// confirmed as Sealand's or not, which that prompt reads right ("Got the
// Sealand Moon Bag" true, "This Rad Rev Moon Bag" false).
//
// MEASURED (the dry run of 17 Nov, June to November, one month a read, and its
// recorded reads replayed): every word below read by hand on a sample; the
// ones left out above were the ones that read wrong.
//
// SOURCES. Every product carries the sealandgear.com page it comes from: each
// URL is one the store's product sitemap (sitemap_products_1.xml, read
// 2026-11-17) lists, and each name is the sitemap's title for it, less the
// material ("- MajiTex", "- Yacht Sail", "- CORDURA®", "- ECONYL®",
// "- Upcycled Canvas", "- Lightweight Ripstop", "- Kite", "- Customisable"),
// the size ("22L") and "Men's" / "Women's". The store's JSON endpoints
// answered 429 on the day, so product types and descriptions come from the
// collection list (collections.json, read the same day) and search-indexed
// sealandgear.com pages, named in the comment where they decided something.
// One product per design: its materials, colourways, sizes and the men's and
// women's cut of one style are one product, the other pages named beside it.
//
// LEFT OUT (non-products, or not gear people name): Gift Card; Donate to
// Protect our Paths (a donation); Pin Badges; Customisable Name Tag (the
// personalisation tag for the Customisable bags); Atlantide Scent Bottle
// 15ml (the store's room spray). Not in the current range (no page in the
// sitemap): the Kaizer Chiefs x Sealand range (a crossbody, a backpack and a
// toiletry bag, December 2025), Wilderness x Sealand (2023), K-Way x Sealand
// and Sol Sol; a mention of their bags by Sealand's model name ("Wilderness X
// Sealand Recycled Toastie Storage Bag") still names the model below.

export const SEALAND_PRODUCTS: CatalogueSeed = {
  seededFrom: 'sealandgear.com',
  compiledOn: '2026-11-17',
  groups: [
    {
      name: 'Backpacks',
      words: ['backpack', 'daypack', 'rucksack'],
      // The Hero range (the store's "Hero Bags" collection, /collections/commuter):
      // "hero backpack" is also any superhero kids' backpack, so the confirm reads it
      families: [{ alias: 'Hero Backpack', needsConfirm: true }],
      products: [
        // https://sealandgear.com/products/yacht-sail-buddy-large (22L; also majitex-buddy-backpack,
        // upcycled-buddy-backpack-xs 13L, buddy-backpack-customisable)
        // generic: plush "buddy backpacks" for children, and the "Backpack Buddies" food programme
        { name: 'Buddy Backpack', needsConfirm: true, aliases: ['Sealand Buddy Backpack'] },
        // https://sealandgear.com/products/yacht-sail-roamer (30L; also roamer-backpack-customisable)
        // generic: Patagonia's Dirt Roamer (a tracked rival's pack), PGYTECH's and Ruffwear's Roamer (the dry run, 17 Nov)
        { name: 'Roamer Backpack', needsConfirm: true, aliases: ['Sealand Roamer Backpack', { alias: 'Roamer', needsConfirm: true }] },
        // https://sealandgear.com/products/majitex-rowlie-backpack (26L)
        { name: 'Rowlie Backpack', aliases: [{ alias: 'Rowlie', needsConfirm: true }] },
        // https://sealandgear.com/products/hero-pro-cordura (21L; also hero-pro-x-pac)
        // "Hero Pro" alone is also GoPro talk
        { name: 'Hero Pro Backpack', aliases: [{ alias: 'Hero Pro', needsConfirm: true }] },
        // https://sealandgear.com/products/recycled-cordura-slim-backpack (12L)
        { name: 'Hero Slim Backpack', aliases: [{ alias: 'Hero Slim', needsConfirm: true }] },
        // https://sealandgear.com/products/recycled-cordura-ultimate-travel-backpack (58L)
        // "hero ultimate" alone is also a game hero's ultimate ability
        { name: 'Hero Ultimate Backpack', aliases: ['Hero Ultimate Travel Backpack', { alias: 'Hero Ultimate', needsConfirm: true }] },
      ],
    },
    {
      name: 'Crossbody & Hip Bags',
      words: [
        // "sling" is a bag in about 99 in 100 of its 712 uses in the dry run (the verb, "sling it over the shoulder",
        // and a gun sling are the rest), so it places by rule
        'cross-body', 'cross-body bag', 'sling bag', 'sling', 'bum bag', 'fanny pack', 'belt bag',
        'waist bag', 'hip bag', 'hip pack', 'chest bag', 'messenger bag',
      ],
      products: [
        // https://sealandgear.com/products/majitex-moon-bag (titled "Moon Crossbody - MajiTex"; Sealand calls the Moon
        // its most popular bag, and its older Recycled and Upcycled Moon Bag pages are indexed but not in the sitemap)
        // generic: "moon bag" is South African for any bum bag, and a crypto "moonbag" (the pattern reads both spellings)
        { name: 'Moon Bag', needsConfirm: true, aliases: ['Moon Crossbody', 'Sealand Moon Bag', { alias: 'Moon Bags', needsConfirm: true }] },
        // https://sealandgear.com/products/recycled-mini-crossbody-bag (also upcycled-mini-crossbody-bag,
        // yacht-sail-mini-crossbody, majitex-mini-crossbody, mini-crossbody-customisable)
        // generic: every brand sells a "mini crossbody"
        { name: 'Mini Crossbody', needsConfirm: true, aliases: ['Sealand Mini Crossbody'] },
        // https://sealandgear.com/products/majitex-zeplin-crossbody (also yacht-sail-zeplin, zeplin-crossbody-customisable)
        // "Zeplin" alone is a design tool, and Zeppelin misspelt
        { name: 'Zeplin Crossbody', aliases: [{ alias: 'Zeplin', needsConfirm: true }] },
        // https://sealandgear.com/products/majitex-messenger-crossbody-bag
        { name: 'Messenger Crossbody', needsConfirm: true },
        // https://sealandgear.com/products/walkman-crossbody-bag
        { name: 'Walkman Crossbody' },
        // https://sealandgear.com/products/wanderer-crossbody-bag (titled "... - Lightweight Ripstop Lava")
        // generic: "wanderer" names other brands' crossbodies too
        { name: 'Wanderer Crossbody', needsConfirm: true },
        // https://sealandgear.com/products/wizmed-odyssey-cross-body-bag (a collab)
        { name: 'WiZmed x Sealand Ward Crossbody', aliases: ['Ward Crossbody', 'WiZmed x Sealand'] },
      ],
    },
    {
      name: 'Duffels & Travel',
      words: [
        'duffel', 'duffle', 'weekender bag', 'travel bag', 'holdall', 'gym bag', 'luggage', 'suitcase', 'wheelie bag',
        'carry-on bag', 'cabin bag', 'toiletry bag', 'wash bag', 'dopp kit', 'packing cube',
      ],
      products: [
        // https://sealandgear.com/products/yacht-sail-nomad-duffel-small (27L; also majitex-nomad-duffel)
        // generic: "nomad duffel" is other brands' name too
        { name: 'Nomad Duffel', needsConfirm: true, aliases: ['Sealand Nomad Duffel'] },
        // https://sealandgear.com/products/dune-duffel-majitex (42L; also dune-duffel-customisable)
        { name: 'Dune Duffel' },
        // https://sealandgear.com/products/recycled-wheelie-bag (titled "Large Wheelie - ECONYL®")
        // generic: a wheelie is a bike trick
        { name: 'Large Wheelie', needsConfirm: true },
        // https://sealandgear.com/products/recycled-wheelie-bag-1 (titled "Cabin Wheelie - CORDURA®")
        { name: 'Cabin Wheelie', needsConfirm: true },
        // https://sealandgear.com/products/majitex-toastie (also yacht-sail-toastie, toastie-storage-bag-customisable;
        // a wash and toiletry bag, per the indexed wilderness-x-sealand-recycled-toastie-storage-bag page)
        // "Toastie" alone is a toasted sandwich
        { name: 'Toastie Storage Bag', aliases: [{ alias: 'Toastie', needsConfirm: true }] },
        // https://sealandgear.com/products/poka-set (three zipped pouches in kite fabric, per the indexed page)
        { name: 'Poka Set' },
        // https://sealandgear.com/products/sealand-packing-cube (titled "Packing Cube - Lightweight Ripstop"): named with
        // the brand, as the handle is, because "packing cube" is the category's own word (141 texts in the dry run, every
        // one another brand's or packing cubes in general)
        { name: 'Sealand Packing Cube' },
      ],
    },
    {
      name: 'Totes',
      words: ['tote bag', 'shopper bag', 'beach bag'],
      products: [
        // https://sealandgear.com/products/majitex-family-tote (also family-tote-customisable)
        { name: 'Family Tote', needsConfirm: true, aliases: ['Sealand Family Tote'] },
        // https://sealandgear.com/products/canvas-tote-bag (titled "Tote Bag - Canvas")
        { name: 'Canvas Tote', needsConfirm: true, aliases: ['Sealand Canvas Tote'] },
      ],
    },
    {
      name: 'Laptop & Tech',
      // not "laptop sleeve": in this market it is a backpack's laptop pocket ("a laptop sleeve that fits 16 inches")
      words: ['laptop bag', 'laptop case', 'laptop shoulder bag', 'briefcase', 'tech pouch', 'tech organiser', 'tech organizer'],
      products: [
        // https://sealandgear.com/products/yacht-sail-slim-laptop-bag (also majitex-slim-laptop-bag)
        { name: 'Slim Laptop Bag', needsConfirm: true, aliases: ['Sealand Slim Laptop Bag'] },
        // https://sealandgear.com/products/recycled-tech-pouch (titled "Tech Pouch - CORDURA®"): named with the brand,
        // because "tech pouch" is the category's own word (Topo Designs', Tomtoc's and Peak Design's in the dry run)
        { name: 'Sealand Tech Pouch' },
      ],
    },
    {
      name: 'Cooler Bags',
      // not "cool bag": it is mostly "a super cool bag"
      words: ['cooler bag', 'soft cooler', 'insulated bag'],
      products: [
        // https://sealandgear.com/products/upcycled-cooler (titled "Frosty Cooler - MajiTex")
        // generic: "a frosty cooler" of drinks
        { name: 'Frosty Cooler', needsConfirm: true },
        // https://sealandgear.com/products/recycled-chillah-cooler (titled "Chillah Wine Cooler - MajiTex")
        { name: 'Chillah Wine Cooler', aliases: [{ alias: 'Chillah', needsConfirm: true }] },
      ],
    },
    {
      name: 'Accessories',
      // not "card holder" or "key ring": in this market they are mostly a bag's own pocket or clip ("it also has a
      // card holder down in here", "a little key ring that holds your keys")
      words: ['cardholder', 'key organiser', 'key organizer'],
      products: [
        // https://sealandgear.com/products/stash-cardholder (also stash-cardholder-kite)
        { name: 'Stash Cardholder', needsConfirm: true },
        // https://sealandgear.com/products/majitex-dash-cardholder
        // generic: a car's dash card holder
        { name: 'Dash Cardholder', needsConfirm: true },
        // https://sealandgear.com/products/upcycled-keezy-key-organiser (a key ring, per the indexed page)
        // "Keezy" alone is also an app and a rapper's name
        { name: 'Keezy Key Organiser', aliases: ['Keezy Key Ring', { alias: 'Keezy', needsConfirm: true }] },
        // https://sealandgear.com/products/protect-our-paths-trail-mate-pouch-kite (a clip-on litter pouch for hikes)
        // generic: "trail mate" is a hiking companion
        { name: 'Trail Mate', needsConfirm: true, aliases: ['Trail Mate Pouch', 'Protect Our Paths Trail Mate'] },
        // https://sealandgear.com/products/circular-co-x-sealand-750ml-water-bottle (a collab; also
        // circulor-co-x-sealand-1l-water-bottle-ssteel)
        // generic: Circular&Co sells its own bottles, so the confirm reads which
        { name: 'Circular&Co Water Bottle', needsConfirm: true, aliases: [{ alias: 'Circular & Co Water Bottle', needsConfirm: true }] },
      ],
    },
    {
      name: 'Headwear',
      words: ['bucket hat', 'trucker cap', 'trucker hat', 'baseball cap', 'running cap', 'dad hat', 'snapback', 'beanie'],
      products: [
        // https://sealandgear.com/products/recycled-run-cap (also recycled-run-cap-1, -2, -3, -army-green-eucalyptus,
        // -hazy-pink-clay-bone, -petrol-camel-khaki, -orange-embroided, recycled-lifestyle-cap-black-embroided)
        { name: 'Recycled Run Cap', aliases: [{ alias: 'Run Cap', needsConfirm: true }] },
        // https://sealandgear.com/products/urban-lifestyle-cap (also recycled-lifestyle-cap-2, -4 "Recycled Lifestyle Cap",
        // recycled-lifestyle-cap-5, -burgundy, -hazy-pink, -mushroom, recycled-run-cap-olive-badge)
        { name: 'Urban Lifestyle Cap', aliases: ['Recycled Lifestyle Cap', { alias: 'Lifestyle Cap', needsConfirm: true }] },
        // https://sealandgear.com/products/vintage-lifestyle-cap-olive (also -sand, -washed-black)
        { name: 'Vintage Lifestyle Cap' },
        // https://sealandgear.com/products/urban-trucker-cap (titled "Recycled Urban Trucker Cap"; also urban-trucker-cap-1)
        { name: 'Urban Trucker Cap' },
        // https://sealandgear.com/products/recycled-lifestyle-bucket-hat (also -1, -black, recycled-bucket-hat-ink,
        // -mushroom, -petrol-camel-c-block, -walnut-mushroom)
        // generic: other brands' recycled bucket hats
        { name: 'Recycled Bucket Hat', needsConfirm: true },
        // https://sealandgear.com/products/ecocycled-beanie (titled "Beanie"; also ecocycled-beanie-5): named with the
        // brand, because the store's bare "Beanie" is the category word
        { name: 'Sealand Beanie' },
      ],
    },
    {
      name: 'Apparel',
      words: ['puffer jacket', 'fleece jacket', 'shacket'],
      products: [
        // https://sealandgear.com/products/mens-core-logo-tee (also mens-core-logo-tee-2, -navy, men-s-core-tee-v2-0, core-logo-tee)
        { name: 'Core Logo Tee', needsConfirm: true },
        // https://sealandgear.com/products/core-logo-long-sleeve (also mens-core-logo-longsleeve)
        { name: 'Core Logo Long Sleeve', needsConfirm: true },
        // https://sealandgear.com/products/mens-boxy-tee-black (also mens-boxy-tee-6, -burgundy, -earth-brown, -natural-cotton,
        // -pure-white; women's womans-boxy-t-shirt-biking-red, -natural-cotton)
        { name: 'Boxy Tee', needsConfirm: true },
        // https://sealandgear.com/products/mens-stripe-tee (also mens-stripe-tee-1)
        { name: 'Stripe Tee', needsConfirm: true },
        // https://sealandgear.com/products/mens-mutant-fish-tee-1
        { name: 'Mutant Fish Tee' },
        // https://sealandgear.com/products/discover-new-paths-tee (also discover-new-paths-mens-tee)
        { name: 'Discover New Paths Tee' },
        // https://sealandgear.com/products/protect-our-paths-tee-black
        { name: 'Protect our Paths Tee' },
        // https://sealandgear.com/products/ciovita-x-sealand-mens-run-tee (a collab; also ciovita-x-sealand-womans-run-tee)
        // "Ciovita run tee" alone is Ciovita's own range too
        { name: 'Ciovita x Sealand Run Tee', aliases: ['Ciovita x Sealand', { alias: 'Ciovita Run Tee', needsConfirm: true }] },
        // https://sealandgear.com/products/hemp-shacket-1 (also hemp-shacket-2, -3, mens-hemp-shacket-beach-sand)
        { name: 'Hemp Shacket', needsConfirm: true },
        // https://sealandgear.com/products/origin-puffer-jacket (also origin-puffer-jacket-1, -2)
        { name: 'Origin Puffer Jacket', aliases: [{ alias: 'Origin Puffer', needsConfirm: true }] },
        // https://sealandgear.com/products/mens-origin-jacket
        { name: 'Origin Jacket', needsConfirm: true },
        // https://sealandgear.com/products/mens-thermo-tide-fleece
        { name: 'Thermo Tide Fleece' },
        // https://sealandgear.com/products/mens-heavy-hooded-knit
        { name: 'Heavy Hooded Knit', needsConfirm: true },
        // https://sealandgear.com/products/mens-lightweight-hooded-knit-mocha-marle
        { name: 'Lightweight Hooded Knit', needsConfirm: true },
        // https://sealandgear.com/products/mens-textured-knit-mushroom
        { name: 'Textured Knit', needsConfirm: true },
        // https://sealandgear.com/products/mens-contour-design-knit-multi (also womans-contour-knit-multi, womens-contour-knitwear)
        { name: 'Contour Knit', needsConfirm: true, aliases: [{ alias: 'Contour Design Knit', needsConfirm: true }, { alias: 'Contour Knitwear', needsConfirm: true }] },
        // https://sealandgear.com/products/mens-hooded-sweat-top-1 (also mens-hooded-top-navy)
        { name: 'Hooded Sweat Top', needsConfirm: true },
        // https://sealandgear.com/products/mens-1-4-zip-olive (titled "Men's Quarter Zip Sweat Top"; also womens-quarter-zip-2)
        { name: 'Quarter Zip', needsConfirm: true },
        // https://sealandgear.com/products/womans-crew-sweat-top-clay
        { name: 'Crew Sweat Top', needsConfirm: true },
        // https://sealandgear.com/products/woven-summer-shirt (also mens-long-sleeve-summer-shirt-oxford-blues-stripe,
        // -ice-blue, -bottle-green, mens-short-sleeve-summer-shirt-chocolate-bark)
        { name: 'Summer Shirt', needsConfirm: true },
        // https://sealandgear.com/products/mens-weekender-linen-shorts-navy (also -olive)
        { name: 'Weekender Linen Shorts', needsConfirm: true },
        // https://sealandgear.com/products/womans-summer-shorts-beach-sand
        { name: 'Summer Shorts', needsConfirm: true },
        // https://sealandgear.com/products/womans-weekender-pants-soft-olive-herb
        { name: 'Weekender Pants', needsConfirm: true },
        // https://sealandgear.com/products/womans-weekender-dress-black (also womans-weekender-dress-beach-sand)
        { name: 'Weekender Dress', needsConfirm: true },
        // https://sealandgear.com/products/womans-terra-lux-skirt-chestnut (titled "Women's Terra Luxe Skirt")
        { name: 'Terra Luxe Skirt' },
        // https://sealandgear.com/products/womans-terra-lux-tank-chestnut (titled "Women's Terra Luxe Tank")
        { name: 'Terra Luxe Tank' },
        // https://sealandgear.com/products/womans-crew-rib-tank-olive
        { name: 'Crew Rib Tank', needsConfirm: true },
        // https://sealandgear.com/products/womens-ribbed-henley-2 (also womens-ribbed-henley-3)
        { name: 'Ribbed Henley', needsConfirm: true },
      ],
    },
  ],
}

export default SEALAND_PRODUCTS
