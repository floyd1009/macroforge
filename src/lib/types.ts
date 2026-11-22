/**
 * Core domain types.
 *
 * Two rules shape everything here:
 *  1. Nutrition is stored per 100 g (or 100 ml) — the basis every European
 *     label and Open Food Facts already uses. Portions are conversions on top.
 *  2. A log entry keeps a *snapshot* of the nutrients it was created with.
 *     Editing or re-syncing a food must never silently rewrite past days.
 */

/** Absolute nutrient amounts. Grams unless the name says otherwise. */
export interface Nutrients {
  kcal: number
  protein: number
  carbs: number
  fat: number
  fiber?: number
  sugar?: number
  satFat?: number
  /** Salt in g (EU labels use salt; sodium = salt / 2.5). */
  salt?: number
  /** Ethanol in g — carried separately because it is 7 kcal/g. */
  alcohol?: number
  /** Sugar alcohols in g, at 2.4 kcal/g. */
  polyols?: number
}

export const MACRO_KEYS = ['protein', 'carbs', 'fat'] as const
export type MacroKey = (typeof MACRO_KEYS)[number]

/**
 * Energy conversion factors, kcal per gram.
 *
 * These are the EU LMIV (Reg. 1169/2011) Annex XIV factors, not bare Atwater.
 * The difference matters: a plain 4/4/9 check false-positives on every
 * high-fibre, sugar-alcohol and alcoholic product in the German catalogue.
 */
export const ENERGY_FACTORS = {
  protein: 4,
  /** Available carbohydrate — i.e. excluding fibre. See `CarbBasis`. */
  carbs: 4,
  fat: 9,
  fiber: 2,
  alcohol: 7,
  /** Sugar alcohols (Zuckeraustauschstoffe): xylitol, maltitol, sorbitol… */
  polyol: 2.4,
  organicAcid: 3,
} as const

/** Kept as an alias so the familiar name still resolves. */
export const ATWATER = ENERGY_FACTORS

/**
 * The single most dangerous inconsistency in nutrition data.
 *
 * EU labels and the Bundeslebensmittelschlüssel state **available**
 * carbohydrate: fibre is listed separately and is NOT inside the carb number.
 * USDA FoodData Central states **total** carbohydrate "by difference", which
 * DOES include fibre.
 *
 * Mixing the two in one column is a silent, systematic error equal to the
 * fibre content of every food, and it becomes unrecoverable once it is baked
 * into months of history. Every food therefore records which convention its
 * numbers follow, and everything is normalised to the EU convention on read —
 * because that is what is printed on the packet a German user is holding.
 */
export type CarbBasis = 'available' | 'total'

export type Basis = 'g' | 'ml'

export interface ServingSize {
  /** Human label as it should appear in the picker, e.g. "1 Scheibe (25 g)". */
  label: string
  /** Mass in grams (or volume in ml when the food's basis is 'ml'). */
  amount: number
  isDefault?: boolean
}

/**
 * Raw vs cooked matters more than it looks. Logging 350 g of *cooked* chicken
 * against a *raw* database entry under-counts protein by roughly 30 %, because
 * cooking drives off water and concentrates everything else.
 */
export type FoodState = 'raw' | 'cooked' | 'as_sold'

export type FoodSource =
  | 'off' // Open Food Facts — packaged retail products
  | 'bls' // Bundeslebensmittelschlüssel 4.0 — the German national database
  | 'usda' // USDA FoodData Central
  | 'seed' // bundled everyday staples
  | 'custom' // user-created
  | 'ai' // created by a photo/voice estimate

