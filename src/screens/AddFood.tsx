import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, ChevronLeft, Cloud, HardDrive, Pencil, PencilLine, Search, ScanLine, Star, X, Zap } from 'lucide-react'
import { Badge, Button, Card, EmptyState, IconButton, Input, Screen, Segmented, Sheet, Spinner } from '../components/ui'
import { MacroChips } from '../components/MacroBars'
import { CustomFoodSheet, QuickAddSheet } from '../components/FoodSheets'
import { MEAL_LABELS } from '../lib/meals'
import { humanDate, isToday } from '../lib/date'
import { logDate, logMeal } from '../lib/logTarget'
import { altName, kcal as fmtKcal, num } from '../lib/format'
import { scale } from '../lib/nutrition'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getProfile } from '../lib/db'
import { addEntry, searchLocalFoods, toggleFavorite, upsertFood } from '../lib/repo'
import { MEAL_SLOTS, type Food, type MealSlot } from '../lib/types'
import { OffError, isOnline, searchProducts, type NormalisedProduct } from '../services/openfoodfacts'

export default function AddFood() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [local, setLocal] = useState<Food[]>([])
  const [remote, setRemote] = useState<NormalisedProduct[]>([])
  const [searching, setSearching] = useState(false)
  const [remoteError, setRemoteError] = useState<string | null>(null)
  const [picked, setPicked] = useState<Food | null>(null)
  const [sheet, setSheet] = useState<'quick' | 'custom' | null>(null)
  const favorites = useLiveQuery(
    async () => (await db.foods.filter((f) => !!f.favorite && !f.deleted).toArray()).sort((a, b) => a.name.localeCompare(b.name)),
    [],
  )
  const date = logDate()
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
      setRemoteError(e instanceof OffError ? e.message : 'The online search failed. Try again in a moment.')
    } finally {
      setSearching(false)
    }
  }

  const results = useMemo(() => {
    const seen = new Set(local.map((f) => f.barcode).filter(Boolean))
    // With no query the favourites are listed above, so do not repeat them.
    const pinned = new Set(query.trim() ? [] : (favorites ?? []).map((f) => f.id))
    return [
      ...local.filter((f) => !pinned.has(f.id)).map((f) => ({ food: f, source: 'local' as const, warnings: [] as string[] })),
      ...remote
        .filter((r) => !seen.has(r.food.barcode))
        .map((r) => ({ food: r.food, source: 'off' as const, warnings: r.warnings })),
    ]
  }, [local, remote, favorites, query])

  return (
    <Screen
      title="Add food"
      subtitle={isToday(date) ? undefined : `Logging to ${humanDate(date)}`}
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
              : `Search "${query.trim().slice(0, 22)}" in supermarket products`
            : 'Offline — local results only'}
        </button>
      )}

      {!query.trim() && (
        <div className="mt-2 grid grid-cols-3 gap-2">
          {[
            { key: 'quick', icon: Zap, label: 'Quick add', run: () => setSheet('quick') },
            { key: 'custom', icon: PencilLine, label: 'New food', run: () => setSheet('custom') },
            { key: 'recipes', icon: BookOpen, label: 'Recipes', run: () => navigate('/recipes') },
          ].map((a) => (
            <button
              key={a.key}
              onClick={a.run}
              className="flex flex-col items-center gap-1.5 rounded-tile border border-line bg-surface py-3 transition-colors active:bg-surface-2"
            >
              <a.icon size={17} strokeWidth={2.25} className="text-brand-text" />
              <span className="label-micro text-[0.5625rem] text-txt-2">{a.label}</span>
            </button>
          ))}
        </div>
      )}

      {!query.trim() && favorites && favorites.length > 0 && (
        <>
          <p className="label-micro mb-2 mt-5 text-txt-3">Favourites</p>
          <ul className="space-y-2">
            {favorites.map((food) => (
              <li key={food.id}>
                <FoodRow food={food} source="local" warnings={[]} onPick={setPicked} />
              </li>
            ))}
          </ul>
          {results.length > 0 && <p className="label-micro mb-0 mt-5 text-txt-3">Recent</p>}
        </>
      )}

      {remoteError && (
        <p className="mt-2 rounded-tile border border-warn/25 bg-warn/8 px-3.5 py-2.5 text-[0.8125rem] text-warn">
          {remoteError}
        </p>
      )}

      {results.length === 0 ? (
        // Favourites already fill the screen; an empty-state under them is noise.
        !query.trim() && favorites && favorites.length > 0 ? null : (
        <EmptyState
          icon={<Search size={28} />}
          title={query ? 'No matches' : 'Recently used will appear here'}
          body={
            query
              ? 'Try the online search, scan the barcode, or enter it from the label.'
              : 'Search for a food, or scan a package.'
          }
          action={
            query ? (
              <Button onClick={() => setSheet('custom')}>
                <PencilLine size={15} /> Create "{query.trim().slice(0, 24)}"
              </Button>
            ) : undefined
          }
        />
        )
      ) : (
        <ul className="mt-3 space-y-2">
          {results.map(({ food, source, warnings }) => (
            <li key={food.id}>
              <FoodRow food={food} source={source} warnings={warnings} onPick={setPicked} />
            </li>
          ))}
        </ul>
      )}

      {picked && <PortionSheet food={picked} onClose={() => setPicked(null)} onDone={() => navigate('/')} />}
      {sheet === 'quick' && <QuickAddSheet onClose={() => setSheet(null)} onDone={() => navigate('/')} />}
      {sheet === 'custom' && (
        <CustomFoodSheet
          initialName={query.trim()}
          onClose={() => setSheet(null)}
          onSaved={(food) => {
            setSheet(null)
            setPicked(food)
          }}
        />
      )}
    </Screen>
  )
}

