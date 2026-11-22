import { useSyncExternalStore } from 'react'

/**
 * Rest timer state.
 *
 * The timer is an end timestamp, not a counter. iOS freezes JavaScript timers
 * the moment the app is backgrounded or the screen locks, so a decrementing
 * counter would simply stop; a timestamp is still right when the app comes
 * back. It lives in localStorage for the same reason: a reload mid-rest
 * should not lose it.
 */
export interface RestState {
  endsAt: number
  /** Full length in ms, for the progress bar. */
  total: number
  label?: string
  sound: boolean
}

const KEY = 'mf.rest'
const listeners = new Set<() => void>()

function load(): RestState | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as RestState
    return typeof s.endsAt === 'number' ? s : null
  } catch {
    return null
  }
}

let state: RestState | null = typeof localStorage === 'undefined' ? null : load()

function set(next: RestState | null) {
  state = next
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next))
    else localStorage.removeItem(KEY)
  } catch {
    // Private mode can refuse writes; the in-memory timer still works.
  }
  for (const l of listeners) l()
}

/* ------------------------------------------------------------------ *
 * Sound
 *
 * The beep is scheduled on the audio clock at the moment the timer starts,
 * inside the tap that started it. Two reasons: browsers only allow audio
 * to begin from a user gesture, and the audio clock keeps running when
 * setTimeout is throttled in a background tab. On a locked iPhone the audio
 * context is suspended too, and nothing short of a native app can beep
 * there; the bar shows "Rest over" when the app is reopened.
 * ------------------------------------------------------------------ */

type Ctx = AudioContext
let ctx: Ctx | null = null
let scheduled: OscillatorNode[] = []

function cancelBeep() {
  for (const o of scheduled) {
    try {
      o.stop()
    } catch {
      // Already stopped.
    }
  }
  scheduled = []
}

function scheduleBeep(inSeconds: number) {
  cancelBeep()
  const AC =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return
  try {
    ctx ??= new AC()
    void ctx.resume()
    const t0 = ctx.currentTime + Math.max(0, inSeconds)
    // Three short tones: one is easy to miss over gym music.
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = i === 2 ? 1175 : 880
      const at = t0 + i * 0.28
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(0.35, at + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.2)
      osc.connect(gain).connect(ctx.destination)
      osc.start(at)
      osc.stop(at + 0.22)
      scheduled.push(osc)
    }
  } catch {
    // No audio is not worth failing a set over.
  }
}

/* ------------------------------------------------------------------ *
 * API
 * ------------------------------------------------------------------ */

/** Must be called from a user gesture so the browser allows the sound. */
export function startRest(seconds: number, opts: { label?: string; sound: boolean }) {
  if (seconds <= 0) return
  const total = seconds * 1000
  set({ endsAt: Date.now() + total, total, label: opts.label, sound: opts.sound })
  if (opts.sound) scheduleBeep(seconds)
  else cancelBeep()
}

export function adjustRest(deltaSeconds: number) {
  if (!state) return
  const now = Date.now()
  const endsAt = Math.max(now, state.endsAt + deltaSeconds * 1000)
  const next = { ...state, endsAt, total: Math.max(state.total + deltaSeconds * 1000, endsAt - now, 1000) }
  set(next)
  if (next.sound) scheduleBeep((endsAt - now) / 1000)
}

export function stopRest() {
  cancelBeep()
  set(null)
}

export function useRest(): RestState | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => state,
  )
}

export function buzz() {
  try {
    navigator.vibrate?.([220, 120, 220])
  } catch {
    // iOS Safari has no Vibration API.
  }
}
