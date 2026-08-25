import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, ChevronLeft, Info, Images } from 'lucide-react'
import { Button, Card, IconButton, Screen, Spinner } from '../components/ui'
import { PlateEditor } from '../components/PlateEditor'
import { newId } from '../lib/db'
import { todayKey } from '../lib/date'
import { addEntry } from '../lib/repo'
import type { MealSlot } from '../lib/types'
import { AiError } from '../services/ai/client'
import { analysePhoto, type PhotoAnalysis } from '../services/ai/photo'
import type { ResolvedItem } from '../services/ai/resolve'

/** Meal slot implied by the clock, so the common case needs no tap. */
function currentMeal(): MealSlot {
  const h = new Date().getHours()
  if (h < 10.5) return 'breakfast'
  if (h < 15) return 'lunch'
  if (h < 21) return 'dinner'
  return 'snack'
}

export default function PhotoLog() {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [stage, setStage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<PhotoAnalysis | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [meal, setMeal] = useState<MealSlot>(currentMeal())
  const [busy, setBusy] = useState(false)

  const run = async (file: File, hint?: string) => {
    setError(null)
    setBusy(true)
    try {
      const result = await analysePhoto(file, {
        hint,
        // Three samples, median portion: a meaningful accuracy gain for ~3x the
        // cost of one call, which is still under two cents.
        selfConsistency: true,
        onProgress: setStage,
      })
      setAnalysis(result)
      if (result.items.length === 0) {
        setError(result.result.note ?? 'No food could be identified in this photo.')
      }
    } catch (e) {
      setError(e instanceof AiError ? e.message : 'Analysis failed. Please try again.')
    } finally {
      setBusy(false)
      setStage(null)
    }
  }

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPreview(URL.createObjectURL(file))
    void run(file)
  }

  const commit = async (items: ResolvedItem[]) => {
    setBusy(true)
    const captureId = newId()
    for (const item of items) {
      await addEntry({
        date: todayKey(),
        meal,
        food: item.food,
        name: item.food?.name ?? item.food?.nameDe ?? item.raw.name,
        brand: item.food?.brand,
        amount: item.grams,
        unit: item.unit,
        nutrients: item.nutrients,
        basis: item.unit,
        method: 'photo',
        provenance: 'photo',
        confidence: item.confidence,
        captureId,
        ai: {
          model: analysis!.model,
          estimatedGrams: item.grams,
          uncertaintyPct: item.uncertainty,
          anchors: analysis!.result.anchors,
          reasoning: item.explanation,
        },
      })
    }
    navigate('/')
  }

  return (
    <Screen
      title="Photo logging"
      left={
        <IconButton label="Back" onClick={() => navigate(-1)}>
          <ChevronLeft size={20} />
        </IconButton>
      }
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        // `capture` opens the camera directly and — unlike getUserMedia — is
        // reliable inside an installed iOS web app and needs no permission.
        capture="environment"
        className="hidden"
        onChange={onPick}
      />

      {!analysis && !busy && (
        <>
          <Card className="mt-2 overflow-hidden">
            {preview ? (
              <img src={preview} alt="" className="aspect-[4/3] w-full object-cover" />
            ) : (
              <div className="grid aspect-[4/3] place-items-center bg-surface-2 text-txt-4">
                <Camera size={40} strokeWidth={1.5} />
              </div>
            )}
          </Card>

          <div className="mt-4 flex gap-2">
            <Button
              variant="primary"
              className="flex-1"
              onClick={() => {
                if (fileRef.current) {
                  fileRef.current.setAttribute('capture', 'environment')
                  fileRef.current.click()
                }
              }}
            >
              <Camera size={17} /> Take photo
            </Button>
            <Button
              onClick={() => {
                if (fileRef.current) {
                  fileRef.current.removeAttribute('capture')
                  fileRef.current.click()
                }
              }}
            >
              <Images size={17} />
            </Button>
          </div>

          {error && (
            <p className="mt-3 rounded-tile border border-bad/25 bg-bad/8 px-3.5 py-3 text-[0.8125rem] leading-relaxed text-bad">
              {error}
            </p>
          )}

          <Card className="mt-5 p-4">
            <div className="flex items-start gap-2.5">
              <Info size={15} className="mt-0.5 shrink-0 text-txt-3" />
              <div className="text-[0.8125rem] leading-relaxed text-txt-2">
                <p className="font-medium text-txt">How to make it more accurate</p>
                <ul className="mt-2 space-y-1.5 text-txt-3">
                  <li>Shoot from slightly above, with the whole dish in frame.</li>
                  <li>Leave a fork or the plate edge visible — that gives the scale.</li>
                  <li>No camera can see oil, butter or sugar. The follow-up questions are the
                      most valuable part.</li>
                  <li>For anything packaged, scan the barcode instead.</li>
                </ul>
              </div>
            </div>
          </Card>

          <p className="mt-4 px-1 text-[0.6875rem] leading-relaxed text-txt-3">
            Photo estimates typically land around 25% away from the true calorie value, even
            with the best models available. That is still usually better than guessing — but it
            is not a measurement. Weighing remains more accurate.
          </p>
        </>
      )}

      {busy && !analysis && (
        <div className="mt-16 grid place-items-center gap-3">
          <Spinner className="size-7 text-brand-text" />
          <p className="text-[0.8125rem] text-txt-2">{stage ?? 'Analysing'}…</p>
          <p className="max-w-[15rem] text-center text-[0.6875rem] leading-relaxed text-txt-3">
            Three estimates are taken and the middle one used — more accurate than a single
            pass.
          </p>
        </div>
      )}

      {analysis && analysis.items.length > 0 && (
        <div className="mt-2">
          {preview && (
            <Card className="mb-4 overflow-hidden">
              <img src={preview} alt="" className="aspect-video w-full object-cover" />
            </Card>
          )}
          <PlateEditor
            items={analysis.items}
            meal={meal}
            onMealChange={setMeal}
            onCommit={commit}
            onCancel={() => {
              setAnalysis(null)
              setPreview(null)
            }}
            questions={analysis.result.questions}
            busy={busy}
            headline={analysis.result.dish}
            onAnswer={(answers) => {
              const file = fileRef.current?.files?.[0]
              if (file) void run(file, answers.join(' '))
            }}
          />
        </div>
      )}
    </Screen>
  )
}
