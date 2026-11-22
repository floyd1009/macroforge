import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Camera, Trash2 } from 'lucide-react'
import { Button, Card, Field, Input, SectionTitle, Segmented, Sheet } from './ui'
import { db, newId } from '../lib/db'
import { fromKey, todayKey, type DateKey } from '../lib/date'
import { num, parseNumber, signed } from '../lib/format'
import type { ProgressPhoto } from '../lib/types'

/**
 * Tape measurements and progress photos.
 *
 * Scale weight cannot tell fat from muscle or water. A waist measurement can:
 * during a cut it falls with fat, and during a gain it is the earliest sign
 * that the surplus is too large. Photos do the same job qualitatively.
 */
const SITES = [
  { key: 'waist', label: 'Waist' },
  { key: 'chest', label: 'Chest' },
  { key: 'hips', label: 'Hips' },
  { key: 'arm', label: 'Upper arm' },
  { key: 'thigh', label: 'Thigh' },
] as const

const ANGLES = [
  { value: 'front' as const, label: 'Front' },
  { value: 'side' as const, label: 'Side' },
  { value: 'back' as const, label: 'Back' },
]

const shortDate = (d: DateKey) => fromKey(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })

/** Downscale before storing: a 12 MP photo is ~4 MB, and IndexedDB quota is finite. */
async function shrink(file: Blob, longEdge = 1280): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file)
  try {
    const k = Math.min(1, longEdge / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * k))
    const height = Math.max(1, Math.round(bitmap.height * k))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas unavailable')
    ctx.drawImage(bitmap, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82))
    if (!blob) throw new Error('Could not encode the photo')
    return { blob, width, height }
  } finally {
    bitmap.close()
  }
}

