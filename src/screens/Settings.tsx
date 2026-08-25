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

export default function SettingsScreen() {
  const data = useLiveQuery(async () => {
    const [profile, settings, plan, storage] = await Promise.all([
      getProfile(),
      getSettings(),
      buildDayPlan(todayKey()),
      estimateStorage(),
    ])
    return { profile, settings, plan, storage }
  }, [])

  if (!data) {
    return (
      <Screen title="Einstellungen">
        <div className="mt-4 skeleton h-64 rounded-card" />
      </Screen>
    )
  }

  return (
    <Screen title="Einstellungen">
      <InstallCard />
      <ProfileCard profile={data.profile} />
      <TargetsCard plan={data.plan} />
      <AiCard settings={data.settings.ai} />
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
            <p className="text-[0.9375rem] font-medium">Als App installiert</p>
            <p className="mt-1 text-[0.8125rem] leading-relaxed text-txt-3">
              Deine Daten sind dauerhaft gespeichert
              {persisted === false && ' (Speicherschutz noch nicht bestätigt)'}.
            </p>
            {persisted === false && (
              <Button
                className="mt-2.5"
                onClick={() => void requestPersistence().then(setPersisted)}
              >
                Speicher schützen
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
          <p className="text-[0.9375rem] font-medium">Zum Home-Bildschirm hinzufügen</p>
          <p className="mt-1 text-[0.8125rem] leading-relaxed text-txt-2">
            Wichtig, nicht optional: Safari löscht die Daten von Websites nach sieben Tagen ohne
            Nutzung. Installierte Web-Apps sind davon ausgenommen. Ohne Installation kann dein
            gesamtes Ernährungstagebuch verschwinden.
          </p>
          <ol className="mt-3 space-y-1.5 text-[0.8125rem] text-txt-2">
            <li className="flex gap-2">
              <span className="text-txt-4">1.</span>
              <span className="inline-flex items-center gap-1.5">
                In Safari auf <Share size={13} className="inline" /> Teilen tippen
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-txt-4">2.</span>
              <span className="inline-flex items-center gap-1.5">
                <Smartphone size={13} className="inline" /> „Zum Home-Bildschirm"
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-txt-4">3.</span>
              <span>Hinzufügen — danach die App über das Symbol öffnen</span>
            </li>
          </ol>
        </div>
      </div>
    </Card>
  )
}

const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: 'Sitzend',
  light: 'Leicht aktiv',
  moderate: 'Mäßig aktiv',
  high: 'Sehr aktiv',
  athlete: 'Athlet',
}

function ProfileCard({ profile }: { profile: Profile }) {
  const save = async (patch: Partial<Profile>) => {
    await db.profile.put({ ...DEFAULT_PROFILE, ...profile, ...patch, updatedAt: Date.now() })
  }

  return (
    <>
      <SectionTitle>Profil</SectionTitle>
      <Card className="space-y-4 p-4">
        <Field label="Geschlecht">
          <Segmented
            options={[
              { value: 'male' as Sex, label: 'Männlich' },
              { value: 'female' as Sex, label: 'Weiblich' },
            ]}
            value={profile.sex}
            onChange={(v) => void save({ sex: v })}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Größe (cm)">
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
          <Field label="Geburtsdatum">
            <Input
              type="date"
              defaultValue={profile.birthDate ?? ''}
              onChange={(e) => void save({ birthDate: e.target.value })}
            />
          </Field>
        </div>

        <Field label="Aktivität" hint="Ohne Training gerechnet — Trainingseinheiten erhöhen deinen gemessenen Verbrauch automatisch.">
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

        <Field label="Ziel">
          <Segmented
            options={[
              { value: 'lose' as GoalDirection, label: 'Abnehmen' },
              { value: 'maintain' as GoalDirection, label: 'Halten' },
              { value: 'gain' as GoalDirection, label: 'Aufbauen' },
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
            label={`Tempo: ${num(Math.abs(profile.rateKgPerWeek), 2)} kg pro Woche`}
            hint="Schneller ist selten besser — steilere Defizite kosten vor allem Muskelmasse und Durchhaltevermögen."
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
          <Field label="Eiweiß g/kg">
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
          <Field label="Fett g/kg">
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
      <SectionTitle>Aktuelle Ziele</SectionTitle>
      <Card className="p-4">
        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            ['kcal', fmtKcal(targets.kcal)],
            ['Eiweiß', `${targets.protein} g`],
            ['KH', `${targets.carbs} g`],
            ['Fett', `${targets.fat} g`],
          ].map(([label, value]) => (
            <div key={label}>
              <div className="text-[0.9375rem] font-semibold tabular-nums">{value}</div>
              <div className="mt-0.5 text-[0.6875rem] text-txt-3">{label}</div>
            </div>
          ))}
        </div>
        <p className="mt-3.5 border-t border-line pt-3 text-[0.6875rem] leading-relaxed text-txt-3">
          Abgeleitet aus einem Verbrauch von {fmtKcal(expenditure.tdee)} kcal. {expenditure.note}.
          Eiweiß und Fett werden zuerst gesetzt, Kohlenhydrate füllen den Rest auf.
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
      setMessage('Key funktioniert. Foto- und Diktat-Erkennung sind aktiv.')
    } catch (e) {
      setState('error')
      setMessage(e instanceof AiError ? e.message : 'Prüfung fehlgeschlagen')
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
        action={settings.enabled && settings.apiKey ? <Badge tone="ok">aktiv</Badge> : <Badge>aus</Badge>}
      >
        KI-Funktionen
      </SectionTitle>
      <Card className="p-4">
        <p className="text-[0.8125rem] leading-relaxed text-txt-2">
          Foto- und Diktat-Erkennung brauchen einen eigenen Anthropic-API-Key. Die App hat keinen
          Server: dein Key bleibt auf diesem Gerät und geht nur direkt an Anthropic. Suche,
          Barcode-Scan und manuelles Protokollieren funktionieren auch ohne.
        </p>

        <Field label="Anthropic API-Key" className="mt-3.5">
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
            <Sparkles size={16} /> Prüfen & speichern
          </Button>
          {settings.apiKey && (
            <Button variant="danger" onClick={() => void clear()}>
              Entfernen
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
            Key erstellen unter console.anthropic.com → API Keys. Setze dort ein Ausgabenlimit —
            jeder mit Zugriff auf dein entsperrtes Handy könnte den Key sonst auslesen.
          </p>
          <p>Kosten: etwa 1–2 Cent pro Foto, unter 0,1 Cent pro Diktat.</p>
        </div>
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
    if (!confirm('Wirklich alle Daten löschen? Das kann nicht rückgängig gemacht werden.')) return
    await db.delete()
    location.reload()
  }

  return (
    <>
      <SectionTitle>Daten</SectionTitle>
      <Card className="p-4">
        {storage && (
          <p className="mb-3 text-[0.8125rem] text-txt-2">
            {bytes(storage.usage)} belegt
            {storage.quota > 0 && ` von ${bytes(storage.quota)} verfügbar`}
          </p>
        )}
        <div className="flex gap-2">
          <Button className="flex-1" loading={busy} onClick={() => void exportAll()}>
            <Download size={16} /> Alles exportieren
          </Button>
          <Button variant="danger" onClick={() => void wipe()}>
            <Trash2 size={16} />
          </Button>
        </div>
        <p className="mt-3 text-[0.6875rem] leading-relaxed text-txt-3">
          Alles liegt ausschließlich auf diesem Gerät — es gibt kein Konto und keinen Server.
          Der Export ist deine einzige Sicherung, also mach ihn regelmäßig. Der API-Key wird aus
          dem Export bewusst herausgelassen.
        </p>
      </Card>

      <p className="mt-6 px-1 text-center text-[0.6875rem] leading-relaxed text-txt-4">
        Nährwertdaten von Open Food Facts (ODbL) und aus Standard-Nährwerttabellen.
        Schätzungen sind Schätzungen — kein medizinischer Rat.
      </p>
    </>
  )
}
