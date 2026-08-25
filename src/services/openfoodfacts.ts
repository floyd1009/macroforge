import { checkEnergy, kcalFromMacros, kjToKcal, sodiumToSalt } from '../lib/nutrition'
import type { Food, Nutrients, ServingSize } from '../lib/types'

/**
 * Open Food Facts client.
 *
 * OFF is the only free, open, no-key database with real German retail coverage
 * — including the private labels the user actually buys (ja!, Gut&Günstig,
 * Milbona, dmBio, K-Classic). It is crowdsourced, which means coverage is
 * excellent and *quality is not guaranteed*: missing panels, kJ-only entries,
 * sodium/salt mix-ups and outright typos are common. Every product therefore
 * goes through `normalise()` before it is allowed near the log.
 */

/**
 * Always the `world` host.
 *
 * The country subdomains (de.openfoodfacts.org and friends) do NOT send
 * `Access-Control-Allow-Origin`, so a browser blocks every request to them —
 * verified against the live API. `world` sends `allow-origin: *`, and passing
 * `lc=de` plus a country filter returns exactly the same German-localised
 * results, so there is nothing lost by never touching the `de` host.
 */
const HOST = 'https://world.openfoodfacts.org'

/** Only ask for what we use — full product documents are ~50 kB each. */
const FIELDS = [
  'code',
  'product_name',
  'product_name_de',
  'generic_name',
  'generic_name_de',
  'brands',
  'quantity',
  'serving_size',
  'serving_quantity',
  'nutriments',
  'image_front_small_url',
  'image_front_url',
  'countries_tags',
  'nutriscore_grade',
  'nova_group',
  'stores',
  'stores_tags',
  'completeness',
].join(',')

/* ------------------------------------------------------------------ *
 * Rate limiting
 *
 * OFF publishes limits (product reads are generous, search is not) and asks
 * clients to behave. A shared queue keeps us well under, and matters most on
 * the search screen where every keystroke wants to fire a request.
 * ------------------------------------------------------------------ */

class RateLimiter {
  private queue: Array<() => void> = []
  private timestamps: number[] = []
  private readonly max: number
  private readonly windowMs: number

  constructor(max: number, windowMs: number) {
    this.max = max
    this.windowMs = windowMs
  }

  async acquire(): Promise<void> {
    return new Promise((resolve) => {
      this.queue.push(resolve)
      this.drain()
    })
  }

  private drain() {
    const now = Date.now()
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs)
    while (this.queue.length && this.timestamps.length < this.max) {
      this.timestamps.push(Date.now())
      this.queue.shift()!()
    }
    if (this.queue.length) {
      const wait = this.windowMs - (now - this.timestamps[0]) + 20
      setTimeout(() => this.drain(), Math.max(50, wait))
    }
  }
}

// Deliberately below the published ceilings, leaving headroom for retries.
const productLimiter = new RateLimiter(60, 60_000)
const searchLimiter = new RateLimiter(8, 60_000)

export class OffError extends Error {
  readonly kind: 'network' | 'notfound' | 'ratelimit' | 'bad-data'

  constructor(message: string, kind: 'network' | 'notfound' | 'ratelimit' | 'bad-data') {
    super(message)
    this.kind = kind
  }
}

/**
 * OFF's search backend sheds load aggressively: measured against the live API,
 * roughly 6 in 10 search requests come back as an instant 503. They fail in
 * ~200 ms, so retrying is cheap and effective — retries took a measured 37 %
 * success rate to 100 % across 12 German queries at 1.7 attempts on average.
 */
const RETRY_DELAYS = [0, 250, 600, 1200, 2000]

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function get(url: string, limiter: RateLimiter, signal?: AbortSignal): Promise<any> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    if (RETRY_DELAYS[attempt]) await sleep(RETRY_DELAYS[attempt])
    await limiter.acquire()

    let res: Response
    try {
      // Browsers forbid setting User-Agent, so OFF sees the browser's own. That
      // is expected for web clients; we identify the app via query parameters,
      // which OFF also reads.
      res = await fetch(url, { signal, headers: { Accept: 'application/json' } })
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e
      lastError = new OffError('Keine Verbindung zu Open Food Facts', 'network')
      continue
    }

    if (res.ok) {
      try {
        return await res.json()
      } catch {
        lastError = new OffError('Unlesbare Antwort von Open Food Facts', 'bad-data')
        continue
      }
    }

    if (res.status === 429) {
      lastError = new OffError('Zu viele Anfragen — kurz warten', 'ratelimit')
      continue
    }
    // 5xx is the load shedder and is worth retrying; 4xx is not.
    if (res.status >= 500) {
      lastError = new OffError(`Open Food Facts überlastet (${res.status})`, 'network')
      continue
    }
    throw new OffError(`Open Food Facts antwortete mit ${res.status}`, 'network')
  }

  throw lastError ?? new OffError('Open Food Facts nicht erreichbar', 'network')
}

