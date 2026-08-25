import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Cloud, HardDrive, Search, ScanLine, X } from 'lucide-react'
import { Badge, Button, Card, EmptyState, IconButton, Input, Screen, Segmented, Sheet, Spinner } from '../components/ui'
import { MacroChips } from '../components/MacroBars'
import { todayKey } from '../lib/date'
import { altName, kcal as fmtKcal, num } from '../lib/format'
import { scale } from '../lib/nutrition'
import { addEntry, searchLocalFoods, upsertFood } from '../lib/repo'
import { MEAL_SLOTS, type Food, type MealSlot } from '../lib/types'
import { OffError, isOnline, searchProducts, type NormalisedProduct } from '../services/openfoodfacts'

const MEAL_LABELS: Record<MealSlot, string> = {
  breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack',
}

function currentMeal(): MealSlot {
  const h = new Date().getHours()
  if (h < 10.5) return 'breakfast'
  if (h < 15) return 'lunch'
  if (h < 21) return 'dinner'
  return 'snack'
}

export default function AddFood() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [local, setLocal] = useState<Food[]>([])
  const [remote, setRemote] = useState<NormalisedProduct[]>([])
  const [searching, setSearching] = useState(false)
  const [remoteError, setRemoteError] = useState<string | null>(null)
  const [picked, setPicked] = useState<Food | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Local results are instant and free, so they update on every keystroke.
  useEffect(() => {
    void searchLocalFoods(query, 25).then(setLocal)
  }, [query])

  /**
   * Online search is a separate, explicit step.
   *
   * Open Food Facts sheds load hard on its search endpoint — measured at
   * roughly 4 in 10 requests returning an instant 503 — so search-as-you-type
   * against it would both fail constantly and be a bad citizen. Local first,
   * network on request.
   */
  const searchOnline = async () => {
    if (!query.trim() || !isOnline()) return
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setSearching(true)
    setRemoteError(null)
    try {
      setRemote(await searchProducts(query, { signal: ctrl.signal }))
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setRemoteError(e instanceof OffError ? e.message : 'Onlinesuche fehlgeschlagen')
    } finally {
      setSearching(false)
    }
  }

  const results = useMemo(() => {
    const seen = new Set(local.map((f) => f.barcode).filter(Boolean))
    return [
      ...local.map((f) => ({ food: f, source: 'local' as const, warnings: [] as string[] })),
      ...remote
        .filter((r) => !seen.has(r.food.barcode))
        .map((r) => ({ food: r.food, source: 'off' as const, warnings: r.warnings })),
    ]
  }, [local, remote])

  return (
    <Screen
      title="Add food"
      left={
        <IconButton label="Back" onClick={() => navigate(-1)}>
          <ChevronLeft size={20} />
        </IconButton>
      }
      right={
        <IconButton label="Scan barcode" onClick={() => navigate('/scan')}>
          <ScanLine size={19} />
        </IconButton>
      }
    >
      <div className="sticky top-0 z-20 -mx-4 bg-bg px-4 pb-2 pt-1">
        <div className="relative">
          <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-txt-3" />
          <Input
            type="search"
            autoFocus
            enterKeyHint="search"
            placeholder="Search food or brand"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void searchOnline()}
            className="pl-10 pr-10"
          />
          {query && (
            <button
              onClick={() => { setQuery(''); setRemote([]) }}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-txt-3"
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {query.trim().length >= 2 && (
        <button
          onClick={() => void searchOnline()}
          disabled={searching || !isOnline()}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-tile border border-line bg-surface py-2.5 text-[0.8125rem] text-txt-2 active:bg-surface-2 disabled:opacity-50"
        >
          {searching ? <Spinner className="size-3.5" /> : <Cloud size={15} />}
          {isOnline()
            ? searching
              ? 'Searching Open Food Facts…'
              : `Search "${query}" online (Aldi, REWE, dm, EDEKA …)`
            : 'Offline — local results only'}
        </button>
      )}

      {remoteError && (
        <p className="mt-2 rounded-tile border border-warn/25 bg-warn/8 px-3.5 py-2.5 text-[0.8125rem] text-warn">
          {remoteError}
        </p>
      )}

      {results.length === 0 ? (
        <EmptyState
          icon={<Search size={28} />}
          title={query ? 'No matches' : 'Recently used will appear here'}
          body={
            query
              ? 'Try the online search, or scan the barcode.'
              : 'Search for a food, or scan a package.'
          }
        />
      ) : (
        <ul className="mt-3 space-y-2">
          {results.map(({ food, source, warnings }) => (
            <li key={food.id}>
              <button
                onClick={() => setPicked(food)}
                className="flex w-full items-center gap-3 rounded-tile border border-line bg-surface px-3.5 py-3 text-left active:bg-surface-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.9375rem] font-bold leading-snug tracking-[-0.015em]">
                    {food.name || food.nameDe}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                    {food.brand && (
                      <span className="truncate text-[0.6875rem] text-txt-3">{food.brand}</span>
                    )}
                    {/* Keep the German name visible: it is what is on the packet. */}
                    {altName(food) && (
                      <span className="truncate text-[0.6875rem] text-txt-4">{altName(food)}</span>
                    )}
                    {food.retailer && <Badge tone="brand">{food.retailer}</Badge>}
                    {source === 'local' ? (
                      <Badge>
                        <HardDrive size={9} /> local
                      </Badge>
                    ) : (
                      <Badge>OFF</Badge>
                    )}
                    {warnings.length > 0 && <Badge tone="warn">check data</Badge>}
                  </div>
                  <div className="mt-1.5">
                    <MacroChips n={food.per100} />
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="numeric text-[1.0625rem] font-extrabold">
                    {fmtKcal(food.per100.kcal)}
                  </div>
                  <div className="text-[0.625rem] font-semibold text-txt-4">/100 {food.basis}</div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {picked && <PortionSheet food={picked} onClose={() => setPicked(null)} onDone={() => navigate('/')} />}
    </Screen>
  )
}

export function PortionSheet({
  food,
  onClose,
  onDone,
}: {
  food: Food
  onClose: () => void
  onDone: () => void
}) {
  const [meal, setMeal] = useState<MealSlot>(currentMeal())
  const defaultServing = food.servings.find((s) => s.isDefault) ?? food.servings[0]
  const [servingLabel, setServingLabel] = useState(defaultServing?.label ?? '')
  const [count, setCount] = useState('1')
  const [state, setState] = useState<'raw' | 'cooked'>(food.state === 'cooked' ? 'cooked' : 'raw')

  const serving = food.servings.find((s) => s.label === servingLabel) ?? defaultServing
  const qty = Number(count.replace(',', '.')) || 0
  const rawGrams = qty * (serving?.amount ?? 100)

  // If the entry is weighed in a different state than the database row, convert.
  const needsYield = food.yieldFactor != null && food.state !== 'as_sold'
  const effectiveGrams =
    needsYield && state !== food.state
      ? state === 'cooked'
        ? rawGrams / food.yieldFactor!
        : rawGrams * food.yieldFactor!
      : rawGrams

  const nutrients = scale(food.per100, effectiveGrams)

  const save = async () => {
    await upsertFood(food)
    await addEntry({
      date: todayKey(),
      meal,
      food,
      amount: qty,
      unit: 'serving',
      servingLabel: serving?.label,
      nutrients,
      method: food.source === 'off' ? 'barcode' : 'search',
      provenance: food.source === 'off' ? 'barcode' : 'weighed',
    })
    onDone()
  }

  return (
    <Sheet open onClose={onClose} title={food.name || food.nameDe}>
      <div className="space-y-4 pb-2">
        {food.brand && <p className="-mt-2 text-[0.8125rem] text-txt-3">{food.brand}</p>}

        <Segmented
          options={MEAL_SLOTS.map((m) => ({ value: m, label: MEAL_LABELS[m] }))}
          value={meal}
          onChange={setMeal}
        />

        <div className="flex gap-2">
          <div className="w-24">
            <label className="mb-1.5 block text-[0.8125rem] text-txt-2">Amount</label>
            <Input
              type="text"
              inputMode="decimal"
              value={count}
              onChange={(e) => setCount(e.target.value)}
              className="text-center text-lg font-semibold"
            />
          </div>
          <div className="min-w-0 flex-1">
            <label className="mb-1.5 block text-[0.8125rem] text-txt-2">Serving</label>
            <select
              value={servingLabel}
              onChange={(e) => setServingLabel(e.target.value)}
              className="h-[2.875rem] w-full rounded-xl border border-line bg-surface-2 px-3 text-txt outline-none focus:border-brand"
            >
              {food.servings.map((s) => (
                <option key={s.label} value={s.label}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {needsYield && (
          <div>
            <label className="mb-1.5 block text-[0.8125rem] text-txt-2">Weighed as</label>
            <Segmented
              options={[
                { value: 'raw' as const, label: 'Raw' },
                { value: 'cooked' as const, label: 'Cooked' },
              ]}
              value={state}
              onChange={setState}
            />
            <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-txt-3">
              {food.yieldFactor! < 1
                ? `This food loses water when cooked (yield ${num(food.yieldFactor!, 2)}). A cooked weight therefore came from more raw food — and carries more protein.`
                : `This food absorbs water when cooked (yield ${num(food.yieldFactor!, 2)}).`}
            </p>
          </div>
        )}

        <Card className="p-4">
          <div className="flex items-end justify-between">
            <div>
              <div className="numeric text-[1.75rem] font-extrabold leading-none text-kcal">
                {fmtKcal(nutrients.kcal)}
              </div>
              <div className="mt-1 text-[0.6875rem] text-txt-3">
                kcal · {num(Math.round(effectiveGrams))} {food.basis}
              </div>
            </div>
            <MacroChips n={nutrients} />
          </div>
        </Card>

        {food.provenance && (
          <p className="text-[0.6875rem] text-txt-3">Source: {food.provenance}</p>
        )}

        <Button variant="primary" className="w-full" onClick={() => void save()} disabled={qty <= 0}>
          Add
        </Button>
      </div>
    </Sheet>
  )
}
