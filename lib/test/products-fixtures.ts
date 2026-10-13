import { seedCatalogue, seedRows, type CatalogueSeed } from '../products/seed'
import type { ProductCatalogue } from '../products/types'

// A small catalogue in Össur's shape for the products tests (depth v2 T11):
// four categories, a family per category where the real one has one, the
// generic names the plan names ("Unity", "Total Knee", "Comfort") flagged,
// and a category word ("socket") that is mostly another thing, flagged too.
// Not the real seed (scripts/seeds/ossur-products.ts): the tests pin the
// matcher's behaviour, not Össur's list.

export const FIXTURE_SEED: CatalogueSeed = {
  seededFrom: 'ossur.com',
  compiledOn: '2026-10-13',
  groups: [
    {
      name: 'Liners',
      words: ['liner', 'prosthetic liner'],
      families: ['Iceross'],
      products: [
        { name: 'Iceross Seal-In X5', aliases: ['sealin x5'] },
        { name: 'Iceross Comfort', aliases: [{ alias: 'Comfort', needsConfirm: true }] },
      ],
    },
    {
      name: 'Feet',
      words: ['prosthetic foot', 'prosthetic feet', 'running blade'],
      families: ['Pro-Flex'],
      products: [
        { name: 'Pro-Flex XC' },
        { name: 'Pro-Flex XC Torsion' },
        { name: 'Cheetah Xcel' },
      ],
    },
    {
      name: 'Knees',
      words: ['prosthetic knee', 'microprocessor knee'],
      products: [
        { name: 'Rheo Knee', aliases: ['rheo'] },
        { name: 'Total Knee', needsConfirm: true },
        { name: 'Power Knee' },
      ],
    },
    {
      name: 'Sockets',
      words: ['prosthetic socket', { alias: 'socket', needsConfirm: true }],
      products: [
        { name: 'Direct Socket', needsConfirm: true },
        { name: 'Unity', needsConfirm: true },
      ],
    },
  ],
}

export const FIXTURE_CATALOGUE: ProductCatalogue = seedCatalogue(FIXTURE_SEED)

const rows = seedRows(FIXTURE_SEED)
/** A category's id by name. */
export const G = (name: string): string => rows.groups.find((g) => g.name === name)!.key
/** A product's id by name. */
export const P = (name: string): string => rows.products.find((p) => p.name === name)!.key