export function BodyCard() {
  const [measuring, setMeasuring] = useState(false)
  const [angle, setAngle] = useState<ProgressPhoto['angle']>('front')
  const [viewing, setViewing] = useState<ProgressPhoto | null>(null)
  const [error, setError] = useState<string | null>(null)

  const rows = useLiveQuery(() => db.measurements.orderBy('date').toArray(), [])
  const photos = useLiveQuery(() => db.progressPhotos.orderBy('date').toArray(), [])

  const latest = rows?.[rows.length - 1]
  const first = rows?.[0]
  const shots = (photos ?? []).filter((p) => p.angle === angle)
  // First and latest side by side is the comparison that shows change.
  const pair = shots.length > 1 ? [shots[0], shots[shots.length - 1]] : shots

  const addPhoto = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    try {
      const img = await shrink(file)
      const photoId = newId()
      await db.photos.add({ id: photoId, ...img, createdAt: Date.now() })
      await db.progressPhotos.add({ id: newId(), date: todayKey(), angle, photoId, createdAt: Date.now() })
    } catch {
      setError('That photo could not be read.')
    }
  }

  return (
    <>
      <SectionTitle
        action={
          <button className="text-[0.6875rem] font-medium text-brand-text" onClick={() => setMeasuring(true)}>
            Log it
          </button>
        }
      >
        Measurements
      </SectionTitle>
      <Card className="p-4">
        {!latest ? (
          <p className="text-[0.8125rem] leading-relaxed text-txt-3">
            A tape around the waist tells fat from muscle in a way the scale cannot. Measure at the
            navel, relaxed, at the same time of day.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-x-3 gap-y-4">
            {SITES.filter((s) => latest.values[s.key] != null).map((s) => {
              const delta = first && first !== latest && first.values[s.key] != null ? latest.values[s.key] - first.values[s.key] : null
              return (
                <div key={s.key}>
                  <div className="numeric text-[1.0625rem] font-extrabold">{num(latest.values[s.key], 1)} cm</div>
                  <div className="label-micro mt-1 text-[0.5625rem] text-txt-3">{s.label}</div>
                  {delta != null && delta !== 0 && (
                    <div className="numeric mt-0.5 text-[0.6875rem] font-semibold text-txt-3">{signed(delta, 'en', 1)}</div>
                  )}
                </div>
              )
            })}
          </div>
        )}
        {latest && (
          <p className="mt-3.5 border-t border-line pt-3 text-[0.6875rem] text-txt-3">
            Last measured {shortDate(latest.date)}
            {first && first !== latest && `. Change since ${shortDate(first.date)}.`}
          </p>
        )}
      </Card>

      <SectionTitle>Progress photos</SectionTitle>
      <Card className="p-4">
        <Segmented options={ANGLES} value={angle} onChange={setAngle} />
        {pair.length > 0 ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {pair.map((p) => (
              <button key={p.id} onClick={() => setViewing(p)} className="overflow-hidden rounded-tile border border-line text-left">
                <Photo photoId={p.photoId} className="aspect-[3/4] w-full object-cover" />
                <span className="numeric block px-2.5 py-1.5 text-[0.6875rem] font-semibold text-txt-3">{shortDate(p.date)}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-[0.8125rem] leading-relaxed text-txt-3">
            Same light, same distance, same time of day. Once there are two, the first and the latest
            are shown side by side.
          </p>
        )}
        {shots.length > 2 && (
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
            {shots.map((p) => (
              <button key={p.id} onClick={() => setViewing(p)} className="shrink-0 overflow-hidden rounded-md border border-line">
                <Photo photoId={p.photoId} className="h-16 w-12 object-cover" />
              </button>
            ))}
          </div>
        )}
        {error && <p className="mt-2 text-[0.8125rem] text-bad">{error}</p>}
        <label className="mt-3 flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-line bg-surface-2 text-[0.875rem] font-bold tracking-tight active:bg-surface-3">
          <Camera size={16} /> Add {angle} photo
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              void addPhoto(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </label>
        <p className="mt-2.5 text-[0.6875rem] leading-relaxed text-txt-3">
          Photos stay on this device. They are not uploaded and are not part of the export file.
        </p>
      </Card>

      {measuring && <MeasureSheet previous={latest?.values} onClose={() => setMeasuring(false)} />}
      {viewing && (
        <Sheet open onClose={() => setViewing(null)} title={`${viewing.angle[0].toUpperCase()}${viewing.angle.slice(1)} · ${shortDate(viewing.date)}`} full>
          <Photo photoId={viewing.photoId} className="w-full rounded-tile" />
          <Button
            variant="danger"
            className="mt-4 w-full"
            onClick={() => {
              void db.photos.delete(viewing.photoId)
              void db.progressPhotos.delete(viewing.id)
              setViewing(null)
            }}
          >
            <Trash2 size={16} /> Delete photo
          </Button>
        </Sheet>
      )}
    </>
  )
}

/** Renders a stored blob, releasing its object URL when it leaves the screen. */
function Photo({ photoId, className }: { photoId: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let made: string | null = null
    let live = true
    void db.photos.get(photoId).then((p) => {
      if (!p || !live) return
      made = URL.createObjectURL(p.blob)
      setUrl(made)
    })
    return () => {
      live = false
      if (made) URL.revokeObjectURL(made)
    }
  }, [photoId])
  return url ? <img src={url} alt="" className={className} /> : <div className={`skeleton ${className ?? ''}`} />
}

function MeasureSheet({ previous, onClose }: { previous?: Record<string, number>; onClose: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({})

  const save = async () => {
    const out: Record<string, number> = {}
    for (const s of SITES) {
      const v = parseNumber(values[s.key] ?? '')
      if (v && v > 10 && v < 300) out[s.key] = v
    }
    if (Object.keys(out).length === 0) return
    const existing = await db.measurements.get(todayKey())
    await db.measurements.put({
      date: todayKey(),
      values: { ...existing?.values, ...out },
      updatedAt: Date.now(),
    })
    onClose()
  }

  return (
    <Sheet open onClose={onClose} title="Measurements (cm)">
      <div className="space-y-4 pb-2">
        <div className="grid grid-cols-2 gap-3">
          {SITES.map((s) => (
            <Field key={s.key} label={s.label}>
              <Input
                type="text"
                inputMode="decimal"
                placeholder={previous?.[s.key] != null ? num(previous[s.key], 1) : '–'}
                value={values[s.key] ?? ''}
                onChange={(e) => setValues({ ...values, [s.key]: e.target.value })}
                className="text-center"
              />
            </Field>
          ))}
        </div>
        <p className="text-[0.6875rem] leading-relaxed text-txt-3">
          Fill in only the ones you measured. Tape error is about half a centimetre, so read the change
          over weeks, not between two days.
        </p>
        <Button variant="primary" className="w-full" onClick={() => void save()}>
          Save
        </Button>
      </div>
    </Sheet>
  )
}
