import { parseNumber } from '../lib/format'

/**
 * Household measures, German and English.
 *
 * No open dataset for the German side exists — the national nutrition surveys
 * used interviewer-administered photo portion books, which are study
 * instruments, not lookup tables. So this is hand-curated, and it is the piece
 * without which "two slices of bread with butter" cannot become grams.
 *
 * Both languages are carried deliberately: the interface is English, but the
 * food is bought in German shops, so a user will say "a slice of Vollkornbrot"
 * or "zwei Scheiben Brot" interchangeably. Aliases and food keywords cover
 * both, and masses follow German retail conventions because that is what is
 * actually in the fridge.
 *
 * Two levels of resolution:
 *   1. A food-specific mass, where the measure means something concrete for
 *      that food ("eine Scheibe Toastbrot" is 28 g, "eine Scheibe Brot" 45 g).
 *   2. A generic fallback, used when the food is unknown.
 *
 * Masses are typical German retail/domestic values, deliberately conservative:
 * a household measure is inherently ±20–30 %, and the UI must say so rather
 * than implying a weighed number.
 */

export interface MeasureDef {
  /** Canonical key. */
  key: string
  /** Everything a user might say or dictate for this measure. */
  aliases: string[]
  /** Generic mass in grams (or ml for liquids) when the food is unknown. */
  generic: number
  unit: 'g' | 'ml'
  /** Food-keyword → mass overrides, matched as substrings, longest first. */
  perFood?: Record<string, number>
  /** Rough ±fraction on the generic value, surfaced as uncertainty. */
  spread: number
}

