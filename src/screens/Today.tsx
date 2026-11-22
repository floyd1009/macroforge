import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Camera, ChevronLeft, ChevronRight, ClipboardCheck, Copy, Flame, Mic, Plus, ScanLine, Scale, Search } from 'lucide-react'
import { CheckinSheet } from '../components/CheckinSheet'
import { CalorieHeader, MacroChips, MacroRows } from '../components/MacroBars'
import { Badge, Button, Card, EmptyState, IconButton, Input, Screen, Segmented, Sheet, SectionTitle } from '../components/ui'
import { addDays, fromKey, humanDate, inlineDate, isFuture, isToday, todayKey } from '../lib/date'
import { kcal as fmtKcal, kg as fmtKg, num, parseNumber, signed } from '../lib/format'
import { setLogTarget } from '../lib/logTarget'
import { scale } from '../lib/nutrition'
import {
  copyDay,
  copyMeal,
  deleteEntry,
  lastDayWithMeal,
  loggingStreak,
  moveEntry,
  saveWeight,
  updateEntryAmount,
} from '../lib/repo'
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
  const [checkinOpen, setCheckinOpen] = useState(false)
  const [editing, setEditing] = useState<LogEntry | null>(null)
  const plan = useDayPlan(date)
  const navigate = useNavigate()
  const streak = useLiveQuery(() => loggingStreak(), [])
  // The most recent earlier day with anything logged, for "copy previous day".
  const previousDay = useLiveQuery(() => lastDayWithMeal(date), [date])

  // Every add screen logs to the day being viewed, not blindly to today.
  useEffect(() => setLogTarget(date), [date])

  const add = (path: string, meal?: MealSlot) => {
    setLogTarget(date, meal)
    navigate(path)
  }

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
  }))
  const dayTarget =
    plan.targets.kcal !== plan.weekTargets.kcal
      ? plan.targets.kcal > plan.weekTargets.kcal
        ? 'High day'
        : 'Low day'
      : null

  return (
    <Screen
      title={
        <button
          onClick={() => setDate(todayKey())}
        >
          {humanDate(date)}
        </button>
      }
      subtitle={fromKey(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
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
      {plan.checkinDue && isToday(date) && (
        <button
          onClick={() => setCheckinOpen(true)}
          className="mt-2 flex w-full items-center gap-3 rounded-card border border-brand/50 bg-brand-wash px-4 py-3.5 text-left active:bg-surface-2"
        >
          <ClipboardCheck size={20} className="shrink-0 text-brand-text" />
          <span className="min-w-0 flex-1">
            <span className="block text-[0.9375rem] font-bold tracking-[-0.015em]">Weekly check-in is ready</span>
            <span className="mt-0.5 block text-[0.6875rem] font-semibold text-txt-3">
              Review the week and set next week's targets
            </span>
          </span>
          <ChevronRight size={18} className="shrink-0 text-txt-3" />
        </button>
      )}

      <Card className="mt-2 p-5">
        <CalorieHeader consumed={consumed.kcal} target={targets.kcal} uncertainty={uncertainty} />
        <div className="mt-5 border-t border-line pt-4">
          <MacroRows consumed={consumed} targets={targets} showFiber={plan.settings.showFiber} />
        </div>
        {(dayTarget || (streak ?? 0) > 1) && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3.5">
            {(streak ?? 0) > 1 && (
              <Badge>
                <Flame size={10} /> {streak} days logged in a row
              </Badge>
            )}
            {dayTarget && <Badge tone="brand">{dayTarget}</Badge>}
          </div>
        )}
      </Card>

      <QuickActions onPick={(p) => add(p)} />

      <SectionTitle
        action={
          <span className="text-[0.6875rem] text-txt-3">
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
          </span>
        }
      >
        Eaten today
      </SectionTitle>

      {entries.length === 0 && previousDay && (
        <button
          onClick={() => void copyDay(previousDay, date)}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-tile border border-line bg-surface py-2.5 text-[0.8125rem] font-semibold text-txt-2 active:bg-surface-2"
        >
          <Copy size={14} /> Copy everything from {inlineDate(previousDay, false)}
        </button>
      )}

      <div className="space-y-3">
        {byMeal.map(({ meal, items }) => (
          <MealGroup
            key={meal}
            date={date}
            meal={meal}
            items={items}
            onAdd={() => add('/add', meal)}
            onEdit={setEditing}
          />
        ))}
      </div>

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
                <div className="text-display text-[2.125rem] leading-none">
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

      {plan.targetSource !== 'manual' && isToday(date) && (
        <p className="mt-3 px-1 text-[0.6875rem] leading-relaxed text-txt-3">
          {plan.targetSource === 'checkin'
            ? `Targets are fixed until the next check-in ${inlineDate(plan.nextCheckin)}.`
            : `Targets come from a formula until the first check-in ${inlineDate(plan.nextCheckin)}.`}
        </p>
      )}

      <WeightSheet
        open={weightOpen}
        date={date}
        current={currentKg}
        onClose={() => setWeightOpen(false)}
      />
      {checkinOpen && <CheckinSheet onClose={() => setCheckinOpen(false)} />}
      {editing && <EntrySheet entry={editing} onClose={() => setEditing(null)} />}
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

function MealGroup({
  date,
  meal,
  items,
  onAdd,
  onEdit,
}: {
  date: string
  meal: MealSlot
  items: LogEntry[]
  onAdd: () => void
  onEdit: (e: LogEntry) => void
}) {
  const total = items.reduce((s, e) => s + e.nutrients.kcal, 0)
  // Offer the last time this meal was logged — most breakfasts repeat.
  const lastDay = useLiveQuery(
    () => (items.length === 0 ? lastDayWithMeal(date, meal) : undefined),
    [date, meal, items.length],
  )

  return (
    <Card>
      <div className="flex items-center justify-between gap-2 px-4 py-1.5">
        <span className="label-micro text-txt-2">{MEAL_LABELS[meal]}</span>
        <span className="flex items-center gap-1">
          {items.length > 0 ? (
            <span className="numeric text-[0.8125rem] font-bold text-txt-3">{fmtKcal(total)} kcal</span>
          ) : (
            lastDay && (
              <button
                onClick={() => void copyMeal(lastDay, meal, date)}
                className="flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-[0.75rem] font-semibold text-txt-3 active:bg-surface-2"
              >
                <Copy size={13} /> Same as {inlineDate(lastDay, false)}
              </button>
            )
          )}
          <IconButton label={`Add to ${MEAL_LABELS[meal]}`} className="-mr-2 size-9 text-brand-text" onClick={onAdd}>
            <Plus size={18} strokeWidth={2.5} />
          </IconButton>
        </span>
      </div>
      {items.length > 0 && (
        <ul className="border-t border-line">
          {items.map((e) => (
            <EntryRow key={e.id} entry={e} onEdit={() => onEdit(e)} />
          ))}
        </ul>
      )}
    </Card>
  )
}

function EntryRow({ entry, onEdit }: { entry: LogEntry; onEdit: () => void }) {
  const prov = PROVENANCE_ERROR[entry.provenance]
  const band = entry.nutrients.kcal * prov.pct

  return (
    <li className="border-b border-line/60 last:border-b-0">
      <button onClick={onEdit} className="block w-full px-4 py-3 text-left active:bg-surface-2">
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
          {entry.method !== 'quick' && (
            <span className="numeric text-[0.6875rem] font-semibold text-txt-3">
              {num(Math.round(entry.resolvedAmount))} {entry.basis}
            </span>
          )}
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
      </button>
    </li>
  )
}

/** Change the amount, move it to another meal, or remove it. */
function EntrySheet({ entry, onClose }: { entry: LogEntry; onClose: () => void }) {
  const fixed = entry.method === 'quick'
  const [amount, setAmount] = useState(String(Math.round(entry.resolvedAmount)))
  const [meal, setMeal] = useState<MealSlot>(entry.meal)

  const grams = Math.max(0, parseNumber(amount) ?? 0)
  // Preview by scaling the stored snapshot, so it matches what save will do.
  const preview =
    fixed || entry.resolvedAmount <= 0
      ? entry.nutrients
      : scale(scale(entry.nutrients, 100 / entry.resolvedAmount), grams * 100)

  const save = async () => {
    if (!fixed && grams > 0 && Math.round(grams) !== Math.round(entry.resolvedAmount)) {
      await updateEntryAmount(entry.id, grams, entry.basis)
    }
    if (meal !== entry.meal) await moveEntry(entry.id, meal)
    onClose()
  }

  return (
    <Sheet open onClose={onClose} title={entry.name}>
      <div className="space-y-4 pb-2">
        <Segmented
          options={MEAL_SLOTS.map((m) => ({ value: m, label: MEAL_LABELS[m] }))}
          value={meal}
          onChange={setMeal}
        />
        {!fixed && (
          <div>
            <label className="mb-1.5 block text-[0.8125rem] text-txt-2">Amount ({entry.basis})</label>
            <Input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="text-center text-xl font-semibold"
            />
          </div>
        )}
        <div className="flex items-center justify-between rounded-tile border border-line bg-surface-2 px-3.5 py-3">
          <span className="numeric text-[1.0625rem] font-extrabold">{fmtKcal(preview.kcal)} kcal</span>
          <MacroChips n={preview} />
        </div>
        <div className="flex gap-2">
          <Button
            variant="danger"
            onClick={() => {
              void deleteEntry(entry.id)
              onClose()
            }}
          >
            Delete
          </Button>
          <Button variant="primary" className="flex-1" disabled={!fixed && grams <= 0} onClick={() => void save()}>
            Save
          </Button>
        </div>
      </div>
    </Sheet>
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
