import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Download, Share, Sparkles, Smartphone, Trash2, TriangleAlert, Upload } from 'lucide-react'
import { Badge, Button, Card, Field, Input, Screen, SectionTitle, Segmented } from '../components/ui'
import { db, estimateStorage, getProfile, getSettings, requestPersistence } from '../lib/db'
import { bytes, kcal as fmtKcal, kg as fmtKg, num, parseNumber } from '../lib/format'
import { buildDayPlan, saveProfile } from '../lib/repo'
import { addDays, fromKey, inlineDate, todayKey } from '../lib/date'
import { RATE_PRESETS, daysToGoal } from '../lib/nutrition'
import { EXPORT_TABLES, exportData, importData } from '../lib/backup'
import type { ActivityLevel, GoalDirection, MacroStyle, Profile, Sex } from '../lib/types'
import { AiError, testKey } from '../services/ai/client'
import { isStandalone } from '../services/ai/voice'
import { BLS_CITATION, blsCount, importBls } from '../data/bls'

export default function SettingsScreen() {
  const data = useLiveQuery(async () => {
    const [profile, settings, plan, storage, foods, bls] = await Promise.all([
      getProfile(),
      getSettings(),
      buildDayPlan(todayKey()),
      estimateStorage(),
      db.foods.count(),
      blsCount(),
    ])
    return { profile, settings, plan, storage, foods, bls }
  }, [])

  if (!data) {
    return (
      <Screen title="Settings">
        <div className="mt-4 skeleton h-64 rounded-card" />
      </Screen>
    )
  }

  return (
    <Screen title="Settings">
      <InstallCard />
      <GoalCard profile={data.profile} plan={data.plan} />
      <ProgramCard profile={data.profile} plan={data.plan} />
      <ProfileCard profile={data.profile} />
      <AiCard settings={data.settings.ai} />
      <FoodDataCard total={data.foods} bls={data.bls} />
      <DataCard storage={data.storage} />
    </Screen>
  )
}

/**
 * On iOS, installing to the home screen is not a nicety — Safari's tracking
 * prevention deletes all script-writable storage after seven days without
 * interaction, and home-screen web apps are the documented exemption. An
 * uninstalled app can silently lose the entire food history and the API key.
 */
function InstallCard() {
  const [installed, setInstalled] = useState(isStandalone())
  const [persisted, setPersisted] = useState<boolean | null>(null)

  useEffect(() => {
    setInstalled(isStandalone())
    void navigator.storage?.persisted?.().then((p) => setPersisted(p ?? false))
  }, [])

  if (installed) {
    return (
      <Card className="mt-2 p-4">
        <div className="flex items-start gap-2.5">
          <Check size={17} className="mt-0.5 shrink-0 text-ok" />
          <div>
            <p className="text-[0.9375rem] font-medium">Installed as an app</p>
            <p className="mt-1 text-[0.8125rem] leading-relaxed text-txt-3">
              Your data is stored persistently
              {persisted === false && ' (persistent storage not yet granted)'}.
            </p>
            {persisted === false && (
              <Button
                className="mt-2.5"
                onClick={() => void requestPersistence().then(setPersisted)}
              >
                Request persistent storage
              </Button>
            )}
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Card className="mt-2 border-warn/30 p-4">
      <div className="flex items-start gap-2.5">
        <TriangleAlert size={17} className="mt-0.5 shrink-0 text-warn" />
        <div>
          <p className="text-[0.9375rem] font-medium">Add to your Home Screen</p>
          <p className="mt-1 text-[0.8125rem] leading-relaxed text-txt-2">
            Important, not optional: Safari deletes website data after seven days without use.
            Installed web apps are exempt. Without installing, your entire food diary can
            disappear.
          </p>
          <ol className="mt-3 space-y-1.5 text-[0.8125rem] text-txt-2">
            <li className="flex gap-2">
              <span className="text-txt-4">1.</span>
              <span className="inline-flex items-center gap-1.5">
                In Safari, tap <Share size={13} className="inline" /> Share
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-txt-4">2.</span>
              <span className="inline-flex items-center gap-1.5">
                <Smartphone size={13} className="inline" /> "Add to Home Screen"
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-txt-4">3.</span>
              <span>Add — then open the app from its icon</span>
            </li>
          </ol>
        </div>
      </div>
    </Card>
  )
}

const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: 'Sedentary',
  light: 'Lightly active',
  moderate: 'Moderately active',
  high: 'Very active',
  athlete: 'Athlete',
}