export const MEASURES: MeasureDef[] = [
  {
    key: 'scheibe',
    aliases: ['scheibe', 'scheiben', 'schnitte', 'schnitten', 'slice', 'slices'],
    generic: 40,
    unit: 'g',
    spread: 0.3,
    perFood: {
      toastbrot: 28,
      toast: 28,
      'white bread': 28,
      vollkornbrot: 45,
      mischbrot: 45,
      roggenbrot: 45,
      graubrot: 45,
      brot: 45,
      bread: 45,
      knäckebrot: 10,
      crispbread: 10,
      pumpernickel: 30,
      käse: 30,
      cheese: 30,
      gouda: 30,
      emmentaler: 30,
      schmelzkäse: 20,
      salami: 10,
      wurst: 15,
      schinken: 25,
      ham: 25,
      kochschinken: 25,
      putenbrust: 20,
      leberwurst: 20,
      gurke: 8,
      cucumber: 8,
      tomate: 15,
      tomato: 15,
      zwiebel: 10,
      ananas: 80,
      zitrone: 8,
    },
  },
  {
    key: 'el',
    aliases: ['el', 'esslöffel', 'esslöffeln', 'essloeffel', 'tablespoon', 'tablespoons', 'tbsp'],
    generic: 15,
    unit: 'g',
    spread: 0.25,
    perFood: {
      öl: 12,
      oil: 12,
      olivenöl: 12,
      'olive oil': 12,
      rapsöl: 12,
      butter: 15,
      margarine: 15,
      zucker: 15,
      sugar: 15,
      mehl: 10,
      flour: 10,
      stärke: 10,
      honig: 20,
      honey: 20,
      marmelade: 20,
      jam: 20,
      senf: 15,
      ketchup: 15,
      mayonnaise: 15,
      quark: 30,
      joghurt: 20,
      yoghurt: 20,
      yogurt: 20,
      sahne: 15,
      cream: 15,
      frischkäse: 20,
      erdnussbutter: 16,
      'peanut butter': 16,
      haferflocken: 12,
      oats: 12,
      reis: 15,
      salz: 18,
      proteinpulver: 12,
      whey: 12,
    },
  },
  {
    key: 'tl',
    aliases: ['tl', 'teelöffel', 'teeloeffel', 'teaspoon', 'teaspoons', 'tsp'],
    generic: 5,
    unit: 'g',
    spread: 0.25,
    perFood: { öl: 4, oil: 4, butter: 5, zucker: 4, sugar: 4, honig: 7, honey: 7, salz: 6, salt: 6, mehl: 3, flour: 3, senf: 5, kaffee: 2, coffee: 2 },
  },
  {
    key: 'becher',
    aliases: ['becher', 'bechern', 'pot', 'pots', 'tub', 'tubs', 'container'],
    generic: 200,
    unit: 'g',
    spread: 0.25,
    perFood: { joghurt: 150, yoghurt: 150, yogurt: 150, skyr: 150, quark: 250, magerquark: 250, 'cottage cheese': 200, hüttenkäse: 200, sahne: 200, pudding: 125 },
  },
  {
    key: 'tasse',
    aliases: ['tasse', 'tassen', 'cup', 'cups', 'mug'],
    generic: 200,
    unit: 'ml',
    spread: 0.2,
    perFood: { kaffee: 200, coffee: 200, tee: 200, tea: 200, mehl: 120, flour: 120, reis: 180, rice: 180, zucker: 200, sugar: 200, haferflocken: 90, oats: 90, milch: 200, milk: 200 },
  },
  {
    key: 'glas',
    aliases: ['glas', 'gläser', 'glaeser', 'glass', 'glasses'],
    generic: 200,
    unit: 'ml',
    spread: 0.25,
    perFood: { bier: 330, beer: 330, wein: 200, wine: 200, sekt: 100, saft: 200, juice: 200, wasser: 250, water: 250, milch: 200, milk: 200 },
  },
  {
    key: 'handvoll',
    aliases: ['handvoll', 'hand voll', 'händevoll', 'handful', 'handfuls'],
    generic: 30,
    unit: 'g',
    spread: 0.4,
    perFood: { nüsse: 25, nuts: 25, mandeln: 25, almonds: 25, walnüsse: 25, walnuts: 25, cashews: 25, chips: 25, crisps: 25, beeren: 80, berries: 80, heidelbeeren: 80, blueberries: 80, rosinen: 30, raisins: 30, müsli: 40, muesli: 40, granola: 45, salat: 20 },
  },
  {
    key: 'stück',
    aliases: ['stück', 'stücke', 'stk', 'stueck', 'piece', 'pieces', 'item', 'whole'],
    generic: 100,
    unit: 'g',
    spread: 0.4,
    perFood: {
      ei: 58, egg: 58, brötchen: 55, semmel: 55, schrippe: 55, roll: 55,
      croissant: 60, banane: 118, banana: 118, apfel: 180, apple: 180,
      orange: 150, birne: 175, pear: 175, kiwi: 75, tomate: 120, tomato: 120,
      paprika: 150, pepper: 150, karotte: 70, carrot: 70, kartoffel: 150,
      potato: 150, zwiebel: 110, onion: 110, knoblauchzehe: 3,
      pizza: 350, döner: 400, kebab: 400, currywurst: 150, bratwurst: 100,
      sausage: 100, frikadelle: 80, meatball: 80, keks: 12, biscuit: 12,
      cookie: 14, würfelzucker: 3, riegel: 25, schokoriegel: 50,
    },
  },
  {
    key: 'prise',
    aliases: ['prise', 'prisen', 'pinch', 'pinches'],
    generic: 0.4,
    unit: 'g',
    spread: 0.5,
  },
  {
    key: 'schuss',
    aliases: ['schuss', 'spritzer', 'splash', 'dash', 'drizzle'],
    generic: 15,
    unit: 'ml',
    spread: 0.5,
    perFood: { milch: 20, sahne: 15, öl: 10, essig: 10, zitrone: 5 },
  },
  {
    key: 'portion',
    aliases: ['portion', 'portionen', 'serving', 'servings', 'helping'],
    generic: 150,
    unit: 'g',
    spread: 0.4,
    perFood: { nudeln: 85, pasta: 85, reis: 75, rice: 75, müsli: 50, muesli: 50, haferflocken: 50, oats: 50, fleisch: 150, meat: 150, chicken: 150, fisch: 140, fish: 140, gemüse: 200, vegetables: 200, salat: 100, salad: 100, pommes: 150, fries: 150 },
  },
  {
    key: 'kelle',
    aliases: ['kelle', 'schöpfkelle', 'suppenkelle', 'ladle', 'ladles'],
    generic: 150,
    unit: 'ml',
    spread: 0.3,
  },
  {
    key: 'kugel',
    aliases: ['kugel', 'kugeln', 'scoop', 'scoops', 'ball'],
    generic: 50,
    unit: 'g',
    spread: 0.3,
    perFood: { eis: 50, mozzarella: 125 },
  },
  {
    key: 'zehe',
    aliases: ['zehe', 'zehen', 'clove', 'cloves'],
    generic: 3,
    unit: 'g',
    spread: 0.4,
  },
  {
    key: 'blatt',
    aliases: ['blatt', 'blätter', 'leaf', 'leaves'],
    generic: 10,
    unit: 'g',
    spread: 0.4,
    perFood: { salat: 10, basilikum: 0.5, lasagneplatte: 15 },
  },
  {
    key: 'bund',
    aliases: ['bund', 'bunch', 'bunches'],
    generic: 40,
    unit: 'g',
    spread: 0.4,
    perFood: { petersilie: 30, schnittlauch: 25, radieschen: 150, frühlingszwiebeln: 100, möhren: 400 },
  },
  {
    key: 'stange',
    aliases: ['stange', 'stangen', 'stalk', 'stalks', 'stick'],
    generic: 100,
    unit: 'g',
    spread: 0.4,
    perFood: { lauch: 200, porree: 200, sellerie: 60, zimt: 2, spargel: 20 },
  },
  {
    key: 'dose',
    aliases: ['dose', 'dosen', 'can', 'cans', 'tin', 'tins'],
    generic: 400,
    unit: 'g',
    spread: 0.2,
    perFood: { cola: 330, bier: 500, thunfisch: 110, mais: 285, kidneybohnen: 400, kichererbsen: 400, tomaten: 400 },
  },
  {
    key: 'packung',
    aliases: ['packung', 'packungen', 'päckchen', 'paeckchen', 'pack', 'packs', 'packet', 'package'],
    generic: 250,
    unit: 'g',
    spread: 0.4,
    perFood: { butter: 250, quark: 500, nudeln: 500, reis: 500, tofu: 200, mozzarella: 125, hackfleisch: 500 },
  },
  {
    key: 'flasche',
    aliases: ['flasche', 'flaschen', 'bottle', 'bottles'],
    generic: 500,
    unit: 'ml',
    spread: 0.3,
    perFood: { bier: 500, wasser: 500, wein: 750, saft: 1000, cola: 500 },
  },
  {
    key: 'riegel',
    aliases: ['riegel', 'bar', 'bars'],
    generic: 40,
    unit: 'g',
    spread: 0.3,
    perFood: { schokolade: 25, proteinriegel: 60, müsliriegel: 25 },
  },
]

