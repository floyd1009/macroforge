import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Info, Mic, Sparkles } from 'lucide-react'
import { Button, Card, IconButton, Screen, Spinner, Textarea } from '../components/ui'
import { PlateEditor } from '../components/PlateEditor'
import { newId } from '../lib/db'
import { todayKey } from '../lib/date'
import { addEntry } from '../lib/repo'
import type { MealSlot } from '../lib/types'
import { AiError } from '../services/ai/client'
import { analyseText, detectVoiceMode, type VoiceAnalysis } from '../services/ai/voice'
import type { ResolvedItem } from '../services/ai/resolve'

const EXAMPLES = [
  'Zwei Scheiben Vollkornbrot mit Butter und einem Spiegelei',
  'Ein Becher Magerquark mit einer Handvoll Heidelbeeren',
  '150 g gebratene Hähnchenbrust, eine Portion Reis und Brokkoli',
  'Anderthalb Brötchen mit Kochschinken und ein Glas Milch',
]

export default function VoiceLog() {
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [analysis, setAnalysis] = useState<VoiceAnalysis | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [meal, setMeal] = useState<MealSlot>('snack')
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const mode = detectVoiceMode()

  useEffect(() => {
    // In a standalone iOS web app the Web Speech API is present but silently
    // does nothing, so there is no in-app record button to focus. Putting the
    // caret in the textarea is what brings up the keyboard — and with it the
    // dictation key that actually works.
    const t = setTimeout(() => areaRef.current?.focus(), 350)
    return () => clearTimeout(t)
  }, [])

  const run = async () => {
    if (!text.trim()) return
    setBusy(true)
    setError(null)
    try {
      const result = await analyseText(text)
      setAnalysis(result)
      if (result.result.meal) setMeal(result.result.meal)
      if (result.items.length === 0) setError('Daraus konnte ich kein Lebensmittel lesen.')
    } catch (e) {
      setError(e instanceof AiError ? e.message : 'Erkennung fehlgeschlagen.')
    } finally {
      setBusy(false)
    }
  }

  const commit = async (items: ResolvedItem[]) => {
    setBusy(true)
    const captureId = newId()
    for (const item of items) {
      await addEntry({
        date: todayKey(),
        meal,
        food: item.food,
        name: item.food?.nameDe ?? item.food?.name ?? item.raw.name,
        brand: item.food?.brand,
        amount: item.grams,
        unit: item.unit,
        nutrients: item.nutrients,
        basis: item.unit,
        method: 'voice',
        provenance: 'voice',
        confidence: item.confidence,
        captureId,
        note: analysis?.transcript,
        ai: {
          model: analysis!.model,
          estimatedGrams: item.grams,
          uncertaintyPct: item.uncertainty,
          reasoning: item.explanation,
        },
      })
    }
    navigate('/')
  }

  if (analysis && analysis.items.length > 0) {
    return (
      <Screen
        title="Prüfen & speichern"
        left={
          <IconButton label="Zurück" onClick={() => setAnalysis(null)}>
            <ChevronLeft size={20} />
          </IconButton>
        }
      >
        <div className="mt-2">
          <PlateEditor
            items={analysis.items}
            meal={meal}
            onMealChange={setMeal}
            onCommit={commit}
            onCancel={() => setAnalysis(null)}
            busy={busy}
            headline={`„${analysis.transcript}"`}
          />
        </div>
      </Screen>
    )
  }

  return (
    <Screen
      title="Diktieren"
      left={
        <IconButton label="Zurück" onClick={() => navigate(-1)}>
          <ChevronLeft size={20} />
        </IconButton>
      }
    >
      <Card className="mt-2 p-4">
        <Textarea
          ref={areaRef}
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Sag oder tippe, was du gegessen hast…"
          className="border-0 bg-transparent px-0 py-0 text-[1.0625rem] leading-relaxed focus:ring-0"
        />
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
          <p className="flex items-center gap-1.5 text-[0.6875rem] text-txt-3">
            <Mic size={12} />
            {mode === 'keyboard-dictation'
              ? 'Mikrofon-Taste auf der Tastatur nutzen'
              : 'Tippen oder diktieren'}
          </p>
          <Button variant="primary" onClick={() => void run()} loading={busy} disabled={!text.trim()}>
            <Sparkles size={16} /> Erkennen
          </Button>
        </div>
      </Card>

      {error && (
        <p className="mt-3 rounded-tile border border-bad/25 bg-bad/8 px-3.5 py-3 text-[0.8125rem] text-bad">
          {error}
        </p>
      )}

      {busy && (
        <div className="mt-8 grid place-items-center gap-2">
          <Spinner className="size-6 text-brand-text" />
          <p className="text-[0.8125rem] text-txt-3">Wird zerlegt…</p>
        </div>
      )}

      {!busy && (
        <>
          <p className="mb-2 mt-6 text-[0.6875rem] font-semibold uppercase tracking-wider text-txt-3">
            Beispiele
          </p>
          <div className="space-y-2">
            {EXAMPLES.map((e) => (
              <button
                key={e}
                onClick={() => setText(e)}
                className="w-full rounded-tile border border-line bg-surface px-3.5 py-2.5 text-left text-[0.8125rem] leading-relaxed text-txt-2 active:bg-surface-2"
              >
                {e}
              </button>
            ))}
          </div>

          <Card className="mt-5 p-4">
            <div className="flex items-start gap-2.5">
              <Info size={15} className="mt-0.5 shrink-0 text-txt-3" />
              <div className="text-[0.8125rem] leading-relaxed text-txt-2">
                <p className="font-medium text-txt">Warum die Tastatur statt eines Aufnahme-Knopfs</p>
                <p className="mt-1.5 text-txt-3">
                  In einer installierten Web-App auf dem iPhone funktioniert die Web-Speech-API
                  nicht zuverlässig — sie meldet Erfolg und liefert nichts. Die Diktier-Taste der
                  iOS-Tastatur nutzt Apples eigene Erkennung, ist genauer, braucht keine
                  Berechtigung und kostet nichts. Deine Stimme verlässt das Gerät nicht über diese
                  App; nur der fertige Text wird zur Auswertung geschickt.
                </p>
              </div>
            </div>
          </Card>
        </>
      )}
    </Screen>
  )
}
