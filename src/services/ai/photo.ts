import { getSettings } from '../../lib/db'
import type { AiSettings } from '../../lib/types'
import { AiError, MODEL_VISION, callStructured } from './client'
import { assessQuality, prepareImage } from './image'
import { PHOTO_SYSTEM, PHOTO_TOOL, type PhotoResult } from './prompts'
import { resolveItems, type ResolvedItem } from './resolve'

export interface PhotoAnalysis {
  result: PhotoResult
  items: ResolvedItem[]
  imageBlob: Blob
  model: string
}

export interface AnalyseOptions {
  /** Extra context the user supplied, e.g. answers to the follow-up questions. */
  hint?: string
  /** Runs 3 samples and takes the median portion, improving accuracy ~a third. */
  selfConsistency?: boolean
  signal?: AbortSignal
  settings?: AiSettings
  onProgress?: (stage: string) => void
}

/**
 * Analyse a meal photo.
 *
 * What this deliberately does NOT do is ask the model for calories. It asks
 * what food is present and how much, then resolves that against composition
 * data. The number the user sees is therefore traceable to a database row they
 * can open, not to a model's opinion.
 */
export async function analysePhoto(file: Blob, opts: AnalyseOptions = {}): Promise<PhotoAnalysis> {
  const settings = opts.settings ?? (await getSettings()).ai
  if (!settings.enabled || (!settings.apiKey && !settings.proxyUrl)) {
    throw new AiError('Photo logging needs an API key (Settings → AI)', 'no-key')
  }

  opts.onProgress?.('Checking the photo')
  const quality = await assessQuality(file)
  if (!quality.ok) throw new AiError(quality.reason ?? 'Photo unusable', 'bad-response')

  opts.onProgress?.('Preparing the photo')
  const image = await prepareImage(file)

  const text = opts.hint
    ? `Analyse this meal photo. Extra information from the user: ${opts.hint}`
    : 'Analyse this meal photo.'

  const call = () =>
    callStructured<PhotoResult>({
      settings,
      model: settings.model ?? MODEL_VISION,
      system: PHOTO_SYSTEM,
      text,
      images: [{ data: image.base64, mediaType: image.mediaType }],
      schema: PHOTO_TOOL.schema as unknown as Record<string, unknown>,
      toolName: PHOTO_TOOL.name,
      toolDescription: PHOTO_TOOL.description,
      maxTokens: 2048,
      signal: opts.signal,
      // A little temperature is required for self-consistency to sample
      // meaningfully different portion estimates.
      temperature: opts.selfConsistency ? 1 : 0,
    })

  opts.onProgress?.('Looking at your food')
  let result: PhotoResult
  if (opts.selfConsistency) {
    const samples = await Promise.all([call(), call(), call()])
    result = medianOfSamples(samples)
  } else {
    result = await call()
  }

  opts.onProgress?.('Matching nutrition data')
  const items = await resolveItems(result.items ?? [])

  return { result, items, imageBlob: file, model: settings.model ?? MODEL_VISION }
}

/**
 * Combine repeated samples by taking the median portion for each food.
 *
 * Sampling the model several times and taking the middle answer is a
 * well-established accuracy gain, and it costs nothing extra to also read the
 * spread between samples as a confidence signal: three samples that agree are
 * worth more than three that don't.
 */
export function medianOfSamples(samples: PhotoResult[]): PhotoResult {
  const valid = samples.filter((s) => s?.items?.length)
  if (valid.length === 0) return samples[0] ?? { items: [], overallConfidence: 0 }
  if (valid.length === 1) return valid[0]

  // Group by normalised food name across samples.
  const groups = new Map<string, Array<{ item: PhotoResult['items'][number]; sample: number }>>()
  valid.forEach((s, si) => {
    for (const item of s.items) {
      const key = item.name.toLowerCase().trim()
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push({ item, sample: si })
    }
  })

  const merged: PhotoResult['items'] = []
  for (const [, entries] of groups) {
    // Only keep foods a majority of samples actually saw — this is what
    // filters out one-off hallucinations.
    if (entries.length < Math.ceil(valid.length / 2)) continue

    const base = entries[0].item
    // Compare portions in a common unit where possible.
    const byMeasure = new Map<string, number[]>()
    for (const e of entries) {
      const m = (e.item.measure ?? '').toLowerCase()
      if (!byMeasure.has(m)) byMeasure.set(m, [])
      byMeasure.get(m)!.push(e.item.quantity)
    }
    const [measure, quantities] = [...byMeasure.entries()].sort((a, b) => b[1].length - a[1].length)[0]
    const sorted = [...quantities].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]

    // Agreement between samples is itself evidence.
    const spread =
      sorted.length > 1 ? (sorted[sorted.length - 1] - sorted[0]) / Math.max(1e-6, median) : 0
    const agreement = Math.max(0, 1 - Math.min(1, spread))
    const meanConf = entries.reduce((s, e) => s + (e.item.confidence ?? 0.5), 0) / entries.length

    merged.push({
      ...base,
      measure,
      quantity: median,
      confidence: Math.min(1, meanConf * (0.6 + 0.4 * agreement)),
    })
  }

  const best = valid.reduce((a, b) => ((a.items?.length ?? 0) >= (b.items?.length ?? 0) ? a : b))
  return {
    ...best,
    items: merged.length ? merged : best.items,
    overallConfidence:
      valid.reduce((s, v) => s + (v.overallConfidence ?? 0.5), 0) / valid.length,
  }
}