export interface Food {
  id: string
  source: FoodSource
  /** Barcode for `off`, FDC id for `usda`, slug for `seed`. */
  sourceId?: string
  name: string
  /** German display name when the source provides one. */
  nameDe?: string
  brand?: string
  /** Retail chain this product belongs to, when known (ALDI, REWE, dm, ...). */
  retailer?: string
  state: FoodState
  /**
   * Cooked mass ÷ raw mass. Meat loses ~25–30 % (YF ≈ 0.70–0.75); pasta and
   * rice gain (YF ≈ 2.2–2.6). Present only where the conversion is known.
   */
  yieldFactor?: number
  basis: Basis
  /**
   * Which carbohydrate convention `per100.carbs` follows. Always normalised to
   * 'available' before storage; the field records what the source used so a
   * re-import can be reasoned about.
   */
  carbBasis: CarbBasis
  /** Nutrients per 100 g / 100 ml. The single source of truth. */
  per100: Nutrients
  servings: ServingSize[]
  barcode?: string
  imageUrl?: string
  /**
   * `true` only for data we trust structurally: a bundled seed food, a
   * user-confirmed custom food, or an OFF product with a complete Big-7 panel.
   */
  verified: boolean
  /** Free-form provenance shown in the UI so the user can judge the number. */
  provenance?: string
  createdAt: number
  updatedAt: number
  /** Usage counters drive the "recent + frequent" ranking in search. */
  useCount: number
  lastUsedAt?: number
  favorite?: boolean
  deleted?: boolean
}

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export const MEAL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack']

export type EntryMethod =
  | 'search'
  | 'barcode'
  | 'photo'
  | 'voice'
  | 'quick'
  | 'recipe'
  | 'repeat'

/** How much we trust the numbers on this entry. Drives the UI badge. */
export type Confidence = 'high' | 'medium' | 'low'

/**
 * Where an entry's numbers came from, which is the honest basis for how far
 * off they might be. The percentages are typical kcal error bands from the
 * dietary-assessment literature and EU labelling tolerance — not marketing.
 */
export type Provenance = 'weighed' | 'barcode' | 'menu' | 'photo' | 'voice' | 'manual'

export const PROVENANCE_ERROR: Record<Provenance, { pct: number; label: string }> = {
  // Weighed against a composition table: the table's own analytical error.
  weighed: { pct: 0.05, label: 'weighed' },
  // EU tolerance permits ±20% on macros in the 10–40 g/100 g band, and label
  // energy is calculated rather than measured. "Barcode = truth" is a myth.
  barcode: { pct: 0.15, label: 'barcode' },
  menu: { pct: 0.21, label: 'menu' },
  photo: { pct: 0.25, label: 'photo' },
  voice: { pct: 0.2, label: 'spoken' },
  manual: { pct: 0.2, label: 'manual' },
}

export interface AiEstimateMeta {
  model: string
  /** What the model said it saw, verbatim, for auditing a bad estimate. */
  reasoning?: string
  /** Portion mass the model estimated, before any user correction, in grams. */
  estimatedGrams?: number
  /** ±% the model reported for kcal. */
  uncertaintyPct?: number
  /** Set once the user edits an AI-produced entry — feeds the correction log. */
  correctedByUser?: boolean
  /** Which anchors were available to the estimate (plate, hand, barcode...). */
  anchors?: string[]
}

export interface LogEntry {
  id: string
  /** Local calendar date, 'YYYY-MM-DD'. Never a timestamp — days are local. */
  date: string
  meal: MealSlot
  foodId?: string
  /* --- snapshot ------------------------------------------------------ */
  name: string
  brand?: string
  /** Quantity in `unit`. */
  amount: number
  unit: 'g' | 'ml' | 'serving'
  servingLabel?: string
  /** `amount` resolved to grams/ml, so totals never depend on the food row. */
  resolvedAmount: number
  basis: Basis
  /** Absolute nutrients for this entry. Already multiplied out. */
  nutrients: Nutrients
  /* ------------------------------------------------------------------- */
  method: EntryMethod
  provenance: Provenance
  confidence: Confidence
  ai?: AiEstimateMeta
  photoId?: string
  /** Groups entries created together from one photo/voice capture. */
  captureId?: string
  note?: string
  createdAt: number
  updatedAt: number
  /** Manual ordering within a meal. */
  sort: number
  deleted?: boolean
}

/** A user-defined multi-ingredient food. Expands to its own `Food` on save. */
export interface Recipe {
  id: string
  name: string
  /** Total cooked weight in g — lets us derive per-100g for the whole dish. */
  totalGrams?: number
  portions: number
  ingredients: Array<{
    foodId: string
    name: string
    amount: number
    unit: 'g' | 'ml' | 'serving'
    servingLabel?: string
    resolvedAmount: number
    nutrients: Nutrients
  }>
  createdAt: number
  updatedAt: number
  deleted?: boolean
}

