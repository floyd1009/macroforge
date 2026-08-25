import type { Food, FoodState, Nutrients, ServingSize } from '../lib/types'

/**
 * Bundled German everyday foods, per 100 g/ml.
 *
 * These are *generic* whole foods, not branded products — the things Open Food
 * Facts covers worst (it is a packaged-goods database; nobody scans a potato)
 * and that a tracker needs on day one, offline, before any network call.
 *
 * Values follow standard food-composition tables (USDA SR/Foundation Foods
 * cross-checked against typical German retail labels). Where German labelling
 * convention differs — salt rather than sodium, fibre counted inside
 * carbohydrate — the German convention wins, because that is what is printed
 * on the packet the user is holding.
 */

interface SeedSpec {
  slug: string
  de: string
  en: string
  basis?: 'g' | 'ml'
  /** [kcal, protein, carbs, fat, fiber?, sugar?, satFat?, salt?] */
  n: [number, number, number, number, number?, number?, number?, number?]
  servings?: Array<[label: string, amount: number, isDefault?: boolean]>
  state?: FoodState
  /** Cooked mass ÷ raw mass, where the conversion is well established. */
  yf?: number
}

const S: SeedSpec[] = [
  /* --- Getreide & Beilagen ------------------------------------------ */
  { slug: 'haferflocken', de: 'Haferflocken', en: 'Rolled oats', n: [372, 13.5, 58.7, 7, 10, 1.2, 1.3, 0.02], servings: [['1 Portion (50 g)', 50, true], ['1 EL (12 g)', 12]] , state: 'raw', yf: 2.6 },
  { slug: 'vollkornbrot', de: 'Vollkornbrot', en: 'Wholegrain bread', n: [210, 7.5, 35.6, 3.2, 7.4, 2.5, 0.6, 1.1], servings: [['1 Scheibe (45 g)', 45, true]] },
  { slug: 'roggenmischbrot', de: 'Roggenmischbrot', en: 'Rye mixed bread', n: [225, 6.8, 43, 1.2, 5.1, 2.2, 0.3, 1.2], servings: [['1 Scheibe (45 g)', 45, true]] },
  { slug: 'toastbrot', de: 'Toastbrot (Weizen)', en: 'White toast bread', n: [269, 8.5, 47, 4.2, 3, 4, 0.8, 1.1], servings: [['1 Scheibe (28 g)', 28, true]] },
  { slug: 'broetchen', de: 'Brötchen (Weizen)', en: 'Bread roll', n: [270, 9, 52, 1.5, 3, 2, 0.4, 1.2], servings: [['1 Brötchen (55 g)', 55, true]] },
  { slug: 'nudeln-roh', de: 'Nudeln, roh (Hartweizen)', en: 'Dry pasta', n: [359, 12.5, 71.2, 1.5, 3, 3.5, 0.3, 0.01], servings: [['1 Portion (85 g)', 85, true]] , state: 'raw', yf: 2.3 },
  { slug: 'nudeln-gekocht', de: 'Nudeln, gekocht', en: 'Cooked pasta', n: [131, 5, 25, 0.6, 1.2, 0.8, 0.1, 0.01], servings: [['1 Portion (200 g)', 200, true]] , state: 'cooked' },
  { slug: 'reis-roh', de: 'Reis, roh (Basmati)', en: 'Dry rice', n: [350, 7.5, 78, 0.9, 1.3, 0.1, 0.2, 0.01], servings: [['1 Portion (75 g)', 75, true]] , state: 'raw', yf: 2.6 },
  { slug: 'reis-gekocht', de: 'Reis, gekocht', en: 'Cooked rice', n: [130, 2.7, 28.2, 0.3, 0.4, 0.1, 0.1, 0.01], servings: [['1 Portion (180 g)', 180, true]] , state: 'cooked' },
  { slug: 'kartoffeln', de: 'Kartoffeln, roh', en: 'Potatoes, raw', n: [70, 2, 15.4, 0.1, 2.1, 0.8, 0.03, 0.01], servings: [['1 mittlere (150 g)', 150, true]] , state: 'raw', yf: 0.95 },
  { slug: 'suesskartoffel', de: 'Süßkartoffel, roh', en: 'Sweet potato, raw', n: [86, 1.6, 20.1, 0.1, 3, 4.2, 0.02, 0.14] , state: 'raw', yf: 0.92 },
  { slug: 'mehl-405', de: 'Weizenmehl Type 405', en: 'Wheat flour 405', n: [348, 10, 72, 1, 3.2, 0.7, 0.2, 0.01] , state: 'raw' },
  { slug: 'couscous-roh', de: 'Couscous, roh', en: 'Couscous, dry', n: [376, 12.8, 72.4, 0.6, 5, 0.6, 0.1, 0.02] , state: 'raw', yf: 2.5 },

  /* --- Milchprodukte -------------------------------------------------- */
  { slug: 'magerquark', de: 'Magerquark', en: 'Quark, low fat', n: [67, 12, 4.1, 0.3, 0, 4.1, 0.2, 0.1], servings: [['1 Becher (250 g)', 250, true], ['1 Portion (150 g)', 150]] },
  { slug: 'skyr', de: 'Skyr, natur', en: 'Skyr, plain', n: [63, 11, 4, 0.2, 0, 4, 0.1, 0.1], servings: [['1 Becher (450 g)', 450], ['1 Portion (150 g)', 150, true]] },
  { slug: 'huettenkaese', de: 'Körniger Frischkäse (Hüttenkäse)', en: 'Cottage cheese', n: [98, 12.5, 3, 4.3, 0, 3, 2.8, 0.8], servings: [['1 Becher (200 g)', 200, true]] },
  { slug: 'naturjoghurt-35', de: 'Naturjoghurt 3,5 %', en: 'Yoghurt 3.5%', n: [66, 3.5, 4.7, 3.5, 0, 4.7, 2.3, 0.13], servings: [['1 Becher (150 g)', 150, true]] },
  { slug: 'joghurt-mager', de: 'Naturjoghurt 0,1 %', en: 'Yoghurt 0.1%', n: [40, 4.3, 5.6, 0.1, 0, 5.6, 0.1, 0.15], servings: [['1 Becher (150 g)', 150, true]] },
  { slug: 'milch-35', de: 'Vollmilch 3,5 %', en: 'Whole milk 3.5%', basis: 'ml', n: [64, 3.4, 4.8, 3.5, 0, 4.8, 2.3, 0.11], servings: [['1 Glas (200 ml)', 200, true]] },
  { slug: 'milch-15', de: 'Milch 1,5 %', en: 'Milk 1.5%', basis: 'ml', n: [47, 3.4, 4.9, 1.5, 0, 4.9, 1, 0.11], servings: [['1 Glas (200 ml)', 200, true]] },
  { slug: 'haferdrink', de: 'Haferdrink', en: 'Oat drink', basis: 'ml', n: [45, 0.6, 6.6, 1.5, 0.8, 4, 0.2, 0.09], servings: [['1 Glas (200 ml)', 200, true]] },
  { slug: 'gouda', de: 'Gouda 48 % F.i.Tr.', en: 'Gouda cheese', n: [356, 25, 0, 28, 0, 0, 18, 2], servings: [['1 Scheibe (30 g)', 30, true]] },
  { slug: 'harzer', de: 'Harzer Käse', en: 'Harzer cheese', n: [125, 30, 0, 0.7, 0, 0, 0.4, 3.5], servings: [['1 Rolle (125 g)', 125, true]] },
  { slug: 'frischkaese', de: 'Frischkäse Doppelrahmstufe', en: 'Cream cheese', n: [253, 6, 3.5, 24, 0, 3.5, 16, 0.8], servings: [['1 EL (20 g)', 20, true]] },
  { slug: 'butter', de: 'Butter', en: 'Butter', n: [741, 0.7, 0.6, 82, 0, 0.6, 52, 0.02], servings: [['1 TL (5 g)', 5], ['1 Portion (10 g)', 10, true]] },

  /* --- Eier, Fleisch, Fisch ------------------------------------------- */
  { slug: 'ei', de: 'Hühnerei', en: 'Chicken egg', n: [143, 12.6, 0.7, 9.9, 0, 0.4, 3.1, 0.36], servings: [['1 Ei M (58 g)', 58, true], ['1 Ei L (68 g)', 68], ['1 Eiweiß (33 g)', 33]] , state: 'raw', yf: 0.9 },
  { slug: 'eiklar', de: 'Eiklar', en: 'Egg white', n: [52, 10.9, 0.7, 0.2, 0, 0.7, 0, 0.4] },
  { slug: 'haehnchenbrust', de: 'Hähnchenbrustfilet, roh', en: 'Chicken breast, raw', n: [106, 23, 0, 1.5, 0, 0, 0.4, 0.15], servings: [['1 Filet (150 g)', 150, true]] , state: 'raw', yf: 0.72 },
  { slug: 'putenbrust', de: 'Putenbrust, roh', en: 'Turkey breast, raw', n: [104, 23.5, 0, 1, 0, 0, 0.3, 0.15] , state: 'raw', yf: 0.72 },
  { slug: 'rinderhack-5', de: 'Rinderhackfleisch 5 % Fett', en: 'Beef mince 5%', n: [133, 21.5, 0, 5, 0, 0, 2.2, 0.15] , state: 'raw', yf: 0.72 },
  { slug: 'rinderhack-20', de: 'Rinderhackfleisch 20 % Fett', en: 'Beef mince 20%', n: [254, 17, 0, 20, 0, 0, 8, 0.15] , state: 'raw', yf: 0.68 },
  { slug: 'gemischtes-hack', de: 'Gemischtes Hackfleisch', en: 'Mixed mince', n: [230, 18, 0, 17.5, 0, 0, 7, 0.16] , state: 'raw', yf: 0.7 },
  { slug: 'schweinefilet', de: 'Schweinefilet, roh', en: 'Pork tenderloin, raw', n: [110, 22, 0, 2.3, 0, 0, 0.8, 0.14] , state: 'raw', yf: 0.73 },
  { slug: 'bratwurst', de: 'Bratwurst', en: 'Bratwurst', n: [298, 13, 1.5, 26.5, 0, 0.8, 10, 2], servings: [['1 Wurst (100 g)', 100, true]] },
  { slug: 'lachs', de: 'Lachs, roh', en: 'Salmon, raw', n: [208, 20.4, 0, 13.4, 0, 0, 3.1, 0.14], servings: [['1 Filet (140 g)', 140, true]] , state: 'raw', yf: 0.78 },
  { slug: 'thunfisch-wasser', de: 'Thunfisch in eigenem Saft', en: 'Tuna in water', n: [108, 24, 0, 1, 0, 0, 0.3, 0.9], servings: [['1 Dose abgetropft (110 g)', 110, true]] },
  { slug: 'kochschinken', de: 'Kochschinken', en: 'Cooked ham', n: [110, 19, 1, 3.5, 0, 1, 1.2, 2.3], servings: [['1 Scheibe (25 g)', 25, true]] },

  /* --- Hülsenfrüchte, Nüsse, Fette ------------------------------------ */
  { slug: 'linsen-trocken', de: 'Linsen, getrocknet', en: 'Lentils, dry', n: [353, 25, 60, 1.1, 30.5, 2, 0.2, 0.01] , state: 'raw', yf: 2.4 },
  { slug: 'kichererbsen-dose', de: 'Kichererbsen, Dose (abgetropft)', en: 'Chickpeas, canned', n: [139, 7.2, 17, 2.6, 6.5, 0.8, 0.3, 0.5] },
  { slug: 'kidneybohnen-dose', de: 'Kidneybohnen, Dose (abgetropft)', en: 'Kidney beans, canned', n: [104, 7, 13.5, 0.5, 6.4, 0.6, 0.1, 0.6] },
  { slug: 'mandeln', de: 'Mandeln', en: 'Almonds', n: [579, 21.2, 21.6, 49.9, 12.5, 4.4, 3.8, 0.001], servings: [['1 Handvoll (25 g)', 25, true]] },
  { slug: 'walnuesse', de: 'Walnüsse', en: 'Walnuts', n: [654, 15.2, 13.7, 65.2, 6.7, 2.6, 6.1, 0.005] },
  { slug: 'erdnussbutter', de: 'Erdnussbutter (100 % Erdnuss)', en: 'Peanut butter', n: [588, 25.1, 19.6, 50, 8, 5, 9, 0.02], servings: [['1 EL (16 g)', 16, true]] },
  { slug: 'olivenoel', de: 'Olivenöl', en: 'Olive oil', basis: 'ml', n: [884, 0, 0, 100, 0, 0, 13.8, 0], servings: [['1 EL (12 ml)', 12, true], ['1 TL (4 ml)', 4]] },
  { slug: 'rapsoel', de: 'Rapsöl', en: 'Rapeseed oil', basis: 'ml', n: [884, 0, 0, 100, 0, 0, 7.4, 0], servings: [['1 EL (12 ml)', 12, true]] },

  /* --- Obst & Gemüse -------------------------------------------------- */
  { slug: 'banane', de: 'Banane', en: 'Banana', n: [89, 1.1, 22.8, 0.3, 2.6, 12.2, 0.1, 0.001], servings: [['1 mittlere (118 g)', 118, true]] },
  { slug: 'apfel', de: 'Apfel', en: 'Apple', n: [52, 0.3, 13.8, 0.2, 2.4, 10.4, 0.03, 0.001], servings: [['1 mittlerer (180 g)', 180, true]] },
  { slug: 'orange', de: 'Orange', en: 'Orange', n: [47, 0.9, 11.8, 0.1, 2.4, 9.4, 0.02, 0], servings: [['1 mittlere (150 g)', 150, true]] },
  { slug: 'heidelbeeren', de: 'Heidelbeeren', en: 'Blueberries', n: [57, 0.7, 14.5, 0.3, 2.4, 10, 0.03, 0.001], servings: [['1 Portion (125 g)', 125, true]] },
  { slug: 'brokkoli', de: 'Brokkoli, roh', en: 'Broccoli, raw', n: [34, 2.8, 6.6, 0.4, 2.6, 1.7, 0.04, 0.08], servings: [['1 Portion (200 g)', 200, true]] , state: 'raw', yf: 0.9 },
  { slug: 'tomate', de: 'Tomate', en: 'Tomato', n: [18, 0.9, 3.9, 0.2, 1.2, 2.6, 0.03, 0.01], servings: [['1 mittlere (120 g)', 120, true]] },
  { slug: 'gurke', de: 'Salatgurke', en: 'Cucumber', n: [15, 0.7, 3.6, 0.1, 0.5, 1.7, 0.04, 0.005] },
  { slug: 'paprika', de: 'Paprika, rot', en: 'Bell pepper, red', n: [31, 1, 6, 0.3, 2.1, 4.2, 0.06, 0.01], servings: [['1 Stück (150 g)', 150, true]] },
  { slug: 'zwiebel', de: 'Zwiebel', en: 'Onion', n: [40, 1.1, 9.3, 0.1, 1.7, 4.2, 0.04, 0.01] },
  { slug: 'karotte', de: 'Karotte', en: 'Carrot', n: [41, 0.9, 9.6, 0.2, 2.8, 4.7, 0.03, 0.17] },
  { slug: 'spinat', de: 'Blattspinat, roh', en: 'Spinach, raw', n: [23, 2.9, 3.6, 0.4, 2.2, 0.4, 0.06, 0.2] , state: 'raw', yf: 0.45 },
  { slug: 'avocado', de: 'Avocado', en: 'Avocado', n: [160, 2, 8.5, 14.7, 6.7, 0.7, 2.1, 0.02], servings: [['1/2 Frucht (75 g)', 75, true]] },

  /* --- Supplements & Sonstiges ---------------------------------------- */
  { slug: 'whey', de: 'Whey Protein (Konzentrat)', en: 'Whey protein', n: [378, 78, 6.5, 5.5, 0, 5.5, 3.4, 0.5], servings: [['1 Scoop (30 g)', 30, true]] },
  { slug: 'zucker', de: 'Haushaltszucker', en: 'Sugar', n: [400, 0, 100, 0, 0, 100, 0, 0], servings: [['1 TL (4 g)', 4, true]] },
  { slug: 'honig', de: 'Honig', en: 'Honey', n: [304, 0.3, 82.4, 0, 0.2, 82.1, 0, 0.01], servings: [['1 TL (7 g)', 7, true]] },
  { slug: 'ketchup', de: 'Tomatenketchup', en: 'Ketchup', n: [102, 1.3, 23.5, 0.1, 0.3, 21.8, 0.02, 2], servings: [['1 EL (15 g)', 15, true]] },
  { slug: 'bier', de: 'Bier (Pils, 4,8 %)', en: 'Beer', basis: 'ml', n: [43, 0.5, 3.2, 0, 0, 0.1, 0, 0.01], servings: [['1 Glas (330 ml)', 330, true], ['1 Halbe (500 ml)', 500]] },
  { slug: 'cola', de: 'Cola', en: 'Cola', basis: 'ml', n: [42, 0, 10.6, 0, 0, 10.6, 0, 0.01], servings: [['1 Glas (250 ml)', 250], ['1 Dose (330 ml)', 330, true]] },
  { slug: 'kaffee-schwarz', de: 'Kaffee, schwarz', en: 'Black coffee', basis: 'ml', n: [2, 0.1, 0, 0, 0, 0, 0, 0], servings: [['1 Tasse (200 ml)', 200, true]] },
]

