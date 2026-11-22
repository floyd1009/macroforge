import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Plus } from 'lucide-react'
import { IconButton, Input, Screen } from '../../components/ui'
import { db } from '../../lib/db'
import type { MuscleGroup } from '../../lib/types'
import { BackButton, CustomExerciseSheet, ExerciseRow, MuscleChips } from './shared'
import { filterExercises } from './util'

export default function ExerciseLibrary() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null)
  const [creating, setCreating] = useState(false)
  const exercises = useLiveQuery(() => db.exercises.toArray(), [])
  const list = useMemo(() => filterExercises(exercises ?? [], q, muscle), [exercises, q, muscle])
  const open = (id: string) => navigate(`/train/exercise/${encodeURIComponent(id)}`)

  return (
    <Screen
      title="Exercises"
      subtitle={exercises ? `${exercises.filter((e) => !e.deleted).length} movements` : undefined}
      left={<BackButton to="/train" />}
      right={
        <IconButton label="Create custom exercise" onClick={() => setCreating(true)}>
          <Plus size={21} />
        </IconButton>
      }
    >
      <Input
        type="search"
        placeholder="Search by name, muscle or equipment"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="mb-2.5 mt-2"
      />
      {/* The chip strip bleeds to the screen edge; the Screen gutter is 1rem, the strip assumes 1.25rem. */}
      <div className="px-1">
        <MuscleChips value={muscle} onChange={setMuscle} />
      </div>

      <ul className="mt-3 space-y-1.5">
        {list.map((e) => (
          <li key={e.id}>
            <ExerciseRow
              exercise={e}
              onClick={() => open(e.id)}
              right={<ChevronRight size={16} className="shrink-0 text-txt-4" />}
            />
          </li>
        ))}
      </ul>
      {exercises && list.length === 0 && (
        <p className="py-10 text-center text-sm text-txt-3">No exercise matches. Create it with the plus above.</p>
      )}

      {creating && (
        <CustomExerciseSheet
          initialName={q}
          initialMuscle={muscle ?? undefined}
          onClose={() => setCreating(false)}
          onCreated={(e) => {
            setCreating(false)
            open(e.id)
          }}
        />
      )}
    </Screen>
  )
}