/* ------------------------------------------------------------------ *
 * Normalisation
 * ------------------------------------------------------------------ */

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) ? n : undefined
}

export interface NormalisedProduct {
  food: Food
  /** Non-fatal data-quality notes to surface next to the numbers. */
  warnings: string[]
  /** Fraction 0–1 of how trustworthy the panel looks. */
  quality: number
}

/**
 * Turn a raw OFF product into a `Food`, or reject it.
 *
 * Rejection is a feature. A product with no usable energy value is worse than
 * no result at all, because it silently logs zero calories.
 */
export function normalise(p: any): NormalisedProduct | null {
  if (!p || typeof p !== 'object') return null
  const nut = p.nutriments ?? {}
  const warnings: string[] = []

  // Energy: prefer the explicit kcal field, fall back to converting kJ.
  let kcal = num(nut['energy-kcal_100g'])
  if (kcal == null) {
    const kj = num(nut['energy-kj_100g']) ?? num(nut['energy_100g'])
    if (kj != null) {
      kcal = kjToKcal(kj)
      warnings.push('Kalorien aus kJ umgerechnet')
    }
  }

  const protein = num(nut['proteins_100g'])
  const carbs = num(nut['carbohydrates_100g'])
  const fat = num(nut['fat_100g'])

  // Without energy *and* at least one macro there is nothing to log.
  if (kcal == null && protein == null && carbs == null && fat == null) return null

  const per100: Nutrients = {
    kcal: kcal ?? 0,
    protein: protein ?? 0,
    carbs: carbs ?? 0,
    fat: fat ?? 0,
  }

  const fiber = num(nut['fiber_100g'])
  const sugar = num(nut['sugars_100g'])
  const satFat = num(nut['saturated-fat_100g'])
  let salt = num(nut['salt_100g'])
  if (salt == null) {
    const sodiumG = num(nut['sodium_100g'])
    // OFF stores sodium in g/100g despite the name; some entries use mg.
    if (sodiumG != null) salt = sodiumToSalt(sodiumG > 10 ? sodiumG : sodiumG * 1000)
  }
  if (fiber != null) per100.fiber = fiber
  if (sugar != null) per100.sugar = sugar
  if (satFat != null) per100.satFat = satFat
  if (salt != null) per100.salt = salt

  // --- sanity gates -------------------------------------------------
  const macroSum = per100.protein + per100.carbs + per100.fat
  if (macroSum > 100.5) {
    // Physically impossible in 100 g of anything.
    return null
  }
  if (per100.kcal > 900) return null // nothing beats pure fat at 884
  if (per100.protein < 0 || per100.carbs < 0 || per100.fat < 0) return null
  if (per100.fiber != null && per100.fiber > per100.carbs + 5) {
    warnings.push('Ballaststoffe höher als Kohlenhydrate — Angabe prüfen')
  }
  if (per100.satFat != null && per100.satFat > per100.fat + 0.5) {
    warnings.push('Gesättigte Fette höher als Gesamtfett — Angabe prüfen')
  }

  if (per100.kcal === 0 && macroSum > 1) {
    // One shared implementation of the LMIV Annex XIV factors; a local copy
    // here would silently drift from the rest of the app.
    per100.kcal = kcalFromMacros(per100)
    warnings.push('Kalorien fehlten — aus Makros berechnet')
  }

  const energy = checkEnergy(per100)
  if (energy.status === 'suspect' && energy.message) warnings.push(energy.message)

  // --- portions -----------------------------------------------------
  const servings: ServingSize[] = []
  const servingQty = num(p.serving_quantity)
  if (servingQty && servingQty > 0 && servingQty < 2000) {
    servings.push({ label: `1 Portion (${Math.round(servingQty)} g)`, amount: servingQty, isDefault: true })
  } else if (typeof p.serving_size === 'string') {
    const m = p.serving_size.match(/([\d.,]+)\s*(g|ml)/i)
    const v = m ? num(m[1]) : undefined
    if (v && v > 0 && v < 2000) {
      servings.push({ label: `1 Portion (${Math.round(v)} ${m![2].toLowerCase()})`, amount: v, isDefault: true })
    }
  }
  // Whole-package portion, when the net quantity is a clean number.
  const pack = typeof p.quantity === 'string' ? p.quantity.match(/([\d.,]+)\s*(g|ml)/i) : null
  const packQty = pack ? num(pack[1]) : undefined
  if (packQty && packQty > 0 && packQty <= 5000) {
    servings.push({ label: `Ganze Packung (${Math.round(packQty)} ${pack![2].toLowerCase()})`, amount: packQty })
  }
  const isDrink = /ml|l$/i.test(p.quantity ?? '') || /getränk|drink|saft|wasser|cola/i.test(p.product_name ?? '')
  servings.push({ label: isDrink ? '100 ml' : '100 g', amount: 100, isDefault: servings.length === 0 })

  const str = (v: unknown): string | undefined =>
    typeof v === 'string' && v.trim() ? v.trim() : undefined
  const nameDe = str(p.product_name_de)
  const nameAny = str(p.product_name)
  const name = nameDe ?? nameAny ?? str(p.generic_name_de) ?? str(p.generic_name)
  if (!name) return null

  // --- quality score ------------------------------------------------
  let quality = 0.4
  if (kcal != null) quality += 0.2
  if (protein != null && carbs != null && fat != null) quality += 0.25
  if (salt != null || satFat != null) quality += 0.05
  if (servingQty) quality += 0.05
  if (energy.status === 'ok') quality += 0.05
  if (warnings.length) quality -= 0.15 * warnings.length
  quality = Math.max(0, Math.min(1, quality))

  // `brands` is a comma string on search.pl and an array on search-a-licious.
  const brands: string = Array.isArray(p.brands) ? p.brands.join(', ') : (p.brands ?? '')
  const stores: string = Array.isArray(p.stores) ? p.stores.join(', ') : (p.stores ?? '')
  const retailer = detectRetailer(brands, stores)

  const food: Food = {
    id: `off:${p.code}`,
    source: 'off',
    sourceId: String(p.code),
    barcode: String(p.code),
    name: nameAny ?? name,
    nameDe,
    brand: brands.split(',')[0]?.trim() || undefined,
    retailer,
    // A packaged product is logged as sold; no raw/cooked conversion applies.
    state: 'as_sold',
    // EU labels (Reg. 1169/2011) list fibre separately from carbohydrate, so
    // OFF's European entries are already "available carbs".
    carbBasis: 'available',
    basis: isDrink ? 'ml' : 'g',
    per100,
    servings,
    imageUrl: p.image_front_small_url || p.image_front_url || undefined,
    // "Verified" here means structurally complete, not human-checked.
    verified: quality >= 0.8 && warnings.length === 0,
    provenance: 'Open Food Facts',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    useCount: 0,
  }

  return { food, warnings, quality }
}

