import { useEffect, useState } from 'react'
import { MUSCLE_LABELS } from '../../data/exercises'
import type { Exercise, MuscleGroup } from '../../lib/types'

/** A load as a lifter writes it: 82.5, not 82.50; 100, not 100.0. */
export const fmtLoad = (kg: number): string => String(Math.round(kg * 100) / 100)

export const fmtSet = (weightKg: number, reps: number): string =>
  weightKg > 0 ? `${fmtLoad(weightKg)} × ${reps}` : `${reps} reps`

export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

export const restLabel = (sec: number): string =>
  sec % 60 === 0
    ? `${sec / 60} min`
    : sec > 60
      ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
      : `${sec} s`

/** A clock that re-renders its caller. Reading Date.now() in render directly would be impure. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

export function filterExercises(exercises: Exercise[], q: string, muscle: MuscleGroup | null): Exercise[] {
  const needle = q.trim().toLowerCase()
  return exercises
    .filter((e) => !e.deleted)
    .filter((e) => !muscle || e.primary === muscle || e.secondary.includes(muscle))
    .filter((e) => {
      if (!needle) return true
      const hay = `${e.name} ${e.nameDe ?? ''} ${e.equipment ?? ''} ${MUSCLE_LABELS[e.primary]}`.toLowerCase()
      return needle.split(/\s+/).every((t) => hay.includes(t))
    })
    .sort((a, b) => {
      // With a muscle chosen, movements that train it directly come first.
      if (muscle) {
        const pa = a.primary === muscle ? 0 : 1
        const pb = b.primary === muscle ? 0 : 1
        if (pa !== pb) return pa - pb
      }
      return (b.useCount ?? 0) - (a.useCount ?? 0) || a.name.localeCompare(b.name)
    })
}
