import { getSettings } from '../../lib/db'
import type { AiSettings } from '../../lib/types'
import { AiError, MODEL_TEXT, callStructured } from './client'
import { VOICE_SYSTEM, VOICE_TOOL, type VoiceResult } from './prompts'
import { resolveItems, type ResolvedItem } from './resolve'

export interface VoiceAnalysis {
  result: VoiceResult
  items: ResolvedItem[]
  transcript: string
  model: string
}

/**
 * Parse a dictated or typed German meal description.
 *
 * The audio never leaves the device: on iPhone this text comes from the system
 * keyboard's own dictation, which is why this path is reliable in an installed
 * PWA where the Web Speech API silently does nothing. Only the resulting short
 * string is sent, which is also why this costs a fraction of a cent.
 */
export async function analyseText(
  transcript: string,
  opts: { signal?: AbortSignal; settings?: AiSettings } = {},
): Promise<VoiceAnalysis> {
  const text = transcript.trim()
  if (!text) throw new AiError('Nothing to read', 'bad-response')

  const settings = opts.settings ?? (await getSettings()).ai
  if (!settings.enabled || (!settings.apiKey && !settings.proxyUrl)) {
    throw new AiError('Dictation needs an API key (Settings → AI)', 'no-key')
  }

  const result = await callStructured<VoiceResult>({
    settings,
    // Text parsing is easy; the small model is both faster and ~5x cheaper.
    model: MODEL_TEXT,
    system: VOICE_SYSTEM,
    text: `Split this meal description into entries:\n\n"${text}"`,
    schema: VOICE_TOOL.schema as unknown as Record<string, unknown>,
    toolName: VOICE_TOOL.name,
    toolDescription: VOICE_TOOL.description,
    maxTokens: 1500,
    temperature: 0,
    signal: opts.signal,
  })

  const items = await resolveItems(result.items ?? [])
  return { result, items, transcript: text, model: MODEL_TEXT }
}

/* ------------------------------------------------------------------ *
 * Speech input capability
 * ------------------------------------------------------------------ */

export type VoiceMode = 'keyboard-dictation' | 'web-speech' | 'none'

/**
 * Decide how this device should capture speech.
 *
 * On iOS the answer is almost always the system keyboard's microphone key.
 * `webkitSpeechRecognition` is *present* in an installed PWA — so a naive
 * feature detect passes — and then does nothing at all. Detecting standalone
 * mode and refusing to offer it is the only way to avoid a dead button.
 */
export function detectVoiceMode(): VoiceMode {
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true

  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

  if (isIOS) {
    // Keyboard dictation is the only path that works in a home-screen web app,
    // and it is also the better one in a tab: Apple's own recogniser, no
    // permission prompt, no audio upload, no cost.
    return 'keyboard-dictation'
  }

  const hasWebSpeech =
    'SpeechRecognition' in window || 'webkitSpeechRecognition' in window
  if (hasWebSpeech && !standalone) return 'web-speech'
  return 'keyboard-dictation'
}

export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}
