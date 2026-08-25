import { useState } from 'react'
import { ChevronRight, Lock, Scale, Share, Smartphone, Sparkles } from 'lucide-react'
import { Button, Card, Field, Input, Segmented } from '../components/ui'
import { DEFAULT_PROFILE, db } from '../lib/db'
import { todayKey } from '../lib/date'
import { saveWeight } from '../lib/repo'
import { parseNumber } from '../lib/format'
import { isStandalone } from '../services/ai/voice'
import type { GoalDirection, Sex } from '../lib/types'

/**
 * First-run setup.
 *
 * Three things have to happen before the app is useful, and only one of them
 * is data entry:
 *  1. Say plainly where the data lives, because "no account" is unusual enough
 *     that people assume there is a hidden one.
 *  2. Get height, sex, age and a starting weight — without them, targets come
 *     from a guess about an average person.
 *  3. Get the app onto the Home Screen, which on iOS is what stops Safari
 *     deleting the whole diary after seven days.
 */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0)
  const [sex, setSex] = useState<Sex>('male')
  const [height, setHeight] = useState('')
  const [birth, setBirth] = useState('')
  const [weight, setWeight] = useState('')
  const [goal, setGoal] = useState<GoalDirection>('maintain')
  const [weighsFood, setWeighsFood] = useState<'raw' | 'cooked'>('cooked')
  const installed = isStandalone()

  const finish = async () => {
    const h = parseNumber(height)
    const w = parseNumber(weight)
    const now = Date.now()
    await db.profile.put({
      ...DEFAULT_PROFILE,
      sex,
      heightCm: h && h > 80 && h < 260 ? h : DEFAULT_PROFILE.heightCm,
      birthDate: birth || undefined,
      goal,
      rateKgPerWeek: goal === 'lose' ? -0.5 : goal === 'gain' ? 0.25 : 0,
      weighsFood,
      createdAt: now,
      updatedAt: now,
    })
    if (w && w > 20 && w < 400) await saveWeight(todayKey(), w)
    localStorage.setItem('mf.onboarded', '1')
    onDone()
  }

  return (
    <div className="min-h-dvh bg-bg pt-safe">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="flex gap-1.5 pt-4">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`h-0.5 flex-1 rounded-full transition-colors ${
                i <= step ? 'bg-brand' : 'bg-surface-3'
              }`}
            />
          ))}
        </div>

        {step === 0 && (
          <div className="flex flex-1 flex-col justify-center py-10">
            <h1 className="text-[2rem] font-extrabold leading-[1.05] tracking-[-0.03em]">
              Your food diary
              <br />
              stays on your phone.
            </h1>
            <p className="mt-4 text-[0.9375rem] leading-relaxed text-txt-2">
              There is no account, no server and no subscription. Everything you log is stored
              on this device only.
            </p>

            <div className="mt-6 space-y-3">
              <Point icon={<Lock size={16} />} title="Nothing is uploaded by default">
                Search and barcode lookups query Open Food Facts; the German national food
                database is bundled and works offline.
              </Point>
              <Point icon={<Sparkles size={16} />} title="AI logging is opt-in">
                Photo and dictation logging need your own API key. Without one, everything else
                still works.
              </Point>
              <Point icon={<Scale size={16} />} title="Estimates are labelled as estimates">
                Every entry shows where its numbers came from and how far off they might be.
              </Point>
            </div>

            <Button variant="primary" className="mt-8 w-full" onClick={() => setStep(1)}>
              Get started <ChevronRight size={17} />
            </Button>
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-1 flex-col py-8">
            <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-[-0.025em]">
              A few numbers
            </h1>
            <p className="mt-2 text-[0.875rem] leading-relaxed text-txt-3">
              Used to estimate your energy needs on day one. From about three weeks in, the app
              replaces the estimate with your measured expenditure.
            </p>

            <div className="mt-6 space-y-4">
              <Field label="Sex">
                <Segmented
                  options={[
                    { value: 'male' as Sex, label: 'Male' },
                    { value: 'female' as Sex, label: 'Female' },
                  ]}
                  value={sex}
                  onChange={setSex}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Height (cm)">
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder="178"
                    value={height}
                    onChange={(e) => setHeight(e.target.value)}
                  />
                </Field>
                <Field label="Weight (kg)">
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder="80"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                  />
                </Field>
              </div>

              <Field label="Date of birth">
                <Input type="date" value={birth} onChange={(e) => setBirth(e.target.value)} />
              </Field>

              <Field label="Goal">
                <Segmented
                  options={[
                    { value: 'lose' as GoalDirection, label: 'Lose' },
                    { value: 'maintain' as GoalDirection, label: 'Maintain' },
                    { value: 'gain' as GoalDirection, label: 'Gain' },
                  ]}
                  value={goal}
                  onChange={setGoal}
                />
              </Field>

              <Field
                label="Do you weigh food raw or cooked?"
                hint="Cooked meat has lost water. Logging 150 g cooked against a raw entry under-counts protein by about 28%, so the app needs to know which you mean."
              >
                <Segmented
                  options={[
                    { value: 'cooked' as const, label: 'Cooked' },
                    { value: 'raw' as const, label: 'Raw' },
                  ]}
                  value={weighsFood}
                  onChange={setWeighsFood}
                />
              </Field>
            </div>

            <div className="mt-auto flex gap-2 pt-8">
              <Button className="flex-1" onClick={() => setStep(0)}>
                Back
              </Button>
              <Button variant="primary" className="flex-[2]" onClick={() => setStep(2)}>
                Continue
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-1 flex-col justify-center py-10">
            <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-[-0.025em]">
              {installed ? "You're set up" : 'Add it to your Home Screen'}
            </h1>

            {installed ? (
              <p className="mt-3 text-[0.9375rem] leading-relaxed text-txt-2">
                The app is installed, so your data is stored persistently and will not be cleared.
              </p>
            ) : (
              <>
                <p className="mt-3 text-[0.9375rem] leading-relaxed text-txt-2">
                  This one matters. Safari deletes website data after seven days without use, and
                  installed web apps are the exception — without it, your diary can disappear.
                </p>
                <Card className="mt-5 p-4">
                  <ol className="space-y-2.5 text-[0.875rem] text-txt-2">
                    <li className="flex items-center gap-2.5">
                      <Share size={16} className="shrink-0 text-brand-text" />
                      In Safari, tap Share
                    </li>
                    <li className="flex items-center gap-2.5">
                      <Smartphone size={16} className="shrink-0 text-brand-text" />
                      Choose "Add to Home Screen"
                    </li>
                    <li className="flex items-center gap-2.5">
                      <ChevronRight size={16} className="shrink-0 text-brand-text" />
                      Open the app from its icon
                    </li>
                  </ol>
                </Card>
              </>
            )}

            <p className="mt-5 text-[0.8125rem] leading-relaxed text-txt-3">
              You can turn on photo and voice logging later in Settings, and export everything at
              any time. The export is your only backup — there is no cloud copy.
            </p>

            <Button variant="primary" className="mt-8 w-full" onClick={() => void finish()}>
              Start tracking
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

function Point({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 shrink-0 text-brand-text">{icon}</div>
      <div>
        <p className="text-[0.875rem] font-bold tracking-tight">{title}</p>
        <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-txt-3">{children}</p>
      </div>
    </div>
  )
}

export function needsOnboarding(): boolean {
  return localStorage.getItem('mf.onboarded') !== '1'
}
