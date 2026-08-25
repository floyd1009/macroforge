import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, ChevronLeft, ChevronRight, Mic, Plus, ScanLine, Scale, Search, Trash2 } from 'lucide-react'
import { CalorieHeader, MacroChips, MacroRows } from '../components/MacroBars'
import { Badge, Button, Card, EmptyState, IconButton, Input, Screen, Sheet, SectionTitle } from '../components/ui'
import { addDays, humanDate, isFuture, todayKey } from '../lib/date'
import { kcal as fmtKcal, kg as fmtKg, num, signed } from '../lib/format'
import { deleteEntry, saveWeight } from '../lib/repo'
import { useDayPlan } from '../lib/useDb'
import { MEAL_SLOTS, PROVENANCE_ERROR, type LogEntry, type MealSlot } from '../lib/types'

const MEAL_LABELS: Record<MealSlot, string> = {
  breakfast: 'Frühstück',
  lunch: 'Mittagessen',
  dinner: 'Abendessen',
  snack: 'Snacks',
}

export default function Today() {
  const [date, setDate] = useState(todayKey())
  const [weightOpen, setWeightOpen] = useState(false)
  const plan = useDayPlan(date)
  const navigate = useNavigate()

  if (!plan) {
    return (
      <Screen title="Heute">
        <div className="mt-6 space-y-3">
          <div className="skeleton h-32 rounded-card" />
          <div className="skeleton h-40 rounded-card" />
        </div>
      </Screen>
    )
  }

  const { consumed, targets, entries, expenditure, currentKg, trendKg } = plan

  // Sum the per-entry error bands in quadrature — independent estimates do not
  // simply add their errors.
  const uncertainty = Math.sqrt(
    entries.reduce((s, e) => s + (e.nutrients.kcal * PROVENANCE_ERROR[e.provenance].pct) ** 2, 0),
  )

  const byMeal = MEAL_SLOTS.map((m) => ({
    meal: m,
    items: entries.filter((e) => e.meal === m),
  })).filter((g) => g.items.length > 0)

  return (
    <Screen
      title={
        <button
          onClick={() => setDate(todayKey())}
          className="text-[1.0625rem] font-semibold"
        >
          {humanDate(date)}
        </button>
      }
      subtitle={new Date(date).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })}
      left={
        <IconButton label="Vorheriger Tag" onClick={() => setDate(addDays(date, -1))}>
          <ChevronLeft size={20} />
        </IconButton>
      }
      right={
        <IconButton
          label="Nächster Tag"
          disabled={isFuture(addDays(date, 1))}
          className="disabled:opacity-25"
          onClick={() => setDate(addDays(date, 1))}
        >
          <ChevronRight size={20} />
        </IconButton>
      }
    >
      <Card className="mt-2 p-5">
        <CalorieHeader consumed={consumed.kcal} target={targets.kcal} uncertainty={uncertainty} />
        <div className="mt-5 border-t border-line pt-4">
          <MacroRows consumed={consumed} targets={targets} showFiber={plan.settings.showFiber} />
        </div>
      </Card>

      <QuickActions onPick={(p) => navigate(p)} />

      <SectionTitle
        action={
          <span className="text-[0.6875rem] text-txt-3">
            {entries.length} {entries.length === 1 ? 'Eintrag' : 'Einträge'}
          </span>
        }
      >
        Heute gegessen
      </SectionTitle>

      {byMeal.length === 0 ? (
        <Card className="py-2">
          <EmptyState
            icon={<Plus size={28} />}
            title="Noch nichts protokolliert"
            body="Foto, Diktat, Barcode oder Suche — was am schnellsten geht."
            action={
              <Button variant="primary" onClick={() => navigate('/add')}>
                Essen hinzufügen
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {byMeal.map(({ meal, items }) => (
            <MealGroup key={meal} meal={meal} items={items} />
          ))}
        </div>
      )}

      <SectionTitle
        action={
          <button
            className="text-[0.6875rem] font-medium text-brand-text"
            onClick={() => setWeightOpen(true)}
          >
            Eintragen
          </button>
        }
      >
        Gewicht & Verbrauch
      </SectionTitle>

      <Card className="p-4">
        {currentKg == null ? (
          <EmptyState
            icon={<Scale size={26} />}
            title="Noch keine Wiegung"
            body="Ohne Gewichtsverlauf kann dein echter Verbrauch nicht berechnet werden — nur geschätzt."
            action={
              <Button variant="primary" onClick={() => setWeightOpen(true)}>
                Gewicht eintragen
              </Button>
            }
          />
        ) : (
          <>
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="text-2xl font-bold leading-none">{fmtKg(currentKg)} kg</div>
                <div className="mt-1.5 text-xs text-txt-3">
                  Trend {trendKg != null ? `${fmtKg(trendKg)} kg` : '–'}
                </div>
              </div>
              {expenditure.daysOfData > 0 && (
                <div className="text-right">
                  <div className="text-sm font-semibold tabular-nums">
                    {signed(expenditure.slopeKgPerWeek, 'de', 2)} kg
                  </div>
                  <div className="mt-1 text-[0.6875rem] text-txt-3">pro Woche</div>
                </div>
              )}
            </div>

            <div className="mt-4 border-t border-line pt-3.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[0.8125rem] text-txt-2">Verbrauch</span>
                <span className="text-[0.9375rem] font-semibold tabular-nums">
                  {fmtKcal(expenditure.tdee)} kcal
                </span>
              </div>
              <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-txt-3">
                {expenditure.note}
                {expenditure.daysOfData > 0 && ` · ${expenditure.daysOfData} Tage Daten`}
              </p>
            </div>
          </>
        )}
      </Card>

      <WeightSheet
        open={weightOpen}
        date={date}
        current={currentKg}
        onClose={() => setWeightOpen(false)}
      />
    </Screen>
  )
}

