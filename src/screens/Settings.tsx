import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Download, Share, Sparkles, Smartphone, Trash2, TriangleAlert } from 'lucide-react'
import { Badge, Button, Card, Field, Input, Screen, SectionTitle, Segmented } from '../components/ui'
import { DEFAULT_PROFILE, db, estimateStorage, getProfile, getSettings, requestPersistence } from '../lib/db'
import { bytes, kcal as fmtKcal, num } from '../lib/format'
import { buildDayPlan } from '../lib/repo'
import { todayKey } from '../lib/date'
import type { ActivityLevel, GoalDirection, Profile, Sex } from '../lib/types'
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
      <ProfileCard profile={data.profile} />
      <TargetsCard plan={data.plan} />
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

function ProfileCard({ profile }: { profile: Profile }) {
  const save = async (patch: Partial<Profile>) => {
    await db.profile.put({ ...DEFAULT_PROFILE, ...profile, ...patch, updatedAt: Date.now() })
  }

  return (
    <>
      <SectionTitle>Profile</SectionTitle>
      <Card className="space-y-4 p-4">
        <Field label="Sex">
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
                const v = Number(e.target.value.replace(',', '.'))
                if (v > 80 && v < 260) void save({ heightCm: v })
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

        <Field label="Activity" hint="Excluding training — logged sessions raise your measured expenditure on their own.">
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

        <Field label="Goal">
          <Segmented
            options={[
              { value: 'lose' as GoalDirection, label: 'Lose' },
              { value: 'maintain' as GoalDirection, label: 'Maintain' },
              { value: 'gain' as GoalDirection, label: 'Gain' },
            ]}
            value={profile.goal}
            onChange={(v) =>
              void save({
                goal: v,
                rateKgPerWeek: v === 'lose' ? -0.5 : v === 'gain' ? 0.25 : 0,
              })
            }
          />
        </Field>

        {profile.goal !== 'maintain' && (
          <Field
            label={`Rate: ${num(Math.abs(profile.rateKgPerWeek), 2)} kg per week`}
            hint="Faster is rarely better — steeper deficits mostly cost lean mass and adherence."
          >
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={Math.abs(profile.rateKgPerWeek)}
              onChange={(e) =>
                void save({
                  rateKgPerWeek: Number(e.target.value) * (profile.goal === 'lose' ? -1 : 1),
                })
              }
              className="w-full accent-brand"
            />
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field
          label="How you weigh food"
          hint="Cooked meat has lost water, so 150 g cooked came from ~208 g raw and carries about 28% more protein. Getting this wrong is the single largest silent error in most trackers."
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

        <Field label="Protein g/kg">
            <Input
              type="text"
              inputMode="decimal"
              defaultValue={num(profile.proteinPerKg, 1)}
              onBlur={(e) => {
                const v = Number(e.target.value.replace(',', '.'))
                if (v >= 0.5 && v <= 4) void save({ proteinPerKg: v })
              }}
            />
          </Field>
          <Field label="Fat g/kg">
            <Input
              type="text"
              inputMode="decimal"
              defaultValue={num(profile.fatPerKg, 1)}
              onBlur={(e) => {
                const v = Number(e.target.value.replace(',', '.'))
                if (v >= 0.3 && v <= 2.5) void save({ fatPerKg: v })
              }}
            />
          </Field>
        </div>
      </Card>
    </>
  )
}

function TargetsCard({ plan }: { plan: Awaited<ReturnType<typeof buildDayPlan>> }) {
  const { targets, expenditure } = plan
  return (
    <>
      <SectionTitle>Current targets</SectionTitle>
      <Card className="p-4">
        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            ['kcal', fmtKcal(targets.kcal)],
            ['Protein', `${targets.protein} g`],
            ['Carbs', `${targets.carbs} g`],
            ['Fat', `${targets.fat} g`],
          ].map(([label, value]) => (
            <div key={label}>
              <div className="text-[0.9375rem] font-semibold tabular-nums">{value}</div>
              <div className="mt-0.5 text-[0.6875rem] text-txt-3">{label}</div>
            </div>
          ))}
        </div>
        <p className="mt-3.5 border-t border-line pt-3 text-[0.6875rem] leading-relaxed text-txt-3">
          Derived from an expenditure of {fmtKcal(expenditure.tdee)} kcal. {expenditure.note}.
          Protein and fat are set first; carbohydrate fills the remainder.
        </p>
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
      const dump = {
        version: 1,
        exportedAt: new Date().toISOString(),
        profile: await db.profile.toArray(),
        settings: (await db.settings.toArray()).map((s) => ({
          ...s,
          // Never write a credential into a file the user might share.
          ai: { ...s.ai, apiKey: undefined },
        })),
        foods: await db.foods.toArray(),
        entries: await db.entries.toArray(),
        weights: await db.weights.toArray(),
        workouts: await db.workouts.toArray(),
        exercises: await db.exercises.toArray(),
        recipes: await db.recipes.toArray(),
      }
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' })
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
            <Download size={16} /> Export everything
          </Button>
          <Button variant="danger" onClick={() => void wipe()}>
            <Trash2 size={16} />
          </Button>
        </div>
        <p className="mt-3 text-[0.6875rem] leading-relaxed text-txt-3">
          Everything lives on this device alone — there is no account and no server. This export
          is your only backup, so take one regularly. The API key is deliberately left out of it.
        </p>
      </Card>

      <p className="mt-6 px-1 text-center text-[0.6875rem] leading-relaxed text-txt-4">
        Nutrition data from the Bundeslebensmittelschlüssel 4.0 (Max Rubner-Institut, CC BY 4.0)
        and Open Food Facts (ODbL). Estimates are estimates — not medical advice.
      </p>
    </>
  )
}
