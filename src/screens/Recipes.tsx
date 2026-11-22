import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { BookOpen, ChevronLeft, Plus, Search, Trash2, X } from 'lucide-react'
import { MacroChips } from '../components/MacroBars'
import { Button, Card, EmptyState, Field, IconButton, Input, Screen, SectionTitle, Sheet } from '../components/ui'
import { PortionSheet } from './AddFood'
import { db, newId } from '../lib/db'
import { kcal as fmtKcal, num, parseNumber } from '../lib/format'
import { recipeTotals, scale } from '../lib/nutrition'
import { deleteRecipe, saveRecipe, searchLocalFoods } from '../lib/repo'
import type { Food, Recipe } from '../lib/types'

type Ingredient = Recipe['ingredients'][number]

export default function Recipes() {
  const { id } = useParams()
  return id ? <RecipeEditor id={id} /> : <RecipeList />
}

function RecipeList() {
  const navigate = useNavigate()
  const [logging, setLogging] = useState<Food | null>(null)
  const recipes = useLiveQuery(
    async () => (await db.recipes.toArray()).filter((r) => !r.deleted).sort((a, b) => b.updatedAt - a.updatedAt),
    [],
  )

  const log = async (r: Recipe) => {
    const food = await db.foods.get(`recipe:${r.id}`)
    if (food) setLogging(food)
  }

  return (
    <Screen
      title="Recipes"
      left={
        <IconButton label="Back" onClick={() => navigate(-1)}>
          <ChevronLeft size={20} />
        </IconButton>
      }
      right={
        <IconButton label="New recipe" onClick={() => navigate('/recipes/new')}>
          <Plus size={20} />
        </IconButton>
      }
    >
      {!recipes ? (
        <div className="skeleton mt-2 h-24 rounded-card" />
      ) : recipes.length === 0 ? (
        <Card className="mt-2 py-2">
          <EmptyState
            icon={<BookOpen size={28} />}
            title="No recipes yet"
            body="Build a dish once from its ingredients, then log a portion in two taps."
            action={
              <Button variant="primary" onClick={() => navigate('/recipes/new')}>
                New recipe
              </Button>
            }
          />
        </Card>
      ) : (
        <ul className="mt-2 space-y-2">
          {recipes.map((r) => {
            const t = recipeTotals(r)
            return (
              <li key={r.id}>
                <Card className="flex items-center gap-3 px-4 py-3">
                  <button className="min-w-0 flex-1 text-left" onClick={() => void log(r)}>
                    <p className="truncate text-[0.9375rem] font-bold tracking-[-0.015em]">{r.name}</p>
                    <p className="mt-0.5 text-[0.6875rem] font-semibold text-txt-3">
                      {fmtKcal(t.perPortion.kcal)} kcal per portion · {r.portions}{' '}
                      {r.portions === 1 ? 'portion' : 'portions'}
                    </p>
                    <div className="mt-1.5">
                      <MacroChips n={t.perPortion} />
                    </div>
                  </button>
                  <Button onClick={() => navigate(`/recipes/${r.id}`)}>Edit</Button>
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      {logging && <PortionSheet food={logging} onClose={() => setLogging(null)} onDone={() => navigate('/')} />}
    </Screen>
  )
}

function RecipeEditor({ id }: { id: string }) {
  const navigate = useNavigate()
  const isNew = id === 'new'
  const [recipeId] = useState(() => (isNew ? newId() : id))
  const [loaded, setLoaded] = useState(isNew)
  const [name, setName] = useState('')
  const [portions, setPortions] = useState('2')
  const [cooked, setCooked] = useState('')
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [createdAt, setCreatedAt] = useState(() => Date.now())
  const [picking, setPicking] = useState(false)

  useEffect(() => {
    if (isNew) return
    void db.recipes.get(id).then((r) => {
      if (r) {
        setName(r.name)
        setPortions(String(r.portions))
        setCooked(r.totalGrams ? String(r.totalGrams) : '')
        setIngredients(r.ingredients)
        setCreatedAt(r.createdAt)
      }
      setLoaded(true)
    })
  }, [id, isNew])

  const draft = {
    ingredients,
    portions: Math.max(1, Math.round(parseNumber(portions) ?? 1)),
    totalGrams: parseNumber(cooked) ?? undefined,
  }
  const t = recipeTotals(draft)
  const rawGrams = ingredients.reduce((s, i) => s + i.resolvedAmount, 0)
  const valid = name.trim().length > 0 && ingredients.length > 0

  const save = async () => {
    // saveRecipe stamps updatedAt itself.
    await saveRecipe({ id: recipeId, name: name.trim(), ...draft, createdAt, updatedAt: createdAt })
    navigate('/recipes', { replace: true })
  }

  const remove = async () => {
    if (!confirm(`Delete "${name}"? Days already logged keep their numbers.`)) return
    await deleteRecipe(recipeId)
    navigate('/recipes', { replace: true })
  }

  if (!loaded) {
    return (
      <Screen title="Recipe">
        <div className="skeleton mt-2 h-40 rounded-card" />
      </Screen>
    )
  }

  return (
    <Screen
      title={isNew ? 'New recipe' : 'Edit recipe'}
      left={
        <IconButton label="Back" onClick={() => navigate(-1)}>
          <ChevronLeft size={20} />
        </IconButton>
      }
      right={
        !isNew ? (
          <IconButton label="Delete recipe" onClick={() => void remove()}>
            <Trash2 size={18} />
          </IconButton>
        ) : undefined
      }
    >
      <Card className="mt-2 space-y-4 p-4">
        <Field label="Name">
          <Input value={name} placeholder="Chicken and rice" onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Portions">
            <Input
              type="text"
              inputMode="numeric"
              value={portions}
              onChange={(e) => setPortions(e.target.value)}
              className="text-center"
            />
          </Field>
          <Field label="Cooked weight (g)">
            <Input
              type="text"
              inputMode="decimal"
              value={cooked}
              placeholder={rawGrams ? String(Math.round(rawGrams)) : 'optional'}
              onChange={(e) => setCooked(e.target.value)}
              className="text-center"
            />
          </Field>
        </div>
        <p className="text-[0.6875rem] leading-relaxed text-txt-3">
          Cooking moves water, not calories. Weigh the finished dish and logging by grams stays exact;
          leave it empty and the raw ingredient weights are used, which is fine when you log by portion.
        </p>
      </Card>

      <SectionTitle
        action={
          <button className="text-[0.6875rem] font-medium text-brand-text" onClick={() => setPicking(true)}>
            Add ingredient
          </button>
        }
      >
        Ingredients
      </SectionTitle>

      {ingredients.length === 0 ? (
        <Card className="py-2">
          <EmptyState
            title="No ingredients yet"
            body="Add each ingredient at the weight that goes into the pot."
            action={
              <Button variant="primary" onClick={() => setPicking(true)}>
                Add ingredient
              </Button>
            }
          />
        </Card>
      ) : (
        <Card>
          <ul>
            {ingredients.map((ing, i) => (
              <li key={i} className="flex items-center gap-3 border-b border-line/60 px-4 py-3 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.9375rem] font-bold tracking-[-0.015em]">{ing.name}</p>
                  <p className="numeric mt-0.5 text-[0.6875rem] font-semibold text-txt-3">
                    {num(Math.round(ing.resolvedAmount))} g · {fmtKcal(ing.nutrients.kcal)} kcal
                  </p>
                </div>
                <IconButton
                  label={`Remove ${ing.name}`}
                  className="-mr-2 size-8"
                  onClick={() => setIngredients(ingredients.filter((_, j) => j !== i))}
                >
                  <X size={15} />
                </IconButton>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {ingredients.length > 0 && (
        <Card className="mt-4 p-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="numeric text-[1.75rem] font-extrabold leading-none">{fmtKcal(t.perPortion.kcal)}</div>
              <div className="mt-1 text-[0.6875rem] font-semibold text-txt-3">
                kcal per portion · {num(Math.round(t.grams / draft.portions))} g
              </div>
            </div>
            <MacroChips n={t.perPortion} />
          </div>
          <p className="mt-3 border-t border-line pt-3 text-[0.6875rem] text-txt-3">
            Whole recipe: {fmtKcal(t.total.kcal)} kcal · {fmtKcal(t.per100.kcal)} kcal per 100 g
          </p>
        </Card>
      )}

      <Button variant="primary" className="mt-5 w-full" disabled={!valid} onClick={() => void save()}>
        Save recipe
      </Button>

      {picking && (
        <IngredientPicker
          onClose={() => setPicking(false)}
          onAdd={(ing) => {
            setIngredients([...ingredients, ing])
            setPicking(false)
          }}
        />
      )}
    </Screen>
  )
}

function IngredientPicker({ onClose, onAdd }: { onClose: () => void; onAdd: (ing: Ingredient) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Food[]>([])
  const [food, setFood] = useState<Food | null>(null)
  const [grams, setGrams] = useState('100')

  useEffect(() => {
    // Ingredients go into the pot raw, whatever the diary preference is.
    void searchLocalFoods(query, 25, 'raw').then((r) => setResults(r.filter((f) => !f.id.startsWith('recipe:'))))
  }, [query])

  const amount = Math.max(0, parseNumber(grams) ?? 0)

  if (food) {
    const nutrients = scale(food.per100, amount)
    return (
      <Sheet open onClose={onClose} title={food.name || food.nameDe}>
        <div className="space-y-4 pb-2">
          <Field
            label={`Amount (${food.basis})`}
            hint={
              food.state !== 'as_sold'
                ? `This entry is the ${food.state} food. Enter the weight in that state.`
                : undefined
            }
          >
            <Input
              type="text"
              inputMode="decimal"
              autoFocus
              value={grams}
              onChange={(e) => setGrams(e.target.value)}
              className="text-center text-lg"
            />
          </Field>
          {food.servings.filter((s) => s.amount !== 1 && s.amount !== 100).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {food.servings
                .filter((s) => s.amount !== 1 && s.amount !== 100)
                .slice(0, 4)
                .map((s) => (
                  <button
                    key={s.label}
                    onClick={() => setGrams(String(s.amount))}
                    className="rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-[0.75rem] font-semibold text-txt-2 active:bg-surface-3"
                  >
                    {s.label}
                  </button>
                ))}
            </div>
          )}
          <div className="flex items-center justify-between rounded-tile border border-line bg-surface-2 px-3.5 py-3">
            <span className="numeric text-[0.9375rem] font-extrabold">{fmtKcal(nutrients.kcal)} kcal</span>
            <MacroChips n={nutrients} />
          </div>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => setFood(null)}>
              Back
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              disabled={amount <= 0}
              onClick={() =>
                onAdd({
                  foodId: food.id,
                  name: food.name || food.nameDe || 'Ingredient',
                  amount,
                  unit: food.basis,
                  resolvedAmount: amount,
                  nutrients,
                })
              }
            >
              Add
            </Button>
          </div>
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet open onClose={onClose} title="Add ingredient" full>
      <div className="relative mb-3">
        <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-txt-3" />
        <Input
          type="search"
          autoFocus
          placeholder="Search food"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-10"
        />
      </div>
      {results.length === 0 ? (
        <EmptyState
          title={query ? 'No matches' : 'Search the food database'}
          body={query ? 'Packaged products appear here once you have scanned or logged them.' : undefined}
        />
      ) : (
        <ul className="space-y-1.5">
          {results.map((f) => (
            <li key={f.id}>
              <button
                onClick={() => {
                  const def = f.servings.find((s) => s.isDefault)
                  setGrams(String(def?.amount ?? 100))
                  setFood(f)
                }}
                className="flex w-full items-center justify-between gap-3 rounded-tile border border-line bg-surface px-3.5 py-3 text-left active:bg-surface-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-[0.9375rem] font-bold tracking-[-0.015em]">{f.name || f.nameDe}</p>
                  <p className="mt-0.5 truncate text-[0.6875rem] text-txt-3">
                    {[f.brand, f.state !== 'as_sold' ? f.state : null].filter(Boolean).join(' · ') || 'per 100 ' + f.basis}
                  </p>
                </div>
                <span className="numeric shrink-0 text-[0.9375rem] font-extrabold">{fmtKcal(f.per100.kcal)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  )
}