export interface WeightEntry {
  /** 'YYYY-MM-DD' — one weigh-in per day; a second overwrites the first. */
  date: string
  kg: number
  /** Exponentially smoothed trend weight, recomputed on write. */
  trendKg?: number
  bodyFatPct?: number
  note?: string
  createdAt: number
  updatedAt: number
}

/* ---------------------------------------------------------------- *
 * Training
 * ---------------------------------------------------------------- */

export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'abs'
  | 'forearms'
  | 'traps'
  | 'neck'
  | 'cardio'

export interface Exercise {
  id: string
  name: string
  nameDe?: string
  primary: MuscleGroup
  secondary: MuscleGroup[]
  equipment?: string
  /** Bodyweight movements need the user's mass to compute real load. */
  bodyweight?: boolean
  /** Short technique cues shown on the exercise page. */
  cues?: string[]
  /** Smallest load step available for this movement, in kg. */
  incrementKg?: number
  isCustom?: boolean
  useCount: number
  lastUsedAt?: number
  deleted?: boolean
}

/**
 * `warmup` sets never count toward volume or records. `drop` and `failure`
 * count as hard sets; they are labelled so progression ignores them when
 * deciding the next load.
 */
export type SetType = 'normal' | 'warmup' | 'drop' | 'failure'

export interface WorkoutSet {
  id: string
  exerciseId: string
  /** 1-based index within this exercise in this workout. */
  index: number
  weightKg: number
  reps: number
  /** Rate of perceived exertion, 5–10 in half steps. */
  rpe?: number
  rir?: number
  /** Kept in sync with `type === 'warmup'` so older rows still read right. */
  warmup?: boolean
  type?: SetType
  /* Targets copied from the routine when the workout was started, so a later
     edit to the program never rewrites what a past session was aiming for. */
  targetRepMin?: number
  targetRepMax?: number
  targetRir?: number
  /** What the progression rule proposed for this set, for later audit. */
  suggestedKg?: number
  suggestedReps?: number
  /** Set was attempted but failed / cut short. */
  failed?: boolean
  note?: string
  completedAt?: number
}

export interface Workout {
  id: string
  date: string
  name?: string
  startedAt: number
  endedAt?: number
  sets: WorkoutSet[]
  note?: string
  /** Set when the session was started from a program day. */
  programId?: string
  dayId?: string
  /** Display order of exercises; sets alone cannot order an exercise with none logged. */
  exerciseOrder?: string[]
  exerciseNotes?: Record<string, string>
  /** Per-exercise rest in seconds, copied from the routine. */
  restSec?: Record<string, number>
  deleted?: boolean
}

/** One exercise slot inside a program day. */
export interface RoutineExercise {
  id: string
  exerciseId: string
  sets: number
  repMin: number
  repMax: number
  /** Target reps in reserve for the working sets. */
  rir: number
  restSec: number
  note?: string
}

export interface RoutineDay {
  id: string
  name: string
  exercises: RoutineExercise[]
}

export interface Program {
  id: string
  name: string
  description?: string
  days: RoutineDay[]
  /** Id of the bundled template this was copied from, if any. */
  templateId?: string
  /** 1 for the program currently being run, else 0 (IndexedDB cannot index booleans). */
  active: 0 | 1
  /** Index into `days` of the session that comes next. */
  nextDayIndex: number
  createdAt: number
  updatedAt: number
  deleted?: boolean
}

/* ---------------------------------------------------------------- *
 * Goals & settings
 * ---------------------------------------------------------------- */

export type Sex = 'male' | 'female'
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'high' | 'athlete'
export type GoalDirection = 'lose' | 'maintain' | 'gain'

/**
 * How the calories left after protein are divided between carbohydrate and fat.
 * Protein is set per kg of body mass first, because it has a requirement and
 * the other two are a preference.
 */
export type MacroStyle = 'balanced' | 'low_fat' | 'low_carb' | 'keto'

export interface MacroTargets {
  kcal: number
  protein: number
  carbs: number
  fat: number
  fiber?: number
}