/** Map a brand/store string onto the German chain it belongs to. */
const RETAILER_PATTERNS: Array<[RegExp, string]> = [
  // Note the trailing `\b` is applied per-alternative, not to the group: a
  // brand ending in punctuation (REWE's "ja!") has no word boundary after it.
  [/\b(?:aldi|milsani|gut bio|fitmaker|mamia|almare|milfina|choceur)\b/i, 'ALDI'],
  [/\b(?:lidl|milbona|combino|dulano|pilos|crivit|freeway|vemondo)\b/i, 'Lidl'],
  [/(?:\brewe\b|\bja!|\bbeste wahl\b)/i, 'REWE'],
  [/\b(?:edeka|gut ?& ?günstig|gut und günstig|elkos)\b/i, 'EDEKA'],
  [/(?:\bdmbio\b|\bdas gesunde plus\b|\bsanft ?& ?sicher\b|\bdm\b)/i, 'dm'],
  [/\b(?:kaufland|k-?classic|k-take it veggie)\b/i, 'Kaufland'],
  [/\b(?:penny|san fabio|mibell)\b/i, 'PENNY'],
  [/\b(?:netto marken|netto|bio bio)\b/i, 'Netto'],
  [/\b(?:rossmann|enerbio|promarkt)\b/i, 'Rossmann'],
]