type Plan = Awaited<ReturnType<typeof buildDayPlan>>

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Protein presets, g per kg body mass per day. */
const PROTEIN_LEVELS = [
  { value: 1.4, label: 'Low' },
  { value: 1.6, label: 'Moderate' },
  { value: 2.0, label: 'High' },
  { value: 2.4, label: 'Very high' },
]

const STYLE_HINT: Record<MacroStyle, string> = {
  balanced: 'Calories left after protein are split evenly between carbohydrate and fat.',
  low_fat: 'Fat at about a fifth of calories; carbohydrate takes the rest.',
  low_carb: 'Carbohydrate at a fifth of calories, capped at 150 g; fat takes the rest.',
  keto: 'Carbohydrate held near 30 g a day; fat takes the rest.',
}

function GoalCard({ profile, plan }: { profile: Profile; plan: Plan }) {
  const kg = plan.trendKg ?? plan.currentKg
  const presets = profile.goal === 'maintain' ? [] : RATE_PRESETS[profile.goal]
  const rate = Math.abs(profile.rateKgPerWeek)
  const dir = profile.goal === 'lose' ? -1 : 1

  const setGoal = (goal: GoalDirection) => {
    const pct = goal === 'lose' ? 0.005 : goal === 'gain' ? 0.0025 : 0
    // Without a weigh-in, fall back to the absolute rates those percentages
    // give an 80 kg person rather than leaving the goal at zero.
    const base = kg ?? 80
    void saveProfile({
      goal,
      rateKgPerWeek: goal === 'maintain' ? 0 : Math.round(base * pct * 100) / 100 * (goal === 'lose' ? -1 : 1),
    })
  }

  const days = kg != null ? daysToGoal(kg, profile.goalWeightKg, profile.rateKgPerWeek) : null
  const wrongWay =
    kg != null &&
    profile.goalWeightKg != null &&
    profile.goal !== 'maintain' &&
    Math.sign(profile.goalWeightKg - kg) !== dir

  return (
    <>
      <SectionTitle>Goal</SectionTitle>
      <Card className="space-y-4 p-4">
        <Segmented
          options={[
            { value: 'lose' as GoalDirection, label: 'Lose' },
            { value: 'maintain' as GoalDirection, label: 'Maintain' },
            { value: 'gain' as GoalDirection, label: 'Gain' },
          ]}
          value={profile.goal}
          onChange={setGoal}
        />

        {profile.goal !== 'maintain' && (
          <>
            <Field
              label="Rate"
              hint={
                kg != null
                  ? `${num(rate, 2)} kg per week, which is ${num((rate / kg) * 100, 2)}% of your body weight and a daily ${profile.goal === 'lose' ? 'deficit' : 'surplus'} of about ${fmtKcal((rate * 7700) / 7)} kcal.`
                  : 'Log a weight to see this as a share of your body weight.'
              }
              group
            >
              <div className="grid grid-cols-2 gap-1.5">
                {presets.map((p) => {
                  const value = Math.round((kg ?? 80) * p.pct * 100) / 100
                  const active = Math.abs(value - rate) < 0.006
                  return (
                    <button
                      key={p.label}
                      onClick={() => void saveProfile({ rateKgPerWeek: value * dir })}
                      className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                        active ? 'border-brand bg-brand-wash' : 'border-line bg-surface-2 active:bg-surface-3'
                      }`}
                    >
                      <span className="block text-[0.8125rem] font-bold tracking-tight">{p.label}</span>
                      <span className="numeric mt-0.5 block text-[0.6875rem] font-semibold text-txt-3">
                        {num(p.pct * 100, 2)}% · {num(value, 2)} kg/wk
                      </span>
                    </button>
                  )
                })}
              </div>
            </Field>

            <Field
              label="Goal weight (kg)"
              hint={
                wrongWay
                  ? `That is ${profile.goal === 'lose' ? 'above' : 'below'} your current trend weight of ${fmtKg(kg!)} kg, so it does not match a goal to ${profile.goal}.`
                  : days != null && kg != null
                    ? `${num(Math.abs(profile.goalWeightKg! - kg), 1)} kg to go. At this rate that is about ${Math.round(days / 7)} weeks, around ${fromKey(addDays(todayKey(), days)).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.`
                    : 'Optional. A rate on its own is a complete goal; a target weight adds an end date.'
              }
            >
              <Input
                type="text"
                inputMode="decimal"
                placeholder="optional"
                defaultValue={profile.goalWeightKg ?? ''}
                onBlur={(e) => {
                  const v = parseNumber(e.target.value)
                  void saveProfile({ goalWeightKg: v && v > 30 && v < 300 ? v : undefined })
                }}
              />
            </Field>
          </>
        )}

        <p className="border-t border-line pt-3 text-[0.6875rem] leading-relaxed text-txt-3">
          {profile.goal === 'lose'
            ? 'Slower keeps more muscle: in the one controlled comparison in athletes (Garthe 2011), 0.7% a week retained lean mass that 1.4% lost. Above 1% a week that trade gets worse quickly.'
            : profile.goal === 'gain'
              ? 'Muscle gain is slow, so a larger surplus mostly adds fat. Beginners can use the faster rates; trained lifters rarely benefit from more than the lean one.'
              : 'Targets are set to your measured expenditure, so weight should hold.'}
        </p>
      </Card>
    </>
  )
}

function ProgramCard({ profile, plan }: { profile: Profile; plan: Plan }) {
  const { weekTargets, expenditure, targetSource } = plan
  const manual = profile.manualTargets
  const [draft, setDraft] = useState(() => ({
    kcal: String(manual?.kcal ?? weekTargets.kcal),
    protein: String(manual?.protein ?? weekTargets.protein),
    carbs: String(manual?.carbs ?? weekTargets.carbs),
    fat: String(manual?.fat ?? weekTargets.fat),
  }))

  const saveManual = (next: typeof draft) => {
    const v = (x: string) => Math.max(0, Math.round(parseNumber(x) ?? 0))
    void saveProfile({
      manualTargets: { kcal: v(next.kcal), protein: v(next.protein), carbs: v(next.carbs), fat: v(next.fat) },
    })
  }

  const toggleHigh = (d: number) => {
    const set = new Set(profile.highDays)
    if (set.has(d)) set.delete(d)
    else set.add(d)
    void saveProfile({ highDays: [...set].sort() })
  }

  return (
    <>
      <SectionTitle
        action={
          <Badge tone={targetSource === 'manual' ? 'neutral' : 'ok'}>
            {targetSource === 'manual' ? 'manual' : targetSource === 'checkin' ? 'coached' : 'starting estimate'}
          </Badge>
        }
      >
        Targets
      </SectionTitle>
      <Card className="space-y-4 p-4">
        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            ['kcal', fmtKcal(weekTargets.kcal)],
            ['Protein', `${weekTargets.protein} g`],
            ['Carbs', `${weekTargets.carbs} g`],
            ['Fat', `${weekTargets.fat} g`],
          ].map(([label, value]) => (
            <div key={label}>
              <div className="numeric text-[0.9375rem] font-extrabold">{value}</div>
              <div className="mt-0.5 text-[0.6875rem] text-txt-3">{label}</div>
            </div>
          ))}
        </div>

        <Segmented
          options={[
            { value: 'coached' as const, label: 'Coached' },
            { value: 'manual' as const, label: 'Manual' },
          ]}
          value={manual ? 'manual' : 'coached'}
          onChange={(v) => {
            if (v === 'coached') void saveProfile({ manualTargets: null })
            else saveManual(draft)
          }}
        />

        {manual ? (
          <>
            <div className="grid grid-cols-4 gap-2">
              {(['kcal', 'protein', 'carbs', 'fat'] as const).map((k) => (
                <Field key={k} label={k === 'kcal' ? 'kcal' : k[0].toUpperCase() + k.slice(1)}>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={draft[k]}
                    onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                    onBlur={() => saveManual(draft)}
                    className="px-1 text-center"
                  />
                </Field>
              ))}
            </div>
            <p className="text-[0.6875rem] leading-relaxed text-txt-3">
              Fixed numbers you set. Expenditure is still measured ({fmtKcal(expenditure.tdee)} kcal a
              day right now), but nothing adjusts on its own and there is no weekly check-in.
            </p>
          </>
        ) : (
          <>
            <p className="text-[0.6875rem] leading-relaxed text-txt-3">
              Built on an expenditure of {fmtKcal(plan.checkin?.tdee ?? expenditure.tdee)} kcal.{' '}
              {targetSource === 'checkin'
                ? `Fixed until the check-in ${inlineDate(plan.nextCheckin)}.`
                : `First check-in ${inlineDate(plan.nextCheckin)}; until then the number comes from a formula.`}
            </p>

            <Field label="Carbohydrate and fat" hint={STYLE_HINT[profile.macroStyle]} group>
              <Segmented
                options={[
                  { value: 'balanced' as MacroStyle, label: 'Balanced' },
                  { value: 'low_fat' as MacroStyle, label: 'Low fat' },
                  { value: 'low_carb' as MacroStyle, label: 'Low carb' },
                  { value: 'keto' as MacroStyle, label: 'Keto' },
                ]}
                value={profile.macroStyle}
                onChange={(v) => void saveProfile({ macroStyle: v })}
              />
            </Field>

            <Field
              label={`Protein: ${num(profile.proteinPerKg, 1)} g per kg`}
              hint="Gains from training stop rising at about 1.6 g/kg on average (Morton 2018, 49 trials), with the uncertainty reaching 2.2. In a deficit the higher settings help hold muscle."
              group
            >
              <Segmented
                options={PROTEIN_LEVELS.map((l) => ({ value: String(l.value), label: l.label }))}
                value={String(
                  PROTEIN_LEVELS.reduce((best, l) =>
                    Math.abs(l.value - profile.proteinPerKg) < Math.abs(best.value - profile.proteinPerKg) ? l : best,
                  ).value,
                )}
                onChange={(v) => void saveProfile({ proteinPerKg: Number(v) })}
              />
            </Field>

            <Field
              label="Check-in day"
              hint="The one day a week your targets are allowed to change."
              group
            >
              <div className="flex gap-1">
                {WEEKDAYS.map((d, i) => (
                  <DayChip
                    key={d}
                    label={d}
                    active={profile.checkinDay === i}
                    onClick={() => void saveProfile({ checkinDay: i as Profile['checkinDay'] })}
                  />
                ))}
              </div>
            </Field>

            <Field
              label="Higher-calorie days"
              hint={
                profile.highDays.length > 0 && profile.highDays.length < 7
                  ? `Those days get ${Math.round(profile.highDayBoost * 100)}% more, the others ${num((profile.highDayBoost * profile.highDays.length * 100) / (7 - profile.highDays.length), 1)}% less. The weekly total is unchanged.`
                  : 'Optional. Move calories toward the days you eat more, such as weekends or training days, without changing the weekly total.'
              }
              group
            >
              <div className="flex gap-1">
                {WEEKDAYS.map((d, i) => (
                  <DayChip key={d} label={d} active={profile.highDays.includes(i)} onClick={() => toggleHigh(i)} />
                ))}
              </div>
            </Field>

            <Field
              label="Calorie floor"
              hint="The lowest daily target the coach will set. 1,200 kcal is a convention, not a measured threshold: it exists because meeting vitamin and mineral needs gets hard below it."
              group
            >
              <Segmented
                options={[
                  { value: '1200', label: '1,200 kcal' },
                  { value: '1500', label: '1,500 kcal' },
                  { value: '0', label: 'None' },
                ]}
                value={String(profile.kcalFloor)}
                onChange={(v) => void saveProfile({ kcalFloor: Number(v) })}
              />
            </Field>
          </>
        )}
      </Card>
    </>
  )
}

function DayChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`min-h-9 flex-1 rounded-md border text-[0.6875rem] font-bold transition-colors ${
        active ? 'border-brand bg-brand text-on-brand' : 'border-line bg-surface-2 text-txt-2 active:bg-surface-3'
      }`}
    >
      {label}
    </button>
  )
}

function ProfileCard({ profile }: { profile: Profile }) {
  const save = (patch: Partial<Profile>) => saveProfile(patch)

  return (
    <>
      <SectionTitle>Profile</SectionTitle>
      <Card className="space-y-4 p-4">
        <Field label="Sex" group>
          <Segmented
            options={[
              { value: 'male' as Sex, label: 'Male' },
              { value: 'female' as Sex, label: 'Female' },
            ]}
            value={profile.sex}
            onChange={(v) => void save({ sex: v })}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Height (cm)">
            <Input
              type="text"
              inputMode="numeric"
              defaultValue={profile.heightCm}
              onBlur={(e) => {
                const v = parseNumber(e.target.value)
                if (v && v > 80 && v < 260) void save({ heightCm: v })
              }}
            />
          </Field>
          <Field label="Date of birth">
            <Input
              type="date"
              defaultValue={profile.birthDate ?? ''}
              onChange={(e) => void save({ birthDate: e.target.value })}
            />
          </Field>
        </div>

        <Field
          label="Activity"
          hint="Only sets the starting estimate. Once your own data is in, measured expenditure replaces it."
        >
          <select
            value={profile.activity}
            onChange={(e) => void save({ activity: e.target.value as ActivityLevel })}
            className="h-[2.875rem] w-full rounded-xl border border-line bg-surface-2 px-3 outline-none focus:border-brand"
          >
            {Object.entries(ACTIVITY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="How you weigh food"
          hint="Cooked meat has lost water, so 150 g cooked came from about 208 g raw and carries about 28% more protein. Getting this wrong is the largest silent error in most trackers."
          group
        >
          <Segmented
            options={[
              { value: 'cooked' as const, label: 'Cooked' },
              { value: 'raw' as const, label: 'Raw' },
            ]}
            value={profile.weighsFood}
            onChange={(v) => void save({ weighsFood: v })}
          />
        </Field>
      </Card>
    </>
  )
}

function AiCard({ settings }: { settings: Awaited<ReturnType<typeof getSettings>>['ai'] }) {
  const [key, setKey] = useState(settings.apiKey ?? '')
  const [state, setState] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)

  const save = async () => {
    setState('testing')
    setMessage(null)
    const next = { ...settings, apiKey: key.trim(), enabled: true }
    try {
      await testKey(next)
      await db.settings.update('settings', { ai: next, updatedAt: Date.now() })
      setState('ok')
      setMessage('Key works. Photo and dictation logging are active.')
    } catch (e) {
      setState('error')
      setMessage(e instanceof AiError ? e.message : 'Check failed')
    }
  }

  const clear = async () => {
    await db.settings.update('settings', {
      ai: { ...settings, apiKey: undefined, enabled: false },
      updatedAt: Date.now(),
    })
    setKey('')
    setState('idle')
    setMessage(null)
  }

  return (
    <>
      <SectionTitle
        action={settings.enabled && settings.apiKey ? <Badge tone="ok">on</Badge> : <Badge>off</Badge>}
      >
        AI features
      </SectionTitle>
      <Card className="p-4">
        <p className="text-[0.8125rem] leading-relaxed text-txt-2">
          Photo and dictation logging need your own Anthropic API key. This app has no server:
          your key stays on this device and goes only to Anthropic. Search, barcode scanning and
          manual logging all work without one.
        </p>

        <Field label="Anthropic API key" className="mt-3.5">
          <Input
            type="password"
            autoComplete="off"
            placeholder="sk-ant-…"
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
        </Field>

        <div className="mt-3 flex gap-2">
          <Button
            variant="primary"
            className="flex-1"
            loading={state === 'testing'}
            disabled={!key.trim()}
            onClick={() => void save()}
          >
            <Sparkles size={16} /> Check & save
          </Button>
          {settings.apiKey && (
            <Button variant="danger" onClick={() => void clear()}>
              Remove
            </Button>
          )}
        </div>

        {message && (
          <p
            className={`mt-3 text-[0.8125rem] leading-relaxed ${
              state === 'ok' ? 'text-ok' : 'text-bad'
            }`}
          >
            {message}
          </p>
        )}

        <div className="mt-3.5 space-y-1.5 border-t border-line pt-3 text-[0.6875rem] leading-relaxed text-txt-3">
          <p>
            Create a key at console.anthropic.com → API Keys, and set a spend limit on it —
            anyone with access to your unlocked phone could otherwise read it out.
          </p>
          <p>Cost: roughly 1–2 cents per photo, under 0.1 cents per dictation.</p>
        </div>
      </Card>
    </>
  )
}

function FoodDataCard({ total, bls }: { total: number; bls: number }) {
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const loaded = bls > 7000

  return (
    <>
      <SectionTitle action={loaded ? <Badge tone="ok">offline</Badge> : <Badge tone="warn">not loaded</Badge>}>
        Food database
      </SectionTitle>
      <Card className="p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-[0.8125rem] font-semibold text-txt-2">Foods on this device</span>
          <span className="numeric text-[0.9375rem] font-extrabold">{num(total)}</span>
        </div>

        {!loaded && (
          <Button
            className="mt-3 w-full"
            loading={busy}
            onClick={() => {
              setBusy(true)
              void importBls((d, t) => setProgress(d / t))
                .finally(() => {
                  setBusy(false)
                  setProgress(null)
                })
            }}
          >
            {progress != null ? `Loading… ${Math.round(progress * 100)}%` : 'Load German food database'}
          </Button>
        )}

        <p className="mt-3 border-t border-line pt-3 text-[0.6875rem] leading-relaxed text-txt-3">
          Generic foods come from the Bundeslebensmittelschlüssel — the German national nutrition
          database — and packaged products from Open Food Facts. BLS reports available carbohydrate
          with fibre listed separately, which is the convention this app uses throughout, so no
          conversion is applied and nothing is double-counted.
        </p>
        <p className="mt-2 text-[0.625rem] leading-relaxed text-txt-4">{BLS_CITATION}</p>
      </Card>
    </>
  )
}

function DataCard({ storage }: { storage: { usage: number; quota: number } | null }) {
  const [busy, setBusy] = useState(false)

  const [message, setMessage] = useState<string | null>(null)

  /**
   * Full export, on demand.
   *
   * This is not a nice-to-have: it is the only backup that exists, since there
   * is no server. Safari also blocks downloads a page starts itself in some
   * contexts, so the Web Share sheet is tried first.
   */
  const exportAll = async () => {
    setBusy(true)
    try {
      const blob = new Blob([JSON.stringify(await exportData(), null, 2)], { type: 'application/json' })
      const file = new File([blob], `macroforge-${todayKey()}.json`, { type: 'application/json' })

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'MacroForge Export' })
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = file.name
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
    } catch {
      // A cancelled share sheet is not an error worth reporting.
    } finally {
      setBusy(false)
    }
  }

  const restore = async (file: File | undefined) => {
    if (!file) return
    if (!confirm('Restore from this file? It replaces everything currently in the app.')) return
    setBusy(true)
    try {
      const counts = await importData(JSON.parse(await file.text()))
      setMessage(`Restored ${num(counts.entries)} log entries, ${num(counts.weights)} weigh-ins and ${num(counts.workouts)} workouts.`)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'That file could not be read.')
    } finally {
      setBusy(false)
    }
  }

  const wipe = async () => {
    if (!confirm('Delete all data? This cannot be undone.')) return
    await db.delete()
    location.reload()
  }

  return (
    <>
      <SectionTitle>Data</SectionTitle>
      <Card className="p-4">
        {storage && (
          <p className="mb-3 text-[0.8125rem] text-txt-2">
            {bytes(storage.usage)} used
            {storage.quota > 0 && ` of ${bytes(storage.quota)} available`}
          </p>
        )}
        <div className="flex gap-2">
          <Button className="flex-1" loading={busy} onClick={() => void exportAll()}>
            <Download size={16} /> Export
          </Button>
          <label className="flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-line bg-surface-2 px-4 text-[0.875rem] font-bold tracking-tight active:bg-surface-3">
            <Upload size={16} /> Restore
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                void restore(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </label>
          <Button variant="danger" onClick={() => void wipe()}>
            <Trash2 size={16} />
          </Button>
        </div>
        {message && <p className="mt-3 text-[0.8125rem] font-semibold text-txt-2">{message}</p>}
        <p className="mt-3 text-[0.6875rem] leading-relaxed text-txt-3">
          Everything lives on this device alone. There is no account and no server, so this export
          is your only backup: take one regularly, and use Restore to move to a new phone. It covers{' '}
          {EXPORT_TABLES.length} tables. The API key and photos are left out.
        </p>
      </Card>

      <p className="mt-6 px-1 text-center text-[0.6875rem] leading-relaxed text-txt-4">
        Nutrition data from the Bundeslebensmittelschlüssel 4.0 (Max Rubner-Institut, CC BY 4.0)
        and Open Food Facts (ODbL). Estimates are estimates — not medical advice.
      </p>
    </>
  )
}
