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
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snacks',
}

export default function Today() {
  const [date, setDate] = useState(todayKey())
  const [weightOpen, setWeightOpen] = useState(false)
  const plan = useDayPlan(date)
  const navigate = useNavigate()

  if (!plan) {
    return (
      <Screen title="Today">
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
      subtitle={new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
      left={
        <IconButton label="Previous day" onClick={() => setDate(addDays(date, -1))}>
          <ChevronLeft size={20} />
        </IconButton>
      }
      right={
        <IconButton
          label="Next day"
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
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
          </span>
        }
      >
        Eaten today
      </SectionTitle>

      {byMeal.length === 0 ? (
        <Card className="py-2">
          <EmptyState
            icon={<Plus size={28} />}
            title="Nothing logged yet"
            body="Photo, dictation, barcode or search — whichever is quickest."
            action={
              <Button variant="primary" onClick={() => navigate('/add')}>
                Add food
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
            Log it
          </button>
        }
      >
        Weight & expenditure
      </SectionTitle>

      <Card className="p-4">
        {currentKg == null ? (
          <EmptyState
            icon={<Scale size={26} />}
            title="No weigh-in yet"
            body="Without weight history your real expenditure can only be guessed at, not measured."
            action={
              <Button variant="primary" onClick={() => setWeightOpen(true)}>
                Log weight
              </Button>
            }
          />
        ) : (
          <>
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="numeric text-[1.75rem] font-extrabold leading-none">
                  {fmtKg(currentKg)}
                  <span className="ml-1 text-base font-bold text-txt-3">kg</span>
                </div>
                <div className="mt-1.5 text-xs font-semibold text-txt-3">
                  Trend {trendKg != null ? `${fmtKg(trendKg)} kg` : '–'}
                </div>
              </div>
              {expenditure.daysOfData > 0 && (
                <div className="text-right">
                  <div className="numeric text-sm font-extrabold">
                    {signed(expenditure.slopeKgPerWeek, 'en', 2)} kg
                  </div>
                  <div className="label-micro mt-1.5 text-[0.5625rem] text-txt-3">per week</div>
                </div>
              )}
            </div>

            <div className="mt-4 border-t border-line pt-3.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[0.8125rem] font-semibold text-txt-2">Expenditure</span>
                <span className="numeric text-[0.9375rem] font-extrabold">
                  {fmtKcal(expenditure.tdee)} kcal
                </span>
              </div>
              <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-txt-3">
                {expenditure.note}
                {expenditure.daysOfData > 0 && ` · ${expenditure.daysOfData} days of data`}
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
    { path: '/photo', icon: Camera, label: 'Photo' },
    { path: '/voice', icon: Mic, label: 'Speak' },
    { path: '/scan', icon: ScanLine, label: 'Barcode' },
    { path: '/add', icon: Search, label: 'Search' },
  ]
  return (
    <div className="mt-4 grid grid-cols-4 gap-2">
      {actions.map((a) => (
        <button
          key={a.path}
          onClick={() => onPick(a.path)}
          className="flex flex-col items-center gap-1.5 rounded-tile border border-line bg-surface py-3 transition-colors active:bg-surface-2"
        >
          <a.icon size={17} strokeWidth={2.25} className="text-brand-text" />
          <span className="label-micro text-[0.5625rem] text-txt-2">{a.label}</span>
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
        <span className="label-micro text-txt-2">{MEAL_LABELS[meal]}</span>
        <span className="numeric text-[0.8125rem] font-bold text-txt-3">{fmtKcal(total)} kcal</span>
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
          <p className="min-w-0 flex-1 text-[0.9375rem] font-bold leading-snug tracking-[-0.015em]">
            {entry.name}
            {entry.brand && <span className="font-medium text-txt-3"> · {entry.brand}</span>}
          </p>
          <span className="numeric shrink-0 text-[0.9375rem] font-extrabold">
            {fmtKcal(entry.nutrients.kcal)}
          </span>
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="numeric text-[0.6875rem] font-semibold text-txt-3">
            {num(Math.round(entry.resolvedAmount))} {entry.basis}
          </span>
          {/* An estimate is shown as a range; a weighed entry is not. */}
          {prov.pct >= 0.15 && (
            <span className="numeric text-[0.6875rem] font-medium text-txt-4">
              ± {Math.round(band)} kcal
            </span>
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
            Delete
          </button>
          <button
            className="px-2 py-1 text-[0.6875rem] text-txt-3"
            onClick={() => setConfirming(false)}
          >
            Cancel
          </button>
        </div>
      ) : (
        <IconButton
          label={`Delete ${entry.name}`}
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
    <Sheet open={open} onClose={onClose} title={`Weight · ${humanDate(date)}`}>
      <div className="space-y-4 pb-2">
        <div>
          <label className="mb-1.5 block text-[0.8125rem] text-txt-2">Weight (kg)</label>
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
            Body fat % <span className="text-txt-3">(optional)</span>
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
          Weigh yourself at the same time each day — morning, before eating, after the
          bathroom. Single days swing 1–2 kg on water alone, which is why targets follow the
          smoothed trend rather than today's reading.
        </p>
        <Button variant="primary" className="w-full" onClick={() => void submit()}>
          Save
        </Button>
      </div>
    </Sheet>
  )
}