// Beer carries ethanol, which the Atwater check needs to reconcile its kcal.
const ALCOHOL_G_PER_100ML: Record<string, number> = { bier: 3.8 }

function toNutrients(spec: SeedSpec): Nutrients {
  const [kcal, protein, carbs, fat, fiber, sugar, satFat, salt] = spec.n
  const n: Nutrients = { kcal, protein, carbs, fat }
  if (fiber != null) n.fiber = fiber
  if (sugar != null) n.sugar = sugar
  if (satFat != null) n.satFat = satFat
  if (salt != null) n.salt = salt
  const alc = ALCOHOL_G_PER_100ML[spec.slug]
  if (alc != null) n.alcohol = alc
  return n
}

function toServings(spec: SeedSpec): ServingSize[] {
  const list: ServingSize[] = (spec.servings ?? []).map(([label, amount, isDefault]) => ({
    label,
    amount,
    isDefault,
  }))
  // Every food gets a plain 100 g/ml option so a scale reading is one tap away.
  list.push({ label: spec.basis === 'ml' ? '100 ml' : '100 g', amount: 100 })
  return list
}

export function buildSeedFoods(now = 0): Food[] {
  return S.map((spec) => ({
    id: `seed:${spec.slug}`,
    source: 'seed' as const,
    sourceId: spec.slug,
    name: spec.en,
    nameDe: spec.de,
    state: spec.state ?? 'as_sold',
    yieldFactor: spec.yf,
    // German composition tables list fibre separately from carbohydrate.
    carbBasis: 'available' as const,
    basis: spec.basis ?? 'g',
    per100: toNutrients(spec),
    servings: toServings(spec),
    verified: true,
    provenance: 'Standard-Nährwerttabelle',
    createdAt: now,
    updatedAt: now,
    useCount: 0,
  }))
}

export const SEED_COUNT = S.length