/** Lexical fractions and numerals, German and English, as actually spoken. */
export const SPOKEN_QUANTITIES: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  half: 0.5, quarter: 0.25, third: 1 / 3, 'three quarters': 0.75,
  'one and a half': 1.5, couple: 2, few: 3,
  ein: 1, eine: 1, einen: 1, einem: 1, eins: 1,
  zwei: 2, drei: 3, vier: 4, fünf: 5, fuenf: 5, sechs: 6, sieben: 7,
  acht: 8, neun: 9, zehn: 10, elf: 11, zwölf: 12, zwoelf: 12,
  halb: 0.5, halbe: 0.5, halben: 0.5, halbes: 0.5, halber: 0.5,
  viertel: 0.25, drittel: 1 / 3,
  dreiviertel: 0.75, 'drei viertel': 0.75,
  anderthalb: 1.5, eineinhalb: 1.5, 'ein einhalb': 1.5,
  zweieinhalb: 2.5, dutzend: 12,
}

const ALIAS_INDEX = new Map<string, MeasureDef>()
for (const m of MEASURES) for (const a of m.aliases) ALIAS_INDEX.set(a, m)

export function findMeasure(raw: string): MeasureDef | undefined {
  const k = raw.trim().toLowerCase().replace(/\.$/, '')
  return ALIAS_INDEX.get(k)
}

export interface ResolvedMeasure {
  grams: number
  unit: 'g' | 'ml'
  /** ±fraction on `grams`, so the UI can show an honest range. */
  spread: number
  /** True when a food-specific mass was found rather than the generic one. */
  specific: boolean
  measureKey: string
}

/**
 * Resolve "2 Scheiben Vollkornbrot" to grams.
 *
 * Food matching is by longest substring so "vollkornbrot" wins over "brot",
 * and "magerquark" over "quark".
 */
export function resolveMeasure(
  measure: string,
  quantity: number,
  foodName = '',
): ResolvedMeasure | null {
  const def = findMeasure(measure)
  if (!def) return null

  const food = foodName.toLowerCase()
  let mass = def.generic
  let specific = false

  if (def.perFood) {
    const hit = Object.keys(def.perFood)
      .filter((k) => food.includes(k))
      .sort((a, b) => b.length - a.length)[0]
    if (hit) {
      mass = def.perFood[hit]
      specific = true
    }
  }

  return {
    grams: mass * quantity,
    unit: def.unit,
    // A food-specific value is meaningfully tighter than the generic guess.
    spread: specific ? def.spread * 0.6 : def.spread,
    specific,
    measureKey: def.key,
  }
}

/** Parse a spoken or typed quantity: "1,5", "1.5", "anderthalb", "one and a half". */
export function parseQuantity(raw: string): number | null {
  const s = raw.trim().toLowerCase()
  if (!s) return null

  // "1,5" from a German keyboard and "1.5" from an English one must both work.
  const parsed = parseNumber(s)
  if (parsed != null) return parsed

  // "1/2", "3/4"
  const frac = s.match(/^(\d+)\s*\/\s*(\d+)$/)
  if (frac) return Number(frac[1]) / Number(frac[2])

  if (SPOKEN_QUANTITIES[s] != null) return SPOKEN_QUANTITIES[s]

  // "ein halbes", "zwei einhalb" — sum the recognised words.
  const words = s.split(/\s+/)
  if (words.length > 1 && words.every((w) => SPOKEN_QUANTITIES[w] != null)) {
    return words.reduce((sum, w) => sum + SPOKEN_QUANTITIES[w], 0)
  }
  return null
}

export const MEASURE_KEYS = MEASURES.map((m) => m.key)
