import { useMemo, useState } from 'react'
import { AlertTriangle, Check, Eye, EyeOff, Pencil, Trash2 } from 'lucide-react'
import { Badge, Button, Card, Input, Segmented } from './ui'
import { MacroChips } from './MacroBars'
import { kcal as fmtKcal, num } from '../lib/format'
import { scale, scaleAcrossState } from '../lib/nutrition'
import { plateTotal, type ResolvedItem } from '../services/ai/resolve'
import { MEAL_SLOTS, type MealSlot } from '../lib/types'

const MEAL_LABELS: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
}

/**
 * The Plate: every AI estimate lands here and nothing is committed until the
 * user says so.
 *
 * This is the most important screen in the app. A photo estimate carries
 * roughly ±25 % on calories no matter how good the model is, so the product
 * cannot be "AI logs your food" — it has to be "AI does the typing, you check
 * the numbers". Everything here exists to make checking fast: every row is
 * editable, every number says where it came from, and the items most likely
 * to be wrong are flagged rather than buried.
 */
export function PlateEditor({
  items: initial,
  meal,
  onMealChange,
  onCommit,
  onCancel,
  questions,
  onAnswer,
  busy,
  headline,
}: {
  items: ResolvedItem[]
  meal: MealSlot
  onMealChange: (m: MealSlot) => void
  onCommit: (items: ResolvedItem[]) => void
  onCancel: () => void
  questions?: Array<{ question: string; options: string[]; affects?: string }>
  onAnswer?: (answers: string[]) => void
  busy?: boolean
  headline?: string
}) {
  const [items, setItems] = useState(initial)
  const [answers, setAnswers] = useState<Record<number, string>>({})

  const total = useMemo(() => plateTotal(items), [items])
  const flagged = items.filter((i) => i.needsAttention).length

  const updateGrams = (id: string, grams: number) => {
    setItems((prev) =>
      prev.map((i) => {
        if (i.id !== id) return i
        const nutrients = i.food
          ? i.food.state === 'as_sold' || !i.food.yieldFactor || i.raw.state === 'as_sold'
            ? scale(i.food.per100, grams)
            : scaleAcrossState(i.food.per100, grams, i.raw.state, i.food.state, i.food.yieldFactor)
          : i.nutrients
        return {
          ...i,
          grams,
          nutrients,
          // A user-supplied weight is the single biggest accuracy lever there
          // is — halving the error in published testing. Trust it.
          uncertainty: i.food ? Math.min(i.uncertainty, 0.08) : i.uncertainty,
          confidence: i.food ? 'high' : i.confidence,
          explanation: `${Math.round(grams)} ${i.unit} · corrected by you`,
        }
      }),
    )
  }

  const remove = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id))

  return (
    <div className="pb-4">
      {headline && <p className="mb-3 text-[0.9375rem] text-txt-2">{headline}</p>}

      <Card className="p-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-display numeric text-[2.25rem] leading-none text-kcal">
              {fmtKcal(total.nutrients.kcal)}
            </div>
            <div className="mt-1.5 text-xs font-semibold text-txt-2">
              kcal · range {fmtKcal(total.kcalLow)}–{fmtKcal(total.kcalHigh)}
            </div>
          </div>
          <MacroChips n={total.nutrients} />
        </div>
        {/* Never present an estimate as a single exact figure. */}
        <p className="mt-3 border-t border-line pt-3 text-[0.6875rem] leading-relaxed text-txt-3">
          An estimate, not a measurement. Correcting a portion narrows the range — entering a
          weighed amount roughly halves the error.
        </p>
      </Card>

      {flagged > 0 && (
        <div className="mt-3 flex items-start gap-2.5 rounded-tile border border-warn/25 bg-warn/8 px-3.5 py-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warn" />
          <p className="text-[0.8125rem] leading-relaxed text-txt-2">
            {flagged === 1 ? '1 item could' : `${flagged} items could`} not be matched to the
            database with confidence. Worth a check.
          </p>
        </div>
      )}

      <div className="mt-4">
        <Segmented
          options={MEAL_SLOTS.map((m) => ({ value: m, label: MEAL_LABELS[m] }))}
          value={meal}
          onChange={onMealChange}
        />
      </div>

      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <PlateRow key={item.id} item={item} onGrams={updateGrams} onRemove={remove} />
        ))}
      </ul>

      {questions && questions.length > 0 && (
        <Card className="mt-4 p-4">
          <p className="text-[0.8125rem] font-medium">A couple of questions</p>
          <p className="mt-1 text-[0.6875rem] leading-relaxed text-txt-3">
            Oil, butter and sugar are usually invisible in a photo and account for most of the
            error. Answering these measurably improves the estimate.
          </p>
          <div className="mt-3 space-y-3">
            {questions.slice(0, 3).map((q, i) => (
              <div key={i}>
                <p className="mb-1.5 text-[0.8125rem] text-txt-2">{q.question}</p>
                <div className="flex flex-wrap gap-1.5">
                  {q.options.map((o) => (
                    <button
                      key={o}
                      onClick={() => setAnswers((a) => ({ ...a, [i]: o }))}
                      className={`rounded-lg border px-2.5 py-1.5 text-[0.8125rem] transition-colors ${
                        answers[i] === o
                          ? 'border-brand bg-brand/15 text-txt'
                          : 'border-line bg-surface-2 text-txt-2'
                      }`}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {Object.keys(answers).length > 0 && onAnswer && (
            <Button
              className="mt-3.5 w-full"
              loading={busy}
              onClick={() =>
                onAnswer(
                  questions
                    .slice(0, 3)
                    .map((q, i) => (answers[i] ? `${q.question} ${answers[i]}` : ''))
                    .filter(Boolean),
                )
              }
            >
              Recalculate
            </Button>
          )}
        </Card>
      )}

      <div className="mt-5 flex gap-2">
        <Button className="flex-1" onClick={onCancel}>
          Discard
        </Button>
        <Button
          variant="primary"
          className="flex-[2]"
          loading={busy}
          disabled={items.length === 0}
          onClick={() => onCommit(items)}
        >
          <Check size={17} />
          Save {items.length} {items.length === 1 ? 'item' : 'items'}
        </Button>
      </div>
    </div>
  )
}

function PlateRow({
  item,
  onGrams,
  onRemove,
}: {
  item: ResolvedItem
  onGrams: (id: string, grams: number) => void
  onRemove: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(Math.round(item.grams)))

  const commit = () => {
    const v = Number(draft.replace(',', '.'))
    if (Number.isFinite(v) && v > 0 && v < 5000) onGrams(item.id, v)
    setEditing(false)
  }

  return (
    <li
      className={`rounded-tile border bg-surface px-3.5 py-3 ${
        item.needsAttention ? 'border-warn/30' : 'border-line'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[0.9375rem] font-bold leading-snug tracking-[-0.015em]">
            {item.food?.name ?? item.food?.nameDe ?? item.raw.name}
            {item.assumed && (
              <Badge tone="warn" className="ml-1.5">
                <EyeOff size={10} /> assumed
              </Badge>
            )}
            {!item.assumed && item.matchQuality === 'exact' && (
              <Badge tone="ok" className="ml-1.5">
                <Eye size={10} /> matched
              </Badge>
            )}
          </p>
          <p className="mt-1 text-[0.6875rem] leading-relaxed text-txt-3">{item.explanation}</p>
        </div>
        <div className="shrink-0 text-right">
          <div className="numeric text-[0.9375rem] font-extrabold">
            {fmtKcal(item.nutrients.kcal)}
          </div>
          <div className="text-[0.6875rem] text-txt-3">
            ± {Math.round(item.nutrients.kcal * item.uncertainty)}
          </div>
        </div>
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        {editing ? (
          <>
            <Input
              type="text"
              inputMode="decimal"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => e.key === 'Enter' && commit()}
              className="h-9 w-24 py-1 text-[0.9375rem]"
            />
            <span className="text-[0.8125rem] text-txt-3">{item.unit}</span>
          </>
        ) : (
          <button
            onClick={() => {
              setDraft(String(Math.round(item.grams)))
              setEditing(true)
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-[0.8125rem]"
          >
            <Pencil size={12} className="text-txt-3" />
            {num(Math.round(item.grams))} {item.unit}
          </button>
        )}
        <div className="flex-1">
          <MacroChips n={item.nutrients} />
        </div>
        <button
          onClick={() => onRemove(item.id)}
          aria-label={`Remove ${item.raw.name}`}
          className="grid size-8 place-items-center rounded-lg text-txt-4 active:bg-surface-2"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </li>
  )
}