function QuickActions({ onPick }: { onPick: (path: string) => void }) {
  const actions = [
    { path: '/photo', icon: Camera, label: 'Foto' },
    { path: '/voice', icon: Mic, label: 'Diktat' },
    { path: '/scan', icon: ScanLine, label: 'Barcode' },
    { path: '/add', icon: Search, label: 'Suchen' },
  ]
  return (
    <div className="mt-4 grid grid-cols-4 gap-2">
      {actions.map((a) => (
        <button
          key={a.path}
          onClick={() => onPick(a.path)}
          className="flex flex-col items-center gap-1.5 rounded-tile border border-line bg-surface py-3 transition-colors active:bg-surface-2"
        >
          <a.icon size={19} className="text-brand-text" />
          <span className="text-[0.6875rem] font-medium text-txt-2">{a.label}</span>
        </button>
      ))}
    </div>
  )
}

function MealGroup({ meal, items }: { meal: MealSlot; items: LogEntry[] }) {
  const total = items.reduce((s, e) => s + e.nutrients.kcal, 0)
  return (
    <Card>
      <div className="flex items-baseline justify-between border-b border-line px-4 py-2.5">
        <span className="text-[0.8125rem] font-medium text-txt-2">{MEAL_LABELS[meal]}</span>
        <span className="text-[0.8125rem] tabular-nums text-txt-3">{fmtKcal(total)} kcal</span>
      </div>
      <ul>
        {items.map((e) => (
          <EntryRow key={e.id} entry={e} />
        ))}
      </ul>
    </Card>
  )
}

function EntryRow({ entry }: { entry: LogEntry }) {
  const [confirming, setConfirming] = useState(false)
  const prov = PROVENANCE_ERROR[entry.provenance]
  const band = entry.nutrients.kcal * prov.pct

  return (
    <li className="flex items-start gap-3 border-b border-line/60 px-4 py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 flex-1 text-[0.9375rem] leading-snug">
            {entry.name}
            {entry.brand && <span className="text-txt-3"> · {entry.brand}</span>}
          </p>
          <span className="shrink-0 text-[0.9375rem] font-medium tabular-nums">
            {fmtKcal(entry.nutrients.kcal)}
          </span>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[0.6875rem] text-txt-3">
            {num(Math.round(entry.resolvedAmount))} {entry.basis}
          </span>
          {/* An estimate is shown as a range; a weighed entry is not. */}
          {prov.pct >= 0.15 && (
            <span className="text-[0.6875rem] text-txt-3">± {Math.round(band)} kcal</span>
          )}
          <Badge tone={entry.confidence === 'high' ? 'neutral' : 'warn'}>{prov.label}</Badge>
        </div>

        <div className="mt-1.5">
          <MacroChips n={entry.nutrients} />
        </div>
      </div>

      {confirming ? (
        <div className="flex shrink-0 flex-col gap-1">
          <button
            className="rounded-lg bg-bad/15 px-2 py-1 text-[0.6875rem] font-medium text-bad"
            onClick={() => void deleteEntry(entry.id)}
          >
            Löschen
          </button>
          <button
            className="px-2 py-1 text-[0.6875rem] text-txt-3"
            onClick={() => setConfirming(false)}
          >
            Abbrechen
          </button>
        </div>
      ) : (
        <IconButton
          label={`${entry.name} löschen`}
          className="-mr-2 size-8"
          onClick={() => setConfirming(true)}
        >
          <Trash2 size={15} />
        </IconButton>
      )}
    </li>
  )
}

function WeightSheet({
  open,
  date,
  current,
  onClose,
}: {
  open: boolean
  date: string
  current?: number
  onClose: () => void
}) {
  const [value, setValue] = useState('')
  const [fat, setFat] = useState('')

  const submit = async () => {
    // German decimal comma: "78,4" must not become 784.
    const kgVal = Number(value.replace(',', '.'))
    if (!Number.isFinite(kgVal) || kgVal <= 0 || kgVal > 400) return
    const fatVal = fat ? Number(fat.replace(',', '.')) : undefined
    await saveWeight(date, kgVal, Number.isFinite(fatVal!) ? fatVal : undefined)
    setValue('')
    setFat('')
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title={`Gewicht · ${humanDate(date)}`}>
      <div className="space-y-4 pb-2">
        <div>
          <label className="mb-1.5 block text-[0.8125rem] text-txt-2">Gewicht (kg)</label>
          <Input
            type="text"
            inputMode="decimal"
            autoFocus
            placeholder={current ? fmtKg(current) : '78,4'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="text-2xl font-semibold"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[0.8125rem] text-txt-2">
            Körperfett % <span className="text-txt-3">(optional)</span>
          </label>
          <Input
            type="text"
            inputMode="decimal"
            placeholder="15"
            value={fat}
            onChange={(e) => setFat(e.target.value)}
          />
        </div>
        <p className="text-xs leading-relaxed text-txt-3">
          Wiege dich möglichst immer zur gleichen Zeit — morgens, nüchtern, nach der Toilette.
          Einzelne Tage schwanken um 1–2 kg durch Wasser; die App rechnet deshalb mit dem
          geglätteten Trend, nicht mit dem Tageswert.
        </p>
        <Button variant="primary" className="w-full" onClick={() => void submit()}>
          Speichern
        </Button>
      </div>
    </Sheet>
  )
}