export interface Profile {
  id: 'me'
  name?: string
  sex: Sex
  /** ISO date; age is derived so it stays correct over time. */
  birthDate?: string
  heightCm: number
  activity: ActivityLevel
  goal: GoalDirection
  /** Target rate of change in kg per week. Negative for a cut. */
  rateKgPerWeek: number
  /** Manual override; when null, targets come from the adaptive engine. */
  manualTargets?: MacroTargets | null
  proteinPerKg: number
  fatPerKg: number
  /** Body weight the goal ends at. Optional: a rate alone is a valid goal. */
  goalWeightKg?: number
  macroStyle: MacroStyle
  /** Weekday (0 = Sunday) on which the weekly check-in falls due. */
  checkinDay: 0 | 1 | 2 | 3 | 4 | 5 | 6
  /** Lowest daily calorie target the coach will ever set. 0 disables the floor. */
  kcalFloor: number
  /** Weekdays (0 = Sunday) that get extra calories, paid for by the others. */
  highDays: number[]
  /** Fraction above the weekly mean that a high day receives, e.g. 0.15. */
  highDayBoost: number
  /**
   * Whether food is normally weighed raw or after cooking.
   *
   * This is not cosmetic. Logging 150 g of *cooked* chicken against a raw
   * database entry under-counts protein by roughly 28 %, because cooking
   * drives off water and concentrates everything else. Knowing which the user
   * means lets search prefer the right variant and the portion sheet default
   * to the right conversion.
   */
  weighsFood: 'raw' | 'cooked'
  units: 'metric' | 'imperial'
  locale: 'en' | 'de'
  createdAt: number
  updatedAt: number
}

/**
 * A weekly check-in: the moment targets are allowed to change.
 *
 * Between check-ins the targets are frozen. Recomputing them daily makes the
 * number on the home screen wobble with every weigh-in, and a target that
 * moves while you are trying to hit it is not a target.
 */
export interface CheckIn {
  /** Local date the check-in was accepted; one per day at most. */
  id: string
  date: string
  /** Expenditure estimate the new targets were built on, kcal/day. */
  tdee: number
  prevTdee?: number
  targets: MacroTargets
  prevTargets?: MacroTargets
  trendKg?: number
  /** Change in trend weight since the previous check-in (or over 7 days). */
  trendDeltaKg?: number
  /** Mean logged intake over the days since the previous check-in. */
  avgIntake?: number
  daysLogged: number
  weighIns: number
  /** Goal rate at the time, kg/week, so history stays interpretable. */
  rateKgPerWeek: number
  dataWeight: number
  createdAt: number
}

/** Tape measurements in cm, keyed by site. One row per day. */
export interface BodyMeasurement {
  date: string
  values: Record<string, number>
  updatedAt: number
}

export interface ProgressPhoto {
  id: string
  date: string
  angle: 'front' | 'side' | 'back'
  /** Row in `photos` holding the image blob. */
  photoId: string
  createdAt: number
}

export type AiProvider = 'anthropic' | 'openai' | 'gemini' | 'proxy'

export interface AiSettings {
  provider: AiProvider
  /** Stored locally on device only. Never transmitted anywhere but the API. */
  apiKey?: string
  model?: string
  /** Optional self-hosted proxy so the key never lives in the browser. */
  proxyUrl?: string
  enabled: boolean
}

export interface Settings {
  id: 'settings'
  ai: AiSettings
  /** Smoothing factor for the weight trend line (0–1). */
  weightTrendAlpha: number
  firstDayOfWeek: 0 | 1
  showFiber: boolean
  keepPhotos: boolean
  /** Default rest between sets in seconds, when a routine does not set one. */
  restSec: number
  restSound: boolean
  /** Barbell mass and the plates available per side, for the plate calculator. */
  barKg: number
  platesKg: number[]
  updatedAt: number
}

/** Records every time a user fixes an AI estimate, to measure and improve it. */
export interface CorrectionLog {
  id: string
  entryId: string
  capturedAt: number
  method: 'photo' | 'voice'
  model: string
  before: { name: string; grams: number; nutrients: Nutrients }
  after: { name: string; grams: number; nutrients: Nutrients }
}

export interface StoredPhoto {
  id: string
  blob: Blob
  width: number
  height: number
  createdAt: number
}