export function detectRetailer(brands: string, stores: string): string | undefined {
  const hay = `${brands} ${stores}`
  for (const [re, name] of RETAILER_PATTERNS) if (re.test(hay)) return name
  return undefined
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

const APP_TAG = 'app_name=MacroForge&app_version=0.1&app_uuid=web'

export async function lookupBarcode(barcode: string, signal?: AbortSignal): Promise<NormalisedProduct | null> {
  const clean = barcode.replace(/\D/g, '')
  if (clean.length < 8) throw new OffError('Ungültiger Barcode', 'bad-data')

  const url = `${HOST}/api/v2/product/${clean}.json?fields=${FIELDS}&lc=de&${APP_TAG}`
  const json = await get(url, productLimiter, signal)
  if (json.status !== 1 || !json.product) return null
  return normalise(json.product)
}

export interface SearchOptions {
  signal?: AbortSignal
  page?: number
  pageSize?: number
  /** Restrict to products sold in Germany. On by default. */
  germanyOnly?: boolean
}

export async function searchProducts(
  query: string,
  { signal, page = 1, pageSize = 24, germanyOnly = true }: SearchOptions = {},
): Promise<NormalisedProduct[]> {
  const q = query.trim()
  if (q.length < 2) return []

  const run = async (term: string, restrict: boolean) => {
    const params = new URLSearchParams({
      search_terms: term,
      search_simple: '1',
      action: 'process',
      json: '1',
      page: String(page),
      page_size: String(pageSize),
      fields: FIELDS,
      // Ask for German names and units without leaving the CORS-enabled host.
      lc: 'de',
    })
    if (restrict) params.set('countries_tags_en', 'germany')

    const json = await get(`${HOST}/cgi/search.pl?${params}&${APP_TAG}`, searchLimiter, signal)
    const products: any[] = Array.isArray(json.products) ? json.products : []
    return products
      .map(normalise)
      .filter((x): x is NormalisedProduct => x !== null)
  }

  let results = await run(q, germanyOnly)

  // Multi-word private-label queries ("Gut & Günstig Magerquark") frequently
  // return nothing because OFF ANDs every token against a sparse index. Widen
  // the query before widening the country filter: a German product is still a
  // better answer than a correct-sounding Belgian one.
  if (results.length === 0) {
    const simplified = simplifyQuery(q)
    if (simplified && simplified !== q) results = await run(simplified, germanyOnly)
  }
  if (results.length === 0 && germanyOnly) {
    results = await run(q, false)
  }

  return rankResults(results, q)
}

/** Strip punctuation and keep the most distinctive tokens. */
export function simplifyQuery(q: string): string {
  const tokens = q
    .replace(/[&!,.+]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2)
  if (tokens.length <= 1) return q
  // Longest tokens carry the most search signal ("Magerquark" beats "Gut").
  return [...tokens].sort((a, b) => b.length - a.length).slice(0, 2).join(' ')
}

/**
 * Re-rank OFF's results for this app's purpose.
 *
 * OFF sorts by its own popularity metric, which does not know that a product
 * with no protein value is useless to a macro tracker, or that a query naming
 * a brand should surface that brand.
 */
export function rankResults(results: NormalisedProduct[], query: string): NormalisedProduct[] {
  const tokens = query.toLowerCase().replace(/[&!,.]/g, ' ').split(/\s+/).filter((t) => t.length > 2)

  return [...results]
    .map((r) => {
      const hay = `${r.food.nameDe ?? ''} ${r.food.name} ${r.food.brand ?? ''}`.toLowerCase()
      let s = r.quality * 40
      for (const t of tokens) if (hay.includes(t)) s += 12
      if (r.food.nameDe) s += 6 // a German name means a German-market entry
      if (r.food.retailer) s += 5
      if (r.food.imageUrl) s += 2
      if (r.warnings.length) s -= 8 * r.warnings.length
      return { r, s }
    })
    .sort((a, b) => b.s - a.s)
    .map((x) => x.r)
}

/** True when the device thinks it is online. Used to skip doomed requests. */
export function isOnline(): boolean {
  return navigator.onLine !== false
}