function FoodRow({
  food,
  source,
  warnings,
  onPick,
}: {
  food: Food
  source: 'local' | 'off'
  warnings: string[]
  onPick: (food: Food) => void
}) {
  return (
    <button
      onClick={() => onPick(food)}
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
          {/* Raw vs cooked changes the numbers by ~30% for meat, so
              it belongs on the row, not buried in the detail sheet. */}
          {food.state !== 'as_sold' && (
            <Badge tone={food.state === 'cooked' ? 'ok' : 'neutral'}>{food.state}</Badge>
          )}
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
  const profile = useLiveQuery(() => getProfile(), [])
  // Read the stored row so the star reflects taps made while the sheet is open.
  const stored = useLiveQuery(() => db.foods.get(food.id), [food.id])
  const [editing, setEditing] = useState(false)
  const [meal, setMeal] = useState<MealSlot>(logMeal())
  const defaultServing = food.servings.find((s) => s.isDefault) ?? food.servings[0]
  const [servingLabel, setServingLabel] = useState(defaultServing?.label ?? '')
  const [count, setCount] = useState('1')
  const [state, setState] = useState<'raw' | 'cooked' | null>(null)
  // Default to however this user says they weigh, not to whatever state the
  // database row happens to be stored in.
  const weighedAs = state ?? profile?.weighsFood ?? 'cooked'

  const serving = food.servings.find((s) => s.label === servingLabel) ?? defaultServing
  const qty = Number(count.replace(',', '.')) || 0
  const rawGrams = qty * (serving?.amount ?? 100)

  // If the entry is weighed in a different state than the database row, convert.
  const needsYield = food.yieldFactor != null && food.state !== 'as_sold'
  const effectiveGrams =
    needsYield && weighedAs !== food.state
      ? weighedAs === 'cooked'
        ? rawGrams / food.yieldFactor!
        : rawGrams * food.yieldFactor!
      : rawGrams

  const nutrients = scale(food.per100, effectiveGrams)

  const save = async () => {
    await upsertFood(food)
    await addEntry({
      date: logDate(),
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

  const toggleFav = async () => {
    // A product from the online search is not in the database until it is used.
    await upsertFood(food)
    await toggleFavorite(food.id)
  }

  if (editing) {
    return <CustomFoodSheet food={stored ?? food} onClose={() => setEditing(false)} onSaved={onClose} />
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={
        <div className="flex items-start justify-between gap-3">
          <span className="min-w-0">{food.name || food.nameDe}</span>
          <span className="-mt-1 flex shrink-0">
            {food.source === 'custom' && !food.id.startsWith('recipe:') && (
              <IconButton label="Edit food" className="size-9" onClick={() => setEditing(true)}>
                <Pencil size={16} />
              </IconButton>
            )}
            <IconButton
              label={stored?.favorite ? 'Remove from favourites' : 'Add to favourites'}
              className="size-9"
              onClick={() => void toggleFav()}
            >
              <Star
                size={18}
                className={stored?.favorite ? 'text-fat' : undefined}
                fill={stored?.favorite ? 'currentColor' : 'none'}
              />
            </IconButton>
          </span>
        </div>
      }
    >
      <div className="space-y-4 pb-2">
        {food.brand && <p className="text-[0.8125rem] font-semibold text-txt-3">{food.brand}</p>}

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
              value={weighedAs}
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
              <div className="text-display text-[2rem] leading-none text-kcal">
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
