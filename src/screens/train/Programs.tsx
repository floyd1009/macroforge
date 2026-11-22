import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Plus } from 'lucide-react'
import { Badge, Button, Card, Screen, SectionTitle, Sheet } from '../../components/ui'
import { exerciseId } from '../../data/exercises'
import { PROGRAM_TEMPLATES, templateWeeklySets, type ProgramTemplate } from '../../data/programs'
import { db } from '../../lib/db'
import { BackButton } from './shared'
import { activateProgram, adoptTemplate, createBlankProgram } from './store'

export default function Programs() {
  const navigate = useNavigate()
  const [preview, setPreview] = useState<ProgramTemplate | null>(null)
  const programs = useLiveQuery(async () => {
    const rows = await db.programs.toArray()
    return rows.filter((p) => !p.deleted).sort((a, b) => b.active - a.active || b.updatedAt - a.updatedAt)
  }, [])
  const exercises = useLiveQuery(() => db.exercises.toArray(), [])
  const exName = new Map((exercises ?? []).map((e) => [e.id, e.name]))

  return (
    <Screen title="Programs" left={<BackButton to="/train" />}>
      {programs && programs.length > 0 && (
        <>
          <SectionTitle>Your programs</SectionTitle>
          <ul className="space-y-2">
            {programs.map((p) => (
              <li key={p.id}>
                <Card className="flex items-center gap-2 p-1.5 pl-4">
                  <button className="min-w-0 flex-1 py-2 text-left" onClick={() => navigate(`/train/programs/${p.id}`)}>
                    <p className="truncate text-[0.9375rem] font-bold">{p.name}</p>
                    <p className="mt-0.5 text-[0.6875rem] text-txt-3">
                      {p.days.length} {p.days.length === 1 ? 'day' : 'days'} ·{' '}
                      {p.days.reduce((s, d) => s + d.exercises.reduce((a, e) => a + e.sets, 0), 0)} sets per round
                    </p>
                  </button>
                  {p.active ? (
                    <Badge tone="brand" className="mr-2.5">
                      Active
                    </Badge>
                  ) : (
                    <Button className="min-h-9 px-3 text-[0.8125rem]" onClick={() => void activateProgram(p.id)}>
                      Use
                    </Button>
                  )}
                  <button
                    aria-label={`Edit ${p.name}`}
                    className="grid size-9 place-items-center text-txt-4"
                    onClick={() => navigate(`/train/programs/${p.id}`)}
                  >
                    <ChevronRight size={16} />
                  </button>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}

      <SectionTitle>Ready-made</SectionTitle>
      <ul className="space-y-2">
        {PROGRAM_TEMPLATES.map((t) => (
          <li key={t.id}>
            <button className="block w-full text-left" onClick={() => setPreview(t)}>
              <Card className="p-4 active:bg-surface-2">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[1rem] font-extrabold leading-tight tracking-[-0.015em]">{t.name}</p>
                  <ChevronRight size={16} className="mt-0.5 shrink-0 text-txt-4" />
                </div>
                <p className="mt-1.5 text-[0.8125rem] leading-snug text-txt-2">{t.summary}</p>
                <p className="mt-2 text-[0.6875rem] font-semibold text-txt-3">
                  {t.suits} · {templateWeeklySets(t)} sets a week
                </p>
              </Card>
            </button>
          </li>
        ))}
      </ul>

      <Button
        className="mt-4 w-full"
        onClick={async () => navigate(`/train/programs/${await createBlankProgram()}`)}
      >
        <Plus size={16} /> Build your own
      </Button>

      <p className="mt-4 text-[0.6875rem] leading-relaxed text-txt-3">
        The splits are scheduling conventions. What the evidence supports is the weekly number of
        hard sets per muscle and how close to failure they are taken, and every plan here is built
        to the same weekly range. Pick by how many days you can train.
      </p>

      {preview && (
        <Sheet open onClose={() => setPreview(null)} title={preview.name} full>
          <p className="text-[0.875rem] leading-relaxed text-txt-2">{preview.summary}</p>
          <div className="mt-4 space-y-3">
            {preview.days.map((d) => (
              <div key={d.name} className="rounded-tile border border-line bg-surface-2 p-3">
                <p className="text-[0.875rem] font-extrabold">{d.name}</p>
                <ul className="mt-2 space-y-1.5">
                  {d.slots.map(([name, sets, lo, hi, rir]) => (
                    <li key={name} className="flex items-baseline justify-between gap-3 text-[0.8125rem]">
                      <span className="min-w-0 truncate text-txt-2">{exName.get(exerciseId(name)) ?? name}</span>
                      <span className="numeric shrink-0 text-txt-3">
                        {sets} × {lo}–{hi} @ {rir}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[0.6875rem] leading-relaxed text-txt-3">
            Sets × rep range @ reps in reserve. You get your own copy and can change anything in it.
          </p>
          <Button
            variant="primary"
            className="sticky bottom-0 mt-4 w-full"
            onClick={async () => {
              await adoptTemplate(preview)
              navigate('/train')
            }}
          >
            Use this program
          </Button>
        </Sheet>
      )}
    </Screen>
  )
}
