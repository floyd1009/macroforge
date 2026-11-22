import { useState } from 'react'
import { Button, Field, Input, Segmented, Sheet } from './ui'
import { MacroChips } from './MacroBars'
import { kcal as fmtKcal, parseNumber } from '../lib/format'
import { logDate, logMeal } from '../lib/logTarget'
import { checkEnergy, kcalFromMacros } from '../lib/nutrition'
import { quickAdd, saveCustomFood } from '../lib/repo'
import { MEAL_LABELS } from '../lib/meals'
import { MEAL_SLOTS, type Food, type MealSlot, type Nutrients } from '../lib/types'

/** A numeric input that accepts "84,5" as well as "84.5". */
function NumField({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  hint?: string
}) {
  return (
    <Field label={label} hint={hint}>
      <Input
        type="text"
        inputMode="decimal"
        value={value}
        placeholder={placeholder ?? '0'}
        onChange={(e) => onChange(e.target.value)}
        className="text-center"
      />
    </Field>
  )
}

const n = (s: string) => Math.max(0, parseNumber(s) ?? 0)

/**
 * Calories and macros with no food behind them — for a restaurant meal with
 * published numbers, or a day where the choice is a rough entry or none.
 */
export function QuickAddSheet({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [meal, setMeal] = useState<MealSlot>(logMeal())
  const [name, setName] = useState('')
  const [kcal, setKcal] = useState('')
  const [protein, setProtein] = useState('')
  const [carbs, setCarbs] = useState('')
  const [fat, setFat] = useState('')

  const macros = { protein: n(protein), carbs: n(carbs), fat: n(fat) }
  const derived = kcalFromMacros(macros)
  const stated = kcal.trim() ? n(kcal) : null
  const total = stated ?? derived
  // Only worth a warning when both were typed and they disagree badly.
  const check = stated != null && derived > 0 ? checkEnergy({ kcal: stated, ...macros }) : null

  const save = async () => {
    await quickAdd({ date: logDate(), meal, name, kcal: stated ?? undefined, ...macros })
    onDone()
  }

  return (
    <Sheet open onClose={onClose} title="Quick add">
      <div className="space-y-4 pb-2">
        <Segmented
          options={MEAL_SLOTS.map((m) => ({ value: m, label: MEAL_LABELS[m] }))}
          value={meal}
          onChange={setMeal}
        />
        <Field label="Name (optional)">
          <Input value={name} placeholder="Lunch out" onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-4 gap-2">
          <NumField label="kcal" value={kcal} onChange={setKcal} placeholder={derived ? String(Math.round(derived)) : '0'} />
          <NumField label="Protein" value={protein} onChange={setProtein} />
          <NumField label="Carbs" value={carbs} onChange={setCarbs} />
          <NumField label="Fat" value={fat} onChange={setFat} />
        </div>
        <p className="text-[0.6875rem] leading-relaxed text-txt-3">
          {stated == null
            ? 'Leave kcal empty and it is calculated from the macros (4 / 4 / 9 kcal per gram).'
            : check && check.status === 'suspect'
              ? `These macros add up to ${fmtKcal(derived)} kcal, not ${fmtKcal(stated)}. One of the two is off.`
              : 'Calories without macros still count toward the day, but protein will read low.'}
        </p>
        <Button variant="primary" className="w-full" disabled={total <= 0} onClick={() => void save()}>
          Add {total > 0 ? `${fmtKcal(total)} kcal` : ''}
        </Button>
      </div>
    </Sheet>
  )
}

/** Create or edit a food from the numbers on its label. */
export function CustomFoodSheet({
  food,
  initialName,
  onClose,
  onSaved,
}: {
  food?: Food
  initialName?: string
  onClose: () => void
  onSaved: (food: Food) => void
}) {
  const p = food?.per100
  const s = (v?: number) => (v != null && v > 0 ? String(Math.round(v * 10) / 10) : '')
  const own = food?.servings.find((x) => x.isDefault && x.amount !== 100)

  const [name, setName] = useState(food?.name ?? initialName ?? '')
  const [brand, setBrand] = useState(food?.brand ?? '')
  const [basis, setBasis] = useState<'g' | 'ml'>(food?.basis ?? 'g')
  const [kcal, setKcal] = useState(s(p?.kcal))
  const [protein, setProtein] = useState(s(p?.protein))
  const [carbs, setCarbs] = useState(s(p?.carbs))
  const [fat, setFat] = useState(s(p?.fat))
  const [fiber, setFiber] = useState(s(p?.fiber))
  const [sugar, setSugar] = useState(s(p?.sugar))
  const [salt, setSalt] = useState(s(p?.salt))
  const [servingLabel, setServingLabel] = useState(own ? own.label.replace(/\s*\(.*\)$/, '') : '')
  const [servingAmount, setServingAmount] = useState(own ? String(own.amount) : '')

  const per100: Nutrients = {
    kcal: n(kcal),
    protein: n(protein),
    carbs: n(carbs),
    fat: n(fat),
    ...(fiber.trim() ? { fiber: n(fiber) } : {}),
    ...(sugar.trim() ? { sugar: n(sugar) } : {}),
    ...(salt.trim() ? { salt: n(salt) } : {}),
  }
  const derived = kcalFromMacros(per100)
  if (!kcal.trim()) per100.kcal = derived
  const check = kcal.trim() && derived > 0 ? checkEnergy(per100) : null

  // The same hard limits applied to imported products: these cannot be true.
  const impossible = per100.protein + per100.carbs + per100.fat > 100.5 || per100.kcal > 900
  const valid = name.trim().length > 0 && per100.kcal > 0 && !impossible

  const save = async () => {
    const saved = await saveCustomFood({
      id: food?.id,
      name,
      brand,
      basis,
      per100,
      servingLabel,
      servingAmount: n(servingAmount) || undefined,
    })
    onSaved(saved)
  }

  return (
    <Sheet open onClose={onClose} title={food ? 'Edit food' : 'New food'} full>
      <div className="space-y-4 pb-2">
        <Field label="Name">
          <Input value={name} autoFocus={!food} placeholder="Protein bar" onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <Field label="Brand (optional)">
            <Input value={brand} onChange={(e) => setBrand(e.target.value)} />
          </Field>
          <Field label="Measured in" group>
            <Segmented
              options={[
                { value: 'g' as const, label: 'g' },
                { value: 'ml' as const, label: 'ml' },
              ]}
              value={basis}
              onChange={setBasis}
            />
          </Field>
        </div>

        <p className="label-micro pt-1 text-txt-3">Per 100 {basis}, as printed on the label</p>
        <div className="grid grid-cols-4 gap-2">
          <NumField label="kcal" value={kcal} onChange={setKcal} placeholder={derived ? String(Math.round(derived)) : '0'} />
          <NumField label="Protein" value={protein} onChange={setProtein} />
          <NumField label="Carbs" value={carbs} onChange={setCarbs} />
          <NumField label="Fat" value={fat} onChange={setFat} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <NumField label="Fibre" value={fiber} onChange={setFiber} placeholder="–" />
          <NumField label="Sugar" value={sugar} onChange={setSugar} placeholder="–" />
          <NumField label="Salt" value={salt} onChange={setSalt} placeholder="–" />
        </div>
        <p className="text-[0.6875rem] leading-relaxed text-txt-3">
          {impossible
            ? 'These numbers cannot be right: macros above 100 g per 100 g, or more than 900 kcal per 100 g (pure fat is 900).'
            : check && check.status === 'suspect'
              ? `The macros add up to ${fmtKcal(derived)} kcal but the label says ${fmtKcal(per100.kcal)}. Check for a typo.`
              : 'Carbs as on an EU label: without fibre. On a US label, subtract the fibre first.'}
        </p>

        <p className="label-micro pt-1 text-txt-3">Serving (optional)</p>
        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <Field label="Called">
            <Input value={servingLabel} placeholder="1 bar" onChange={(e) => setServingLabel(e.target.value)} />
          </Field>
          <NumField label={`Weighs (${basis})`} value={servingAmount} onChange={setServingAmount} placeholder="55" />
        </div>

        {per100.kcal > 0 && (
          <div className="flex items-center justify-between rounded-tile border border-line bg-surface-2 px-3.5 py-3">
            <span className="numeric text-[0.9375rem] font-extrabold">
              {fmtKcal(per100.kcal)} <span className="text-[0.6875rem] font-semibold text-txt-3">kcal / 100 {basis}</span>
            </span>
            <MacroChips n={per100} />
          </div>
        )}

        <Button variant="primary" className="w-full" disabled={!valid} onClick={() => void save()}>
          Save food
        </Button>
      </div>
    </Sheet>
  )
}
