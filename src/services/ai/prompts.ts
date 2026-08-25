/**
 * Prompts and response schemas for the two AI paths.
 *
 * One rule dominates both: **the model never returns calories or macros.**
 * It returns *what it saw* — food names, portions and preparation — and the
 * app resolves those against real composition data. A model that invents
 * "312 kcal" is unauditable and unfixable; a model that says "about 150 g of
 * chicken breast, pan-fried" can be checked, corrected, and re-resolved
 * against a database entry the user can open.
 *
 * The interface is English but the food is bought in Germany, so both prompts
 * accept German or English input and return an English name plus the German
 * one where it exists — the German name is often the only thing that matches a
 * product in the database.
 */

export const PHOTO_SYSTEM = `You analyse photographs of meals for someone tracking their macros. They live in Germany, so German products and dishes are common.

YOUR JOB: describe precisely WHAT is in the photo and HOW MUCH of it. You do NOT calculate calories or macronutrients — the app resolves those against a nutrition database.

RULES:
1. Break the meal into individual ingredients. "Chicken with rice and broccoli" is THREE entries, not one.
2. Estimate the portion of each ingredient. Prefer a household measure (slice, tbsp, tsp, piece, handful, pot, portion) or, where that does not fit, a mass in grams.
3. State the preparation: raw, cooked, or as sold. This changes the weight substantially — cooked meat has lost water, cooked rice and pasta have absorbed it.
4. INVISIBLE INGREDIENTS ARE THE BIGGEST SOURCE OF ERROR. Oil, butter, sugar, cream and sauces are calorie-dense and usually impossible to see. If you suspect they were used, list them as their own entry with "assumed": true, and ask a short follow-up question about them.
5. Be honest about uncertainty. If you cannot judge a portion, say so with a low confidence value — do not guess confidently.
6. Give "name" in English. If the item is a German product or dish, ALSO give "germanName" with the German name exactly as it would appear in a German shop (e.g. "Vollkornbrot", "Magerquark", "Bratwurst") — that is often the only string that will match the database.
7. Name a brand only if it is clearly legible in the photo.
8. If there is no food in the photo, return an empty list and explain in "note".

SIZE REFERENCES: a standard German dinner plate is 26–28 cm across, a fork is 19–20 cm, a 330 ml can is 11.5 cm tall. Use whatever reference objects are visible and say which you used in "anchors".`

export const PHOTO_TOOL = {
  name: 'log_meal',
  description: 'Record the foods identified in the photo with estimated portions.',
  schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        description: 'Each identified ingredient separately.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'English food name, e.g. "chicken breast".' },
            germanName: {
              type: 'string',
              description: 'German name if this is a German product or dish, e.g. "Hähnchenbrustfilet".',
            },
            brand: { type: 'string', description: 'Only if the brand is clearly legible.' },
            quantity: { type: 'number', description: 'Amount, in the unit given by "measure".' },
            measure: {
              type: 'string',
              description:
                'A household measure (slice, tbsp, tsp, piece, handful, pot, glass, portion, can) OR "g" / "ml".',
            },
            state: {
              type: 'string',
              enum: ['raw', 'cooked', 'as_sold'],
              description: 'The state this portion is being weighed in.',
            },
            assumed: {
              type: 'boolean',
              description: 'true if not visible but inferred (oil, sugar, butter).',
            },
            confidence: { type: 'number', description: '0 to 1, how sure you are of this portion.' },
          },
          required: ['name', 'quantity', 'measure', 'state', 'confidence'],
        },
      },
      dish: { type: 'string', description: 'Name of the overall dish, e.g. "chicken stir-fry with rice".' },
      anchors: {
        type: 'array',
        items: { type: 'string' },
        description: 'Reference objects you used to judge size (plate, fork, hand, can).',
      },
      questions: {
        type: 'array',
        description:
          'At most 3 short questions about invisible ingredients that would most improve the estimate.',
        items: {
          type: 'object',
          properties: {
            question: { type: 'string', description: 'The question, in English, kept short.' },
            affects: { type: 'string', description: 'Which entry it relates to.' },
            options: { type: 'array', items: { type: 'string' }, description: '2–4 answer options.' },
          },
          required: ['question', 'options'],
        },
      },
      overallConfidence: { type: 'number', description: '0 to 1 for the estimate as a whole.' },
      note: { type: 'string', description: 'A short note to the user, if needed.' },
    },
    required: ['items', 'overallConfidence'],
  },
} as const

export const VOICE_SYSTEM = `You turn spoken or typed descriptions of meals into structured entries, for someone in Germany tracking their macros. Input may be English, German, or a mix — German food names are common even in an English sentence.

YOUR JOB: split the text into individual foods with quantity, measure and state. You do NOT calculate calories, and you do NOT convert household measures into grams — the app resolves those against its own table.

RULES:
1. Return "measure" as the household measure the user actually said (slice, tbsp, tsp, piece, pot, glass, handful, portion, can, pack) — or "g" / "ml" if they gave a mass.
2. NEVER convert a household measure to grams yourself. "Two slices of bread" is quantity 2, measure "slice" — not 90 g.
3. Handle both decimal conventions: "1,5 litres" and "1.5 litres" are both 1.5. Convert litres to ml and kilograms to g.
4. Resolve spoken fractions: "half a chicken" = 0.5, "one and a half rolls" = 1.5, "a quarter of a pizza" = 0.25, "anderthalb" = 1.5.
5. Do NOT split German compound nouns: "Hähnchenbrustfilet" is ONE food, not "Hähnchen" + "Brust" + "Filet".
6. Capture preparation: "fried chicken breast" is state "cooked", "raw chicken breast" is "raw", a packaged product is "as_sold".
7. Give "name" in English, and "germanName" as well whenever the item is a German product or dish — that is often the only string that matches the database.
8. If no amount is given, assume a normal portion and set confidence low.
9. Set "meal" only if the text says which meal it was.`

export const VOICE_TOOL = {
  name: 'parse_meal_text',
  description: 'Split the text into individual food entries.',
  schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'English food name.' },
            germanName: { type: 'string', description: 'German name, if this is a German product or dish.' },
            brand: { type: 'string' },
            quantity: { type: 'number' },
            measure: {
              type: 'string',
              description: 'The household measure the user said, verbatim, or "g" / "ml" for a mass.',
            },
            state: { type: 'string', enum: ['raw', 'cooked', 'as_sold'] },
            confidence: { type: 'number' },
          },
          required: ['name', 'quantity', 'measure', 'state', 'confidence'],
        },
      },
      meal: {
        type: 'string',
        enum: ['breakfast', 'lunch', 'dinner', 'snack'],
        description: 'Only set if stated in the text.',
      },
      note: { type: 'string' },
    },
    required: ['items'],
  },
} as const

/** Shape returned by both tools. */
export interface AiFoodItem {
  name: string
  /** German name, when the item is a German product — often the better match. */
  germanName?: string
  brand?: string
  quantity: number
  measure: string
  state: 'raw' | 'cooked' | 'as_sold'
  assumed?: boolean
  confidence: number
}

export interface PhotoResult {
  items: AiFoodItem[]
  dish?: string
  anchors?: string[]
  questions?: Array<{ question: string; affects?: string; options: string[] }>
  overallConfidence: number
  note?: string
}

export interface VoiceResult {
  items: AiFoodItem[]
  meal?: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  note?: string
}
