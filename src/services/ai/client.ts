import type { AiSettings } from '../../lib/types'

/**
 * Minimal Anthropic client for the browser.
 *
 * Anthropic gates browser calls behind an explicit opt-in header: without
 * `anthropic-dangerous-direct-browser-access`, the CORS preflight is rejected.
 * With it, any origin is allowed — no registration, no allowlist.
 *
 * The key lives only in this device's IndexedDB and is sent only to
 * api.anthropic.com. There is no server in this app to send it anywhere else.
 * That is also the security trade-off the user is accepting: anyone with the
 * unlocked phone can read the key out of storage, so it should be a key with a
 * spend limit, not an organisation's main key.
 */

const API_BASE = 'https://api.anthropic.com/v1'
const API_VERSION = '2023-06-01'

/** Vision-capable, for photo estimation. */
export const MODEL_VISION = 'claude-opus-5'
/** Cheap and fast, for parsing a dictated sentence into structured items. */
export const MODEL_TEXT = 'claude-haiku-4-5-20251001'

export class AiError extends Error {
  readonly kind: 'no-key' | 'auth' | 'rate' | 'network' | 'refused' | 'bad-response' | 'overloaded'

  constructor(message: string, kind: AiError['kind']) {
    super(message)
    this.kind = kind
  }
}

export interface ImagePart {
  /** Base64 *without* the data: prefix. */
  data: string
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp'
}

interface CallOptions {
  settings: AiSettings
  model: string
  system: string
  /** Text of the user turn. */
  text: string
  images?: ImagePart[]
  /** JSON Schema the reply must satisfy. */
  schema: Record<string, unknown>
  toolName: string
  toolDescription: string
  maxTokens?: number
  signal?: AbortSignal
  temperature?: number
}

/**
 * Call the model and get a validated object back.
 *
 * Structured output is done with a forced tool call rather than free-text JSON:
 * the model cannot reply with prose, an apology, or a fenced code block, which
 * are the three ways naive JSON prompting fails in production.
 */
export async function callStructured<T>({
  settings,
  model,
  system,
  text,
  images = [],
  schema,
  toolName,
  toolDescription,
  maxTokens = 2048,
  signal,
  temperature,
}: CallOptions): Promise<T> {
  if (!settings.enabled) throw new AiError('AI features are switched off', 'no-key')

  const usingProxy = settings.provider === 'proxy' && settings.proxyUrl
  if (!usingProxy && !settings.apiKey) throw new AiError('No API key saved', 'no-key')

  const content: unknown[] = images.map((img) => ({
    type: 'image',
    source: { type: 'base64', media_type: img.mediaType, data: img.data },
  }))
  content.push({ type: 'text', text })

  const body = {
    model,
    max_tokens: maxTokens,
    system,
    ...(temperature != null ? { temperature } : {}),
    messages: [{ role: 'user', content }],
    tools: [{ name: toolName, description: toolDescription, input_schema: schema }],
    // Force the tool so the reply is always machine-readable.
    tool_choice: { type: 'tool', name: toolName },
  }

  const url = usingProxy ? settings.proxyUrl! : `${API_BASE}/messages`
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (!usingProxy) {
    headers['x-api-key'] = settings.apiKey!
    headers['anthropic-version'] = API_VERSION
    // Without this header the CORS preflight fails with "Disallowed CORS origin".
    headers['anthropic-dangerous-direct-browser-access'] = 'true'
  }

  let res: Response
  try {
    res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new AiError('Cannot reach the AI service', 'network')
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    if (res.status === 401 || res.status === 403)
      throw new AiError('API key is invalid or out of credit', 'auth')
    if (res.status === 429) throw new AiError('Rate limit reached — wait a moment', 'rate')
    if (res.status === 529) throw new AiError('AI service overloaded — try again shortly', 'overloaded')
    throw new AiError(`AI error ${res.status}: ${detail.slice(0, 160)}`, 'network')
  }

  const json = await res.json()
  const block = (json.content ?? []).find((c: any) => c.type === 'tool_use' && c.name === toolName)
  if (!block) {
    // Almost always a refusal or a max_tokens cut-off mid-tool-call.
    const stop = json.stop_reason
    throw new AiError(
      stop === 'max_tokens' ? 'Response was too long — try less at once' : 'The AI returned nothing usable',
      stop === 'refusal' ? 'refused' : 'bad-response',
    )
  }
  return block.input as T
}

/** Rough cost readout so the user can see what a photo actually costs. */
export function estimateCostEur(inputTokens: number, outputTokens: number, model: string): number {
  // Published USD per million tokens; converted at a deliberately pessimistic rate.
  const RATES: Record<string, [number, number]> = {
    'claude-opus-5': [5, 25],
    'claude-sonnet-5': [3, 15],
    'claude-haiku-4-5-20251001': [1, 5],
  }
  const [inRate, outRate] = RATES[model] ?? RATES['claude-sonnet-5']
  const usd = (inputTokens / 1e6) * inRate + (outputTokens / 1e6) * outRate
  return usd * 0.95
}

/**
 * Anthropic charges vision by tile: ceil(w/28) x ceil(h/28) tokens, capped at
 * 2576 px on the long edge. A raw 4K phone photo costs ~4784 tokens; the same
 * photo at 1024 px costs ~1300 and estimates just as well, because the model
 * cannot resolve a gram of oil either way.
 */
export function visionTokens(width: number, height: number): number {
  const MAX_EDGE = 2576
  let w = width
  let h = height
  const longest = Math.max(w, h)
  if (longest > MAX_EDGE) {
    const f = MAX_EDGE / longest
    w = Math.round(w * f)
    h = Math.round(h * f)
  }
  return Math.ceil(w / 28) * Math.ceil(h / 28)
}

/** Verify a key works, without spending meaningful tokens. */
export async function testKey(settings: AiSettings, signal?: AbortSignal): Promise<boolean> {
  const res = await fetch(`${API_BASE}/models`, {
    headers: {
      'x-api-key': settings.apiKey ?? '',
      'anthropic-version': API_VERSION,
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    signal,
  })
  if (res.status === 401 || res.status === 403) throw new AiError('API key is invalid', 'auth')
  if (!res.ok) throw new AiError(`Check failed (${res.status})`, 'network')
  return true
}
